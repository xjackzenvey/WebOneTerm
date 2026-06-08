"""FastAPI dependency injection."""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from src.weboneterm.database import async_session


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session. Automatically closed after request."""
    async with async_session() as session:
        yield session
