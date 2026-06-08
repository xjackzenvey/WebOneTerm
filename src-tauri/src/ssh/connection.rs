// SSH connection helpers — build and manage ssh2::Session

use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use ssh2::Session;

use crate::error::AppError;

/// Connect to a remote host, authenticate, and return an ssh2::Session.
/// `known_hosts` verification is DISABLED (matches Python behavior).
pub fn connect(
    host: &str,
    port: i64,
    username: &str,
    password: Option<&str>,
    private_key: Option<&str>,
) -> Result<Session, AppError> {
    let addr = format!("{}:{}", host, port);

    let socket_addr = addr
        .to_socket_addrs()
        .map_err(|e| AppError::SshConnection(format!("DNS resolve {}: {}", addr, e)))?
        .next()
        .ok_or_else(|| AppError::SshConnection(format!("DNS resolve {}: no addresses found", addr)))?;

    let tcp = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(10))
        .map_err(|e| AppError::SshConnection(format!("TCP connect to {} failed: {}", addr, e)))?;

    tcp.set_nodelay(true).ok();

    let mut session = Session::new()
        .map_err(|e| AppError::SshConnection(format!("Session create failed: {}", e)))?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|e| AppError::SshConnection(format!("SSH handshake failed: {}", e)))?;

    // Authenticate. For private keys: write to a temp file first —
    // `userauth_pubkey_memory` is not available on Windows libssh2 builds.
    if let Some(pw) = password {
        session
            .userauth_password(username, pw)
            .map_err(|e| AppError::SshConnection(format!("Password auth failed: {}", e)))?;
    } else if let Some(key_data) = private_key {
        let key_path = std::env::temp_dir()
            .join(format!("weboneterm_key_{}", std::process::id()));
        std::fs::write(&key_path, key_data)
            .map_err(|e| AppError::SshConnection(format!("Cannot write temp key: {}", e)))?;

        let result = session
            .userauth_pubkey_file(username, None, &key_path, None)
            .map_err(|e| AppError::SshConnection(format!("Public key auth failed: {}", e)));

        std::fs::remove_file(&key_path).ok();
        result?;
    } else {
        return Err(AppError::SshConnection("No credentials provided".into()));
    }

    if !session.authenticated() {
        return Err(AppError::SshConnection("Authentication failed".into()));
    }

    Ok(session)
}
