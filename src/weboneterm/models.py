"""SQLAlchemy ORM models."""

from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.weboneterm.database import Base


class Server(Base):
    """SSH server configuration."""

    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alias: Mapped[str] = mapped_column(String(128), nullable=False)
    host: Mapped[str] = mapped_column(String(256), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=22)
    username: Mapped[str] = mapped_column(String(128), nullable=False)
    auth_method: Mapped[str] = mapped_column(String(16), nullable=False)
    encrypted_password: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encrypted_private_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            auth_method.in_(["password", "private_key"]),
            name="ck_auth_method",
        ),
    )

    def __repr__(self) -> str:
        return f"<Server(id={self.id}, alias='{self.alias}', host='{self.host}')>"
