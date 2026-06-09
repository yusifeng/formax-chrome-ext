# Codex 1.1.5 Background Control Map

This is the working map for aligning Formax with the local
`codex-resource/1.1.5_0/background.js` behavior without copying Codex
implementation into Formax.

Use this before changing page-control behavior:

1. Find the relevant Codex section below.
2. Read the referenced `background.pretty.js` lines for behavior and lifecycle.
3. Implement the Formax-owned version in the mapped Formax files.
4. Synchronize protocol, schemas, SDK facade, docs, and tests.

## Key Conclusion

The user's model is mostly correct: page handling is concentrated in the Chrome
extension background worker, with content scripts handling visual state and the
native/app layers mostly transporting typed requests, events, and results.

In Codex 1.1.5, the extension-side page-control chain is:

```text
native/app request
  -> extension native transport
  -> command router/schema
  -> browser-control service
  -> session/turn lease
  -> chrome.tabs / chrome.debugger / chrome.downloads / chrome.history
  -> content script for cursor/favIcon feedback
  -> native/app response or event
```

Formax should mirror that architecture, not the minified symbol names.

## High-Value Source Sections

| Area | Codex source | What to read there | Formax implementation |
| --- | --- | --- | --- |
| Command/schema surface | `background.pretty.js:1499` | Snake-case command payloads such as `browser_id`, `tab_id`, `timeout_ms`, `wait_until`, `file_chooser_id`, `download_id`, `node_id`, `dom_snapshot`, `cropX`/`cropY`. | `shared/types.ts`, `shared/browser-tool-schemas.ts`, `shared/action-registry.ts`, `extension/action-validator.ts`, `agent/browserTools.ts`, `mcp-node-repl/browser-client.ts` |
| Content-script injection | `background.pretty.js:1712` | Ping content script, inject `content-scripts/codex.js` with `chrome.scripting.executeScript`, then ping again. | `extension/background.ts` `prepareContentScript`, `pingContentScript`, `withChromeMessageTimeout`; `extension/content.ts` |
| Cursor state manager | `background.pretty.js:1748` | Session-aware cursor state, browser-control active state, cursor arrival acknowledgment, observed-tab behavior. | `extension/background.ts` `showCursor`, `waitForCursorArrival`, `resolveCursorArrivalWaiter`, `showCursorActivity`; `extension/content.ts` |
| Active tab observation | `background.pretty.js:1945` | Chrome tab/window listeners determine observed tabs and active tab visibility. | `extension/session-manager.ts`, `extension/background.ts` event listeners |
| Tab lease/session storage | `background.pretty.js:2384` | Claimed tab record shape, session id, turn id, origin, group id, active handoff. | `extension/session-manager.ts`, `shared/session-store.ts`, `extension/background.ts` session helpers |
| Finalized favicon badges | `background.pretty.js:2583` | Persistent `TAB_FAVICON_BADGES`, active/handoff/deliverable badge state, focus-clearing, favicon restoration. | `extension/background.ts` `setPageVisualStatus`, `finalizeSession`; `extension/content.ts` |
| Browser-control service | `background.pretty.js:3005` | Top-level service owns sessions, downloads, cursor waiters, `executeCdp`, attach/detach, tab list/create/claim/finalize. | `extension/background.ts` dispatcher/action handlers; `extension/debugger-manager.ts`; `extension/session-manager.ts` |
| Per-session lifecycle | `background.pretty.js:3167` | `activateTurn`, `runTurnMutation`, handoff resume, active tab tracking, debugger detach on turn end. | `extension/session-manager.ts`; `extension/background.ts` `startSession`, `endTurn`, `stopSession`, `finalizeSession` |
| Debugger attach/CDP | `background.pretty.js:3314` | Per-tab and per-target attach sets, serialized attach/detach queues, viewport override after attach. | `extension/debugger-manager.ts`; `extension/background.ts` `cdp`, `rawCdp`, `attachTarget`, `detachTarget` |
| User tabs/history | `background.pretty.js:3375` | Tab creation, tab sorting, user tab listing, history validation and result normalization. | `extension/background.ts` `openTabs`, `getHistory`, `claimTab`, `listTabs`; SDK `browser.user` |
| Finalize validation | `background.pretty.js:3538` | Validate keep entries, reject unknown/duplicate tabs, only `handoff`/`deliverable`. | `extension/background.ts` `finalizeSession`; `mcp-node-repl/browser-client.ts` `browser.tabs.finalize` |
| CDP command wrapper | `background.pretty.js:3558` | Special-case `Target.getTargets` through `chrome.debugger.getTargets()`, timeout wrapper, detach on timeout. | `extension/debugger-manager.ts`, `extension/background.ts` `cdp`, `getPageFrameTree`, `attachTarget` |
| Native transport | `background.pretty.js:3595` | `chrome.runtime.connectNative`, JSON-RPC-ish request id map, reconnect timeout/alarm, status publication. | `extension/background.ts` native port handling; `rust/native-host/src/rpc.rs` |
| Extension update safety | `background.pretty.js:3708` | Store pending update and reload only when browser control is idle. | Formax currently has runtime reload/health support; this is a parity gap if update behavior matters. |
| Heartbeat cleanup | `background.pretty.js:3747` | Heartbeat alarm pings transport, stops active sessions, detaches debugger tabs on app disconnect. | `extension/background.ts` heartbeat/reconnect plus debugger detach handling |
| Runtime listeners | `background.pretty.js:3862` | Register runtime messages, debugger events, downloads, native transport, and content-script cursor messages at top level. | `extension/background.ts` `registerTopLevelListeners` |
| Content message bridge | `background.pretty.js:3878` | `GET_AGENT_CURSOR_STATE` and `AGENT_CURSOR_ARRIVED` request/ack loop. | `extension/background.ts` popup/content message handling; `extension/content.ts` cursor and approval messages |

