# Formax Codex Gap Handoff

This handoff is for another coding agent continuing the work to close the gap
between Formax browser control and Codex-style Chrome/browser control.

## Current User Intent

The user asked to pause active implementation and create this handoff file so a
different AI can continue. Do not continue broad feature work until the next
agent/user explicitly resumes it.

The active longer-running objective before the pause was:

```text
Complete notes/codex-gap-todolist.md, preferably test-first where appropriate.
```

The main roadmap is:

```text
/Users/david/Documents/github/formax-extension/notes/codex-gap-todolist.md
```

## Workspace

Repository:

```text
/Users/david/Documents/github/formax-extension
```

Project shape:

- `extension/`: Chrome MV3 extension. TypeScript compiles to adjacent JS that
  the unpacked extension loads.
- `mcp-node-repl/`: persistent Node-backed MCP server and browser-client SDK.
- `agent/`: agent-facing browser tool wrappers.
- `shared/`: protocol contract, shared types, schema, registry, policy.
- `rust/native-host/`: Rust native messaging HTTP/RPC host.
- `tests/`: Vitest unit/facade/schema tests and real-browser scripts.
- `docs/`: roadmap, API docs, backend boundary docs.

Important local rule from AGENTS.md:

- Keep protocol changes synchronized across `shared/types.ts`,
  `shared/protocol.md`, shared schemas, extension, native host, SDK, agent
  wrappers, docs, and tests.
- Extension background is MV3 classic service worker. Do not import shared TS
  directly into `extension/background.ts`; use the existing classic-script
  approach.
- Use `npm run build` to regenerate JS from TS.
- Use `apply_patch` for manual edits.
- Do not revert unrelated dirty work. The worktree is intentionally dirty.

## Validation Commands

Normal validation:

```bash
npm run build
npm run docs:browser-api
npm run typecheck
npm test
cd rust/native-host && cargo test
cd ../..
git diff --check
```

Rust tests must be run from:

```text
/Users/david/Documents/github/formax-extension/rust/native-host
```

## Current Validation Status

Before the pause, validation results were:

- `npm run build`: passed.
- `npm run docs:browser-api`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, now `62 passed`.
- `cargo test`: passed before the later SDK-only download helper change, then
  not rerun after that helper.
- `git diff --check`: passed before the later SDK-only download helper change,
  then not rerun after that helper or this handoff file.

Recommended first step for the next agent:

```bash
npm run build
npm run docs:browser-api
npm run typecheck
npm test
cd rust/native-host && cargo test
cd ../..
git diff --check
```

## Dirty Worktree

The worktree is expected to be dirty. Do not reset it. Notable modified files:

- `.gitignore`
- `README.md`
- `agent/browserTools.ts` and generated `agent/browserTools.js`
- `extension/background.ts` and generated `extension/background.js`
- `extension/manifest.json`
- `mcp-node-repl/browser-client.ts` and generated
  `mcp-node-repl/browser-client.js`
- `package.json`
- `rust/native-host/src/chrome_stdio.rs`
- `rust/native-host/src/main.rs`
- `rust/native-host/src/rpc.rs`
- `shared/action-registry.ts` and generated JS
- `shared/browser-policy.ts` and generated JS
- `shared/protocol.md`
- `shared/types.ts`
- `skill/SKILL.md`
- `tests/browser-client-facade.test.ts`
- `tests/browser-policy.test.ts`
- `tests/browser-tool-schemas.test.ts`

Important untracked files created during this effort:

- `docs/backend-boundaries.md`
- `docs/browser-client-api.md`
- `notes/codex-gap-todolist.md`
- `extension/action-validator.ts`
- `extension/action-validator.js`
- `extension/clipboard-offscreen.html`
- `extension/clipboard-offscreen.ts`
- `extension/clipboard-offscreen.js`
- `scripts/generate-browser-client-api-docs.js`
- `shared/browser-tool-schemas.ts`
- `shared/browser-tool-schemas.js`

`.gitignore` has an unrelated user change adding `repomix-output/`. Do not
revert it.

## What Was Completed Earlier In This Effort

High-level completed areas before the latest pause:

