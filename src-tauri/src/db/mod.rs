// Database initialization and access

pub mod models;

use std::path::Path;

use rusqlite::Connection;

use crate::error::AppError;

/// Initialize (create if needed) the SQLite database at the given path.
/// Runs migrations to create the `servers` table.
pub fn init_db(db_path: &Path) -> Result<Connection, AppError> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(parent) {
                let mut perms = meta.permissions();
                perms.set_mode(0o700);
                std::fs::set_permissions(parent, perms).ok();
            }
        }
    }

    let conn = Connection::open(db_path)
        .map_err(|e| AppError::Database(format!("Cannot open database: {}", e)))?;

    // Enable WAL mode for better concurrent read performance
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| AppError::Database(format!("Cannot set pragmas: {}", e)))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS servers (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            alias                   TEXT NOT NULL DEFAULT '',
            host                    TEXT NOT NULL,
            port                    INTEGER NOT NULL DEFAULT 22,
            username                TEXT NOT NULL,
            auth_method             TEXT NOT NULL CHECK(auth_method IN ('password', 'private_key')),
            encrypted_password      TEXT,
            encrypted_private_key   TEXT,
            created_at              TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .map_err(|e| AppError::Database(format!("Migration failed: {}", e)))?;

    Ok(conn)
}
