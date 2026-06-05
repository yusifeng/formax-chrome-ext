use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::State,
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Json},
    routing::any,
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::chrome_stdio::ChromeStdioHandle;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>>;

/// Result of a call to the Chrome extension.
#[derive(Debug)]
pub enum CallResult {
    Success(Value),
    Error(String),
}

/// Shared application state for the HTTP RPC handler.
#[derive(Clone)]
pub struct RpcState {
    pub pending: PendingMap,
    pub chrome_stdout: ChromeStdioHandle,
    pub rpc_token: String,
}

// ---------------------------------------------------------------------------
// HTTP request body
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RpcRequest {
    action: Option<String>,
    params: Option<Value>,
    #[serde(rename = "timeoutMs")]
    timeout_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router(state: RpcState) -> Router {
    Router::new()
        .route("/rpc", any(handle_rpc))
        .with_state(state)
        .fallback(handle_404)
}

async fn handle_404() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(json!({"ok": false, "error": "Not found"})),
    )
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async fn handle_rpc(
    method: Method,
    State(state): State<RpcState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    // --- Method check (matches TS: early return, not in try/catch) ---
    if method != Method::POST {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"ok": false, "error": "Not found"})),
        );
    }

    // --- Token check (matches TS: early return, not in try/catch) ---
    if !state.rpc_token.is_empty() {
        let incoming = headers
            .get("x-agent-browser-token")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        if incoming != state.rpc_token {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"ok": false, "error": "Unauthorized"})),
            );
        }
    }

    // --- Everything else is wrapped to match TS try/catch -> 500 ---
    match handle_rpc_inner(state, body).await {
        Ok(response) => response,
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"ok": false, "error": e})),
        ),
    }
}

/// Inner handler. Errors here map to HTTP 500, matching TS try/catch behavior.
async fn handle_rpc_inner(
    state: RpcState,
    body: axum::body::Bytes,
) -> Result<(StatusCode, Json<Value>), String> {
    // --- Parse request (TS: JSON.parse error -> 500 via try/catch) ---
    let req: RpcRequest =
        serde_json::from_slice(&body).map_err(|_| "Missing action".to_string())?;

    let action = req.action.ok_or_else(|| "Missing action".to_string())?;

    let params = req.params.unwrap_or(json!({}));
    let timeout_ms = req.timeout_ms.unwrap_or(30000).min(120_000);

    // --- Validate params (TS: validateActionParams throws -> 500 via try/catch) ---
    validate_action_params(&action, &params)?;

    // --- Call extension ---
    let result = call_extension(
        &state.pending,
        &state.chrome_stdout,
        &action,
        &params,
        timeout_ms,
    )
    .await?;

    Ok((StatusCode::OK, Json(json!({"ok": true, "result": result}))))
}

// ---------------------------------------------------------------------------
// Extension call logic
// ---------------------------------------------------------------------------

async fn call_extension(
    pending: &PendingMap,
    chrome_stdout: &ChromeStdioHandle,
    action: &str,
    params: &Value,
    timeout_ms: u64,
) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();

    let (tx, rx) = oneshot::channel::<CallResult>();

    // Register the pending request before sending to avoid race conditions.
    pending.lock().await.insert(id.clone(), tx);

    // Send the request frame to Chrome.
    let request = json!({
        "type": "request",
        "id": id,
        "action": action,
        "params": params,
    });

    if let Err(e) = chrome_stdout.send(request).await {
        pending.lock().await.remove(&id);
        return Err(format!("Failed to send message to Chrome: {e}"));
    }

    // Wait for response or timeout.
    let timeout = Duration::from_millis(timeout_ms);
    let result = tokio::time::timeout(timeout, rx).await;

    // Clean up pending entry.
    pending.lock().await.remove(&id);

    match result {
        Ok(Ok(CallResult::Success(value))) => Ok(value),
        Ok(Ok(CallResult::Error(msg))) => Err(msg),
        Ok(Err(_)) => Err("Channel closed unexpectedly".to_string()),
        Err(_) => Err(format!("Timed out waiting for extension action: {action}")),
    }
}

// ---------------------------------------------------------------------------
// Action parameter validation
// ---------------------------------------------------------------------------

