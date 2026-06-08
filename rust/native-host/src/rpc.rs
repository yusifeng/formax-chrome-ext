use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    extract::State,
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Json},
    routing::any,
    Router,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::chrome_stdio::ChromeStdioHandle;

const MAX_RPC_BODY_BYTES: usize = 1024 * 1024;
const MIN_RPC_TIMEOUT_MS: u64 = 1;
const MAX_RPC_TIMEOUT_MS: u64 = 120_000;
const ALLOWED_ACTIONS: &[&str] = &[
    "health",
    "reloadExtension",
    "getEvents",
    "clearEvents",
    "waitForEvent",
    "getDiagnostics",
    "getPolicy",
    "updatePolicy",
    "startSession",
    "nameSession",
    "openTabs",
    "claimTab",
    "getHistory",
    "clipboardReadText",
    "clipboardWriteText",
    "clipboardRead",
    "clipboardWrite",
    "createTab",
    "switchTab",
    "openUrl",
    "goBack",
    "goForward",
    "reload",
    "waitForLoadState",
    "waitForUrl",
    "waitForSelector",
    "waitForText",
    "observe",
    "elementInfo",
    "locatorQuery",
    "locatorAction",
    "locatorWait",
    "click",
    "drag",
    "moveMouse",
    "scroll",
    "typeText",
    "evaluate",
    "pressKey",
    "handleDialog",
    "screenshot",
    "uploadFile",
    "cdp",
    "listTabs",
    "getTab",
    "listDownloads",
    "waitForDownload",
    "getDevLogs",
    "getCapabilities",
    "closeTab",
    "finalizeSession",
    "endTurn",
    "stopSession",
];

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
    pub allowed_upload_roots: Vec<PathBuf>,
    pub native_diagnostics: Value,
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
            Json(json!({"ok": false, "error": "Not found", "errorCode": "not_found"})),
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
                Json(json!({"ok": false, "error": "Unauthorized", "errorCode": "unauthorized"})),
            );
        }
    }

    if body.len() > MAX_RPC_BODY_BYTES {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(
                json!({"ok": false, "error": "Request body too large", "errorCode": "request_body_too_large"}),
            ),
        );
    }

    // --- Everything else is wrapped to match TS try/catch -> 500 ---
    match handle_rpc_inner(state, body).await {
        Ok(response) => response,
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"ok": false, "error": e, "errorCode": error_code_for_message(&e)})),
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
    validate_action_allowlist(&action)?;

    let mut params = req.params.unwrap_or(json!({}));
    if action == "getDiagnostics" {
        inject_native_diagnostics(&mut params, &state.native_diagnostics)?;
    }
    let timeout_ms = validate_timeout_ms(req.timeout_ms.unwrap_or(30000))?;

    // --- Validate params (TS: validateActionParams throws -> 500 via try/catch) ---
    validate_action_params(&action, &params, &state.allowed_upload_roots)?;

    // --- Call extension ---
    let started = Instant::now();
    audit_rpc_event(&action, "started", 0, None);
    let result = call_extension(
        &state.pending,
        &state.chrome_stdout,
        &action,
        &params,
        timeout_ms,
    )
    .await;

    match result {
        Ok(value) => {
            audit_rpc_event(&action, "ok", started.elapsed().as_millis(), None);
            Ok((StatusCode::OK, Json(json!({"ok": true, "result": value}))))
        }
        Err(error) => {
            audit_rpc_event(
                &action,
                "error",
                started.elapsed().as_millis(),
                Some(&error),
            );
            Err(error)
        }
    }
}

