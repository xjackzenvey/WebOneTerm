// Application state managed by Tauri

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::crypto::Fernet;

/// Re-export TerminalSession type from commands
pub type TerminalSessionMap = HashMap<String, crate::commands::terminal::TerminalSession>;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub fernet: Fernet,
    pub data_dir: PathBuf,
    pub terminal_sessions: Mutex<TerminalSessionMap>,
}

impl AppState {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = dirs_next().unwrap_or_else(|| PathBuf::from("."));
        std::fs::create_dir_all(&data_dir).ok();

        let fernet_path = data_dir.join("fernet.key");
        let db_path = data_dir.join("weboneterm.db");

        let fernet = Fernet::load_or_create(&fernet_path)?;
        let db = crate::db::init_db(&db_path)?;

        Ok(AppState {
            db: Mutex::new(db),
            fernet,
            data_dir,
            terminal_sessions: Mutex::new(HashMap::new()),
        })
    }
}

/// Get the XDG-like data directory: ~/.weboneterm
fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Some(PathBuf::from(home).join(".weboneterm"));
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(dir) = directories::ProjectDirs::from("com", "weboneterm", "WebOneTerm") {
            return Some(dir.data_dir().to_path_buf());
        }
    }
    None
}
