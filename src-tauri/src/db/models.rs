// Server model and CRUD operations

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Database row for a server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: i64,
    pub alias: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    #[serde(skip_serializing)]
    pub encrypted_password: Option<String>,
    #[serde(skip_serializing)]
    pub encrypted_private_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Client-facing server info (no credentials exposed).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerResponse {
    pub id: i64,
    pub alias: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub has_password: bool,
    pub has_private_key: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<&Server> for ServerResponse {
    fn from(s: &Server) -> Self {
        ServerResponse {
            id: s.id,
            alias: s.alias.clone(),
            host: s.host.clone(),
            port: s.port,
            username: s.username.clone(),
            auth_method: s.auth_method.clone(),
            has_password: s.encrypted_password.is_some(),
            has_private_key: s.encrypted_private_key.is_some(),
            created_at: s.created_at.clone(),
            updated_at: s.updated_at.clone(),
        }
    }
}

/// Request body for creating a server.
#[derive(Debug, Deserialize)]
pub struct ServerCreate {
    pub alias: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
}

fn default_port() -> i64 {
    22
}

/// Request body for updating a server.
#[derive(Debug, Deserialize)]
pub struct ServerUpdate {
    pub alias: Option<String>,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub username: Option<String>,
    pub auth_method: Option<String>,
    pub password: Option<String>,
    pub private_key: Option<String>,
}

// ── CRUD ────────────────────────────────────────────────────────

pub fn list_all(conn: &Connection) -> Result<Vec<ServerResponse>, AppError> {
    let mut stmt = conn
        .prepare("SELECT id, alias, host, port, username, auth_method, encrypted_password, encrypted_private_key, created_at, updated_at FROM servers ORDER BY created_at DESC")
        .map_err(AppError::from)?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Server {
                id: row.get(0)?,
                alias: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_method: row.get(5)?,
                encrypted_password: row.get(6)?,
                encrypted_private_key: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(AppError::from)?;

    let mut servers = Vec::new();
    for row in rows {
        servers.push(ServerResponse::from(&row.map_err(AppError::from)?));
    }
    Ok(servers)
}

pub fn find_by_id(conn: &Connection, id: i64) -> Result<Option<Server>, AppError> {
    let mut stmt = conn
        .prepare("SELECT id, alias, host, port, username, auth_method, encrypted_password, encrypted_private_key, created_at, updated_at FROM servers WHERE id = ?1")
        .map_err(AppError::from)?;

    let mut rows = stmt
        .query_map(params![id], |row| {
            Ok(Server {
                id: row.get(0)?,
                alias: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_method: row.get(5)?,
                encrypted_password: row.get(6)?,
                encrypted_private_key: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(AppError::from)?;

    match rows.next() {
        Some(Ok(server)) => Ok(Some(server)),
        Some(Err(e)) => Err(AppError::from(e)),
        None => Ok(None),
    }
}

pub fn insert(conn: &Connection, data: &ServerCreate, fernet: &crate::crypto::Fernet) -> Result<ServerResponse, AppError> {
    let encrypted_pw = data
        .password
        .as_ref()
        .map(|pw| fernet.encrypt(pw))
        .transpose()?;
    let encrypted_key = data
        .private_key
        .as_ref()
        .map(|k| fernet.encrypt(k))
        .transpose()?;

    conn.execute(
        "INSERT INTO servers (alias, host, port, username, auth_method, encrypted_password, encrypted_private_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![data.alias, data.host, data.port, data.username, data.auth_method, encrypted_pw, encrypted_key],
    )
    .map_err(AppError::from)?;

    let id = conn.last_insert_rowid();
    let server = find_by_id(conn, id)?
        .ok_or_else(|| AppError::Database("Failed to retrieve created server".into()))?;
    Ok(ServerResponse::from(&server))
}

pub fn update(
    conn: &Connection,
    id: i64,
    data: &ServerUpdate,
    fernet: &crate::crypto::Fernet,
) -> Result<ServerResponse, AppError> {
    let existing = find_by_id(conn, id)?
        .ok_or(AppError::ServerNotFound(id))?;

    let alias = data.alias.clone().unwrap_or(existing.alias);
    let host = data.host.clone().unwrap_or(existing.host);
    let port = data.port.unwrap_or(existing.port);
    let username = data.username.clone().unwrap_or(existing.username);
    let auth_method = data.auth_method.clone().unwrap_or(existing.auth_method);

    // If password is provided, clear private key (and vice versa)
    let (enc_pw, enc_key) = if data.password.is_some() {
        (
            Some(fernet.encrypt(data.password.as_ref().unwrap())?),
            None::<String>,
        )
    } else if data.private_key.is_some() {
        (
            None::<String>,
            Some(fernet.encrypt(data.private_key.as_ref().unwrap())?),
        )
    } else {
        (existing.encrypted_password, existing.encrypted_private_key)
    };

    conn.execute(
        "UPDATE servers SET alias=?1, host=?2, port=?3, username=?4, auth_method=?5, encrypted_password=?6, encrypted_private_key=?7, updated_at=datetime('now') WHERE id=?8",
        params![alias, host, port, username, auth_method, enc_pw, enc_key, id],
    )
    .map_err(AppError::from)?;

    let server = find_by_id(conn, id)?
        .ok_or(AppError::ServerNotFound(id))?;
    Ok(ServerResponse::from(&server))
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), AppError> {
    let affected = conn
        .execute("DELETE FROM servers WHERE id = ?1", params![id])
        .map_err(AppError::from)?;
    if affected == 0 {
        return Err(AppError::ServerNotFound(id));
    }
    Ok(())
}