fn inject_native_diagnostics(params: &mut Value, native_diagnostics: &Value) -> Result<(), String> {
    let params_object = params
        .as_object_mut()
        .ok_or_else(|| "params must be an object".to_string())?;
    params_object.insert("nativeDiagnostics".to_string(), native_diagnostics.clone());
    Ok(())
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

fn validate_action_params(
    action: &str,
    params: &Value,
    allowed_upload_roots: &[PathBuf],
) -> Result<(), String> {
    let params_object = params
        .as_object()
        .ok_or_else(|| format!("{action}.params must be an object"))?;

    validate_action_param_shape(action, params_object)?;

    if action != "uploadFile" {
        return Ok(());
    }

    let file_paths = upload_file_paths(params_object)?;

    for file_path in file_paths {
        validate_upload_file_path(&file_path, allowed_upload_roots)?;
    }

    Ok(())
}

fn upload_file_paths(params_object: &Map<String, Value>) -> Result<Vec<String>, String> {
    let mut file_paths = Vec::new();

    if let Some(file_path) = params_object.get("filePath") {
        match file_path.as_str() {
            Some(s) if !s.trim().is_empty() => file_paths.push(s.trim().to_string()),
            _ => return Err("uploadFile.params.filePath must be a non-empty string".to_string()),
        }
    }

    if let Some(file_path_values) = params_object.get("filePaths") {
        let items = file_path_values
            .as_array()
            .ok_or_else(|| "uploadFile.params.filePaths must be an array".to_string())?;

        if items.is_empty() {
            return Err("uploadFile.params.filePaths must not be empty".to_string());
        }

        for (index, item) in items.iter().enumerate() {
            match item.as_str() {
                Some(s) if !s.trim().is_empty() => file_paths.push(s.trim().to_string()),
                _ => {
                    return Err(format!(
                        "uploadFile.params.filePaths[{index}] must be a non-empty string"
                    ))
                }
            }
        }
    }

    if file_paths.is_empty() {
        return Err("uploadFile.params requires filePath or filePaths".to_string());
    }

    Ok(file_paths)
}

fn validate_upload_file_path(
    file_path: &str,
    allowed_upload_roots: &[PathBuf],
) -> Result<(), String> {
    if !Path::new(file_path).is_absolute() {
        return Err(format!(
            "uploadFile path must be an absolute path: {file_path}"
        ));
    }

    let canonical_file_path = std::fs::canonicalize(file_path)
        .map_err(|_| format!("uploadFile path does not exist: {file_path}"))?;
    let metadata = std::fs::metadata(&canonical_file_path)
        .map_err(|_| format!("uploadFile path does not exist: {file_path}"))?;

    if !metadata.is_file() {
        return Err(format!("uploadFile path is not a file: {file_path}"));
    }

    validate_upload_root(&canonical_file_path, allowed_upload_roots)
}

#[derive(Clone, Copy)]
enum ParamKind {
    String,
    Number,
    Boolean,
    Object,
    Locator,
    NumberArray,
    StringArray,
    ObjectArray,
}

type ParamSpec = (&'static str, ParamKind, bool);

fn validate_action_param_shape(action: &str, params: &Map<String, Value>) -> Result<(), String> {
    match action {
        "health" | "reloadExtension" => validate_param_specs(action, params, &[]),
        "getEvents" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("name", ParamKind::String, false),
                ("sinceSequence", ParamKind::Number, false),
                ("limit", ParamKind::Number, false),
                ("includeSnapshots", ParamKind::Boolean, false),
                ("snapshotLimit", ParamKind::Number, false),
            ],
        ),
        "clearEvents" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("name", ParamKind::String, false),
                ("sinceSequence", ParamKind::Number, false),
                ("includeSnapshots", ParamKind::Boolean, false),
            ],
        ),
        "waitForEvent" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("name", ParamKind::String, false),
                ("sinceSequence", ParamKind::Number, false),
                ("limit", ParamKind::Number, false),
                ("timeoutMs", ParamKind::Number, false),
                ("pollMs", ParamKind::Number, false),
            ],
        ),
        "getDiagnostics" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("eventLimit", ParamKind::Number, false),
                ("devLogLimit", ParamKind::Number, false),
                ("includeSnapshots", ParamKind::Boolean, false),
                ("nativeDiagnostics", ParamKind::Object, false),
            ],
        ),
        "getPolicy" => {
            validate_param_specs(action, params, &[("sessionId", ParamKind::String, false)])
        }
        "updatePolicy" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("decision", ParamKind::String, false),
                    ("sessionId", ParamKind::String, false),
                    ("host", ParamKind::String, false),
                    ("url", ParamKind::String, false),
                    ("reset", ParamKind::Boolean, false),
                ],
            )?;
            validate_string_enum(
                action,
                params,
                "decision",
                &["allow", "always_allow", "deny"],
            )
        }
        "startSession" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, true),
                ("turnId", ParamKind::String, false),
                ("active", ParamKind::Boolean, false),
                ("initialUrl", ParamKind::String, false),
                ("name", ParamKind::String, false),
            ],
        ),
        "nameSession" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, true),
                ("name", ParamKind::String, true),
            ],
        ),
        "openTabs" => validate_param_specs(
            action,
            params,
            &[
                ("currentWindow", ParamKind::Boolean, false),
                ("includeControlled", ParamKind::Boolean, false),
            ],
        ),
        "claimTab" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, true),
                ("turnId", ParamKind::String, false),
                ("claimToken", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("active", ParamKind::Boolean, false),
                ("allowUnsafeTabIdClaim", ParamKind::Boolean, false),
            ],
        ),
        "getHistory" => validate_param_specs(
            action,
            params,
            &[
                ("query", ParamKind::String, false),
                ("from", ParamKind::Number, false),
                ("to", ParamKind::Number, false),
                ("limit", ParamKind::Number, false),
                ("confirmed", ParamKind::Boolean, false),
            ],
        ),
        "clipboardReadText" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("confirmed", ParamKind::Boolean, false),
            ],
        ),
        "clipboardWriteText" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("text", ParamKind::String, true),
                ("confirmed", ParamKind::Boolean, false),
                ("sensitive", ParamKind::Boolean, false),
            ],
        ),
        "clipboardRead" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("confirmed", ParamKind::Boolean, false),
            ],
        ),
        "clipboardWrite" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("items", ParamKind::ObjectArray, true),
                ("confirmed", ParamKind::Boolean, false),
                ("sensitive", ParamKind::Boolean, false),
            ],
        ),
        "createTab" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, true),
                ("turnId", ParamKind::String, false),
                ("url", ParamKind::String, false),
                ("active", ParamKind::Boolean, false),
            ],
        ),
        "switchTab" | "listTabs" | "getTab" | "closeTab" => {
            validate_tab_lookup_params(action, params)
        }
        "openUrl" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("url", ParamKind::String, true),
                ("active", ParamKind::Boolean, false),
                ("timeoutMs", ParamKind::Number, false),
            ],
        ),
        "goBack" | "goForward" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("waitForLoad", ParamKind::Boolean, false),
                ("timeoutMs", ParamKind::Number, false),
            ],
        ),
        "reload" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("ignoreCache", ParamKind::Boolean, false),
                ("waitForLoad", ParamKind::Boolean, false),
                ("timeoutMs", ParamKind::Number, false),
            ],
        ),
        "waitForLoadState" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("state", ParamKind::String, false),
                    ("timeoutMs", ParamKind::Number, false),
                    ("idleMs", ParamKind::Number, false),
                ],
            )?;
            validate_string_enum(action, params, "state", &["load", "domcontentloaded", "networkidle"])
        }
        "waitForUrl" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("url", ParamKind::String, false),
                ("urlContains", ParamKind::String, false),
                ("urlRegex", ParamKind::String, false),
                ("timeoutMs", ParamKind::Number, false),
                ("pollMs", ParamKind::Number, false),
            ],
        ),
        "waitForSelector" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("selector", ParamKind::String, true),
                    ("state", ParamKind::String, false),
                    ("timeoutMs", ParamKind::Number, false),
                    ("pollMs", ParamKind::Number, false),
                ],
            )?;
            validate_string_enum(
                action,
                params,
                "state",
                &["attached", "visible", "hidden", "detached"],
            )
        }
        "waitForText" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("text", ParamKind::String, true),
                    ("state", ParamKind::String, false),
                    ("exact", ParamKind::Boolean, false),
                    ("caseSensitive", ParamKind::Boolean, false),
                    ("timeoutMs", ParamKind::Number, false),
                    ("pollMs", ParamKind::Number, false),
                ],
            )?;
            validate_string_enum(action, params, "state", &["present", "hidden"])
        }
        "observe" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("includeAccessibility", ParamKind::Boolean, false),
                ("maxAccessibilityNodes", ParamKind::Number, false),
                ("includeDomSnapshot", ParamKind::Boolean, false),
            ],
        ),
        "elementInfo" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("x", ParamKind::Number, true),
                ("y", ParamKind::Number, true),
                ("includeNonInteractable", ParamKind::Boolean, false),
            ],
        ),
        "locatorQuery" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("locator", ParamKind::Locator, true),
                    ("kind", ParamKind::String, true),
                    ("args", ParamKind::Object, false),
                    ("timeoutMs", ParamKind::Number, false),
                ],
            )?;
            validate_string_enum(
                action,
                params,
                "kind",
                &[
                    "count",
                    "allTextContents",
                    "textContent",
                    "innerText",
                    "getAttribute",
                    "isVisible",
                    "isEnabled",
                    "inputValue",
                    "isChecked",
                    "boundingBox",
                ],
            )
        }
        "locatorAction" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("locator", ParamKind::Locator, true),
                    ("kind", ParamKind::String, true),
                    ("args", ParamKind::Object, false),
                    ("timeoutMs", ParamKind::Number, false),
                    ("waitMs", ParamKind::Number, false),
                ],
            )?;
            validate_string_enum(
                action,
                params,
                "kind",
                &[
                    "click",
                    "dblclick",
                    "fill",
                    "type",
                    "press",
                    "clear",
                    "focus",
                    "hover",
                    "setChecked",
                    "selectOption",
                ],
            )
        }
        "locatorWait" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("locator", ParamKind::Locator, true),
                    ("state", ParamKind::String, false),
                    ("timeoutMs", ParamKind::Number, false),
                    ("pollMs", ParamKind::Number, false),
                ],
            )?;
            validate_string_enum(
                action,
                params,
                "state",
                &["attached", "visible", "hidden", "detached"],
            )
        }
        "click" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("ref", ParamKind::String, false),
                    ("selector", ParamKind::String, false),
                    ("x", ParamKind::Number, false),
                    ("y", ParamKind::Number, false),
                    ("button", ParamKind::String, false),
                    ("clickCount", ParamKind::Number, false),
                    ("modifiers", ParamKind::StringArray, false),
                    ("waitMs", ParamKind::Number, false),
                    ("confirmed", ParamKind::Boolean, false),
                ],
            )?;
            validate_string_enum(
                action,
                params,
                "button",
                &["left", "middle", "right", "back", "forward"],
            )?;
            validate_pointer_modifiers(action, params)
        }
        "drag" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("path", ParamKind::ObjectArray, true),
                    ("button", ParamKind::String, false),
                    ("modifiers", ParamKind::StringArray, false),
                    ("waitMs", ParamKind::Number, false),
                    ("confirmed", ParamKind::Boolean, false),
                ],
            )?;
            validate_string_enum(
                action,
                params,
                "button",
                &["left", "middle", "right", "back", "forward"],
            )?;
            validate_pointer_modifiers(action, params)?;
            validate_drag_path(action, params)
        }
        "moveMouse" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("x", ParamKind::Number, true),
                    ("y", ParamKind::Number, true),
                    ("modifiers", ParamKind::StringArray, false),
                    ("waitForArrival", ParamKind::Boolean, false),
                    ("waitMs", ParamKind::Number, false),
                ],
            )?;
            validate_pointer_modifiers(action, params)
        }
        "scroll" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("deltaX", ParamKind::Number, false),
                    ("deltaY", ParamKind::Number, false),
                    ("x", ParamKind::Number, false),
                    ("y", ParamKind::Number, false),
                    ("modifiers", ParamKind::StringArray, false),
                    ("waitMs", ParamKind::Number, false),
                ],
            )?;
            validate_pointer_modifiers(action, params)
        }
        "typeText" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("ref", ParamKind::String, false),
                ("selector", ParamKind::String, false),
                ("x", ParamKind::Number, false),
                ("y", ParamKind::Number, false),
                ("text", ParamKind::String, true),
                ("clear", ParamKind::Boolean, false),
                ("waitMs", ParamKind::Number, false),
                ("sensitive", ParamKind::Boolean, false),
                ("confirmed", ParamKind::Boolean, false),
            ],
        ),
        "evaluate" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("script", ParamKind::String, true),
                    ("awaitPromise", ParamKind::Boolean, false),
                    ("timeoutMs", ParamKind::Number, false),
                    ("mode", ParamKind::String, false),
                    ("confirmed", ParamKind::Boolean, false),
                    ("reason", ParamKind::String, false),
                ],
            )?;
            validate_string_enum(action, params, "mode", &["read", "write"])
        }
        "pressKey" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("key", ParamKind::String, true),
                    ("waitMs", ParamKind::Number, false),
                ],
            )?;
            validate_press_key_param(params)
        }
        "handleDialog" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("accept", ParamKind::Boolean, false),
                ("promptText", ParamKind::String, false),
            ],
        ),
        "screenshot" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                    ("format", ParamKind::String, false),
                    ("fullPage", ParamKind::Boolean, false),
                    ("clip", ParamKind::Object, false),
                ],
            )?;
            validate_string_enum(action, params, "format", &["png", "jpeg"])
        }
        "uploadFile" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("ref", ParamKind::String, false),
                ("selector", ParamKind::String, false),
                ("locator", ParamKind::Locator, false),
                ("filePath", ParamKind::String, false),
                ("filePaths", ParamKind::StringArray, false),
                ("waitMs", ParamKind::Number, false),
                ("confirmed", ParamKind::Boolean, false),
                ("confirmationId", ParamKind::String, false),
            ],
        ),
        "cdp" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("method", ParamKind::String, true),
                ("params", ParamKind::Object, false),
                ("timeoutMs", ParamKind::Number, false),
                ("originApproved", ParamKind::Boolean, false),
                ("confirmed", ParamKind::Boolean, false),
                ("reason", ParamKind::String, false),
            ],
        ),
        "getDevLogs" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("level", ParamKind::String, false),
                ("levels", ParamKind::StringArray, false),
                ("filter", ParamKind::String, false),
                ("sinceSequence", ParamKind::Number, false),
                ("limit", ParamKind::Number, false),
            ],
        ),
        "getCapabilities" => {
            validate_param_specs(
                action,
                params,
                &[
                    ("scope", ParamKind::String, false),
                    ("sessionId", ParamKind::String, false),
                    ("tabId", ParamKind::Number, false),
                ],
            )?;
            validate_string_enum(action, params, "scope", &["browser", "tab"])
        }
        "listDownloads" => {
            validate_download_params(action, params, &["in_progress", "interrupted", "complete"])
        }
        "waitForDownload" => validate_download_params(
            action,
            params,
            &["in_progress", "interrupted", "complete", "any"],
        ),
        "finalizeSession" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, true),
                ("keepTabIds", ParamKind::NumberArray, false),
                ("handoffTabIds", ParamKind::NumberArray, false),
                ("deliverableTabIds", ParamKind::NumberArray, false),
                ("turnId", ParamKind::String, false),
                ("closeRest", ParamKind::Boolean, false),
            ],
        ),
        "endTurn" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, true),
                ("turnId", ParamKind::String, true),
            ],
        ),
        "stopSession" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, true),
                ("closeTabs", ParamKind::Boolean, false),
            ],
        ),
        _ => Ok(()),
    }
}

