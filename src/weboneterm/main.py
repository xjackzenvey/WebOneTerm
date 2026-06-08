"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.weboneterm.config import settings
from src.weboneterm.database import close_db, init_db

logger = logging.getLogger(__name__)

# Track frontend build path for production mode
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent.parent / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize DB on startup, close on shutdown."""
    settings.ensure_data_dir()
    await init_db()
    logger.info("Database initialized at %s", settings.database_url)
    yield
    # Shutdown: close all active SSH connections and DB
    from src.weboneterm.services.ssh_manager import ssh_manager
    await ssh_manager.shutdown()
    await close_db()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="WebOneTerm",
        description="Web-based SSH terminal and file manager",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS: allow all origins in development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register REST routers
    from src.weboneterm.routers.servers import router as servers_router
    from src.weboneterm.routers.files import router as files_router

    app.include_router(servers_router)
    app.include_router(files_router)

    from src.weboneterm.ws_routes import router as ws_router

    app.include_router(ws_router)

    # Serve frontend static files in production
    if FRONTEND_DIST.exists():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True))

    return app


app = create_app()


def main():
    """Run the application with uvicorn."""
    import uvicorn

    uvicorn.run(
        "src.weboneterm.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info",
    )
