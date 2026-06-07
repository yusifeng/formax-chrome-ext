# Formax Extension

Chrome extension + native host prototype for controlling real Chrome tabs from
an agent through high-level browser tools.

中文安装引导见 [docs/usage.zh-CN.md](docs/usage.zh-CN.md)。

## Development

Install dependencies:

```bash
npm install
```

Build TypeScript:

```bash
npm run build
```

Run checks:

```bash
npm run typecheck
npm test
```

Run real Chrome smoke/e2e checks after the extension and native host are
installed and the popup shows `Connected`:

```bash
npm run build
# Reload the unpacked extension in chrome://extensions after rebuilding.
npm run test:real
```

This starts a local HTTP fixture server and verifies the native host, session
creation, navigation, observation, accessibility tree, DOM snapshot, click,
typing, keyboard input, raw CDP, content-script cursor overlay, scroll,
screenshot, file upload, JavaScript dialogs, downloads, and history navigation.

Keep the controlled tab open for inspection:

```bash
KEEP_TABS=1 npm run test:real
```

Run the LLM-driven browser agent check:

```bash
npm run test:llm
```

By default this reads `DEEPSEEK_API_KEY` from `.env`, calls
`https://api.deepseek.com/chat/completions`, and uses `deepseek-v4-flash`.
Override with `LLM_BROWSER_BASE_URL` and `LLM_BROWSER_MODEL` when needed.

This starts a local fixture server, gives a small browser tool allowlist to a
model through function calling, executes the requested tool calls locally, and
then performs hard assertions over the resulting tool trace.

Start an interactive LLM browser debugging chat:

```bash
npm run chat:llm
```

Use `/trace` to inspect tool calls, `/reset` to clear chat context, `/cleanup`
to close tracked browser sessions, and `/exit` to quit.

Start the Codex-like LLM chat that exposes only the MCP `node_repl` tools:

```bash
npm run chat:node-repl
```

This starts the local MCP server, lists its three tools, and sends only those
tool schemas to the model. When browser control is needed, the model can inject
the browser runtime into the persistent JavaScript kernel:

```js
const { setupBrowserRuntime } = await import("./mcp-node-repl/browser-client.js");
await setupBrowserRuntime({ globals: globalThis });
const browser = await agent.browsers.get("extension");
await browser.openUrl("https://www.baidu.com");
```

Use `/bootstrap` in the chat to inject the browser runtime manually.
Use `/cleanup` to close controlled Agent browser sessions and tabs. Each chat
run writes a JSONL log under `logs/`; use `/log` to print the active log path.
The browser skill for this chat lives at `skill/SKILL.md`. Override it with
`LLM_NODE_REPL_SKILL=/absolute/path/to/SKILL.md`.

Package the MCP server, Chrome extension, native host, browser client SDK,
skill, and debug harness into `dist/`:

```bash
npm run package:dist
```

The release package includes a current-platform native host binary under
`extension-host/<platform>/<arch>/extension-host`. In the source tree, the same
binary is built under `build/extension-host/<platform>/<arch>/extension-host`.
Native host installers require that Rust binary; the older Node native host
fallback has been removed.

Install the packaged runtime into a Codex-like local cache under `~/.formax`
and write the Chrome native messaging manifest:

```bash
npm run package:dist
npm run install:formax-runtime
```

For a local unpacked Chrome extension whose ID differs from the Web Store ID:

```bash
npm run install:formax-runtime -- --extension-id <local-unpacked-extension-id>
```

Run the Codex-like MCP `node_repl` server:

```bash
npm run mcp:node-repl
```

It exposes exactly three MCP tools:

```text
js({ code, timeout_ms?, title? })
js_add_node_module_dir({ path })
js_reset({})
```

Smoke test the MCP server through the official MCP SDK client:

```bash
npm run test:mcp-node-repl
```

This first version is intentionally separate from the Chrome extension. It
provides a persistent Node-backed JavaScript kernel where state stored on
`globalThis` survives across `js` calls until `js_reset`. Browser control will
be added later through a browser client injected into this runtime.

## Chrome Setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this folder's `extension/` directory.
5. Install the native host manifest:

```bash
bash native-host/install-macos.sh
```

The extension ID used by the native host installer is configured in
`config/extension-id.json`. For the published extension it is:

```text
dchkbbjmkheilkmencpckilhmmcppdne
```

For temporary local-development overrides, use
`FORMAX_EXTENSION_ID=... bash native-host/install-macos.sh`.

After installing the native host, reload the extension in `chrome://extensions`.
The popup should show `Connected`.

## Manual Test

After the popup shows `Connected`, run:

```bash
node agent/manual-test.js
```

Expected result:

1. The native host health check returns an action envelope whose
   `result.nativeConnected` is `true`.
2. Chrome creates an Agent tab group.
3. The extension opens `https://example.com`.
4. `observe` returns page text and element refs.
5. By default the tab stays open for inspection.

Optional test modes:

```bash
CLICK_FIRST_ELEMENT=1 node agent/manual-test.js
CLOSE_TABS=1 node agent/manual-test.js
```

## Architecture

```text
Agent tools
  -> HTTP RPC at 127.0.0.1:8765/rpc
  -> rust/native-host extension-host
  -> Chrome Native Messaging
  -> extension/background.ts
  -> chrome.debugger / CDP
  -> real Chrome tab
  -> extension/content.ts visual cursor/highlight
```

The data contract is documented in `shared/protocol.md`. Agent-facing page
observations are marked as untrusted web content, and password input values are
redacted from the first version.
