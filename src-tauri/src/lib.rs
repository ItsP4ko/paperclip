use std::fs::OpenOptions;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Manager, State};
use tauri_plugin_updater::UpdaterExt;

const API_BASE_URL: &str = "https://paperclip-paperclip-api.qiwa34.easypanel.host";

pub struct RunnerState(pub Mutex<Option<Child>>);

#[tauri::command]
fn get_runner_status(state: State<'_, RunnerState>) -> String {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return "unknown".to_string(),
    };
    match &mut *guard {
        Some(child) => match child.try_wait() {
            Ok(None) => "running".to_string(),
            Ok(Some(_)) => "stopped".to_string(),
            Err(_) => "unknown".to_string(),
        },
        None => "not_started".to_string(),
    }
}

/// Check for update and, if found, notify the frontend via the
/// `update-available` event. Re-checks on `install_update` command
/// to avoid storing the Update object across threads.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(update) = update {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

fn spawn_runner(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let log_dir = handle
            .path()
            .app_log_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"));
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("runner.log");

        let mut cmd = Command::new("npx");
        cmd.args(["relaycontrol@latest", "runner", "start", "--api-base", API_BASE_URL]);

        match OpenOptions::new().create(true).append(true).open(&log_path) {
            Ok(log_file) => match log_file.try_clone() {
                Ok(log_clone) => { cmd.stdout(Stdio::from(log_file)); cmd.stderr(Stdio::from(log_clone)); }
                Err(_) => { cmd.stdout(Stdio::null()); cmd.stderr(Stdio::null()); }
            },
            Err(_) => { cmd.stdout(Stdio::null()); cmd.stderr(Stdio::null()); }
        }

        match cmd.spawn() {
            Ok(child) => {
                let state = handle.state::<RunnerState>();
                if let Ok(mut guard) = state.0.lock() { *guard = Some(child); };
            }
            Err(e) => eprintln!("[runner] failed to spawn: {e}"),
        }
    });
}

fn check_for_updates(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Ok(updater) = handle.updater() {
            if let Ok(Some(update)) = updater.check().await {
                let _ = handle.emit(
                    "update-available",
                    serde_json::json!({ "version": update.version }),
                );
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(RunnerState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            spawn_runner(handle.clone());
            check_for_updates(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_runner_status, install_update])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<RunnerState>();
                let child = {
                    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
                    guard.take()
                };
                if let Some(mut child) = child { let _ = child.kill(); }
            }
        });
}
