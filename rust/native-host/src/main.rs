mod chrome_stdio;
mod native_frame;
mod rpc;

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::json;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::rpc::RpcState;

const DEFAULT_RPC_TOKEN_RELATIVE_PATH: &[&str] = &[".formax", "browser-rpc-token"];

#[tokio::main]
async fn main() {
    // --- Read environment variables ---
    let http_host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let http_port = std::env::var("AGENT_BROWSER_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(8765);
    let rpc_token = match resolve_rpc_token_from_env() {
        Ok(token) => token,
        Err(error) => {
            eprintln!("[native-host] Failed to initialize RPC auth token: {error}");
            std::process::exit(1);
        }
    };
    let allowed_upload_roots = std::env::var("AGENT_BROWSER_ALLOWED_UPLOAD_ROOTS")
        .ok()
        .map(|value| rpc::parse_allowed_upload_roots(&value))
        .unwrap_or_default();
    let native_diagnostics = native_diagnostics();

    // --- Shared pending requests map ---
    let pending: Arc<Mutex<HashMap<String, oneshot::Sender<crate::rpc::CallResult>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // --- Chrome stdout channel ---
    let (stdout_tx, stdout_rx) = tokio::sync::mpsc::channel::<serde_json::Value>(1024);
    let chrome_stdout = chrome_stdio::ChromeStdioHandle::new(stdout_tx);

    // --- Start stdin reader (reads frames from Chrome) ---
    let stdin_pending = pending.clone();
    let _stdin_handle = chrome_stdio::run_stdin_reader(stdin_pending);

    // --- Start stdout writer (sends frames to Chrome) ---
    let _stdout_handle = chrome_stdio::run_stdout_writer(stdout_rx);

    // --- Start HTTP RPC server ---
    let rpc_state = RpcState {
        pending,
        chrome_stdout,
        rpc_token,
        allowed_upload_roots,
        native_diagnostics,
    };

    match rpc::start_server(rpc_state, &http_host, http_port).await {
        Ok(addr) => {
            eprintln!("[native-host] HTTP RPC listening on {addr}");
        }
        Err(e) => {
            eprintln!("[native-host] Failed to start HTTP server: {e}");
            std::process::exit(1);
        }
    }

    // --- Keep the process alive indefinitely ---
    tokio::signal::ctrl_c().await.ok();
    eprintln!("[native-host] Shutting down.");
}

fn native_diagnostics() -> serde_json::Value {
    let config = read_runtime_extension_config();
    let extension_id = std::env::var("FORMAX_EXTENSION_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            config
                .get("extensionId")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        });
    let host_name = std::env::var("FORMAX_EXTENSION_HOST_NAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            config
                .get("extensionHostName")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "com.formax.browserhost".to_string());
    let manifest_path = native_host_manifest_path(&host_name);
    let expected_origin = extension_id
        .as_ref()
        .map(|id| format!("chrome-extension://{id}/"));

    json!({
        "manifestPath": manifest_path.map(|path| path.display().to_string()),
        "expectedOrigin": expected_origin,
        "hostName": host_name,
        "extensionId": extension_id
    })
}

fn read_runtime_extension_config() -> serde_json::Value {
    for config_path in runtime_config_candidates() {
        if let Ok(contents) = std::fs::read_to_string(&config_path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) {
                return value;
            }
        }
    }

    json!({})
}

fn runtime_config_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(runtime_root) = exe
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .and_then(Path::parent)
            .and_then(Path::parent)
        {
            candidates.push(runtime_root.join("config").join("extension-id.json"));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("config").join("extension-id.json"));
    }

    candidates
}

fn native_host_manifest_path(host_name: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;

    #[cfg(target_os = "macos")]
    {
        return Some(
            home.join("Library")
                .join("Application Support")
                .join("Google")
                .join("Chrome")
                .join("NativeMessagingHosts")
                .join(format!("{host_name}.json")),
        );
    }

    #[cfg(target_os = "linux")]
    {
        return Some(
            home.join(".config")
                .join("google-chrome")
                .join("NativeMessagingHosts")
                .join(format!("{host_name}.json")),
        );
    }

    #[cfg(target_os = "windows")]
    {
        return Some(
            home.join("AppData")
                .join("Local")
                .join("Formax")
                .join("NativeMessagingHosts")
                .join(format!("{host_name}.json")),
        );
    }

    #[allow(unreachable_code)]
    None
}

