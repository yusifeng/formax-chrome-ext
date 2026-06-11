# API Troubleshooting

Use this guide when JavaScript browser-client calls fail from the MCP
`node_repl`, agent wrapper, or test harness.

IMPORTANT: do not switch to unrelated browser-control paths before checking the
selected backend workflow first.

## Start Here

Check runtime health before retrying:

```js
const browser = await agent.browsers.get("extension");
const health = await browser.health();
console.log(JSON.stringify(health, null, 2));
```

Look at these fields first:

- `nativeConnected`
- `extension`
- `permissions`
- `fileUrlAccess`

If `nativeConnected` is false, stop and read `chrome-troubleshooting`.

## Bootstrap Failures

If the installed SDK entry point cannot be imported, or `browser`, `agent`, or
`tab` is missing in a fresh `node_repl` session, re-run the bootstrap from
`SKILL.md` using:

```text
__FORMAX_RUNTIME_HOME_DISPLAY__/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs
```

If that path still fails, reinstall the runtime:

```bash
npm run package:dist
npm run install:formax-runtime
```

## Common Failure Mapping

Keep user-facing messages short. Keep raw errors for logs and tests.

| Failure | Meaning | Next step |
| --- | --- | --- |
| Extension disconnected | Chrome extension is not connected. | Reload the extension and re-check health. |
| Native host missing | Chrome cannot launch the native host. | Reinstall the runtime. |
| Extension ID mismatch | Native host manifest does not allow the active extension ID. | Reinstall with the active extension ID. |
| Stale extension background | Chrome is still running old extension code. | Reload the extension in `chrome://extensions`. |
| File upload rejected | Path is invalid or blocked by validation. | Check absolute path, existence, and upload roots. |
| Debugger detached | Chrome dropped the debugger session. | Refresh state and rediscover the tab. |

Do not expose tokens, raw stack traces, internal RPC payloads, or unfiltered
CDP parameters in user-facing replies.

## Stale State

When a locator, ref, or `node_id` stops matching the page:

1. Refresh `tab.playwright.domSnapshot()` for locator work.
2. Refresh `tab.observe()` for structured visible elements and refs.
3. Refresh `tab.dom_cua.get_visible_dom()` for DOM CUA `node_id` actions.
4. Rebuild the target from current page state.

Do not reuse old refs after navigation or major page changes.

## Locator Failures

- `strict_mode_violation`: the locator is ambiguous. Scope tighter.
- `locator_not_found`: the target is missing, stale, hidden, or the locator is
  wrong. Re-snapshot before rebuilding it.
- `locator_actionability`: the target exists but is not actionable. Check
  visibility, occlusion, disabled state, and viewport position before retrying.
- `dom_cua_stale_node`: the current `node_id` is stale. Refresh
  `tab.dom_cua.get_visible_dom()` and choose a current node.

If two locator strategies fail on the same target, change strategy instead of
repeating the same pattern.

## Upload Failures

Before retrying an upload, check:

- the path is absolute
- the file exists and is a regular file
- the user asked for that exact file
- `AGENT_BROWSER_ALLOWED_UPLOAD_ROOTS` allows it when configured
- `fileUrlAccess` is enabled when the page itself is `file://`

Prefer the file chooser flow or a resolved file input. Do not guess at OS-level
picker automation.

## Debugger Detach And User Takeover

If a tab stops accepting actions or emits `debuggerDetached`:

1. Check whether DevTools is open or the user manually took over the page.
2. Read `browser.events.get({ limit: ... })` if you need recent diagnostics.
3. Re-discover the tab through `browser.user.openTabs()`.
4. Claim the returned descriptor instead of guessing the tab ID.

## Raw CDP And Evaluate

Use high-level APIs first. Raw CDP and mutating `evaluate` are diagnostic tools.

- Provide a short `reason`.
- Do not surface script bodies or bulky CDP params to users.
- Prefer locators, `tab.observe()`, screenshots, console events, and page
  errors before raw CDP.

## Bug Reports

Collect only non-secret diagnostics:

- `browser.health()` summary
- action name and high-level parameters
- current URL origin
- recent `browser.events.get({ limit: ... })` entries relevant to the failure
- whether this is Web Store install or local unpacked build
- whether DevTools was open on the controlled tab
