"""SSH connection lifecycle manager.

Maintains a pool of active SSH connections keyed by (server_id, ws_key).
Each WebSocket gets its own SSH session so multiple terminals to
the same server can coexist.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

import asyncssh
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.weboneterm.crypto import decrypt
from src.weboneterm.database import async_session
from src.weboneterm.models import Server

logger = logging.getLogger(__name__)


@dataclass
class SSHSession:
    """A live SSH connection and its associated process."""

    conn: asyncssh.SSHClientConnection
    process: asyncssh.SSHClientProcess
    server_id: int
    created_at: float = field(default_factory=asyncio.get_event_loop().time)


class SSHManager:
    """Manages active SSH connections."""

    def __init__(self) -> None:
        self._sessions: dict[str, SSHSession] = {}
        self._lock = asyncio.Lock()

    def _make_key(self, server_id: int, ws_key: str) -> str:
        return f"{server_id}:{ws_key}"

    async def _load_credentials(
        self, server_id: int
    ) -> tuple[Server, Optional[str], Optional[str]]:
        """Load server config and decrypt credentials."""
        async with async_session() as db:
            result = await db.execute(
                select(Server).where(Server.id == server_id)
            )
            server = result.scalar_one_or_none()
            if server is None:
                raise ValueError(f"Server {server_id} not found")

        password = None
        private_key = None
        if server.encrypted_password:
            password = decrypt(server.encrypted_password)
        if server.encrypted_private_key:
            private_key = decrypt(server.encrypted_private_key)

        return server, password, private_key

    async def connect(
        self, server_id: int, ws_key: str
    ) -> SSHSession:
        """Create a new SSH connection and spawn an interactive shell.

        Raises asyncssh.Error or OSError on connection/auth failure.
        """
        server, password, private_key = await self._load_credentials(server_id)

        # Build connection kwargs
        connect_kwargs: dict = {
            "host": server.host,
            "port": server.port,
            "username": server.username,
            "known_hosts": None,  # skip host key verification for local tool
        }

        if server.auth_method == "password" and password:
            connect_kwargs["password"] = password
        elif server.auth_method == "private_key" and private_key:
            # asyncssh can parse PEM and OpenSSH format keys from a string
            connect_kwargs["client_keys"] = [private_key]
        else:
            raise ValueError("No valid credentials available")

        logger.info(
            "Connecting to %s@%s:%d (auth=%s)",
            server.username,
            server.host,
            server.port,
            server.auth_method,
        )

        conn = await asyncssh.connect(**connect_kwargs)

        # Create an interactive shell with a PTY
        process = await conn.create_process(
            term_type="xterm-256color",
            term_size=(80, 24),
            encoding=None,  # binary mode
        )

        key = self._make_key(server_id, ws_key)
        session = SSHSession(
            conn=conn,
            process=process,
            server_id=server_id,
        )

        async with self._lock:
            self._sessions[key] = session

        logger.info("SSH session established: %s", key)
        return session

    async def disconnect(self, server_id: int, ws_key: str) -> None:
        """Close an SSH connection and remove it from the pool."""
        key = self._make_key(server_id, ws_key)
        async with self._lock:
            session = self._sessions.pop(key, None)

        if session is None:
            return

        try:
            session.process.close()
        except Exception:
            pass
        try:
            session.conn.close()
        except Exception:
            pass

        logger.info("SSH session closed: %s", key)

    async def shutdown(self) -> None:
        """Close all active connections (called on app shutdown)."""
        async with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()

        for session in sessions:
            try:
                session.process.close()
            except Exception:
                pass
            try:
                session.conn.close()
            except Exception:
                pass
        if sessions:
            logger.info("Closed %d SSH session(s) on shutdown", len(sessions))


# Singleton instance
ssh_manager = SSHManager()
