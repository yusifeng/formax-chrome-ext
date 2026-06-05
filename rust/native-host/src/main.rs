mod chrome_stdio;
mod native_frame;
mod rpc;

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{oneshot, Mutex};

use crate::rpc::RpcState;

#[tokio::main]
async fn main() {
    // --- Read environment variables ---
    let http_host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let http_port = std::env::var("AGENT_BROWSER_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(8765);
    let rpc_token = std::env::var("AGENT_BROWSER_TOKEN").unwrap_or_default();

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

#[cfg(test)]
mod tests {
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
}
