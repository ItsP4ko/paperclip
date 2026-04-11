use std::fs::OpenOptions;
use std::io::Write as IoWrite;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

/// Append a timestamped line to `updater.log` inside the app log dir.
fn updater_log(handle: &tauri::AppHandle, msg: &str) {
    let log_dir = handle
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"));
    let _ = std::fs::create_dir_all(&log_dir);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("updater.log"))
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{secs}] {msg}");
    }
}

const API_BASE_URL: &str = "https://paperclip-paperclip-api.qiwa34.easypanel.host";

pub struct RunnerState(pub Mutex<Option<Child>>);
pub struct EmbeddedServerState(pub Mutex<Option<Child>>);
pub struct EmbeddedServerPin(pub Mutex<Option<String>>);

#[derive(serde::Serialize)]
pub struct TailscaleStatus {
    installed: bool,
    running: bool,
    ip: Option<String>,
    hostname: Option<String>,
    dns_name: Option<String>,
}

#[derive(serde::Serialize)]
pub struct RemoteControlInfo {
    active: bool,
    url: Option<String>,
    pin: Option<String>,
    tailscale: TailscaleStatus,
    server_port: u16,
}

#[tauri::command]
fn read_claude_md(path: String) -> Result<String, String> {
    let full_path = std::path::Path::new(&path).join("CLAUDE.md");
    match std::fs::read_to_string(&full_path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn write_claude_md(path: String, content: String) -> Result<(), String> {
    let full_path = std::path::Path::new(&path).join("CLAUDE.md");
    std::fs::write(&full_path, content).map_err(|e| e.to_string())
}

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

#[tauri::command]
fn get_tailscale_status() -> TailscaleStatus {
    // Try to run `tailscale status --json` to detect Tailscale state
    let output = Command::new("tailscale")
        .args(["status", "--json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let json_str = String::from_utf8_lossy(&out.stdout);
            // Parse the JSON to extract Self node info
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                let self_node = &parsed["Self"];
                let tailscale_ips = self_node["TailscaleIPs"]
                    .as_array()
                    .and_then(|ips| ips.first())
                    .and_then(|ip| ip.as_str())
                    .map(String::from);
                let hostname = self_node["HostName"]
                    .as_str()
                    .map(String::from);
                let dns_name = self_node["DNSName"]
                    .as_str()
                    .map(|s| s.trim_end_matches('.').to_string());

                TailscaleStatus {
                    installed: true,
                    running: true,
                    ip: tailscale_ips,
                    hostname,
                    dns_name,
                }
            } else {
                TailscaleStatus {
                    installed: true,
                    running: true,
                    ip: None,
                    hostname: None,
                    dns_name: None,
                }
            }
        }
        Ok(_) => {
            // Command ran but failed (Tailscale installed but not running)
            TailscaleStatus {
                installed: true,
                running: false,
                ip: None,
                hostname: None,
                dns_name: None,
            }
        }
        Err(_) => {
            // Command not found (Tailscale not installed)
            TailscaleStatus {
                installed: false,
                running: false,
                ip: None,
                hostname: None,
                dns_name: None,
            }
        }
    }
}

#[tauri::command]
fn get_remote_control_status(
    server_state: State<'_, EmbeddedServerState>,
    pin_state: State<'_, EmbeddedServerPin>,
) -> RemoteControlInfo {
    let tailscale = get_tailscale_status();
    let server_port: u16 = 3100;

    let active = {
        let mut guard = match server_state.0.lock() {
            Ok(g) => g,
            Err(_) => {
                return RemoteControlInfo {
                    active: false,
                    url: None,
                    pin: None,
                    tailscale,
                    server_port,
                };
            }
        };
        match &mut *guard {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        }
    };

    let url = if active {
        tailscale
            .dns_name
            .as_ref()
            .or(tailscale.ip.as_ref())
            .map(|host| format!("http://{}:{}", host, server_port))
    } else {
        None
    };

    let pin = if active {
        pin_state.0.lock().ok().and_then(|g| g.clone())
    } else {
        None
    };

    RemoteControlInfo {
        active,
        url,
        pin,
        tailscale,
        server_port,
    }
}

#[tauri::command]
fn activate_remote_control(
    handle: tauri::AppHandle,
    server_state: State<'_, EmbeddedServerState>,
    pin_state: State<'_, EmbeddedServerPin>,
) -> Result<RemoteControlInfo, String> {
    let tailscale = get_tailscale_status();
    if !tailscale.running {
        return Err("Tailscale is not running. Please start Tailscale first.".to_string());
    }

    let server_port: u16 = 3100;

    // Check if already running — return existing PIN
    {
        let mut guard = server_state.0.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.as_mut() {
            if matches!(child.try_wait(), Ok(None)) {
                let url = tailscale
                    .dns_name
                    .as_ref()
                    .or(tailscale.ip.as_ref())
                    .map(|host| format!("http://{}:{}", host, server_port));
                let pin = pin_state.0.lock().ok().and_then(|g| g.clone());
                return Ok(RemoteControlInfo {
                    active: true,
                    url,
                    pin,
                    tailscale,
                    server_port,
                });
            }
        }
    }

    // Generate a fresh 6-digit PIN
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(123456);
    let pin_value = format!("{:06}", seed % 1_000_000);

    // Store the PIN for later retrieval
    {
        let mut guard = pin_state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(pin_value.clone());
    }

    // Build the allowed hostnames from Tailscale info
    let mut allowed_hostnames = Vec::new();
    if let Some(ref dns) = tailscale.dns_name {
        allowed_hostnames.push(dns.clone());
    }
    if let Some(ref ip) = tailscale.ip {
        allowed_hostnames.push(ip.clone());
    }
    let hostnames_csv = allowed_hostnames.join(",");

    let log_dir = handle
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"));
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("remote-control-server.log");

    // Validate hostnames to prevent shell injection.
    // Tailscale hostnames are DNS names or IPs, so they should only contain
    // alphanumeric chars, dots, hyphens, and colons (for IPv6).
    for hostname in &allowed_hostnames {
        if !hostname.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == ':') {
            return Err(format!("Invalid hostname from Tailscale: {}", hostname));
        }
    }

    // Start the embedded backend in authenticated/private mode with the PIN
    let shell_cmd = format!(
        "PAPERCLIP_DEPLOYMENT_MODE=authenticated \
         PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
         PAPERCLIP_ALLOWED_HOSTNAMES='{hostnames}' \
         PAPERCLIP_AUTH_BASE_URL_MODE=auto \
         PAPERCLIP_REMOTE_PIN='{pin}' \
         HOST=0.0.0.0 \
         PORT={port} \
         npx relaycontrol@latest run",
        hostnames = hostnames_csv,
        pin = pin_value,
        port = server_port,
    );

    let mut cmd = Command::new("/bin/zsh");
    cmd.arg("-l").arg("-c").arg(&shell_cmd);

    match OpenOptions::new().create(true).append(true).open(&log_path) {
        Ok(log_file) => match log_file.try_clone() {
            Ok(log_clone) => {
                cmd.stdout(Stdio::from(log_file));
                cmd.stderr(Stdio::from(log_clone));
            }
            Err(_) => {
                cmd.stdout(Stdio::null());
                cmd.stderr(Stdio::null());
            }
        },
        Err(_) => {
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
        }
    }

    match cmd.spawn() {
        Ok(child) => {
            let mut guard = server_state.0.lock().map_err(|e| e.to_string())?;
            *guard = Some(child);

            let url = tailscale
                .dns_name
                .as_ref()
                .or(tailscale.ip.as_ref())
                .map(|host| format!("http://{}:{}", host, server_port));

            Ok(RemoteControlInfo {
                active: true,
                url,
                pin: Some(pin_value),
                tailscale,
                server_port,
            })
        }
        Err(e) => Err(format!("Failed to start embedded server: {}", e)),
    }
}

