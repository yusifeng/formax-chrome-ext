# Rust Native Host Handoff

You are helping migrate the Formax Chrome Native Messaging host from TypeScript/Node to Rust.

## Goal

Implement a Rust native host equivalent of:

```text
native-host/host.ts
```

The Rust binary should eventually replace the current Node SEA binary under:

```text
extension-host/<platform>/<arch>/extension-host
```

This migration is valuable because the current Node SEA binary is about 105MB. A Rust binary should be much smaller and closer to Codex's native-host shape.

## Current TypeScript Behavior

`native-host/host.ts` currently does four things:

1. Reads Chrome Native Messaging frames from stdin.
2. Writes Chrome Native Messaging frames to stdout.
3. Starts a local HTTP RPC server on `127.0.0.1:${AGENT_BROWSER_PORT || 8765}` at `POST /rpc`.
4. For each HTTP RPC request, sends a native message request to the Chrome extension and waits for the matching response frame.

Current data flow:

```text
agent/browserTools.ts
  -> HTTP POST http://127.0.0.1:8765/rpc
  -> native host
  -> Chrome Native Messaging stdout request frame
  -> extension/background.ts
  -> Chrome Native Messaging stdin response frame
  -> native host
  -> HTTP JSON response
```

Keep this protocol compatible.

## Current TypeScript Source Summary

Important constants:

```ts
const HTTP_HOST = "127.0.0.1";
const HTTP_PORT = Number(process.env.AGENT_BROWSER_PORT || 8765);
const RPC_TOKEN = process.env.AGENT_BROWSER_TOKEN || "";
```

Native frame protocol:

```text
4-byte unsigned little-endian length
UTF-8 JSON body
```

Chrome messages from extension:

```ts
{ type: "hello", extensionId?: string, version?: string }
{ type: "event", ... }
{ type: "response", id: string, ok: true, result: unknown }
{ type: "response", id: string, ok: false, error: { message?: string } }
```

Native host request to extension:

```ts
{
  type: "request",
  id: string,
  action: string,
  params: Record<string, unknown>
}
```

HTTP request:

```http
POST /rpc
content-type: application/json
x-agent-browser-token: <optional token>

{
  "action": "health",
  "params": {},
  "timeoutMs": 30000
}
```

HTTP success response:

```json
{
  "ok": true,
  "result": {}
}
```

HTTP error response:

```json
{
  "ok": false,
  "error": "message"
}
```

Error status behavior:

- non-`POST /rpc` -> 404 `{ ok: false, error: "Not found" }`
- bad/missing token when `AGENT_BROWSER_TOKEN` is set -> 401 `{ ok: false, error: "Unauthorized" }`
- missing string `action` -> 400 `{ ok: false, error: "Missing action" }`
- extension timeout/error/validation/server error -> 500 `{ ok: false, error: "..." }`

`uploadFile` validation:

- only validate when `action === "uploadFile"`
- `params.filePath` must be a non-empty string
- `params.filePath` must be absolute
- file must exist and be a regular file

## Recommended Rust Layout

Add a Rust workspace area:

```text
rust/
  native-host/
    Cargo.toml
    src/
      main.rs
      native_frame.rs
      rpc.rs
      chrome_stdio.rs
    tests/
      native_frame.rs
      rpc_host.rs
```

Keep the crate focused. Do not rewrite the Chrome extension, MCP server, JS browser client, or skill.

Recommended crate name:

```toml
name = "formax-native-host"
```

Recommended dependencies:

```toml
[dependencies]
anyhow = "1"
axum = "0.7"
bytes = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
uuid = { version = "1", features = ["v4"] }
thiserror = "1"

[dev-dependencies]
pretty_assertions = "1"
tempfile = "3"
```

If you prefer `hyper` directly instead of `axum`, that is fine. Keep the public HTTP behavior identical.

## Architecture

Suggested internal modules:

```text
native_frame.rs
  encode_native_message(value: &serde_json::Value) -> Result<Vec<u8>>
  decode_native_messages(buffer: &[u8]) -> Result<DecodedNativeMessages>

chrome_stdio.rs
  async task reading stdin frames
  async writer for stdout frames
  routes incoming Chrome messages to pending request map

rpc.rs
  HTTP server
  token check
  request JSON validation
  uploadFile validation
  calls extension through pending request manager

main.rs
  reads env vars
  starts stdio reader/writer
  starts HTTP server
  logs to stderr
```

Important: never write logs to stdout. Chrome Native Messaging stdout must contain only binary native frames. Logs go to stderr.

## Concurrency Model

Use Tokio.

Maintain pending requests as:

```rust
Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>
```

or a similar safe structure.

When HTTP `/rpc` arrives:

1. validate request
2. generate UUID
3. insert pending sender by id
4. write native frame to Chrome stdout
5. wait with timeout
6. remove pending entry on timeout/error
7. return HTTP JSON

When a Chrome response frame arrives:

1. parse JSON
2. if `type === "hello"`, log connection info to stderr
3. if `type === "event"`, log event JSON to stderr
4. if `type === "response"` and id exists, resolve the pending request
5. if response id is unknown, log to stderr
6. if frame/message is malformed, log to stderr and keep running when possible

On stdin EOF:

- log to stderr
- exit process with code 0

## Native Frame Requirements

