# API Troubleshooting

Use this guide when JavaScript browser-client calls fail from the MCP
`node_repl`, agent wrapper, or test harness.

## Start With Health

Run this before retrying a browser action:

```js
const browser = await agent.browsers.get("extension");
const health = await browser.health();
console.log(JSON.stringify(health, null, 2));
```

Check these fields first:

- `nativeConnected`: the extension is connected to the native messaging host.
- `extension`: the loaded extension version and action registry.
- `permissions`: required Chrome permissions are present.
- `fileUrlAccess`: whether Chrome allows extension access to `file://` URLs.

If `nativeConnected` is false, switch to
`docs/chrome-troubleshooting.md#native-host-missing`.

## Runtime Bootstrap Fails

Symptoms:

- Importing `./scripts/browser-client.mjs` fails.
- Packaged installs cannot find the SDK from the current working directory.

Fix:

Use the guarded bootstrap from `skills/control-chrome/SKILL.md`. It tries the source checkout
path first, then the packaged install path:

```text
~/.formax/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs
```

If both paths fail, install the runtime again:

```bash
npm run package:dist
npm run install:formax-runtime
```

## Common Failure Mapping

Return concise user-facing messages. Keep raw errors for logs and tests.

| Failure | User-facing message |
| --- | --- |
| Extension disconnected | Formax is not connected to Chrome. Reload the extension and run the doctor check. |
| Native host missing | The local Formax native host is not installed or Chrome cannot launch it. Reinstall the runtime. |
| Extension ID mismatch | The active Chrome extension ID is not allowed by the native host manifest. Reinstall with the active unpacked extension ID. |
| Stale extension background | Chrome is still running an old extension background. Reload the extension in `chrome://extensions`. |
| File upload rejected | The file path must be absolute, exist locally, and pass native host upload-root validation. |
| Debugger detached | Chrome detached the debugger, often because DevTools opened or the tab changed. Refresh state before retrying. |

Do not show local tokens, full stack traces, internal RPC payloads, or unfiltered
CDP parameters in final user-facing replies.

## Stale Handles And Snapshots

Symptoms:

- A locator resolves to nothing after navigation.
- A ref from `tab.observe()` no longer clicks the intended element.
- Strict-mode or actionability checks fail repeatedly.

Fix:

1. Take a fresh `tab.observe()` after navigation, modal changes, reloads, or
   locator failures.
2. Rebuild selectors from the latest snapshot.
3. Retry on the same tab.
4. Open a new tab only when the user asks for one or the old tab is closed.

## Upload Failures

Check the file before calling upload helpers:

- Path is absolute.
- File exists and is a regular file.
- User requested that exact file and destination.
- If `AGENT_BROWSER_ALLOWED_UPLOAD_ROOTS` is set, the file is under an allowed
  root.
- If the page is `file://`, Chrome file URL access is enabled for the extension.

Prefer file chooser-aware helpers when available. Direct file input assignment
only works when the target input can be resolved and Chrome accepts the file.

## Debugger Detach And User Takeover

If a tab emits `debuggerDetached` or suddenly stops accepting actions:

1. Check whether the user opened DevTools or manually took over the page.
2. Re-read events with `browser.getEvents()` if diagnostics are needed.
3. Use `browser.user.openTabs()` to rediscover the tab.
4. Claim the returned descriptor instead of guessing the tab ID.
5. Continue only after the user-visible tab state is clear.

## Raw CDP And Evaluate Diagnostics

Use high-level APIs for normal work. Raw CDP and mutating `evaluate` are
advanced diagnostic tools:

- Provide a short `reason`.
- Do not log script bodies, secrets, or bulky CDP parameters in user-facing
  messages.
- Prefer `tab.observe()`, locators, screenshots, network summaries, console
  events, and page errors before raw CDP.

## What To Collect For A Bug Report

Collect only non-secret diagnostics:

- `browser.health()` summary with tokens removed.
- The action name and high-level parameters.
- Current URL origin, not full sensitive query strings.
- Recent `browser.getEvents()` entries relevant to the failure.
- Whether this is Web Store install or local unpacked build.
- Whether Chrome DevTools was open on the controlled tab.