fn resolve_rpc_token_from_env() -> Result<String, String> {
    let explicit_token = std::env::var("AGENT_BROWSER_TOKEN").ok();
    let allow_unauthenticated =
        parse_bool_env_value(std::env::var("AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC").ok());
    let token_file = std::env::var("AGENT_BROWSER_TOKEN_FILE")
        .ok()
        .map(PathBuf::from);
    let home_dir = std::env::var_os("HOME").map(PathBuf::from);

    resolve_rpc_token(explicit_token, allow_unauthenticated, token_file, home_dir)
}

fn resolve_rpc_token(
    explicit_token: Option<String>,
    allow_unauthenticated: bool,
    token_file: Option<PathBuf>,
    home_dir: Option<PathBuf>,
) -> Result<String, String> {
    if let Some(token) = explicit_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(token.to_string());
    }

    if allow_unauthenticated {
        return Ok(String::new());
    }

    let path = match token_file {
        Some(path) => path,
        None => default_rpc_token_path(home_dir)?,
    };

    if let Some(token) = read_rpc_token_file(&path)? {
        return Ok(token);
    }

    let token = generate_rpc_token();
    write_rpc_token_file(&path, &token)?;
    Ok(token)
}

fn parse_bool_env_value(value: Option<String>) -> bool {
    matches!(
        value
            .as_deref()
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

fn default_rpc_token_path(home_dir: Option<PathBuf>) -> Result<PathBuf, String> {
    let mut path = home_dir.ok_or_else(|| {
        "AGENT_BROWSER_TOKEN is not set and HOME is unavailable; set AGENT_BROWSER_TOKEN or AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC=1 for local development".to_string()
    })?;

    for segment in DEFAULT_RPC_TOKEN_RELATIVE_PATH {
        path.push(segment);
    }

    Ok(path)
}

fn read_rpc_token_file(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(contents) => {
            let token = contents.trim();
            if token.is_empty() {
                Ok(None)
            } else {
                Ok(Some(token.to_string()))
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("failed to read {}: {error}", path.display())),
    }
}

fn write_rpc_token_file(path: &Path, token: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }

    let mut options = std::fs::OpenOptions::new();
    options.create(true).truncate(true).write(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options
        .open(path)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    writeln!(file, "{token}")
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn generate_rpc_token() -> String {
    format!(
        "formax-{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    use serde_json::json;

    /// Find a random available port by binding to port 0.
    fn random_available_port() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind to a random port");
        let port = listener.local_addr().unwrap().port();
        // Drop the listener — there is a tiny race, but acceptable for tests.
        drop(listener);
        port
    }

    /// Process-level smoke test: spawn the Rust binary, send an HTTP request,
    /// read the native frame from stdout, respond via stdin, and verify the
    /// HTTP response.
    ///
    /// Uses a random port to avoid conflicts with other running instances.
    #[test]
    fn smoke_test_process() {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR must be set when running via cargo test");

        // Find or build the binary
        let binary_path = format!("{}/target/debug/formax-native-host", manifest_dir);

        if !std::path::Path::new(&binary_path).exists() {
            // Auto-build if binary doesn't exist yet
            let status = Command::new("cargo")
                .args([
                    "build",
                    "--manifest-path",
                    &format!("{}/Cargo.toml", manifest_dir),
                ])
                .status()
                .expect("Failed to run cargo build for smoke test");
            assert!(status.success(), "cargo build failed");
        }

        let port = random_available_port();
        let port_str = port.to_string();

        let mut child = Command::new(&binary_path)
            .env("AGENT_BROWSER_PORT", &port_str)
            .env("AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("Failed to spawn native host binary");

        let mut stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();

        // Wait a moment for the server to start
        std::thread::sleep(Duration::from_millis(500));

        // Send HTTP POST /rpc with action health in a separate thread
        let client = reqwest::blocking::Client::new();
        let url = format!("http://127.0.0.1:{port}/rpc");
        let http_future = std::thread::spawn(move || {
            client
                .post(&url)
                .json(&json!({"action": "health", "params": {}}))
                .timeout(Duration::from_secs(5))
                .send()
        });

        // Read native frame from child stdout
        use crate::native_frame::MAX_NATIVE_MESSAGE_BYTES;
        let mut reader = std::io::BufReader::new(stdout);
        let mut header_buf = [0u8; 4];
        reader
            .read_exact(&mut header_buf)
            .expect("Failed to read frame header from child stdout");
        let body_len = u32::from_le_bytes(header_buf) as usize;
        assert!(
            body_len <= MAX_NATIVE_MESSAGE_BYTES,
            "Frame body too large: {body_len}"
        );

        let mut body = vec![0u8; body_len];
        reader
            .read_exact(&mut body)
            .expect("Failed to read frame body from child stdout");
        let request: serde_json::Value =
            serde_json::from_slice(&body).expect("Invalid JSON from child stdout");
        assert_eq!(request["type"], "request");
        assert_eq!(request["action"], "health");

        // Write matching response frame to child stdin
        let response = json!({
            "type": "response",
            "id": request["id"],
            "ok": true,
            "result": {"status": "ok"}
        });
        let response_frame = crate::native_frame::try_encode_native_message(&response)
            .expect("response should fit in native messaging frame");
        stdin
            .write_all(&response_frame)
            .expect("Failed to write response to child stdin");
        stdin.flush().unwrap();

        // Check HTTP response
        let http_result = http_future.join().expect("HTTP thread panicked");
        let resp = http_result.expect("HTTP request failed");
        assert_eq!(resp.status(), 200);
        let body: serde_json::Value = resp.json().unwrap();
        assert_eq!(body["ok"], true);
        assert_eq!(body["result"]["status"], "ok");

        // Kill the child process
        let _ = child.kill();
        let _ = child.wait();
    }

    #[test]
    fn resolve_rpc_token_prefers_explicit_env_token() {
        let tmp_dir = tempfile::TempDir::new().unwrap();
        let token_file = tmp_dir.path().join("token");

        let token = resolve_rpc_token(
            Some(" explicit-token \n".to_string()),
            false,
            Some(token_file.clone()),
            None,
        )
        .unwrap();

        assert_eq!(token, "explicit-token");
        assert!(!token_file.exists());
    }

    #[test]
    fn resolve_rpc_token_allows_explicit_dev_opt_out() {
        let token = resolve_rpc_token(None, true, None, None).unwrap();

        assert_eq!(token, "");
    }

    #[test]
    fn resolve_rpc_token_requires_home_or_token_file_outside_dev() {
        let error = resolve_rpc_token(None, false, None, None).unwrap_err();

        assert!(error.contains("AGENT_BROWSER_TOKEN is not set"));
    }

    #[test]
    fn resolve_rpc_token_creates_and_reuses_default_token_file() {
        let tmp_dir = tempfile::TempDir::new().unwrap();

        let first =
            resolve_rpc_token(None, false, None, Some(tmp_dir.path().to_path_buf())).unwrap();
        let second =
            resolve_rpc_token(None, false, None, Some(tmp_dir.path().to_path_buf())).unwrap();
        let token_file = tmp_dir.path().join(".formax").join("browser-rpc-token");

        assert!(first.starts_with("formax-"));
        assert_eq!(first, second);
        assert_eq!(std::fs::read_to_string(token_file).unwrap().trim(), first);
    }

    #[test]
    fn resolve_rpc_token_uses_configured_token_file() {
        let tmp_dir = tempfile::TempDir::new().unwrap();
        let token_file = tmp_dir.path().join("custom-token");
        std::fs::write(&token_file, " file-token\n").unwrap();

        let token = resolve_rpc_token(None, false, Some(token_file), None).unwrap();

        assert_eq!(token, "file-token");
    }
}