Implement the Chrome Native Messaging frame codec inside Rust, even if `docs/prompts/rust-native-frame-handoff.md` also exists.

Frame format:

```text
u32 little-endian JSON body length
UTF-8 JSON body
```

Decoder must support:

- empty buffer
- buffer shorter than 4 bytes
- partial frame
- one full frame
- multiple concatenated frames
- invalid JSON in a full frame -> error

Add a max frame size guard:

```rust
const MAX_NATIVE_MESSAGE_BYTES: usize = 64 * 1024 * 1024;
```

Do not silently truncate.

## Build Output

Add a script that builds the Rust host and copies it to the existing product path:

```text
extension-host/macos/arm64/extension-host
extension-host/macos/x64/extension-host
extension-host/linux/x64/extension-host
extension-host/windows/x64/extension-host.exe
```

For this task, building only the current local platform is acceptable.

Suggested package script:

```json
{
  "build:rust-native-host": "cargo build --release --manifest-path rust/native-host/Cargo.toml && node scripts/copy-rust-native-host.js"
}
```

Suggested copy script:

```text
scripts/copy-rust-native-host.js
```

It should:

- detect `process.platform` and `process.arch`
- find `rust/native-host/target/release/formax-native-host`
- copy it to `extension-host/<platform>/<arch>/extension-host`
- chmod `755` on Unix

Keep the existing Node SEA script for now. Do not remove `scripts/build-extension-host-binary.js` unless explicitly asked.

## Installer Compatibility

The existing installers already prefer:

```text
extension-host/<platform>/<arch>/extension-host
```

and fall back to:

```text
native-host/host-launcher.sh
```

Do not break that behavior.

After Rust host is copied into `extension-host/...`, `bash native-host/install-macos.sh` should write a native host manifest whose `path` points at the Rust binary.

## Tests

Add Rust unit/integration tests.

### Native Frame Tests

Cover:

1. encodes and decodes one message
2. keeps partial frames as remaining bytes
3. decodes multiple concatenated frames
4. empty buffer
5. fewer than 4 bytes remaining
6. frame split exactly after header
7. invalid JSON complete frame returns error
8. oversized declared frame returns error
9. non-ASCII UTF-8 string
10. arrays/null/booleans/nested objects

### HTTP RPC Tests

Use an internal test harness instead of real Chrome.

At minimum test:

1. `GET /rpc` or wrong path returns 404
2. missing token returns 401 when token configured
3. missing action returns 400
4. valid action sends a native request frame with matching `action` and `params`
5. matching native response resolves HTTP with `{ ok: true, result }`
6. extension error response resolves HTTP 500 with error message
7. timeout returns HTTP 500 with timeout message
8. `uploadFile` rejects missing filePath
9. `uploadFile` rejects relative filePath
10. `uploadFile` accepts an existing absolute temp file

If fully testing stdin/stdout is awkward, factor the core host state into functions that can be tested with in-memory channels.

### Process-Level Smoke Test

Add one process-level test if practical:

1. spawn the Rust binary
2. read no stdout until an HTTP request is made
3. POST `/rpc` with action `health`
4. read one native request frame from child stdout
5. write matching native response frame to child stdin
6. assert HTTP response is `{ ok: true, result: ... }`

This is the closest test to real Chrome Native Messaging.

## Existing JS Validation To Keep Running

Do not remove existing JS tests. After Rust implementation, run:

```bash
npm test
```

Then run:

```bash
cargo test --manifest-path rust/native-host/Cargo.toml
```

If package scripts are added:

```bash
npm run test:rust-native-host
```

If formatting and linting are available:

```bash
cargo fmt --manifest-path rust/native-host/Cargo.toml --check
cargo clippy --manifest-path rust/native-host/Cargo.toml --all-targets -- -D warnings
```

If clippy is not installed, report that and continue.

## Real Browser E2E Validation

After the Rust binary is built and copied to `extension-host/...`:

1. run the installer:

```bash
bash native-host/install-macos.sh
```

2. reload the Chrome extension in `chrome://extensions`

3. verify popup shows `Connected`

4. run:

```bash
npm run test:real
```

If `npm run test:real` fails, capture:

- native host stderr logs
- HTTP error body
- Chrome extension popup status
- failing test name

Do not change browser behavior to satisfy tests unless the Rust host protocol differs from the TypeScript host.

## Non-Goals

Do not:

- rewrite `extension/background.ts`
- rewrite `mcp-node-repl`
- rewrite `agent/browserTools.ts`
- change the HTTP RPC URL or JSON envelope
- change Chrome native message format
- remove Node host fallback
- remove Node SEA script
- require Rust to run ordinary JS unit tests
- commit `target/`
- commit generated large binaries unless project policy says to do so

## Suggested Implementation Order

1. Create `rust/native-host` crate.
2. Implement `native_frame.rs` and tests.
3. Implement core pending request manager with in-memory tests.
4. Implement HTTP RPC layer and tests.
5. Implement stdin/stdout Chrome frame loop.
6. Add build/copy script.
7. Run Rust tests.
8. Build Rust binary into `extension-host/...`.
9. Run JS tests.
10. Run real browser E2E after reinstalling/reloading extension.

## Expected Final Summary

When finished, report:

- files added and changed
- binary path produced
- approximate binary size
- protocol compatibility notes
- test coverage added
- exact validation commands run
- any known gaps before replacing the Node host in production
