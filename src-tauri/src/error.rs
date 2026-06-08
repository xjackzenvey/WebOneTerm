// Unified error type for all Tauri commands

use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize)]
pub enum AppError {
    #[error("Server not found: {0}")]
    ServerNotFound(i64),

    #[error("SSH connection failed: {0}")]
    SshConnection(String),

    #[error("SFTP error: {0}")]
    Sftp(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Encryption error: {0}")]
    Crypto(String),

    #[error("Terminal session not found: {0}")]
    TerminalNotFound(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("{0}")]
    Other(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Database(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<ssh2::Error> for AppError {
    fn from(e: ssh2::Error) -> Self {
        AppError::SshConnection(e.to_string())
    }
}