fn validate_tab_lookup_params(action: &str, params: &Map<String, Value>) -> Result<(), String> {
    match action {
        "listTabs" => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("controlledOnly", ParamKind::Boolean, false),
                ("currentWindow", ParamKind::Boolean, false),
            ],
        ),
        _ => validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
            ],
        ),
    }
}

fn validate_download_params(
    action: &str,
    params: &Map<String, Value>,
    states: &[&str],
) -> Result<(), String> {
    if action == "waitForDownload" {
        validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("id", ParamKind::Number, false),
                ("state", ParamKind::String, false),
                ("urlContains", ParamKind::String, false),
                ("filenameContains", ParamKind::String, false),
                ("mimeContains", ParamKind::String, false),
                ("startedAfter", ParamKind::Number, false),
                ("limit", ParamKind::Number, false),
                ("timeoutMs", ParamKind::Number, false),
                ("pollMs", ParamKind::Number, false),
            ],
        )?;
    } else {
        validate_param_specs(
            action,
            params,
            &[
                ("sessionId", ParamKind::String, false),
                ("tabId", ParamKind::Number, false),
                ("id", ParamKind::Number, false),
                ("state", ParamKind::String, false),
                ("urlContains", ParamKind::String, false),
                ("filenameContains", ParamKind::String, false),
                ("mimeContains", ParamKind::String, false),
                ("startedAfter", ParamKind::Number, false),
                ("limit", ParamKind::Number, false),
            ],
        )?;
    }

    validate_string_enum(action, params, "state", states)
}

