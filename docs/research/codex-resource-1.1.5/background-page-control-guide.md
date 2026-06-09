# Codex 1.1.5 Background Page-Control Guide

This guide turns the local unpacked `codex-resource/1.1.5_0/background.js`
into a practical implementation reference for Formax. It intentionally avoids
copying Codex implementation blocks. Use the line ranges below to read behavior
in `background.pretty.js`, then implement Formax-owned equivalents in the mapped
files.

## Main Takeaway

The user's model is correct for the important part: Codex keeps real page
control in the Chrome extension background worker. Native/app/SDK layers mostly
carry typed commands, request ids, session ids, events, and results. The content
script is a sidecar for visual state such as cursor movement and favicon badges,
not the owner of browser automation.

Codex's effective chain is:

```text
native/app request
  -> background native transport / JSON-RPC bridge
  -> command schemas and request router
  -> browser-control service
  -> per-session turn lifecycle
  -> chrome.tabs / chrome.debugger / chrome.downloads / chrome.history
  -> optional content-script visual sidecar
  -> response / notification back to native/app
```

For Formax, keep the same boundary:

```text
shared schemas + native host + SDK = validate/transport/expose ergonomics
extension/background.ts + managers = own browser/page behavior
extension/content.ts = cursor, badge, approval UI sidecar
```

## Reading Order For Implementation

1. Start at the command/schema surface to understand payload names and ids.
2. Read the JSON-RPC bridge only enough to understand request/event flow.
3. Read the browser-control service and per-session class for lifecycle rules.
4. Read low-level CDP wrappers for attach/detach, target handling, and timeout
   behavior.
5. Read the content-script and favicon/cursor sections only for visual state.

## Page-Control Source Map

| Concern | Codex source | What the section establishes | Formax implementation anchor |
| --- | --- | --- | --- |
| Command schema surface | `background.pretty.js:1499` | Browser commands use explicit payload schemas with snake-case fields such as `browser_id`, `tab_id`, `timeout_ms`, `wait_until`, `node_id`, `download_id`, `file_chooser_id`, and screenshot crop fields. | `shared/types.ts`, `shared/browser-tool-schemas.ts`, `shared/action-registry.ts`, `extension/action-validator.ts`, `agent/browserTools.ts`, `mcp-node-repl/browser-client.ts` |
| Capability facade | `background.pretty.js:1517-1615` | SDK-style capability objects wrap transport commands, but they do not own page behavior. | `mcp-node-repl/browser-client.ts`, `agent/browserTools.ts` |
| JSON-RPC bridge | `background.pretty.js:1617-1710` | Background registers request handlers on a transport, dispatches method names, sends notifications for CDP/download events, and rejects pending requests on close. | `extension/background.ts` native request dispatch, `rust/native-host/src/rpc.rs`, SDK request handling |
| Content-script readiness | `background.pretty.js:1715-1744` | Ping existing content script, inject `content-scripts/codex.js` when needed, then ping again with timeout wrapping. | `extension/background.ts` `prepareContentScript`, `pingContentScript`, `withChromeMessageTimeout`; `extension/content.ts` |
| Cursor state manager | `background.pretty.js:1748-1907` | Background owns cursor state per session/turn/tab and publishes state to content script; content script reports arrival. | `extension/background.ts` cursor helpers; `extension/content.ts` cursor/arrival messages |
| Observed active tab model | `background.pretty.js:1909-1972` | Background tracks active/visible tabs and windows so visual side effects only publish when relevant. | `extension/session-manager.ts`, `extension/background.ts` tab/window listeners |
| Tab lease/session storage | `background.pretty.js:2384-2576` | Sessions claim tabs with origin/turn/group metadata and survive tab replacement/removal. | `shared/session-store.ts`, `extension/session-manager.ts`, `extension/background.ts` session helpers |
| Favicon badge lifecycle | `background.pretty.js:2580-2777` | Finalized tabs persist `handoff`/`deliverable` badges in session storage; active control takes precedence; focus clears finalized state. | `extension/background.ts` `setPageVisualStatus`, finalized badge helpers; `extension/content.ts` favicon badge UI |
| Managed tab groups | `background.pretty.js:2837-3003` | Agent tabs are grouped and group metadata is reconciled with Chrome tab group state. | `extension/session-manager.ts` group helpers |
| Browser-control service | `background.pretty.js:3005-3150` | Top-level service owns sessions, cursor arrival waiters, downloads, extension info, and request-handler methods. | `extension/background.ts` dispatcher/action handlers; `extension/session-manager.ts`; `extension/debugger-manager.ts` |
| Per-session lifecycle | `background.pretty.js:3153-3309` | Each session serializes lifecycle mutation, activates turns, resumes handoff tabs, owns active tab, validates session tabs, finalizes, and detaches debuggers. | `extension/session-manager.ts`, `extension/background.ts` `startSession`, `endTurn`, `finalizeSession`, `stopSession` |
| Debugger attach/detach | `background.pretty.js:3310-3369` | Attach/detach is serialized per tab and per target; target attachments are tracked separately from tab attachments. | `extension/debugger-manager.ts`, `extension/background.ts` `cdp`, `attachTarget`, `detachTarget`, cleanup helpers |
| Tab creation/list/history | `background.pretty.js:3370-3458` | New tabs are opened in normal windows; user tab/history lists are normalized and bounded. | `extension/background.ts` `openTabs`, `listTabs`, `claimTab`, `getHistory`; SDK `browser.user` |
| Finalize validation | `background.pretty.js:3535-3554` | Finalize rejects invalid, unknown, duplicate, or unsupported keep entries before closing/releasing tabs. | `extension/background.ts` `finalizeSession`; `mcp-node-repl/browser-client.ts` finalize facade |
| CDP command wrapper | `background.pretty.js:3557-3584` | `Target.getTargets` is routed through `chrome.debugger.getTargets()`; all CDP commands get timeout handling. | `extension/debugger-manager.ts`, `extension/background.ts` `cdp`, `rawCdp`, frame/target helpers |
| Native transport | `background.pretty.js:3595-3706` | Native messaging is request/response over `chrome.runtime.connectNative`, with reconnect status and pending request rejection. | `extension/background.ts` native port logic; `rust/native-host/src/rpc.rs` |
| Update safety | `background.pretty.js:3711-3756` | Extension updates are stored and only reloaded when browser control is idle. | `extension/background.ts` pending update helpers |
| Heartbeat cleanup | `background.pretty.js:3759-3771` | Heartbeat failures stop active sessions and detach debugger tabs. | `extension/background.ts` heartbeat/reconnect and native disconnect cleanup |
| Top-level listeners | `background.pretty.js:3850-3871` | Registers native transport, runtime messages, debugger events, download events, and heartbeat initialization. | `extension/background.ts` `registerTopLevelListeners` |
| Content message bridge | `background.pretty.js:3875-3886` | Handles `GET_AGENT_CURSOR_STATE` and `AGENT_CURSOR_ARRIVED` from content script. | `extension/background.ts` runtime message cases; `extension/content.ts` |

