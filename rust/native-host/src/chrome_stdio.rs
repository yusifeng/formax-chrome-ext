use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;

use crate::native_frame::{self, DecodedNativeMessages};

/// Handle for sending JSON messages to the Chrome extension via stdout.
#[derive(Clone)]
pub struct ChromeStdioHandle {
    pub(crate) tx: mpsc::Sender<Value>,
}

impl ChromeStdioHandle {
    /// Create a new handle from a channel sender.
    pub fn new(tx: mpsc::Sender<Value>) -> Self {
        ChromeStdioHandle { tx }
    }

    /// Send a JSON value to the Chrome extension as a native messaging frame on stdout.
    pub async fn send(&self, value: Value) -> Result<(), String> {
        self.tx
            .send(value)
            .await
            .map_err(|_| "stdout channel closed".to_string())
    }
}

/// Create a test handle and a receiver for captured outgoing frames.
/// The receiver yields frames in the order they were sent.
#[cfg(test)]
pub fn new_test_handle() -> (ChromeStdioHandle, mpsc::Receiver<Value>) {
    let (tx, rx) = mpsc::channel(1024);
    (ChromeStdioHandle { tx }, rx)
}

/// Run the Chrome stdin reader loop.
///
/// Reads native messaging frames from stdin and dispatches them:
/// - `"hello"` messages are logged to stderr
/// - `"event"` messages are logged to stderr
/// - `"response"` messages resolve pending request entries
///
/// Returns a `JoinHandle` that completes when stdin reaches EOF.
pub fn run_stdin_reader(
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<crate::rpc::CallResult>>>>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let stdin = tokio::io::stdin();
        let mut reader = BufReader::new(stdin);
        let mut buffer = Vec::new();

        loop {
            // Read available bytes from stdin (non-blocking-like via async read)
            let mut chunk = vec![0u8; 8192];
            let n = match reader.read(&mut chunk).await {
                Ok(0) => {
                    // EOF
                    eprintln!("[native-host] Chrome closed native messaging stdin. Exiting.");
                    std::process::exit(0);
                }
                Ok(n) => n,
                Err(e) => {
                    eprintln!("[native-host] stdin read error: {e}");
                    continue;
                }
            };

            buffer.extend_from_slice(&chunk[..n]);

            // Decode as many complete frames as possible
            loop {
                match native_frame::decode_native_messages(&buffer) {
                    Ok(DecodedNativeMessages {
                        messages,
                        remaining,
                    }) => {
                        buffer = remaining.to_vec();

                        if messages.is_empty() {
                            break; // Need more data
                        }

                        for message in messages {
                            handle_chrome_message(&pending, message).await;
                        }
                    }
                    Err(e) => {
                        eprintln!("[native-host] failed to parse native message: {e}");
                        // Skip the bad frame data.
                        // We skip 4 bytes (header) to advance past the problematic frame.
                        // If we can't even read a header, just clear the buffer.
                        if buffer.len() >= 4 {
                            let len =
                                u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]])
                                    as usize;
                            let skip = 4 + len.min(buffer.len() - 4);
                            buffer.drain(..skip);
                        } else {
                            buffer.clear();
                        }
                        break;
                    }
                }
            }
        }
    })
}

/// Run the Chrome stdout writer task.
///
/// Reads JSON values from the channel and writes them as native messaging frames
/// to stdout. Because Chrome Native Messaging uses stdout for its protocol,
/// we must never write non-frame data there.
pub fn run_stdout_writer(mut rx: mpsc::Receiver<Value>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();

        while let Some(value) = rx.recv().await {
            let frame = match native_frame::try_encode_native_message(&value) {
                Ok(frame) => frame,
                Err(e) => {
                    eprintln!("[native-host] failed to encode native message: {e}");
                    continue;
                }
            };

            if let Err(e) = stdout.write_all(&frame).await {
                eprintln!("[native-host] stdout write error: {e}");
                break;
            }

            if let Err(e) = stdout.flush().await {
                eprintln!("[native-host] stdout flush error: {e}");
                break;
            }
        }
    })
}