fn validate_action_params(action: &str, params: &Value) -> Result<(), String> {
    if action != "uploadFile" {
        return Ok(());
    }

    let file_path = match params.get("filePath").and_then(|v| v.as_str()) {
        Some(s) if !s.trim().is_empty() => s,
        _ => return Err("uploadFile.params.filePath must be a non-empty string".to_string()),
    };

    if !Path::new(file_path).is_absolute() {
        return Err("uploadFile.params.filePath must be an absolute path".to_string());
    }

    let metadata = std::fs::metadata(file_path)
        .map_err(|_| format!("uploadFile path does not exist: {file_path}"))?;

    if !metadata.is_file() {
        return Err(format!("uploadFile path is not a file: {file_path}"));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Startup helper
// ---------------------------------------------------------------------------

/// Start the HTTP RPC server and return the address it's listening on.
pub async fn start_server(state: RpcState, host: &str, port: u16) -> std::io::Result<String> {
    let app = router(state);
    let addr = format!("{host}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    let local_addr = listener.local_addr()?;

    tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("HTTP server failed");
    });

    Ok(format!("http://{local_addr}/rpc"))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chrome_stdio::new_test_handle;
    use pretty_assertions::assert_eq;
    use serde_json::json;
    use tokio::sync::mpsc;

    fn test_state() -> (RpcState, mpsc::Receiver<Value>) {
        let (handle, rx) = new_test_handle();
        let state = RpcState {
            pending: Arc::new(Mutex::new(HashMap::new())),
            chrome_stdout: handle.clone(),
            rpc_token: String::new(),
        };
        (state, rx)
    }

    fn test_state_with_token(token: &str) -> (RpcState, mpsc::Receiver<Value>) {
        let (handle, rx) = new_test_handle();
        let state = RpcState {
            pending: Arc::new(Mutex::new(HashMap::new())),
            chrome_stdout: handle.clone(),
            rpc_token: token.to_string(),
        };
        (state, rx)
    }

    async fn call_rpc(
        state: RpcState,
        method: &str,
        path: &str,
        body: Value,
        token: Option<&str>,
    ) -> (StatusCode, Value) {
        use axum::http::Request;
        use tower::ServiceExt;

        let app = router(state);

        let mut builder = Request::builder()
            .method(method)
            .uri(path)
            .header("content-type", "application/json");

        if let Some(t) = token {
            builder = builder.header("x-agent-browser-token", t);
        }

        let req = builder
            .body(axum::body::Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap();

        let resp = app.oneshot(req).await.unwrap();
        let status = resp.status();
        let body_bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let value: Value = if body_bytes.is_empty() {
            json!({})
        } else {
            serde_json::from_slice(&body_bytes).unwrap_or(json!({}))
        };
        (status, value)
    }

    // --- Test: GET /rpc returns 404 ---
    #[tokio::test]
    async fn test_wrong_method_or_path_returns_404() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(state.clone(), "GET", "/rpc", json!({}), None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["ok"], false);
        assert_eq!(body["error"], "Not found");
    }

    // since axum 0.7 routes by method+path, GET /rpc won't match POST /rpc
    // so it falls through to the 404 from tower, but actually axum returns
    // 405 Method Not Allowed by default for wrong methods on matched paths,
    // but 404 for unmatched paths. Let's test a completely different path:
    #[tokio::test]
    async fn test_wrong_path_returns_404() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(state.clone(), "POST", "/wrong", json!({}), None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["ok"], false);
        assert_eq!(body["error"], "Not found");
    }

    // --- Test: Missing token returns 401 ---
    #[tokio::test]
    async fn test_missing_token_returns_401() {
        let (state, _handle) = test_state_with_token("secret123");

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health"}),
            None, // no token provided
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["ok"], false);
        assert_eq!(body["error"], "Unauthorized");
    }

    // --- Test: Bad token returns 401 ---
    #[tokio::test]
    async fn test_wrong_token_returns_401() {
        let (state, _handle) = test_state_with_token("secret123");

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health"}),
            Some("wrong-token"),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["ok"], false);
        assert_eq!(body["error"], "Unauthorized");
    }

    // --- Test: Missing action returns 500 (matches TS try/catch behavior) ---
    #[tokio::test]
    async fn test_missing_action_returns_500() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(state.clone(), "POST", "/rpc", json!({}), None).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["error"], "Missing action");
    }

    // --- Test: Valid action sends native request frame ---
    #[tokio::test]
    async fn test_valid_action_sends_native_request() {
        let (state, mut rx) = test_state();

        // Spawn a task that responds to the pending request
        let pending = state.pending.clone();
        tokio::spawn(async move {
            // Wait for the native frame to be sent
            let frame = rx.recv().await.unwrap();
            assert_eq!(frame["type"], "request");
            assert_eq!(frame["action"], "health");
            assert_eq!(frame["params"], json!({}));

            // Resolve the pending request
            let id = frame["id"].as_str().unwrap().to_string();
            let mut lock = pending.lock().await;
            if let Some(tx) = lock.remove(&id) {
                let _ = tx.send(CallResult::Success(json!({"status": "ok"})));
            }
        });

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health", "params": {}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["ok"], true);
        assert_eq!(body["result"], json!({"status": "ok"}));
    }

    // --- Test: Extension error response ---
    #[tokio::test]
    async fn test_extension_error_returns_500() {
        let (state, mut rx) = test_state();
        let pending = state.pending.clone();

        tokio::spawn(async move {
            let frame = rx.recv().await.unwrap();
            let id = frame["id"].as_str().unwrap().to_string();
            let mut lock = pending.lock().await;
            if let Some(tx) = lock.remove(&id) {
                let _ = tx.send(CallResult::Error("Something went wrong".to_string()));
            }
        });

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health"}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["ok"], false);
        assert_eq!(body["error"], "Something went wrong");
    }

    // --- Test: Timeout ---
    #[tokio::test]
    async fn test_timeout_returns_500() {
        let (state, _rx) = test_state();

        // Use a very short timeout; don't respond
        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health", "timeoutMs": 1}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["ok"], false);
        assert!(body["error"].as_str().unwrap().contains("Timed out"));
    }

    // --- Test: uploadFile rejects missing filePath (TS: throws -> 500) ---
    #[tokio::test]
    async fn test_upload_file_rejects_missing_path() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "uploadFile", "params": {}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(body["error"]
            .as_str()
            .unwrap()
            .contains("filePath must be a non-empty string"));
    }

    // --- Test: uploadFile rejects relative path (TS: throws -> 500) ---
    #[tokio::test]
    async fn test_upload_file_rejects_relative_path() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "uploadFile", "params": {"filePath": "relative/path.txt"}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(body["error"]
            .as_str()
            .unwrap()
            .contains("filePath must be an absolute path"));
    }

    // --- Test: uploadFile accepts existing absolute file ---
    #[tokio::test]
    async fn test_upload_file_accepts_existing_absolute_path() {
        let (state, mut rx) = test_state();
        let pending = state.pending.clone();

        // Create a temp file
        let tmp_dir = tempfile::TempDir::new().unwrap();
        let file_path = tmp_dir.path().join("test.txt");
        std::fs::write(&file_path, b"hello world").unwrap();
        let abs_path = file_path.to_string_lossy().to_string();

        tokio::spawn(async move {
            let frame = rx.recv().await.unwrap();
            let id = frame["id"].as_str().unwrap().to_string();
            let mut lock = pending.lock().await;
            if let Some(tx) = lock.remove(&id) {
                let _ = tx.send(CallResult::Success(json!({"uploaded": true})));
            }
        });

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "uploadFile", "params": {"filePath": abs_path}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["ok"], true);
    }

    // --- Test: Token works with correct value ---
    #[tokio::test]
    async fn test_correct_token_succeeds() {
        let (state, mut rx) = test_state_with_token("my-token");
        let pending = state.pending.clone();

        tokio::spawn(async move {
            let frame = rx.recv().await.unwrap();
            let id = frame["id"].as_str().unwrap().to_string();
            let mut lock = pending.lock().await;
            if let Some(tx) = lock.remove(&id) {
                let _ = tx.send(CallResult::Success(json!({"ok": true})));
            }
        });

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health"}),
            Some("my-token"),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["ok"], true);
    }
}