## Feature-Specific Notes

### Navigation, Input, Screenshot, DOM CUA

Codex exposes these as command schemas around `background.pretty.js:1499-1514`.
The key implementation lesson is not the exact minified local function names;
it is the field contract and ownership boundary:

- `tab_id` identifies the controlled Chrome tab.
- `node_id` and selector fields are command-level references, not SDK-only state.
- `dom_snapshot` is returned as background-produced page state.
- `fullPage` plus crop fields define screenshot behavior at the command layer.
- Mouse/keyboard actions carry coordinates and modifier key arrays into the
  background/CDP layer.

In Formax, keep compatibility aliases in the SDK if useful, but make the
extension action handler the source of truth for actual page effects.

### Locator And Frame Work

Codex exposes Playwright-like browser ergonomics to agents, but the unpacked
Chrome extension background bundle should be read as the lower-level command
owner: selector commands, DOM CUA `node_id`/snapshot flows, frame targeting, and
CDP target control. Formax intentionally mirrors the high-level Codex-like API
shape in the SDK while representing locator work internally as explicit
`locatorQuery` / `locatorAction` / `locatorWait` commands. That means Formax
should borrow Codex's public ergonomics where useful, but should compare
background behavior at the command/lifecycle layer rather than expecting a
one-to-one Playwright facade implementation inside `background.js`. The
Codex-relevant lesson is architectural: all selector, frame, and CDP execution
semantics still belong in the background worker and must be synchronized with
target attach and session lifecycle.

For Formax frame/OOPIF work, compare against:

- `background.pretty.js:3310-3369` for separate tab/target debugger ownership.
- `background.pretty.js:3557-3584` for the special `Target.getTargets` path.
- `background.pretty.js:3153-3309` for where attach/detach cleanup belongs.

Then implement in:

- `extension/background.ts` frame resolution and execution-context helpers.
- `extension/debugger-manager.ts` target serialization and ownership.
- `shared/protocol.md` / `shared/types.ts` / SDK docs for any exposed fields.

### Downloads And File Chooser

Codex models async browser artifacts with explicit ids:

- `download_id` for download wait/path operations.
- `file_chooser_id` for file chooser state.

The high-level rule for Formax is: async browser artifacts should be resumable
across the SDK/native boundary, so the background should maintain the registry
and the protocol should expose stable ids.

### Cursor And Favicon Visuals

Codex keeps visual state separate from page automation:

- Background calculates and stores current visual state.
- Content script renders cursor and favicon badge.
- Content script sends cursor-arrival acknowledgements.
- Favicon badge state is persistent enough to survive worker restart and tab
  update/replacement.

Formax should continue matching this boundary. Do not move page actions into the
content script just because it can access the DOM; use content only where Chrome
extension content context is the right rendering surface.

## Formax Implementation Rules From Codex

1. Keep page semantics in `extension/background.ts` and small manager classes.
2. Treat native host and SDK as transport/facade layers, not browser owners.
3. Serialize debugger attach/detach and CDP commands per debuggee.
4. Keep tab/session/turn lifecycle responsible for cleanup.
5. Use explicit ids for async browser artifacts such as downloads and file choosers.
6. Keep content script side effects visual and recoverable.
7. When protocol shape changes, update all layers in the same change.

## Current Best Next Targets

Given the current Formax state, the most useful Codex-aligned next work is:

1. Continue tightening frame/OOPIF target resolution around `Target.getTargets`,
   target attach ownership, and execution context selection.
2. Keep moving lifecycle-heavy logic out of ad-hoc action branches only when a
   parity feature touches it; avoid a giant background refactor.
3. Compare file chooser/download registries against the explicit-id rule and add
   missing resumability where needed.
4. Improve content-side favicon restore edge cases, but do not let that block
   background page-control work.