fn validate_param_specs(
    action: &str,
    params: &Map<String, Value>,
    specs: &[ParamSpec],
) -> Result<(), String> {
    for key in params.keys() {
        if !specs.iter().any(|(name, _, _)| name == key) {
            return Err(format!("{action}.params.{key} is not allowed"));
        }
    }

    for (name, kind, required) in specs {
        match params.get(*name) {
            Some(value) => validate_param_kind(action, name, *kind, value)?,
            None if *required => return Err(format!("{action}.params.{name} is required")),
            None => {}
        }
    }

    Ok(())
}

fn validate_param_kind(
    action: &str,
    name: &str,
    kind: ParamKind,
    value: &Value,
) -> Result<(), String> {
    match kind {
        ParamKind::String => {
            if value.is_string() {
                Ok(())
            } else {
                Err(format!("{action}.params.{name} must be a string"))
            }
        }
        ParamKind::Number => {
            if value.is_number() {
                Ok(())
            } else {
                Err(format!("{action}.params.{name} must be a number"))
            }
        }
        ParamKind::Boolean => {
            if value.is_boolean() {
                Ok(())
            } else {
                Err(format!("{action}.params.{name} must be a boolean"))
            }
        }
        ParamKind::Object => {
            if value.is_object() {
                Ok(())
            } else {
                Err(format!("{action}.params.{name} must be an object"))
            }
        }
        ParamKind::Locator => validate_locator(action, name, value),
        ParamKind::NumberArray => validate_number_array(action, name, value),
        ParamKind::StringArray => validate_string_array(action, name, value),
        ParamKind::ObjectArray => validate_object_array(action, name, value),
    }
}