/// Handle a single decoded message from the Chrome extension.
async fn handle_chrome_message(
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<crate::rpc::CallResult>>>>,
    message: Value,
) {
    let msg_type = message.get("type").and_then(|v| v.as_str());

    match msg_type {
        Some("hello") => {
            let ext_id = message
                .get("extensionId")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let version = message
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            eprintln!("[native-host] connected to extension {ext_id}, version {version}");
        }
        Some("event") => {
            eprintln!("[extension-event] {}", message);
        }
        Some("response") => {
            let msg_id = match message.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => {
                    eprintln!("[native-host] response message without id: {message}");
                    return;
                }
            };

            let mut lock = pending.lock().await;
            let sender = match lock.remove(&msg_id) {
                Some(s) => s,
                None => {
                    eprintln!("[native-host] response for unknown request id: {msg_id}");
                    return;
                }
            };
            drop(lock);

            let is_ok = message.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);

            if is_ok {
                let result = message.get("result").cloned().unwrap_or(Value::Null);
                let _ = sender.send(crate::rpc::CallResult::Success(result));
            } else {
                let error_value = message.get("error").cloned().unwrap_or(Value::Null);
                let _ = sender.send(crate::rpc::CallResult::Error(error_value));
            }
        }
        Some(other) => {
            eprintln!("[native-host] unknown message type '{other}': {message}");
        }
        None => {
            eprintln!("[native-host] message without type field: {message}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rpc::CallResult;
    use serde_json::json;

    #[tokio::test]
    async fn test_hello_message_logged() {
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // This should just log and not panic.
        handle_chrome_message(
            &pending,
            json!({"type": "hello", "extensionId": "ext-123", "version": "1.0"}),
        )
        .await;

        // No pending entries should be touched
        assert!(pending.lock().await.is_empty());
    }

    #[tokio::test]
    async fn test_event_message_logged() {
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        handle_chrome_message(
            &pending,
            json!({"type": "event", "data": "something happened"}),
        )
        .await;

        assert!(pending.lock().await.is_empty());
    }

    #[tokio::test]
    async fn test_response_resolves_pending() {
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let (tx, rx) = oneshot::channel::<CallResult>();
        pending.lock().await.insert("req-1".to_string(), tx);

        handle_chrome_message(
            &pending,
            json!({"type": "response", "id": "req-1", "ok": true, "result": {"success": true}}),
        )
        .await;

        let result = rx.await.unwrap();
        match result {
            CallResult::Success(val) => {
                assert_eq!(val, json!({"success": true}));
            }
            _ => panic!("expected success"),
        }

        assert!(pending.lock().await.is_empty());
    }

    #[tokio::test]
    async fn test_error_response_resolves_pending() {
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let (tx, rx) = oneshot::channel::<CallResult>();
        pending.lock().await.insert("req-2".to_string(), tx);

        handle_chrome_message(
            &pending,
            json!({"type": "response", "id": "req-2", "ok": false, "error": {"message": "failed"}}),
        )
        .await;

        let result = rx.await.unwrap();
        match result {
            CallResult::Error(value) => {
                assert_eq!(value["message"], "failed");
            }
            _ => panic!("expected error"),
        }
    }

    #[tokio::test]
    async fn test_error_response_preserves_structured_code() {
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let (tx, rx) = oneshot::channel::<CallResult>();
        pending.lock().await.insert("req-3".to_string(), tx);

        handle_chrome_message(
            &pending,
            json!({
                "type": "response",
                "id": "req-3",
                "ok": false,
                "error": {
                    "code": "requires_host_approval",
                    "message": "Browser access to example.com requires approval",
                    "details": {
                        "host": "example.com"
                    }
                }
            }),
        )
        .await;

        let result = rx.await.unwrap();
        match result {
            CallResult::Error(value) => {
                assert_eq!(value["code"], "requires_host_approval");
                assert_eq!(
                    value["message"],
                    "Browser access to example.com requires approval"
                );
                assert_eq!(value["details"]["host"], "example.com");
            }
            _ => panic!("expected error"),
        }
    }

    #[tokio::test]
    async fn test_unknown_response_id_logged() {
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // This should just log and not crash
        handle_chrome_message(
            &pending,
            json!({"type": "response", "id": "non-existent", "ok": true}),
        )
        .await;
    }

    #[tokio::test]
    async fn test_unknown_message_type_logged() {
        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<CallResult>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        handle_chrome_message(&pending, json!({"type": "unknown_type", "foo": "bar"})).await;
    }
}
