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

/// Commands sent from the frontend to the I/O thread via mpsc.
enum TerminalCmd {
    Write(Vec<u8>),
    Resize(u32, u32),
}

pub struct TerminalSession {
    pub server_id: i64,
    pub _session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
    pub cmd_rx: Option<mpsc::Receiver<TerminalCmd>>,
    cmd_tx: mpsc::Sender<TerminalCmd>,
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

    let (channel, session) = channel;
    let (cmd_tx, cmd_rx) = mpsc::channel::<TerminalCmd>();

    let ts = TerminalSession {
        server_id,
        _session: session,
        channel: Some(channel),
        cmd_rx: Some(cmd_rx),
        cmd_tx,
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

    let (mut channel, cmd_rx, flag) = {
        let mut sessions = state.terminal_sessions.lock().unwrap();
        let ts = sessions.get_mut(&session_key)
            .ok_or_else(|| AppError::TerminalNotFound(session_key.clone()))?;
        ts._session.set_blocking(false);
        let ch = ts.channel.take()
            .ok_or_else(|| AppError::TerminalNotFound("Channel already consumed".into()))?;
        let rx = ts.cmd_rx.take()
            .ok_or_else(|| AppError::TerminalNotFound("cmd_rx already consumed".into()))?;
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

            // Non-blocking read — returns immediately with data or WouldBlock
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
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    let _ = stdout_app.emit(&stdout_event,
                        json!({"type": "disconnected", "reason": format!("{e}")}));
                    break;
                }
            }

            // Drain pending commands (writes + resizes)
            loop {
                match cmd_rx.try_recv() {
                    Ok(TerminalCmd::Write(data)) => {
                        use std::io::Write;
                        let _ = channel.write_all(&data);
                    }
                    Ok(TerminalCmd::Resize(cols, rows)) => {
                        let _ = channel.request_pty_size(cols, rows, None, None);
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                    Err(mpsc::TryRecvError::Disconnected) => break,
                }
            }

            // Brief sleep to avoid busy-waiting (5ms = 200 Hz polling)
            std::thread::sleep(std::time::Duration::from_millis(5));
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

    ts.cmd_tx.send(TerminalCmd::Write(data.into_bytes()))
        .map_err(|_| AppError::TerminalNotFound("Terminal session closed".into()))?;
    Ok(())
}

#[tauri::command]
pub async fn resize_terminal(
    app: AppHandle,
    session_key: String,
    cols: u32,
    rows: u32,
) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let sessions = state.terminal_sessions.lock().unwrap();
    let ts = sessions.get(&session_key)
        .ok_or_else(|| AppError::TerminalNotFound(session_key.clone()))?;

    ts.cmd_tx.send(TerminalCmd::Resize(cols, rows))
        .map_err(|_| AppError::TerminalNotFound("Terminal session closed".into()))?;
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