fn validate_locator(action: &str, name: &str, value: &Value) -> Result<(), String> {
    let locator = value
        .as_object()
        .ok_or_else(|| format!("{action}.params.{name} must be an object"))?;

    validate_param_specs(
        action,
        locator,
        &[
            ("kind", ParamKind::String, true),
            ("selector", ParamKind::String, false),
            ("text", ParamKind::String, false),
            ("role", ParamKind::String, false),
            ("name", ParamKind::String, false),
            ("testId", ParamKind::String, false),
            ("frameSelectors", ParamKind::StringArray, false),
            ("and", ParamKind::Locator, false),
            ("or", ParamKind::Locator, false),
            ("has", ParamKind::Locator, false),
            ("hasNot", ParamKind::Locator, false),
            ("hasText", ParamKind::String, false),
            ("hasNotText", ParamKind::String, false),
            ("visible", ParamKind::Boolean, false),
            ("exact", ParamKind::Boolean, false),
            ("index", ParamKind::Number, false),
            ("strict", ParamKind::Boolean, false),
        ],
    )?;

    validate_string_enum_for_map(
        action,
        locator,
        "kind",
        &["css", "text", "role", "label", "placeholder", "testId"],
    )
}

fn validate_number_array(action: &str, name: &str, value: &Value) -> Result<(), String> {
    let items = value
        .as_array()
        .ok_or_else(|| format!("{action}.params.{name} must be an array"))?;

    if let Some((index, _)) = items.iter().enumerate().find(|(_, item)| !item.is_number()) {
        return Err(format!("{action}.params.{name}[{index}] must be a number"));
    }

    Ok(())
}

fn validate_string_array(action: &str, name: &str, value: &Value) -> Result<(), String> {
    let items = value
        .as_array()
        .ok_or_else(|| format!("{action}.params.{name} must be an array"))?;

    if let Some((index, _)) = items.iter().enumerate().find(|(_, item)| !item.is_string()) {
        return Err(format!("{action}.params.{name}[{index}] must be a string"));
    }

    Ok(())
}

fn validate_object_array(action: &str, name: &str, value: &Value) -> Result<(), String> {
    let items = value
        .as_array()
        .ok_or_else(|| format!("{action}.params.{name} must be an array"))?;

    if let Some((index, _)) = items.iter().enumerate().find(|(_, item)| !item.is_object()) {
        return Err(format!("{action}.params.{name}[{index}] must be an object"));
    }

    Ok(())
}

fn validate_drag_path(action: &str, params: &Map<String, Value>) -> Result<(), String> {
    let Some(path) = params.get("path").and_then(|value| value.as_array()) else {
        return Ok(());
    };

    if path.len() < 2 {
        return Err(format!(
            "{action}.params.path must contain at least two points"
        ));
    }

    for (index, point) in path.iter().enumerate() {
        let Some(point) = point.as_object() else {
            return Err(format!("{action}.params.path[{index}] must be an object"));
        };

        for key in point.keys() {
            if key != "x" && key != "y" {
                return Err(format!(
                    "{action}.params.path[{index}].{key} is not allowed"
                ));
            }
        }

        if !point.get("x").is_some_and(Value::is_number) {
            return Err(format!("{action}.params.path[{index}].x must be a number"));
        }

        if !point.get("y").is_some_and(Value::is_number) {
            return Err(format!("{action}.params.path[{index}].y must be a number"));
        }
    }

    Ok(())
}

fn validate_pointer_modifiers(action: &str, params: &Map<String, Value>) -> Result<(), String> {
    let Some(modifiers) = params.get("modifiers").and_then(|value| value.as_array()) else {
        return Ok(());
    };

    const ALLOWED: &[&str] = &["Alt", "Control", "ControlOrMeta", "Meta", "Shift"];
    let mut seen: Vec<&str> = Vec::new();

    for (index, modifier) in modifiers.iter().enumerate() {
        let Some(modifier) = modifier.as_str() else {
            return Err(format!(
                "{action}.params.modifiers[{index}] must be a string"
            ));
        };

        if !ALLOWED.contains(&modifier) {
            return Err(format!(
                "{action}.params.modifiers[{index}] must be one of: {}",
                ALLOWED.join(", ")
            ));
        }

        if seen.contains(&modifier) {
            return Err(format!(
                "{action}.params.modifiers must not contain duplicates"
            ));
        }

        seen.push(modifier);
    }

    Ok(())
}

fn validate_string_enum(
    action: &str,
    params: &Map<String, Value>,
    name: &str,
    allowed: &[&str],
) -> Result<(), String> {
    validate_string_enum_for_map(action, params, name, allowed)
}

fn validate_string_enum_for_map(
    action: &str,
    params: &Map<String, Value>,
    name: &str,
    allowed: &[&str],
) -> Result<(), String> {
    let Some(value) = params.get(name) else {
        return Ok(());
    };

    let Some(value) = value.as_str() else {
        return Ok(());
    };

    if allowed.contains(&value) {
        return Ok(());
    }

    Err(format!(
        "{action}.params.{name} must be one of: {}",
        allowed.join(", ")
    ))
}

