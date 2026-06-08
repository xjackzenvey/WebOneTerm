"""Application configuration via pydantic-settings."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings. Data stored in ~/.weboneterm/"""

    data_dir: Path = Path.home() / ".weboneterm"

    @property
    def database_url(self) -> str:
        db_path = self.data_dir / "weboneterm.db"
        return f"sqlite+aiosqlite:///{db_path}"

    @property
    def fernet_key_path(self) -> Path:
        return self.data_dir / "fernet.key"

    def ensure_data_dir(self) -> None:
        """Create data directory with restricted permissions if needed."""
        self.data_dir.mkdir(mode=0o700, exist_ok=True)


settings = Settings()
