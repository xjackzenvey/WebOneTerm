"""SFTP file operations.

Each function opens a fresh SSH + SFTP connection, performs the operation,
and cleans up. Uses scandir for fast directory listing (1 round trip).
"""

import os
import stat as stat_module
from contextlib import asynccontextmanager
from typing import AsyncGenerator, List, Optional

import asyncssh
from sqlalchemy import select

from src.weboneterm.crypto import decrypt
from src.weboneterm.database import async_session
from src.weboneterm.models import Server
from src.weboneterm.schemas import FileEntry


class FileOpsError(Exception):
    """Raised when a file operation fails."""


@asynccontextmanager
async def _connect_sftp(server_id: int):
    """Async context manager: open SSH + SFTP, yield sftp, auto-cleanup."""
    async with async_session() as db:
        result = await db.execute(
            select(Server).where(Server.id == server_id)
        )
        server = result.scalar_one_or_none()
        if server is None:
            raise FileOpsError(f"Server {server_id} not found")

    password = None
    private_key = None
    if server.encrypted_password:
        password = decrypt(server.encrypted_password)
    if server.encrypted_private_key:
        private_key = decrypt(server.encrypted_private_key)

    connect_kwargs: dict = {
        "host": server.host,
        "port": server.port,
        "username": server.username,
        "known_hosts": None,
    }
    if server.auth_method == "password" and password:
        connect_kwargs["password"] = password
    elif server.auth_method == "private_key" and private_key:
        connect_kwargs["client_keys"] = [private_key]
    else:
        raise FileOpsError("No valid credentials")

    async with asyncssh.connect(**connect_kwargs) as conn:
        async with conn.start_sftp_client() as sftp:
            yield sftp


def _build_entry(name: str, parent_path: str, attrs) -> FileEntry:
    """Build a FileEntry from SFTP attributes."""
    full_path = os.path.join(parent_path, name)
    return FileEntry(
        name=name,
        path=full_path,
        is_dir=stat_module.S_ISDIR(attrs.permissions),
        size=attrs.size or 0,
        modified_at=attrs.mtime if attrs.mtime else None,
        permissions=str(attrs.permissions),
    )


async def list_files(server_id: int, path: str = "/") -> List[FileEntry]:
    """List files in a directory on the remote server.

    Uses scandir for speed — a single SFTP OPENDIR/READDIR/CLOSE
    round trip yields all entries with attributes.
    """
    async with _connect_sftp(server_id) as sftp:
        scanner = sftp.scandir(path)
        entries: List[FileEntry] = []
        try:
            async for entry in scanner:
                entries.append(
                    _build_entry(entry.filename, path, entry.attrs)
                )
        except asyncssh.SFTPError as e:
            # Server dropped connection mid-listing — return what we have
            if entries:
                pass  # partial results are useful
            else:
                raise FileOpsError(f"Failed to list {path}: {e}") from e
        finally:
            # Force the scanner's finally block (FXP_CLOSE of dir handle)
            # to run BEFORE the async-with exits and closes the connection.
            # aclose() on an exhausted generator is a no-op, but on a
            # partially-consumed one it triggers the cleanup synchronously.
            try:
                await scanner.aclose()
            except Exception:
                pass

        entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
        return entries


async def upload_file(
    server_id: int, file_obj, filename: str, dest_path: str
) -> FileEntry:
    """Upload a file to the remote server via SFTP."""
    async with _connect_sftp(server_id) as sftp:
        remote_path = os.path.join(dest_path.rstrip("/"), filename)

        # Ensure parent directory exists
        parent = os.path.dirname(remote_path)
        try:
            await sftp.stat(parent)
        except asyncssh.SFTPError:
            parts = parent.strip("/").split("/")
            current = ""
            for part in parts:
                current = (
                    os.path.join("/", current, part)
                    if current
                    else f"/{part}"
                )
                try:
                    await sftp.stat(current)
                except asyncssh.SFTPError:
                    await sftp.mkdir(current)

        await sftp.putfo(file_obj, remote_path)
        stat = await sftp.stat(remote_path)
        return _build_entry(
            os.path.basename(remote_path), dest_path.rstrip("/"), stat
        )


async def download_file_chunks(
    server_id: int, path: str
) -> AsyncGenerator[bytes, None]:
    """Generator that yields file chunks for streaming download.

    256 KB chunks for better throughput over high-latency links.
    """
    async with _connect_sftp(server_id) as sftp:
        async with sftp.open(path, "rb") as remote_file:
            while True:
                chunk = await remote_file.read(262144)  # 256 KB
                if not chunk:
                    break
                yield chunk


async def get_file_info(server_id: int, path: str) -> Optional[FileEntry]:
    """Get file metadata. Returns None if not found."""
    try:
        async with _connect_sftp(server_id) as sftp:
            stat = await sftp.stat(path)
            dirname = os.path.dirname(path) or "/"
            return _build_entry(os.path.basename(path), dirname, stat)
    except asyncssh.SFTPError:
        return None


async def delete_file(server_id: int, path: str) -> None:
    """Delete a file or empty directory on the remote server."""
    async with _connect_sftp(server_id) as sftp:
        stat = await sftp.stat(path)
        if stat_module.S_ISDIR(stat.permissions):
            await sftp.rmdir(path)
        else:
            await sftp.unlink(path)


async def create_directory(server_id: int, path: str) -> FileEntry:
    """Create a directory on the remote server."""
    async with _connect_sftp(server_id) as sftp:
        await sftp.mkdir(path)
        stat = await sftp.stat(path)
        dirname = os.path.dirname(path) or "/"
        return _build_entry(os.path.basename(path), dirname, stat)
