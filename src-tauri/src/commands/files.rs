// File operation Tauri commands (async, non-blocking)

use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::ssh::sftp::{self, FileEntry};
use crate::state::AppState;

#[tauri::command]
pub async fn list_files(
    app: AppHandle,
    server_id: i64,
    path: String,
) -> Result<Vec<FileEntry>, AppError> {
    let cloned = app.clone();
    tokio::task::spawn_blocking(move || {
        let state = cloned.state::<AppState>();
        let db = state.db.lock().unwrap();
        sftp::list_files(server_id, &db, &state.fernet, &path)
    })
    .await
    .map_err(|e| AppError::Other(format!("spawn_blocking: {}", e)))?
}

#[tauri::command]
pub async fn upload_file(
    app: AppHandle,
    server_id: i64,
    local_path: String,
    dest_path: String,
) -> Result<FileEntry, AppError> {
    let cloned = app.clone();
    tokio::task::spawn_blocking(move || {
        let state = cloned.state::<AppState>();
        let db = state.db.lock().unwrap();
        sftp::upload_file(server_id, &db, &state.fernet, &local_path, &dest_path)
    })
    .await
    .map_err(|e| AppError::Other(format!("spawn_blocking: {}", e)))?
}

#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    server_id: i64,
    remote_path: String,
    local_path: String,
) -> Result<(), AppError> {
    let cloned = app.clone();
    tokio::task::spawn_blocking(move || {
        let state = cloned.state::<AppState>();
        let db = state.db.lock().unwrap();
        sftp::download_file(server_id, &db, &state.fernet, &remote_path, &local_path)
    })
    .await
    .map_err(|e| AppError::Other(format!("spawn_blocking: {}", e)))?
}

#[tauri::command]
pub async fn delete_file(
    app: AppHandle,
    server_id: i64,
    path: String,
) -> Result<(), AppError> {
    let cloned = app.clone();
    tokio::task::spawn_blocking(move || {
        let state = cloned.state::<AppState>();
        let db = state.db.lock().unwrap();
        sftp::delete_file(server_id, &db, &state.fernet, &path)
    })
    .await
    .map_err(|e| AppError::Other(format!("spawn_blocking: {}", e)))?
}

#[tauri::command]
pub async fn create_directory(
    app: AppHandle,
    server_id: i64,
    path: String,
) -> Result<FileEntry, AppError> {
    let cloned = app.clone();
    tokio::task::spawn_blocking(move || {
        let state = cloned.state::<AppState>();
        let db = state.db.lock().unwrap();
        sftp::create_directory(server_id, &db, &state.fernet, &path)
    })
    .await
    .map_err(|e| AppError::Other(format!("spawn_blocking: {}", e)))?
}
