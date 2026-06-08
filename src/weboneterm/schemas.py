"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, model_validator


# ── Server schemas ──────────────────────────────────────────────────


class ServerCreate(BaseModel):
    """Schema for creating a new server. Accepts plaintext credentials."""

    alias: str
    host: str
    port: int = 22
    username: str
    auth_method: Literal["password", "private_key"]
    password: Optional[str] = None
    private_key: Optional[str] = None

    @model_validator(mode="after")
    def validate_auth_fields(self) -> "ServerCreate":
        if self.auth_method == "password" and not self.password:
            raise ValueError("Password is required for password authentication")
        if self.auth_method == "private_key" and not self.private_key:
            raise ValueError("Private key is required for key authentication")
        return self


class ServerUpdate(BaseModel):
    """Schema for updating a server. All fields optional."""

    alias: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    auth_method: Optional[Literal["password", "private_key"]] = None
    password: Optional[str] = None
    private_key: Optional[str] = None


class ServerResponse(BaseModel):
    """Schema for server list/detail responses. Never exposes credentials."""

    id: int
    alias: str
    host: str
    port: int
    username: str
    auth_method: Literal["password", "private_key"]
    has_password: bool = False
    has_private_key: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── File manager schemas ────────────────────────────────────────────


class FileEntry(BaseModel):
    """A single file or directory entry in a file listing."""

    name: str
    path: str
    is_dir: bool
    size: int
    modified_at: Optional[float] = None
    permissions: str = ""


class MkdirRequest(BaseModel):
    """Request body for creating a directory."""

    path: str