- Codex-like SDK facade:
  - `agent.browsers.get("extension")`
  - `browser.browserId`
  - `browser.capabilities`
  - `browser.documentation()`
  - `browser.user`
  - `browser.tabs`
  - `tab.playwright`
  - `tab.cua`
  - `tab.dom_cua`
  - `tab.clipboard`
  - `tab.dev`
  - Backward-compatible flat aliases remain.

- Shared schema/validation:
  - Added `shared/browser-tool-schemas.ts/js`.
  - Agent validates RPC params before sending.
  - Native host validates HTTP RPC request shapes before forwarding.
  - Extension validates incoming action params via
    `extension/action-validator.ts/js`.
  - Protocol alignment tests check action registry, extension supported actions,
    tool schemas, and protocol docs.

- Policy/security foundation:
  - Session and persistent host allows.
  - Host blocklist enforcement for navigation, click, typing, upload, raw CDP,
    and evaluate.
  - Policy classifier for risky actions.
  - Secret redaction helper.
  - Read-only evaluate mode.
  - Raw CDP origin approval.
  - Native host loopback bind, action allowlist, request size limit, timeout
    bounds, upload path validation, upload roots, audit logging, and default
    auth token behavior outside dev.

- Browser history:
  - Backend `getHistory`.
  - SDK `browser.user.history({ query, from, to, limit, confirmed: true })`.
  - Per-request confirmation required; no always-allow path.
  - Manifest includes `history`.

- Clipboard:
  - `clipboardReadText`, `clipboardWriteText`, `clipboardRead`,
    `clipboardWrite`.
  - SDK `tab.clipboard.readText/writeText/read/write`.
  - MV3 offscreen document support:
    `extension/clipboard-offscreen.html`,
    `extension/clipboard-offscreen.ts/js`.
  - Manifest permissions: `offscreen`, `clipboardRead`, `clipboardWrite`.

- Screenshot API:
  - `tab.screenshot({ fullPage })`
  - `tab.screenshot({ clip })`
  - PNG/JPEG.
  - SDK enriches screenshots with `mimeType`, `dataUrl`, `bytes`, optional
    `path`.
  - SDK save helpers: `path` / `saveToFile`, absolute paths only.
  - Locator and DOM CUA element screenshot helpers exist.

- Locator runtime:
  - CSS and semantic locators.
  - `first`, `last`, `nth`, bounded `all`.
  - Queries: `count`, `allTextContents`, `textContent`, `innerText`,
    `getAttribute`, `isVisible`, `isEnabled`, `inputValue`, `isChecked`,
    `boundingBox`.
  - Actions: `click`, `dblclick`, `fill`, `type`, `press`, `check`, `uncheck`,
    `setChecked`, `selectOption`, `hover`, `focus`, `clear`, `waitFor`.
  - First-pass Playwright-style actionability checks.
  - Structured SDK errors:
    - `BrowserTimeoutError`
    - `BrowserStrictModeError`

- CUA / DOM CUA before the latest turn:
  - `tab.cua.click`, `double_click`, `move`, `scroll`, `type`, `keypress`.
  - More key support and key combos.
  - Mouse buttons: `left`, `middle`, `right`, `back`, `forward`.
  - `tab.dom_cua.scroll({ node_id, x, y })`.

## Latest Completed Work Before Pause

### 1. Implemented `tab.cua.drag({ path, keys })`

Files touched:

- `shared/types.ts`
- `shared/action-registry.ts`
- `shared/browser-tool-schemas.ts`
- `agent/browserTools.ts`
- `extension/action-validator.ts`
- `extension/background.ts`
- `rust/native-host/src/rpc.rs`
- `shared/protocol.md`
- `mcp-node-repl/browser-client.ts`
- `tests/browser-client-facade.test.ts`
- `tests/browser-tool-schemas.test.ts`
- generated JS files via `npm run build`
- generated API docs via `npm run docs:browser-api`
- `notes/codex-gap-todolist.md`

Behavior added:

- New action: `drag`
- New tool: `browser_drag`
- New SDK path: `tab.cua.drag({ path, keys/modifiers/keypress, button, waitMs })`
- Drag path requires at least two `{ x, y }` points.
- Drag uses CDP `Input.dispatchMouseEvent`:
  - initial `mouseMoved`
  - `mousePressed`
  - one or more `mouseMoved` events with pressed button state
  - final `mouseReleased`
- `button` supports `left`, `middle`, `right`, `back`, `forward`.
- Pointer modifiers support `Alt`, `Control`, `ControlOrMeta`, `Meta`, `Shift`.

Also completed in the same area:

- `tab.cua.click`, `double_click`, `move`, and `scroll` now accept modifier
  args and pass them to backend as `modifiers`.
- SDK accepts `modifiers`, `keys`, or `keypress` for pointer modifier input.
- Native host validates drag path and pointer modifiers before forwarding.
- Extension action validator accepts `drag` and pointer modifiers.
- Protocol docs now include `### drag`, which matters because tests require
  every registered action to appear in `shared/protocol.md`.
- TODO was updated:
  - `Add tab.cua namespace` marked complete.
  - `drag({ path, keys })` marked complete.
  - pointer modifier support marked complete.
  - known non-parity changed to: drag/modifiers exist but need real-browser
    drag/drop fixture coverage.

Tests added/updated:

- `tests/browser-client-facade.test.ts`
  - Checks `tab.cua.drag` emits `browser_drag`.
  - Checks pointer `keypress`/`keys` normalize to backend `modifiers`.
- `tests/browser-tool-schemas.test.ts`
  - Checks shared schema accepts valid `drag`.
  - Checks shared schema rejects invalid pointer modifiers.
- `rust/native-host/src/rpc.rs`
  - Checks native host accepts valid `drag` shape and rejects bad modifiers.

Validation after this work:

- `npm run build`: passed.
- `npm run docs:browser-api`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, `61 passed` at that point.
- `cargo test`: passed, `50 passed`.
- `git diff --check`: passed.

### 2. Partially Implemented Download Handle Helpers

This was started after CUA drag and before the user paused. It is not fully
reflected in the TODO yet.

Files touched:

- `mcp-node-repl/browser-client.ts`
- bundled `scripts/browser-client.mjs`
- `tests/browser-client-facade.test.ts`
- generated `docs/browser-client-api.md`

Behavior added:

- SDK enriches download summaries with a handle-like object:
  - `download.suggestedFilename(): string | null`
  - `download.path(): string | null`
  - `download.toJSON()`
- `browser.downloads.waitFor(...)` and `.wait(...)` return the normal wait
  result, but with `result.download` enriched.
- `browser.downloads.list(...)` returns `downloads` enriched the same way.
- `tab.playwright.waitForEvent("download", args)` now returns the enriched
  `download` object directly and throws `BrowserTimeoutError` if the backend
  wait result timed out or did not match.

Test added:

- `tests/browser-client-facade.test.ts`
  - `"enriches download facade results with path and suggested filename helpers"`
  - Uses mocked `/Users/david/Downloads/report.csv`.
  - Checks `suggestedFilename()`, `path()`, and `toJSON()`.

Validation after this partial download helper work:

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, now `62 passed`.
- `npm run docs:browser-api`: passed.

Not yet done after this partial download helper work:

- `cargo test` was not rerun after this SDK-only change.
- `git diff --check` was not rerun after this SDK-only change or this handoff
  file.
- `notes/codex-gap-todolist.md` still has
  `download.suggestedFilename() equivalent` unchecked. The next agent should
  decide whether the current SDK helper is sufficient to check that item, or
  whether backend/protocol docs should first expose an explicit
  `suggestedFilename` field.
- `shared/protocol.md` was not updated for the SDK-only download helper. If the
  next agent treats this as a formal API parity item, update docs accordingly.

## Important Current TODO State

Still incomplete high-value areas in `notes/codex-gap-todolist.md`:

- First-host prompt UI.
- Browser permission-prompt confirmation UI.
- Download policy gating.
- Sensitive storage policy for cookies/localStorage/sessionStorage/passwords/
  tokens/history.
- Raw CDP/evaluate audit trail with origin, method, action id, session id,
  reason.
