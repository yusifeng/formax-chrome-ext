# Codex Resource 1.1.5 Readability Notes

This directory contains local readability artifacts generated from the unpacked
`codex-resource/1.1.5_0` Chrome extension. These files are for behavior and
architecture reference while aligning Formax with Codex-like Chrome control.
Do not copy large private implementation blocks into Formax; use this as a map
for protocol shape, lifecycle behavior, and feature parity decisions.

## Generated Files

- `background.pretty.js`: esbuild-formatted `codex-resource/1.1.5_0/background.js`.
- `content.pretty.js`: esbuild-formatted `codex-resource/1.1.5_0/content-scripts/codex.js`.
- `popup.pretty.js`: esbuild-formatted popup chunk, mostly UI.
- `manifest.json`: copied manifest for permission/resource comparison.
- `keyword-index.tsv`: grep-like index of important browser-control symbols.
- `background-control-map.md`: implementation-oriented map from Codex
  background sections to Formax files and parity priorities.
- `background-page-control-guide.md`: code-writing guide for the actual
  page-control path in Codex background, with line ranges and Formax anchors.

## High-Value Background Sections

- `background.pretty.js:1500`: tool/action schemas and SDK-facing command shapes.
  Notable Codex wire fields use snake_case names such as `browser_id`, `tab_id`,
  `timeout_ms`, `wait_until`, `file_chooser_id`, `download_id`, `cropX`, `cropY`,
  `cropWidth`, and `cropHeight`.
- `background.pretty.js:1728`: content-script injection and cursor overlay session
  manager. This publishes `AGENT_CURSOR_STATE` to tabs and tracks active requests.
- `background.pretty.js:2580`: finalized-tab favicon badge manager. Codex stores
  unseen `handoff` / `deliverable` badges in `chrome.storage.session`, reconciles
  tab visibility/focus, and publishes `TAB_FAVICON_BADGE` to the content script.
- `background.pretty.js:3007`: main browser-control service. It owns sessions,
  cursor arrival waiters, download listeners, CDP/session entry points, and tab
  lifecycle methods.
- `background.pretty.js:3167`: per-session implementation for `executeCdp`,
  `attach`, `attachTarget`, `detach`, `getTabs`, `createTab`, `claimUserTab`, and
  `finalizeTabs`.
- `background.pretty.js:3300`: low-level debugger attach/detach helpers and CDP
  command wrapper. It special-cases `Target.getTargets` via `chrome.debugger.getTargets()`.
- `background.pretty.js:3406`: browser history search parameter validation.
- `background.pretty.js:3558`: `chrome.debugger.sendCommand` transport and CDP
  timeout wrapper.
- `background.pretty.js:3595`: native messaging transport. It uses JSON-RPC-ish
  requests over `chrome.runtime.connectNative(...)`, reconnect alarms, pending
  request maps, and status publication.
- `background.pretty.js:3862`: top-level listener registration: runtime messages,
  debugger events, downloads, and app/native initialization.
- `background-page-control-guide.md`: start here when implementing a concrete
  page-control feature; it narrows the background bundle into actionable line
  ranges and Formax files.

## High-Value Content Sections

- `content.pretty.js:130`: favicon badge helpers. Codex preserves/restores original
  favicons and marks generated badge links with `data-codex-favicon-badge`.
- `content.pretty.js:213`: cursor animation engine. It computes bezier/scoot motion,
  spring simulation, visibility, rotation, and arrival callbacks.
- `content.pretty.js:436`: cursor state normalization and `GET_AGENT_CURSOR_STATE`
  bootstrap from background.
- `content.pretty.js:477`: content message router. It handles `AGENT_CURSOR_STATE`
  and `TAB_FAVICON_BADGE`.

## Formax Alignment Implications

- The user's intuition is mostly right: page-control behavior is concentrated in
  the extension. Native host and SDK layers mainly carry commands, validate them,
  and expose ergonomic object APIs.
- Use `background-control-map.md` before implementing browser-control changes.
  It maps the Codex background sections to Formax implementation files and
  avoids re-deriving architecture from the minified bundle each time.
- Codex's extension is split between background orchestration and content-script
  visual feedback. The actual browser/page control is background + CDP; the
  content script handles cursor/favicons/status.
- Codex's command surface includes several features Formax has partially or fully
  implemented: CUA, DOM CUA, Playwright-like selectors, downloads, file chooser,
  clipboard, history, DOM snapshot, element info, page assets, WebMCP, and tab
  finalization.
- Next high-value Formax alignment targets should be chosen by comparing these
  sections, not by guessing from public docs alone.
- The background guide is the practical reference for that comparison. It keeps
  the Codex architecture close without copying Codex implementation blocks into
  Formax.

## Suggested Next Alignment Targets

1. Reconcile Formax action/schema names with Codex's snake_case command shapes
   where compatibility matters, while preserving existing aliases.
2. Compare Codex `file_chooser_id` flow with Formax's current `fileChooserOpened`
   + `setFiles` wrapper and add an explicit backend file-chooser registry if
   needed.
3. Compare Codex finalized badge manager with Formax's current page visual status;
   improve persistence/focus-clearing for `handoff` and `deliverable` badges.
4. Compare Codex DOM CUA and selector schemas around `node_id`, `dom_snapshot`,
   `elementInfo`, and visible DOM output.
5. Compare Codex CDP target attachment and OOPIF handling with Formax's current
   same-origin frame-only support.