fn validate_press_key_param(params: &Map<String, Value>) -> Result<(), String> {
    let Some(value) = params.get("key").and_then(|value| value.as_str()) else {
        return Ok(());
    };

    if is_supported_press_key(value) {
        return Ok(());
    }

    Err("pressKey.params.key must be a supported key or modifier combo".to_string())
}

fn is_supported_press_key(value: &str) -> bool {
    const BASE_KEYS: &[&str] = &[
        "Enter",
        "Tab",
        "Escape",
        "Backspace",
        "Delete",
        "Space",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
    ];
    const MODIFIERS: &[&str] = &["Alt", "Control", "ControlOrMeta", "Meta", "Shift"];

    if BASE_KEYS.contains(&value) || MODIFIERS.contains(&value) {
        return true;
    }

    let parts: Vec<&str> = value.split('+').collect();

    if parts.len() < 2 || parts.len() > 3 {
        return false;
    }

    let Some(key) = parts.last() else {
        return false;
    };

    if !BASE_KEYS.contains(key) {
        return false;
    }

    let modifiers = &parts[..parts.len() - 1];
    modifiers
        .iter()
        .all(|modifier| MODIFIERS.contains(modifier))
        && modifiers.windows(2).all(|pair| pair[0] != pair[1])
}

fn validate_upload_root(file_path: &Path, allowed_upload_roots: &[PathBuf]) -> Result<(), String> {
    if allowed_upload_roots.is_empty() {
        return Ok(());
    }

    let canonical_roots: Vec<PathBuf> = allowed_upload_roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .collect();

    if canonical_roots
        .iter()
        .any(|root| file_path.starts_with(root))
    {
        return Ok(());
    }

    Err(format!(
        "uploadFile path is outside allowed upload roots: {}",
        file_path.display()
    ))
}

pub fn parse_allowed_upload_roots(value: &str) -> Vec<PathBuf> {
    value
        .split(if cfg!(windows) { ';' } else { ':' })
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(PathBuf::from)
        .collect()
}

fn validate_action_allowlist(action: &str) -> Result<(), String> {
    if ALLOWED_ACTIONS.contains(&action) {
        return Ok(());
    }

    Err(format!("Unsupported action: {action}"))
}

fn validate_timeout_ms(timeout_ms: u64) -> Result<u64, String> {
    if !(MIN_RPC_TIMEOUT_MS..=MAX_RPC_TIMEOUT_MS).contains(&timeout_ms) {
        return Err(format!(
            "timeoutMs must be between {MIN_RPC_TIMEOUT_MS} and {MAX_RPC_TIMEOUT_MS}"
        ));
    }

    Ok(timeout_ms)
}

fn audit_rpc_event(action: &str, status: &str, duration_ms: u128, error: Option<&str>) {
    if let Some(error) = error {
        eprintln!(
            "[native-host] rpc action={} status={} durationMs={} error={}",
            sanitize_audit_field(action),
            sanitize_audit_field(status),
            duration_ms,
            sanitize_audit_field(error)
        );
    } else {
        eprintln!(
            "[native-host] rpc action={} status={} durationMs={}",
            sanitize_audit_field(action),
            sanitize_audit_field(status),
            duration_ms
        );
    }
}

