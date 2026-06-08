// Terminal session Tauri commands (async, non-blocking)

use std::io::Read;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, mpsc};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::db::models::find_by_id;
use crate::error::AppError;
use crate::ssh::connection::connect;
use crate::state::AppState;

pub struct TerminalSession {
    pub server_id: i64,
    pub _session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
    pub write_rx: Option<mpsc::Receiver<Vec<u8>>>,
    write_tx: mpsc::Sender<Vec<u8>>,
    cancel_flag: Arc<AtomicBool>,
}

#[tauri::command]
pub async fn start_terminal(
    app: AppHandle,
    server_id: i64,
) -> Result<String, AppError> {
    let state = app.state::<AppState>();

    let (server, password, private_key) = {
        let db = state.db.lock().unwrap();
        let s = find_by_id(&db, server_id)?.ok_or(AppError::ServerNotFound(server_id))?;
        let pw = s.encrypted_password.as_ref().map(|p| state.fernet.decrypt(p)).transpose()?;
        let pk = s.encrypted_private_key.as_ref().map(|k| state.fernet.decrypt(k)).transpose()?;
        (s, pw, pk)
    };

    let session_key = Uuid::new_v4().to_string();
    let cancel_flag = Arc::new(AtomicBool::new(false));

    let channel = tokio::task::spawn_blocking(move || {
        let sess = connect(
            &server.host, server.port, &server.username,
            password.as_deref(), private_key.as_deref(),
        )?;

        let mut ch = sess
            .channel_session()
            .map_err(|e| AppError::SshConnection(format!("Channel open failed: {}", e)))?;

        ch.request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
            .map_err(|e| AppError::SshConnection(format!("PTY request failed: {}", e)))?;

        ch.shell()
            .map_err(|e| AppError::SshConnection(format!("Shell start failed: {}", e)))?;

        Ok::<_, AppError>((ch, sess))
    })
    .await
    .map_err(|e| AppError::Other(format!("spawn_blocking join: {}", e)))??;

    let (mut channel, session) = channel;
    let (write_tx, write_rx) = mpsc::channel::<Vec<u8>>();

    let ts = TerminalSession {
        server_id,
        _session: session,
        channel: Some(channel),
        write_rx: Some(write_rx),
        write_tx,
        cancel_flag: cancel_flag.clone(),
    };

    let mut sessions = state.terminal_sessions.lock().unwrap();
    sessions.insert(session_key.clone(), ts);

    Ok(session_key)
}

#[tauri::command]
pub async fn start_reading(
    app: AppHandle,
    session_key: String,
) -> Result<(), AppError> {
    let state = app.state::<AppState>();

    let (mut channel, write_rx, flag) = {
        let mut sessions = state.terminal_sessions.lock().unwrap();
        let ts = sessions.get_mut(&session_key)
            .ok_or_else(|| AppError::TerminalNotFound(session_key.clone()))?;
        ts._session.set_timeout(100);
        let ch = ts.channel.take()
            .ok_or_else(|| AppError::TerminalNotFound("Channel already consumed".into()))?;
        let rx = ts.write_rx.take()
            .ok_or_else(|| AppError::TerminalNotFound("write_rx already consumed".into()))?;
        (ch, rx, ts.cancel_flag.clone())
    };

    let event_name = format!("terminal-event-{}", session_key);
    let stdout_app = app.clone();
    let stdout_event = event_name.clone();
    let stdout_cancel = flag;

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            if stdout_cancel.load(Ordering::Relaxed) { break; }

            match channel.read(&mut buf) {
                Ok(0) => {
                    let _ = stdout_app.emit(&stdout_event,
                        json!({"type": "disconnected", "reason": "Remote shell closed"}));
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = stdout_app.emit(&stdout_event,
                        json!({"type": "stdout", "data": data}));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock
                           || e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    let _ = stdout_app.emit(&stdout_event,
                        json!({"type": "disconnected", "reason": format!("{e}")}));
                    break;
                }
            }

            loop {
                match write_rx.try_recv() {
                    Ok(data) => {
                        use std::io::Write;
                        let _ = channel.write_all(&data);
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => break,
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn write_terminal(
    app: AppHandle,
    session_key: String,
    data: String,
) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let sessions = state.terminal_sessions.lock().unwrap();
    let ts = sessions.get(&session_key)
        .ok_or_else(|| AppError::TerminalNotFound(session_key.clone()))?;

    ts.write_tx.send(data.into_bytes())
        .map_err(|_| AppError::TerminalNotFound("Terminal session closed".into()))?;
    Ok(())
}

#[tauri::command]
pub async fn resize_terminal(
    _app: AppHandle,
    _session_key: String,
    _cols: u32,
    _rows: u32,
) -> Result<(), AppError> {
    Ok(())
}

#[tauri::command]
pub async fn close_terminal(
    app: AppHandle,
    session_key: String,
) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let mut sessions = state.terminal_sessions.lock().unwrap();
    if let Some(ts) = sessions.remove(&session_key) {
        ts.cancel_flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}
