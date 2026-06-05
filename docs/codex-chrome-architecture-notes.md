# Codex Chrome Architecture Notes

Date observed: June 6, 2026

These notes record the local Codex Chrome/browser-control artifacts observed on this machine and how they map to this project. They are intended as product and packaging guidance for the Formax Electron + `.formax` install shape.

## Observed Codex Files

Codex stores bundled browser-control plugins under:

```text
/Users/david/.codex/plugins/cache/openai-bundled/
```

The Chrome plugin observed locally is:

```text
/Users/david/.codex/plugins/cache/openai-bundled/chrome/26.602.30954/
```

Important files in that plugin:

```text
.codex-plugin/plugin.json
assets/google-chrome.png
assets/google-chrome-composer.png
docs/api.md
docs/api-troubleshooting.md
docs/chrome-troubleshooting.md
docs/confirmations.md
docs/file-management.md
docs/playwright.md
docs/screenshots.md
extension-host/macos/arm64/extension-host
scripts/browser-client.mjs
scripts/check-extension-installed.js
scripts/check-native-host-manifest.js
scripts/chrome-is-running.js
scripts/extension-id.json
scripts/installManifest.mjs
scripts/installed-browsers.js
scripts/open-chrome-window.js
skills/control-chrome/SKILL.md
```

The in-app browser plugin has a parallel structure:

```text
/Users/david/.codex/plugins/cache/openai-bundled/browser/26.602.30954/
```

It also includes:

```text
scripts/browser-client.mjs
docs/api.md
docs/playwright.md
skills/control-in-app-browser/SKILL.md
```

## Codex Runtime Binaries

Codex Desktop includes the following app-bundled binaries:

```text
/Applications/Codex.app/Contents/Resources/codex
/Applications/Codex.app/Contents/Resources/node
/Applications/Codex.app/Contents/Resources/node_repl
```

Observed sizes:

```text
codex      ~193 MB
node       ~114 MB
node_repl   ~14 MB
```

The Chrome plugin's native host binary is much smaller:

```text
/Users/david/.codex/plugins/cache/openai-bundled/chrome/26.602.30954/extension-host/macos/arm64/extension-host
```

Observed size:

```text
extension-host ~1.2 MB
```

## Codex Chrome Extension ID and Native Host

Codex Chrome plugin config:

```json
{
  "extensionId": "hehggadaopoacecdllhhajmbjkdcmajg",
  "extensionHostName": "com.openai.codexextension"
}
```

The installed Chrome native messaging manifest was observed at:

```text
/Users/david/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.openai.codexextension.json
```

Manifest shape:

```json
{
  "allowed_origins": [
    "chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/"
  ],
  "description": "Codex chrome native messaging host",
  "name": "com.openai.codexextension",
  "path": "/Users/david/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/extension-host",
  "type": "stdio"
}
```

Codex uses a `latest` symlink:

```text
/Users/david/.codex/plugins/cache/openai-bundled/chrome/latest
  -> /Users/david/.codex/plugins/cache/openai-bundled/chrome/26.602.30954
```

This allows the native host manifest to point at a stable path while the plugin version changes.

## Codex Native Host Install Config

`scripts/installManifest.mjs` writes both:

1. The Chrome native messaging manifest.
2. An `extension-host-config.json` file next to the native host binary.

The config written for the native host includes paths such as:

```text
browserClientPath
codexCliPath
codexHome
nodePath
nodeReplPath
proxyHost
proxyPort
resourcesPath
extensionId
channel
```

This is important: the native host binary is not a standalone browser SDK. It is configured with paths to the app-bundled Node runtime, Node REPL, Codex CLI, browser client, and Codex home directory.

## How Codex Exposes Browser Control to the Model

The skill bootstraps browser control through the Node REPL `js` tool:

```js
const { setupBrowserRuntime } = await import("<plugin root>/scripts/browser-client.mjs");
await setupBrowserRuntime({ globals: globalThis });
globalThis.browser = await agent.browsers.get("extension");
nodeRepl.write(await browser.documentation());
```

