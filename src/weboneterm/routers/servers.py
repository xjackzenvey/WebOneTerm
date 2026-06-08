"""REST API for SSH server configuration CRUD."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.weboneterm.crypto import decrypt, encrypt
from src.weboneterm.dependencies import get_db
from src.weboneterm.models import Server
from src.weboneterm.schemas import ServerCreate, ServerResponse, ServerUpdate

router = APIRouter(prefix="/api/servers", tags=["servers"])


def _to_response(server: Server) -> ServerResponse:
    """Convert ORM model to response schema (no credentials exposed)."""
    return ServerResponse(
        id=server.id,
        alias=server.alias,
        host=server.host,
        port=server.port,
        username=server.username,
        auth_method=server.auth_method,
        has_password=server.encrypted_password is not None,
        has_private_key=server.encrypted_private_key is not None,
        created_at=server.created_at,
        updated_at=server.updated_at,
    )


def _get_decrypted_credentials(server: Server) -> tuple[str | None, str | None]:
    """Return (password, private_key) decrypted from storage."""
    password = None
    private_key = None
    if server.encrypted_password:
        password = decrypt(server.encrypted_password)
    if server.encrypted_private_key:
        private_key = decrypt(server.encrypted_private_key)
    return password, private_key


@router.get("", response_model=List[ServerResponse])
async def list_servers(db: AsyncSession = Depends(get_db)):
    """List all configured SSH servers."""
    result = await db.execute(
        select(Server).order_by(Server.created_at.desc())
    )
    servers = result.scalars().all()
    return [_to_response(s) for s in servers]


@router.post(
    "", response_model=ServerResponse, status_code=status.HTTP_201_CREATED
)
async def create_server(
    data: ServerCreate, db: AsyncSession = Depends(get_db)
):
    """Create a new SSH server configuration. Credentials are encrypted."""
    server = Server(
        alias=data.alias,
        host=data.host,
        port=data.port,
        username=data.username,
        auth_method=data.auth_method,
    )

    if data.auth_method == "password" and data.password:
        server.encrypted_password = encrypt(data.password)
    elif data.auth_method == "private_key" and data.private_key:
        server.encrypted_private_key = encrypt(data.private_key)

    db.add(server)
    await db.commit()
    await db.refresh(server)
    return _to_response(server)


@router.get("/{server_id}", response_model=ServerResponse)
async def get_server(server_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single server's configuration."""
    server = await _get_or_404(server_id, db)
    return _to_response(server)


@router.put("/{server_id}", response_model=ServerResponse)
async def update_server(
    server_id: int,
    data: ServerUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a server configuration. Only provided fields are changed."""
    server = await _get_or_404(server_id, db)

    if data.alias is not None:
        server.alias = data.alias
    if data.host is not None:
        server.host = data.host
    if data.port is not None:
        server.port = data.port
    if data.username is not None:
        server.username = data.username
    if data.auth_method is not None:
        server.auth_method = data.auth_method
    if data.password is not None:
        server.encrypted_password = encrypt(data.password)
        server.encrypted_private_key = None
    if data.private_key is not None:
        server.encrypted_private_key = encrypt(data.private_key)
        server.encrypted_password = None

    await db.commit()
    await db.refresh(server)
    return _to_response(server)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(server_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a server configuration."""
    server = await _get_or_404(server_id, db)
    await db.delete(server)
    await db.commit()


async def _get_or_404(server_id: int, db: AsyncSession) -> Server:
    """Fetch a server by ID, or raise 404."""
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server {server_id} not found",
        )
    return server
