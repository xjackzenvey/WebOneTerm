# WebOneTerm

Web-based SSH terminal and file manager built with FastAPI + React.

## Features

- **SSH Terminal** — xterm.js-based terminal with full color support, connects directly to your servers
- **Server Manager** — add, edit, and delete SSH server configurations (password or private key auth)
- **File Manager** — SFTP-based file browser with upload, download, delete, and directory creation
- **Local-first** — data stored in `~/.weboneterm/` with Fernet encryption for credentials

## Quick Start

### Prerequisites
- Python 3.13+
- Node.js 18+
- uv (recommended) or pip

### Install & Run

```bash
# Backend
uv sync
uv run python main.py

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Production Build

```bash
cd frontend && npm run build
# Then run the backend — it auto-serves the built frontend at /
uv run python main.py
# Open http://localhost:8000
```

## Architecture

```
Browser (xterm.js + React)  ←→  FastAPI (WebSocket + REST)  ←→  Remote SSH Server
```

SSH connections go directly from the Python backend to your remote servers — no relays or cloud hops.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, asyncssh, SQLAlchemy (SQLite + aiosqlite), cryptography (Fernet) |
| Frontend | React 19, TypeScript, xterm.js, zustand, Vite |

## Data Storage

- Server configs & encrypted credentials: `~/.weboneterm/weboneterm.db` (SQLite)
- Encryption key: `~/.weboneterm/fernet.key` (0600 permissions)