#[tauri::command]
fn deactivate_remote_control(
    server_state: State<'_, EmbeddedServerState>,
    pin_state: State<'_, EmbeddedServerPin>,
) -> Result<(), String> {
    let mut guard = server_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    if let Ok(mut pin_guard) = pin_state.0.lock() {
        *pin_guard = None;
    }
    Ok(())
}

/// Manual install_update command kept as fallback in case auto-update
/// fails and the frontend needs to retry.
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

        // Use a login shell so macOS GUI apps inherit the full PATH
        // (Homebrew, nvm, etc. are not in the minimal PATH Tauri gets from the Dock).
        let shell_cmd = format!("npx relaycontrol@latest runner start --api-base {API_BASE_URL}");
        let mut cmd = Command::new("/bin/zsh");
        cmd.arg("-l").arg("-c").arg(&shell_cmd);

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
    let h = handle.clone();
    tauri::async_runtime::spawn(async move {
        updater_log(&h, "starting update check...");

        let updater = match h.updater() {
            Ok(u) => u,
            Err(e) => {
                updater_log(&h, &format!("failed to create updater: {e}"));
                let _ = h.emit(
                    "update-error",
                    serde_json::json!({ "error": e.to_string() }),
                );
                return;
            }
        };

        updater_log(&h, "updater created, checking for updates...");

        match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                updater_log(&h, &format!("update available: v{version}, auto-installing..."));
                let _ = h.emit(
                    "update-installing",
                    serde_json::json!({ "version": version }),
                );

                match update.download_and_install(|_, _| {}, || {}).await {
                    Ok(_) => {
                        updater_log(&h, "update installed, restarting...");
                        h.restart();
                    }
                    Err(e) => {
                        updater_log(&h, &format!("auto-install failed: {e}"));
                        let _ = h.emit(
                            "update-available",
                            serde_json::json!({ "version": version }),
                        );
                    }
                }
            }
            Ok(None) => {
                updater_log(&h, "app is up to date");
            }
            Err(e) => {
                updater_log(&h, &format!("check failed: {e}"));
                let _ = h.emit(
                    "update-error",
                    serde_json::json!({ "error": e.to_string() }),
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
        .manage(EmbeddedServerState(Mutex::new(None)))
        .manage(EmbeddedServerPin(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            spawn_runner(handle.clone());
            check_for_updates(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runner_status,
            install_update,
            read_claude_md,
            write_claude_md,
            get_tailscale_status,
            get_remote_control_status,
            activate_remote_control,
            deactivate_remote_control
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Kill runner
                let runner_state = app_handle.state::<RunnerState>();
                let runner_child = {
                    let mut guard = runner_state.0.lock().unwrap_or_else(|e| e.into_inner());
                    guard.take()
                };
                if let Some(mut child) = runner_child { let _ = child.kill(); }

                // Kill embedded server if running
                let server_state = app_handle.state::<EmbeddedServerState>();
                let server_child = {
                    let mut guard = server_state.0.lock().unwrap_or_else(|e| e.into_inner());
                    guard.take()
                };
                if let Some(mut child) = server_child { let _ = child.kill(); }
            }
        });
}
