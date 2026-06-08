// SFTP file operations (stateless, one-off connections)

use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use serde::Serialize;

use crate::crypto::Fernet;
use crate::db::models::find_by_id;
use crate::error::AppError;
use rusqlite::Connection;

use super::connection::connect;

/// File/directory entry returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: Option<f64>,
    pub permissions: String,
}

/// Load server config, decrypt credentials, open SSH + SFTP.
fn open_sftp(server_id: i64, db: &Connection, fernet: &Fernet) -> Result<(ssh2::Session, ssh2::Sftp), AppError> {
    let server = find_by_id(db, server_id)?.ok_or(AppError::ServerNotFound(server_id))?;

    let password = server
        .encrypted_password
        .as_ref()
        .map(|pw| fernet.decrypt(pw))
        .transpose()?;
    let private_key = server
        .encrypted_private_key
        .as_ref()
        .map(|k| fernet.decrypt(k))
        .transpose()?;

    let session = connect(
        &server.host,
        server.port,
        &server.username,
        password.as_deref(),
        private_key.as_deref(),
    )?;

    let sftp = session
        .sftp()
        .map_err(|e| AppError::Sftp(format!("SFTP init failed: {}", e)))?;

    Ok((session, sftp))
}

/// List files in a directory. Sorted: directories first, then alphabetically.
pub fn list_files(
    server_id: i64,
    db: &Connection,
    fernet: &Fernet,
    path: &str,
) -> Result<Vec<FileEntry>, AppError> {
    let (_session, sftp) = open_sftp(server_id, db, fernet)?;
    let dir = Path::new(path);

    let entries_raw: Vec<(std::path::PathBuf, ssh2::FileStat)> = sftp
        .readdir(dir)
        .map_err(|e| AppError::Sftp(format!("readdir failed: {}", e)))?;

    let mut entries: Vec<FileEntry> = entries_raw
        .into_iter()
        .map(|(pb, stat)| {
            let name = pb.to_string_lossy().to_string();
            let full_path = if path.ends_with('/') {
                format!("{}{}", path, name)
            } else {
                format!("{}/{}", path, name)
            };
            FileEntry {
                name,
                path: full_path,
                is_dir: stat.is_dir(),
                size: stat.size.unwrap_or(0),
                modified_at: stat.mtime.map(|t| t as f64),
                permissions: format!("{}", stat.perm.unwrap_or(0)),
            }
        })
        .collect();

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Upload a local file to the remote server via SFTP.
pub fn upload_file(
    server_id: i64,
    db: &Connection,
    fernet: &Fernet,
    local_path: &str,
    dest_dir: &str,
) -> Result<FileEntry, AppError> {
    let path = Path::new(local_path);
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed");
    let remote_path = format!("{}/{}", dest_dir.trim_end_matches('/'), filename);

    let mut local_file = fs::File::open(path)
        .map_err(|e| AppError::Io(format!("Cannot open local file: {}", e)))?;
    let mut file_content = Vec::new();
    local_file
        .read_to_end(&mut file_content)
        .map_err(|e| AppError::Io(format!("Cannot read local file: {}", e)))?;

    let (_session, sftp) = open_sftp(server_id, db, fernet)?;

    // Ensure parent directory exists
    let parent_path = Path::new(&remote_path)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or("/");
    ensure_dir(&sftp, parent_path)?;

    let mut remote_file = sftp
        .create(Path::new(&remote_path))
        .map_err(|e| AppError::Sftp(format!("create failed: {}", e)))?;
    remote_file
        .write_all(&file_content)
        .map_err(|e| AppError::Sftp(format!("write failed: {}", e)))?;

    let stat = sftp
        .stat(Path::new(&remote_path))
        .map_err(|e| AppError::Sftp(format!("stat failed: {}", e)))?;

    Ok(FileEntry {
        name: filename.to_string(),
        path: remote_path,
        is_dir: false,
        size: stat.size.unwrap_or(file_content.len() as u64),
        modified_at: stat.mtime.map(|t| t as f64),
        permissions: format!("{}", stat.perm.unwrap_or(0)),
    })
}

/// Download a remote file to a local path.
pub fn download_file(
    server_id: i64,
    db: &Connection,
    fernet: &Fernet,
    remote_path: &str,
    local_path: &str,
) -> Result<(), AppError> {
    let (_session, sftp) = open_sftp(server_id, db, fernet)?;

    let mut remote_file = sftp
        .open(Path::new(remote_path))
        .map_err(|e| AppError::Sftp(format!("open failed: {}", e)))?;
    let mut content = Vec::new();
    remote_file
        .read_to_end(&mut content)
        .map_err(|e| AppError::Sftp(format!("read failed: {}", e)))?;

    let mut local_file = fs::File::create(local_path)
        .map_err(|e| AppError::Io(format!("Cannot create local file: {}", e)))?;
    local_file
        .write_all(&content)
        .map_err(|e| AppError::Io(format!("Cannot write local file: {}", e)))?;

    Ok(())
}

/// Delete a file or empty directory.
pub fn delete_file(
    server_id: i64,
    db: &Connection,
    fernet: &Fernet,
    path: &str,
) -> Result<(), AppError> {
    let (_session, sftp) = open_sftp(server_id, db, fernet)?;
    let p = Path::new(path);

    let stat = sftp
        .stat(p)
        .map_err(|e| AppError::Sftp(format!("stat failed: {}", e)))?;

    if stat.is_dir() {
        sftp
            .rmdir(p)
            .map_err(|e| AppError::Sftp(format!("rmdir failed: {}", e)))?;
    } else {
        sftp
            .unlink(p)
            .map_err(|e| AppError::Sftp(format!("unlink failed: {}", e)))?;
    }

    Ok(())
}

/// Create a directory on the remote server.
pub fn create_directory(
    server_id: i64,
    db: &Connection,
    fernet: &Fernet,
    path: &str,
) -> Result<FileEntry, AppError> {
    let (_session, sftp) = open_sftp(server_id, db, fernet)?;
    let p = Path::new(path);

    sftp
        .mkdir(p, 0o755)
        .map_err(|e| AppError::Sftp(format!("mkdir failed: {}", e)))?;

    let stat = sftp
        .stat(p)
        .map_err(|e| AppError::Sftp(format!("stat failed: {}", e)))?;

    let name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path);

    Ok(FileEntry {
        name: name.to_string(),
        path: path.to_string(),
        is_dir: true,
        size: 0,
        modified_at: stat.mtime.map(|t| t as f64),
        permissions: format!("{}", stat.perm.unwrap_or(0)),
    })
}

/// Ensure a directory path exists on the remote SFTP server.
fn ensure_dir(sftp: &ssh2::Sftp, path: &str) -> Result<(), AppError> {
    if path == "/" || path.is_empty() {
        return Ok(());
    }
    let parts: Vec<&str> = path
        .trim_start_matches('/')
        .split('/')
        .filter(|p| !p.is_empty())
        .collect();
    let mut current = String::new();
    for part in parts {
        current.push('/');
        current.push_str(part);
        let p = Path::new(&current);
        match sftp.stat(p) {
            Ok(_) => {}
            Err(_) => {
                sftp.mkdir(p, 0o755)
                    .map_err(|e| AppError::Sftp(format!("mkdir {} failed: {}", current, e)))?;
            }
        }
    }
    Ok(())
}
