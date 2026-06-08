# WebOneTerm

Native desktop SSH terminal and file manager built with Tauri + React.

## Features

- **SSH Terminal** — xterm.js-based terminal with full 256-color support, PTY resize, multi-tab sessions
- **Server Manager** — add, edit, and delete SSH server configurations (password or private key auth)
- **File Manager** — SFTP-based file browser with native file dialogs for upload/download, delete, and directory creation
- **Tab System** — multiple terminals per server, file manager in separate tabs, drag-free tab switching
- **System Tray** — minimize to tray, sessions stay alive; click tray icon to restore
- **State Persistence** — tabs survive app restart (localStorage)
- **Local-first** — data stored in `~/.weboneterm/` with Fernet encryption for credentials

## Quick Start

### Prerequisites
- Rust 1.77+ (with `cargo`)
- Node.js 18+

### Development

```bash
# Install frontend dependencies
cd frontend && npm install

# Run in development mode (hot reload)
cargo tauri dev
```

### Production Build

```bash
# Creates a native .app bundle on macOS (.dmg with `cargo tauri build --bundles dmg`)
cargo tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Architecture

```
┌── React (WebView) ────────────────────────┐
│  xterm.js  │  File Manager  │  Sidebar    │
│       │           │              │        │
│  Tauri Events  invoke()     invoke()      │
└───────┼───────────┼──────────────┼────────┘
        │           │              │
┌───────┼───────────┼──────────────┼────────┐
│  Rust (Tauri) ────────────────────────────│
│       ▼           ▼              ▼        │
│  ssh2::Channel  ssh2::Sftp   rusqlite     │
│       │           │              │        │
└───────┼───────────┼──────────────┼────────┘
        ▼           ▼              ▼
  Remote SSH    Remote SFTP    ~/.weboneterm/
   Server        Server        (SQLite + Fernet)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust, Tauri v2, ssh2 (libssh2), rusqlite, AES-CBC + HMAC-SHA256 (Fernet) |
| Frontend | React 19, TypeScript, xterm.js, zustand, Vite |

## Data Storage

- Server configs & encrypted credentials: `~/.weboneterm/weboneterm.db` (SQLite)
- Encryption key: `~/.weboneterm/fernet.key` (0600 permissions)
- Tab state: browser localStorage (`weboneterm-tabs`)
