# Formax Extension

Chrome extension + native host prototype for controlling real Chrome tabs from
an agent through high-level browser tools.

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

## Chrome Setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this folder's `extension/` directory.
5. Copy the extension ID.
6. Install the native host manifest:

```bash
bash native-host/install-macos.sh <extension-id>
```

The current local extension ID is:

```text
hooonkcoopaigliifkabcdjfmjjffmbm
```

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
  -> native-host/host.ts
  -> Chrome Native Messaging
  -> extension/background.ts
  -> chrome.debugger / CDP
  -> real Chrome tab
  -> extension/content.ts visual cursor/highlight
```

The data contract is documented in `shared/protocol.md`. Agent-facing page
observations are marked as untrusted web content, and password input values are
redacted from the first version.