fn sanitize_audit_field(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            '\n' | '\r' | '\t' => ' ',
            _ if ch.is_control() => ' ',
            _ => ch,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn error_code_for_message(message: &str) -> String {
    if message.starts_with("Unsupported action") {
        return "unsupported_action".to_string();
    }

    if message.starts_with("timeoutMs must be") {
        return "invalid_timeout".to_string();
    }

    if message.starts_with("uploadFile") {
        return "invalid_upload_file".to_string();
    }

    if message.contains(".params") {
        return "invalid_params".to_string();
    }

    if message.starts_with("Timed out waiting") {
        return "timeout".to_string();
    }

    if message.starts_with("Missing action") {
        return "missing_action".to_string();
    }

    if message.starts_with("Failed to send message") {
        return "native_send_failed".to_string();
    }

    if let Some((code, _)) = message.split_once(':') {
        if code
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_')
        {
            return code.to_string();
        }
    }

    "extension_error".to_string()
}

// ---------------------------------------------------------------------------
// Startup helper
// ---------------------------------------------------------------------------

/// Start the HTTP RPC server and return the address it's listening on.
pub async fn start_server(state: RpcState, host: &str, port: u16) -> std::io::Result<String> {
    let app = router(state);
    validate_loopback_host(host)?;
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

fn validate_loopback_host(host: &str) -> std::io::Result<()> {
    let is_loopback = matches!(host, "127.0.0.1" | "localhost" | "::1");

    if is_loopback {
        return Ok(());
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        format!("HTTP RPC host must be loopback, got {host}"),
    ))
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
            allowed_upload_roots: Vec::new(),
            native_diagnostics: json!({
                "manifestPath": "/tmp/com.formax.browserhost.json",
                "expectedOrigin": "chrome-extension://ext-123/",
                "hostName": "com.formax.browserhost",
                "extensionId": "ext-123"
            }),
        };
        (state, rx)
    }

    fn test_state_with_token(token: &str) -> (RpcState, mpsc::Receiver<Value>) {
        let (handle, rx) = new_test_handle();
        let state = RpcState {
            pending: Arc::new(Mutex::new(HashMap::new())),
            chrome_stdout: handle.clone(),
            rpc_token: token.to_string(),
            allowed_upload_roots: Vec::new(),
            native_diagnostics: json!({
                "manifestPath": "/tmp/com.formax.browserhost.json",
                "expectedOrigin": "chrome-extension://ext-123/",
                "hostName": "com.formax.browserhost",
                "extensionId": "ext-123"
            }),
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

    async fn call_rpc_raw_body(
        state: RpcState,
        method: &str,
        path: &str,
        body: Vec<u8>,
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

        let req = builder.body(axum::body::Body::from(body)).unwrap();
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
        assert_eq!(body["errorCode"], "unauthorized");
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
        assert_eq!(body["errorCode"], "unauthorized");
    }

    // --- Test: Missing action returns 500 (matches TS try/catch behavior) ---
    #[tokio::test]
    async fn test_missing_action_returns_500() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(state.clone(), "POST", "/rpc", json!({}), None).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["error"], "Missing action");
        assert_eq!(body["errorCode"], "missing_action");
    }

    #[tokio::test]
    async fn test_unsupported_action_is_rejected() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "notARealAction"}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["ok"], false);
        assert!(body["error"]
            .as_str()
            .unwrap()
            .contains("Unsupported action"));
        assert_eq!(body["errorCode"], "unsupported_action");
    }

    #[tokio::test]
    async fn test_rpc_body_size_limit_is_enforced() {
        let (state, _handle) = test_state();
        let body = vec![b'a'; MAX_RPC_BODY_BYTES + 1];

        let (status, body) = call_rpc_raw_body(state.clone(), "POST", "/rpc", body, None).await;

        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(body["ok"], false);
        assert_eq!(body["error"], "Request body too large");
        assert_eq!(body["errorCode"], "request_body_too_large");
    }

    #[tokio::test]
    async fn test_timeout_range_is_rejected() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health", "timeoutMs": MAX_RPC_TIMEOUT_MS + 1}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["ok"], false);
        assert!(body["error"]
            .as_str()
            .unwrap()
            .contains("timeoutMs must be between"));
        assert_eq!(body["errorCode"], "invalid_timeout");
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

    #[tokio::test]
    async fn test_get_diagnostics_injects_native_manifest_metadata() {
        let (state, mut rx) = test_state();
        let pending = state.pending.clone();

        tokio::spawn(async move {
            let frame = rx.recv().await.unwrap();
            assert_eq!(frame["type"], "request");
            assert_eq!(frame["action"], "getDiagnostics");
            assert_eq!(
                frame["params"]["nativeDiagnostics"],
                json!({
                    "manifestPath": "/tmp/com.formax.browserhost.json",
                    "expectedOrigin": "chrome-extension://ext-123/",
                    "hostName": "com.formax.browserhost",
                    "extensionId": "ext-123"
                })
            );

            let id = frame["id"].as_str().unwrap().to_string();
            let mut lock = pending.lock().await;
            if let Some(tx) = lock.remove(&id) {
                let _ = tx.send(CallResult::Success(json!({"diagnostics": true})));
            }
        });

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "getDiagnostics", "params": {"eventLimit": 5}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["ok"], true);
        assert_eq!(body["result"], json!({"diagnostics": true}));
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
        assert_eq!(body["errorCode"], "extension_error");
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
        assert_eq!(body["errorCode"], "timeout");
    }

    // --- Test: uploadFile rejects missing file path params (TS: throws -> 500) ---
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
            .contains("requires filePath or filePaths"));
        assert_eq!(body["errorCode"], "invalid_upload_file");
    }

    #[tokio::test]
    async fn test_params_must_be_an_object() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health", "params": []}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["errorCode"], "invalid_params");
        assert_eq!(body["error"], "health.params must be an object");
    }

    #[tokio::test]
    async fn test_unknown_params_are_rejected_before_forwarding() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "health", "params": {"unexpected": true}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["errorCode"], "invalid_params");
        assert_eq!(body["error"], "health.params.unexpected is not allowed");
    }

    #[tokio::test]
    async fn test_required_params_are_rejected_before_forwarding() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "openUrl", "params": {}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["errorCode"], "invalid_params");
        assert_eq!(body["error"], "openUrl.params.url is required");
    }

    #[tokio::test]
    async fn test_param_type_errors_are_rejected_before_forwarding() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "moveMouse", "params": {"x": 10, "y": "20"}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["errorCode"], "invalid_params");
        assert_eq!(body["error"], "moveMouse.params.y must be a number");
    }

    #[tokio::test]
    async fn test_param_enums_are_rejected_before_forwarding() {
        let (state, _handle) = test_state();

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "pressKey", "params": {"key": "BadKey"}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["errorCode"], "invalid_params");
        assert!(body["error"]
            .as_str()
            .unwrap()
            .contains("pressKey.params.key must be a supported key or modifier combo"));
    }

    #[test]
    fn test_extended_key_and_mouse_button_params_are_validated() {
        assert!(validate_action_params(
            "pressKey",
            &json!({"key": "ControlOrMeta+Shift+Space"}),
            &[]
        )
        .is_ok());
        assert!(
            validate_action_params("click", &json!({"x": 10, "y": 20, "button": "back"}), &[])
                .is_ok()
        );
        assert!(validate_action_params(
            "drag",
            &json!({
                "path": [{"x": 10, "y": 20}, {"x": 30, "y": 40}],
                "modifiers": ["ControlOrMeta", "Shift"]
            }),
            &[]
        )
        .is_ok());
        assert!(validate_action_params(
            "drag",
            &json!({
                "path": [{"x": 10, "y": 20}, {"x": 30, "y": 40}],
                "modifiers": ["BadModifier"]
            }),
            &[]
        )
        .is_err());
    }

    #[test]
    fn test_download_params_accept_session_and_tab_context() {
        assert!(validate_action_params(
            "waitForDownload",
            &json!({
                "sessionId": "session-a",
                "tabId": 101,
                "state": "complete",
                "filenameContains": "report"
            }),
            &[]
        )
        .is_ok());
    }

    #[test]
    fn test_wait_for_load_state_accepts_networkidle() {
        assert!(validate_action_params(
            "waitForLoadState",
            &json!({
                "state": "networkidle",
                "timeoutMs": 5000,
                "idleMs": 200
            }),
            &[]
        )
        .is_ok());
        assert!(validate_action_params(
            "waitForLoadState",
            &json!({
                "state": "commit"
            }),
            &[]
        )
        .is_err());
    }

    #[test]
    fn test_locator_params_accept_text_and_visibility_filters() {
        assert!(validate_action_params(
            "locatorQuery",
            &json!({
                "locator": {
                    "kind": "css",
                    "selector": ".card",
                    "frameSelectors": ["#outer-frame", "#inner-frame"],
                    "and": {
                        "kind": "css",
                        "selector": ".featured"
                    },
                    "or": {
                        "kind": "role",
                        "role": "button",
                        "name": "Open"
                    },
                    "has": {
                        "kind": "css",
                        "selector": ".badge",
                        "hasText": "Ready"
                    },
                    "hasNot": {
                        "kind": "text",
                        "text": "Archived"
                    },
                    "hasText": "Alpha",
                    "hasNotText": "Archived",
                    "visible": true
                },
                "kind": "count"
            }),
            &[]
        )
        .is_ok());
        assert!(validate_action_params(
            "locatorQuery",
            &json!({
                "locator": {
                    "kind": "css",
                    "selector": ".card",
                    "visible": "yes"
                },
                "kind": "count"
            }),
            &[]
        )
        .is_err());
        assert!(validate_action_params(
            "locatorQuery",
            &json!({
                "locator": {
                    "kind": "css",
                    "selector": ".card",
                    "has": {
                        "kind": "xpath",
                        "selector": "//span"
                    }
                },
                "kind": "count"
            }),
            &[]
        )
        .is_err());
    }

    #[test]
    fn test_element_info_params_require_coordinates() {
        assert!(validate_action_params(
            "elementInfo",
            &json!({
                "sessionId": "session-a",
                "tabId": 101,
                "x": 42,
                "y": 64,
                "includeNonInteractable": true
            }),
            &[]
        )
        .is_ok());
        assert!(validate_action_params("elementInfo", &json!({"x": 42}), &[]).is_err());
    }

    #[test]
    fn test_diagnostic_action_params_accept_reason() {
        assert!(validate_action_params(
            "evaluate",
            &json!({
                "script": "document.title",
                "mode": "read",
                "reason": "inspect page title"
            }),
            &[]
        )
        .is_ok());
        assert!(validate_action_params(
            "cdp",
            &json!({
                "method": "DOMSnapshot.captureSnapshot",
                "params": {},
                "originApproved": true,
                "confirmed": true,
                "reason": "diagnostic snapshot"
            }),
            &[]
        )
        .is_ok());
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
            .contains("uploadFile path must be an absolute path"));
        assert_eq!(body["errorCode"], "invalid_upload_file");
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

    #[tokio::test]
    async fn test_upload_file_accepts_existing_absolute_file_paths() {
        let (state, mut rx) = test_state();
        let pending = state.pending.clone();

        let tmp_dir = tempfile::TempDir::new().unwrap();
        let first_path = tmp_dir.path().join("first.txt");
        let second_path = tmp_dir.path().join("second.txt");
        std::fs::write(&first_path, b"first").unwrap();
        std::fs::write(&second_path, b"second").unwrap();
        let first_abs = first_path.to_string_lossy().to_string();
        let second_abs = second_path.to_string_lossy().to_string();

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
            json!({"action": "uploadFile", "params": {"filePaths": [first_abs, second_abs]}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["ok"], true);
    }

    #[tokio::test]
    async fn test_upload_file_rejects_path_outside_allowed_roots() {
        let (mut state, _rx) = test_state();
        let allowed_dir = tempfile::TempDir::new().unwrap();
        let outside_dir = tempfile::TempDir::new().unwrap();
        let file_path = outside_dir.path().join("outside.txt");
        std::fs::write(&file_path, b"outside").unwrap();
        state.allowed_upload_roots = vec![allowed_dir.path().to_path_buf()];

        let (status, body) = call_rpc(
            state.clone(),
            "POST",
            "/rpc",
            json!({"action": "uploadFile", "params": {"filePath": file_path.to_string_lossy()}}),
            None,
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["errorCode"], "invalid_upload_file");
        assert!(body["error"]
            .as_str()
            .unwrap()
            .contains("outside allowed upload roots"));
    }

    #[tokio::test]
    async fn test_upload_file_accepts_path_inside_allowed_roots() {
        let (mut state, mut rx) = test_state();
        let allowed_dir = tempfile::TempDir::new().unwrap();
        let file_path = allowed_dir.path().join("inside.txt");
        std::fs::write(&file_path, b"inside").unwrap();
        state.allowed_upload_roots = vec![allowed_dir.path().to_path_buf()];
        let pending = state.pending.clone();

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
            json!({"action": "uploadFile", "params": {"filePath": file_path.to_string_lossy()}}),
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

    #[tokio::test]
    async fn test_start_server_rejects_non_loopback_host() {
        let (state, _handle) = test_state();
        let error = start_server(state, "0.0.0.0", 0).await.unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);
        assert!(error.to_string().contains("must be loopback"));
    }

    #[test]
    fn test_audit_field_sanitization_removes_control_characters() {
        assert_eq!(
            sanitize_audit_field("health\nerror\tvalue\u{0007}"),
            "health error value"
        );
    }
}