## Behavior To Mirror First

These are the parts where Codex architecture gives us the most leverage:

| Priority | Codex behavior | Why it matters for Formax |
| --- | --- | --- |
| 1 | Session/turn lifecycle owns tab claims and debugger cleanup. | Prevents orphaned debugger attachments and makes `finalize`/handoff deterministic. |
| 2 | CDP attach/detach is serialized per tab and per target. | Reduces race bugs around OOPIF targets and concurrent locator/raw CDP calls. |
| 3 | Content script is only a visual/control sidecar. | Keeps page automation in background/CDP while using content script for cursor and badge UX. |
| 4 | `Target.getTargets` bypasses `sendCommand`. | Chrome extension debugger API exposes target discovery differently than raw CDP. |
| 5 | Download/file chooser ids are explicit protocol objects. | Makes async file/download flows resumable across SDK/native boundaries. |
| 6 | Finalized tab badges are persistent and clear on user focus. | Matches Codex handoff/deliverable UX more closely than transient status overlays. |
| 7 | Native reconnect status is surfaced through storage/popup. | Makes installation/runtime failures diagnosable without guessing. |

## Formax Gap Notes

### Already Close

- `extension/background.ts` already centralizes most page automation.
- Native host and SDK mostly forward/validate request objects, matching the
  Codex layering.
- Formax already has `file_chooser_id`, download events, raw CDP, target attach,
  locator APIs, visual status, popup health, pending approval flow, and
  best-effort auto-expiring in-page approval banners.
- Formax already special-cases `Target.getTargets` through the debugger manager.
- Formax now persists finalized `handoff` / `deliverable` favicon badge state in
  `chrome.storage.session` and republishes it after tab updates/replacements or
  background worker restart.
- Formax now publishes active controlled-tab favicon badges and resolves
  effective badge state with Codex's precedence: active lease, then finalized
  handoff/deliverable, then no badge.
- Formax now reads and caches page favicon data through Chrome's `/_favicon/`
  endpoint and sends it to the content script for Codex-like badge overlays.
- Formax now resumes live handoff leases when `startSession` is called again for
  the same `sessionId`, including active handoff tab selection, fresh `turnId`,
  extension instance refresh, stale-tab cleanup, and managed group restoration
  for agent-origin tabs.
- Formax now performs Codex-like native disconnect cleanup: active sessions are
  stopped without closing tabs, cursor/visual state is cleared, and debugger
  tab/target attachments are swept with both local bookkeeping and
  `chrome.debugger.getTargets()`.
- Formax now serializes CDP commands per attached tab and per attached target,
  while keeping different targets independent, which matches Codex's
  per-debuggee attach/detach queue direction.
- Formax now defers extension update reload while browser control is active and
  reloads after active leases, debugger tab/target attachments, cursor waiters,
  and native cleanup are idle.

### Still Divergent

- Codex has a clearer session/turn object boundary; Formax has accumulated more
  behavior directly in `background.ts`.
- Codex's content script preserves/restores original favicon links more
  carefully. Formax uses a generated badge link and ignores failures, which is
  close enough for status display but still less complete around unusual favicon
  link layouts.
- Codex resumes handoff tabs as part of every turn mutation; Formax resumes them
  on `startSession` for the same `sessionId`, but broader per-action turn
  mutation boundaries are still less isolated than Codex's session class.
- Codex has a compact update-safety class; Formax mirrors the behavior with
  background helper functions instead of a dedicated class.
- Codex's cursor manager has a first-class observed-tab model; Formax has cursor
  overlays, but the lifecycle is less isolated.

## Suggested Implementation Order

1. Split Formax background lifecycle concerns into clearer sections/classes only
   when touching them for parity work; do not do a giant refactor first.
2. Make debugger attach/target handling line up with the Codex lifecycle:
   per-tab/per-target serialization, target ownership, and best-effort detach on
   timeouts/session end.
3. Continue upgrading visual state toward Codex's full badge model:
   original favicon restoration edge cases and unusual favicon link layouts.
4. Tighten handoff resume semantics around `sessionId`/`turnId`, claimed tabs,
   active handoff tab, and managed groups, then move toward Codex's per-action
   `runTurnMutation` boundary.
5. Keep expanding locator/file/download APIs only after the lifecycle boundary
   is stable.

## Do Not Do

- Do not paste Codex implementation blocks into Formax.
- Do not preserve minified variable names from `background.pretty.js`.
- Do not treat native host or SDK as the owner of page semantics. They should
  validate, authorize, transport, and expose ergonomics; the extension should
  own browser/page behavior.
- Do not change protocol names in only one layer. Any action shape change must
  update shared schemas, extension validation, native validation, SDK, agent
  wrappers, docs, and tests.
