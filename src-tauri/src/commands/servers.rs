// Server CRUD Tauri commands

use tauri::State;

use crate::db::models::{self, ServerCreate, ServerResponse, ServerUpdate};
use crate::error::AppError;
use crate::state::AppState;

#[tauri::command]
pub fn list_servers(state: State<AppState>) -> Result<Vec<ServerResponse>, AppError> {
    let db = state.db.lock().unwrap();
    models::list_all(&db)
}

#[tauri::command]
pub fn get_server(state: State<AppState>, server_id: i64) -> Result<ServerResponse, AppError> {
    let db = state.db.lock().unwrap();
    let server = models::find_by_id(&db, server_id)?.ok_or(AppError::ServerNotFound(server_id))?;
    Ok(ServerResponse::from(&server))
}

#[tauri::command]
pub fn create_server(
    state: State<AppState>,
    data: ServerCreate,
) -> Result<ServerResponse, AppError> {
    // Validate auth fields
    if data.auth_method == "password" && data.password.as_ref().map_or(true, |p| p.is_empty()) {
        return Err(AppError::Other(
            "Password is required for password authentication".into(),
        ));
    }
    if data.auth_method == "private_key"
        && data.private_key.as_ref().map_or(true, |k| k.is_empty())
    {
        return Err(AppError::Other(
            "Private key is required for key authentication".into(),
        ));
    }

    let db = state.db.lock().unwrap();
    models::insert(&db, &data, &state.fernet)
}

#[tauri::command]
pub fn update_server(
    state: State<AppState>,
    server_id: i64,
    data: ServerUpdate,
) -> Result<ServerResponse, AppError> {
    let db = state.db.lock().unwrap();
    models::update(&db, server_id, &data, &state.fernet)
}

#[tauri::command]
pub fn delete_server(state: State<AppState>, server_id: i64) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    // Close any active terminal sessions for this server
    if let Ok(mut sessions) = state.terminal_sessions.lock() {
        sessions.retain(|_key, session| {
            if session.server_id == server_id {
                // Can't call close() with the lock held, just remove
                false
            } else {
                true
            }
        });
    }
    models::delete(&db, server_id)
}