- Stable node id semantics and invalidation.
- Frame support:
  - `frameLocator`
  - nested frames/OOPIFs
  - frame selector paths
- Shadow DOM support:
  - open shadow root piercing for snapshots/locators
  - closed shadow root reporting.
- Accessible-name parity:
  - browser-like hidden subtree rules
  - SVG/title fallback
  - closer ARIA role mapping.
- Rich navigation/events:
  - `networkidle`
  - `commit`
  - `expectNavigation(action, options)`
  - file chooser events
  - permission prompt events
  - user takeover/interruption
  - event persistence policy.
- Screenshot QA tests:
  - viewport nonblank
  - full-page below fold
  - clip dimensions
  - high-DPI
  - highlight overlays.
- File chooser flow:
  - `tab.playwright.waitForEvent("filechooser")`
  - file chooser object
  - visible upload button/label flow
  - multiple files.
- Runtime docs and troubleshooting split.
- Plugin/package layout alignment.
- Local fixture and real-site smoke matrix.
- Observability and diagnostics export.

## Suggested Next Steps

Start by verifying the current worktree:

```bash
npm run build
npm run docs:browser-api
npm run typecheck
npm test
cd rust/native-host && cargo test
cd ../..
git diff --check
```

Then choose one bounded TODO item. Good candidates:

1. Finish the download helper item:
   - Decide whether SDK-only `suggestedFilename()` is enough.
   - If yes, update `notes/codex-gap-todolist.md` and possibly
     `shared/protocol.md` / `docs/browser-client-api.md`.
   - If not, add explicit backend/protocol `suggestedFilename` fields.

2. Add screenshot QA tests:
   - Less protocol churn.
   - Good confidence win for existing screenshot implementation.
   - Could be SDK/unit-level first, then real browser fixture if runtime is
     installed.

3. Add `elementInfo({ x, y, includeNonInteractable })`:
   - Clear API gap.
   - Needs shared schema/action/agent/extension/Rust/protocol/tests.
   - Can build from existing point hit-test and selector candidate logic.

4. Improve docs/troubleshooting:
   - Low runtime risk.
   - Many TODO checkboxes can be closed with clear user docs.

5. Add file chooser flow:
   - High value but more invasive.
   - Touches event model, extension/runtime, SDK object model, schema, docs,
     tests.

## Protocol Sync Checklist For New Actions

When adding or changing a backend action, update all of these:

- `shared/types.ts`
- `shared/action-registry.ts`
- `shared/browser-tool-schemas.ts`
- `agent/browserTools.ts`
- `extension/background.ts`
- `extension/action-validator.ts`
- `rust/native-host/src/rpc.rs`
- `shared/protocol.md`
- `tests/browser-client-facade.test.ts`
- `tests/browser-tool-schemas.test.ts`
- any Rust tests in `rust/native-host/src/rpc.rs`
- generated JS via `npm run build`
- generated SDK docs via `npm run docs:browser-api` when SDK surface changes

Extension validator formatting matters for tests. New action entries in
`extension/action-validator.ts` should be formatted like:

```ts
  actionName: [
```

## Specific Implementation Notes

- `mcp-node-repl/browser-client.ts` is the main SDK facade. Prefer matching the
  existing style there.
- The SDK often returns `transport.result(...)`, not the raw tool envelope.
  `browser.tool(...)` returns the lower-level envelope and is not usually what
  facade methods should return.
- For SDK-only helpers like screenshots and download handles, it is acceptable
  to enrich the backend result in `browser-client.ts` without adding backend
  actions, but update docs/TODO so the parity story is clear.
- Native host validation should reject bad params before forwarding to Chrome.
- Extension action validator should reject unknown params at the extension
  boundary.
- Do not assume local unpacked extension ID matches the Web Store ID. See
  AGENTS.md for native host manifest details.

## Current Known Risk

- The latest CUA drag implementation has unit/schema/native validation, but no
  real-browser drag/drop fixture yet.
- The latest download helper is SDK-only and has facade tests, but the TODO is
  not updated and protocol docs do not yet describe the SDK helper.
- The worktree contains many generated JS changes. Do not delete them.
- Real Chrome runtime tests were not run in this handoff window.