The skill explicitly says only the Node REPL `js` tool should be used for this browser surface. The model does not call dozens of direct Chrome tools. Instead, it calls:

```text
js({ code, timeout_ms?, title? })
```

and uses the JavaScript `agent.browsers.*` object model exposed by `browser-client.mjs`.

The API documentation exposed by Codex includes a broad object model:

```text
agent.browsers.get()
browser.user.openTabs()
browser.user.claimTab()
browser.tabs.new()
tab.goto()
tab.screenshot()
tab.cua.*
tab.dom_cua.*
tab.playwright.*
locator.*
tab.clipboard.*
tab.dev.logs()
capabilities.*
```

## Native Messaging Frame Codec

Codex does not expose a source file equivalent to Formax's Rust native frame codec, but the functionality must exist inside its `extension-host` binary.

Any Chrome native messaging host must read and write:

```text
4-byte little-endian message length + UTF-8 JSON payload
```

So Codex necessarily has an equivalent frame encoder/decoder internally, even if it is not visible as a separate source module.

Formax follows the same production shape:

```text
rust/native-host/src/native_frame.rs
```

This Rust module is used by the Rust native host production path. It encodes and decodes Chrome native messaging frames and enforces a maximum frame size before writing to stdout. The older TypeScript file:

The older JavaScript/TypeScript native frame fallback was removed. Production packages use the Rust native host and Rust frame codec.

## Mapping to Formax

Current Formax pieces map well to the observed Codex structure:

```text
Codex Chrome Web Store extension
  -> Formax Chrome Web Store extension

Codex extension-host binary
  -> Formax rust/native-host extension-host binary

Codex scripts/browser-client.mjs
  -> Formax mcp-node-repl/browser-client.js

Codex skills/control-chrome/SKILL.md
  -> Formax skill/SKILL.md

Codex docs/api.md and docs/playwright.md
  -> Formax shared/protocol.md plus future docs/api.md

Codex app-bundled node_repl
  -> Formax Electron-bundled node_repl or Formax MCP node_repl runtime
```

## Recommended Formax `.formax` Layout

For an Electron product that installs files into `.formax`, use a Codex-like layout:

```text
~/.formax/
  plugins/
    cache/
      formax/
        chrome/
          latest -> 0.1.0
          0.1.0/
            .formax-plugin/plugin.json
            extension-host/
              macos/
                arm64/
                  extension-host
            scripts/
              browser-client.mjs
              check-extension-installed.js
              check-native-host-manifest.js
              extension-id.json
              installManifest.mjs
            docs/
              api.md
              chrome-troubleshooting.md
              playwright.md
            skills/
              control-chrome/
                SKILL.md
```

The Chrome native messaging manifest should point to the `latest` symlink path:

```text
~/.formax/plugins/cache/formax/chrome/latest/extension-host/macos/arm64/extension-host
```

This makes updates simpler: install a new versioned directory, update `latest`, and rewrite or verify the native messaging manifest.

## Formax Production Extension ID

Current Formax Chrome Web Store extension ID:

```text
dchkbbjmkheilkmencpckilhmmcppdne
```

Native host manifest origins must include:

```text
chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/
```

Local unpacked development builds may have a different Chrome extension ID. For local testing, either install the Web Store build or run the native host installer with the local unpacked ID as an override.

## Design Takeaways

- Keep the Chrome extension as a Web Store install.
- Keep the native host as a small Rust binary.
- Keep browser interaction ergonomics in JavaScript through `browser-client`.
- Keep the model-facing surface small: expose a persistent `js` tool rather than dozens of direct Chrome tools.
- Use skill and docs files to teach the model how to bootstrap and use the browser object model.
- Use a versioned plugin cache plus `latest` symlink for update stability.
- Have Electron own installation, update, manifest writing, and health checks.
