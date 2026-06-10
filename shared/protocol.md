# Formax Browser Protocol

This document describes the runtime contract shared by the Chrome extension,
native host, MCP `node_repl` bridge, generated tool schemas, and tests.

## Transport

The native messaging side uses a request/response envelope plus async events.

Request shape:

```json
{
  "type": "request",
  "id": "req-123",
  "action": "openUrl",
  "params": {
    "sessionId": "session-1",
    "url": "https://example.com"
  }
}
```

Success response shape:

```json
{
  "type": "response",
  "id": "req-123",
  "ok": true,
  "result": {
    "actionId": "act-123",
    "action": "openUrl",
    "ok": true,
    "result": {}
  }
}
```

Error response shape:

```json
{
  "type": "response",
  "id": "req-123",
  "ok": false,
  "error": {
    "code": "invalid_params",
    "message": "openUrl.params.url must be a non-empty string"
  }
}
```

Async event shape:

```json
{
  "type": "event",
  "name": "browserActionAudit",
  "time": 1710000000000,
  "sequence": 42,
  "sessionId": "session-1",
  "tabId": 101
}
```

## Schema Source And Validation

Action names, tool names, and risk annotations are registered in
`shared/action-registry.ts`.

Agent-facing JSON Schema parameter definitions live in
`shared/browser-tool-schemas.ts`. `agent/browserTools.ts` exports those shared
schemas directly and validates tool/RPC params before sending requests to the
native host. The native host and extension keep independent validation
boundaries so bypassing one layer does not bypass request-shape validation.

The generated action index in `docs/protocol-action-reference.md` is derived
from `shared/action-registry.ts` and `shared/browser-tool-schemas.ts`. Run
`npm run docs:protocol` after action/schema changes, and run
`npm run check:protocol-sync` to verify that the shared registry, JSON schemas,
`shared/types.ts` `BrowserAction` union, `shared/protocol.md` action sections,
and generated reference are synchronized.

## Action Families

See [docs/protocol-action-reference.md](../docs/protocol-action-reference.md)
for the generated action table.

High-level families:

- Runtime: `health`, `reloadExtension`, `getCapabilities`
- Events and diagnostics: `getEvents`, `clearEvents`, `waitForEvent`,
  `getDiagnostics`, `getDevLogs`
- Session and tab lifecycle: `startSession`, `nameSession`, `openTabs`,
  `claimTab`, `createTab`, `switchTab`, `listTabs`, `getTab`, `closeTab`,
  `finalizeSession`, `endTurn`, `stopSession`
- Navigation and waiting: `openUrl`, `goBack`, `goForward`, `reload`,
  `waitForLoadState`, `waitForUrl`, `waitForSelector`, `waitForText`
- Inspection and locators: `observe`, `elementInfo`, `locatorQuery`,
  `locatorAction`, `locatorWait`, `resolveFrame`, `screenshot`
- Interaction: `click`, `drag`, `moveMouse`, `scroll`, `typeText`, `pressKey`,
  `handleDialog`
- File and download: `waitForFileChooser`, `setFileChooserFiles`, `uploadFile`,
  `downloadMedia`, `listDownloads`, `waitForDownload`
- Advanced debugging: `evaluate`, `attachTarget`, `detachTarget`, `cdp`
- Sensitive browser data: `getHistory`, `clipboardReadText`,
  `clipboardWriteText`, `clipboardRead`, `clipboardWrite`

## Health

`health` reports runtime status and install/debug context.

Important fields:

- `extensionId`
- `version`
- `nativeConnected`
- `lastNativeError`
- `sessions`
- `attachedTabs`
- `attachedTargets`
- `supportedActions`
- `backendRevision`
- `permissions`
- `fileUrlAccess`
- `nativeManifest`

Example:

```json
{
  "ok": true,
  "extensionId": "dchkbbjmkheilkmencpckilhmmcppdne",
  "version": "0.1.2",
  "nativeConnected": true,
  "lastNativeError": null,
  "sessions": [],
  "attachedTabs": [],
  "attachedTargets": [],
  "supportedActions": ["health", "startSession", "openUrl"],
  "backendRevision": 5
}
```

The extension does not read Chrome profile files directly. Health may surface
profile hints such as `activeProfileSource`, but `readsProfileFiles: false`
remains the rule for extension-side diagnostics.

## Events

Common event names include:

- `browserActionAudit`
- `cursorArrived`
- `fileChooserOpened`
- `downloadCreated`
- `downloadUpdated`
- `downloadCompleted`
- `downloadFailed`
- `debuggerDetached`
- `nativeDisconnected`
- `nativeDisconnectCleanup`
- `debuggerCleanup`
- `extensionUpdateAvailable`
- `extensionUpdateDeferred`
- `extensionUpdateReloading`
- `pageVisualStatus`
- `userTakeover`
- `userHandoffRequired`

`browserActionAudit` is the main structured action log for diagnostics.
`nativeDisconnected` is emitted when the native host connection drops.
`nativeDisconnectCleanup` records active sessions stopped during cleanup, and
`debuggerCleanup` records debugger tab and target attachments detached.
`extensionUpdateAvailable` is emitted when Chrome offers an update,
`extensionUpdateDeferred` records that reload was postponed while browser
control stayed active, and `extensionUpdateReloading` records the eventual
reload.

Example:

```json
{
  "name": "browserActionAudit",
  "auditKind": "action",
  "category": "navigation",
  "action": "openUrl",
  "actionId": "act-123",
  "sessionId": "session-1",
  "tabId": 101,
  "origin": "https://example.com",
  "status": "ok",
  "resultCode": "ok",
  "errorCode": null,
  "timing": {
    "startedAt": 1710000000000,
    "endedAt": 1710000000500,
    "durationMs": 500
  }
}
```

## Sessions And Tabs

The runtime uses explicit browser sessions for controlled tabs.

Typical flow:

1. `startSession`
2. `createTab` or `claimTab`
3. interact through navigation, locators, DOM inspection, screenshots, or CUA
4. `finalizeSession` / `endTurn` or `stopSession`

For user-opened Chrome tabs:

1. `openTabs`
2. choose a returned descriptor
3. `claimTab`

Do not guess tab IDs outside returned session state or current action results.

## URL And Scope Rules

The extension validates browser-controlled URLs as `http` or `https` where the
action requires a page URL.

## Sensitive Surfaces

The runtime still exposes some sensitive capabilities:

- browser history
- clipboard read/write
- file upload
- raw CDP
- page mutation through `evaluate`

Bookmarks are intentionally not exposed. Browser/system notifications are intentionally not exposed. The runtime advertises those unsupported surfaces through capabilities rather than by requesting extra Chrome permissions.

## File And Download Operations

Uploads:

- use absolute local paths
- prefer file-chooser-aware flows when available
- validate file existence and allowed roots in the native host layer

Downloads:

- can be observed through Chrome downloads APIs
- expose summaries through `listDownloads` / `waitForDownload`
- page asset downloads use `downloadMedia`

## Raw CDP And Evaluate

`evaluate` and `cdp` remain advanced tools. Prefer higher-level browser APIs
first:

- locators
- `observe`
- waits
- screenshots
- CUA mouse/keyboard primitives

Use raw CDP or mutating evaluate only when the higher-level surfaces are not enough for the task. `read_only_evaluate_violation` documents the temporary runtime mutation guard used for `args.mode: "read"` evaluate flows. This is a best-effort denylist plus temporary runtime patch, not a full JavaScript capability sandbox or browser-enforced immutable execution. Locator `evaluate` and `evaluateAll` calls that pass `args.mode: "read"` use the same guard. The guard explicitly watches common mutators such as `classList` helpers and style mutation methods.

## Generated References

Keep these in sync with this protocol contract:

- [shared/types.ts](./types.ts)
- [shared/action-registry.ts](./action-registry.ts)
- [shared/browser-tool-schemas.ts](./browser-tool-schemas.ts)
- [docs/protocol-action-reference.md](../docs/protocol-action-reference.md)

Regenerate the action reference with:

```bash
npm run docs:protocol
```

The shared action reference is generated, but this file is still part of the
human-reviewed contract because it carries cross-layer notes that are not
representable in the JSON schemas alone.

## Action Sections

Each action below is intentionally short. The generated reference, shared
schemas, and shared types are the source of truth for exact parameter shapes.

### health

Report runtime health and install state.

### reloadExtension

Reload the Chrome extension runtime.

### getEvents

Read buffered browser events.

### clearEvents

Clear buffered browser events.

### waitForEvent

Wait for a matching buffered event.

### getDiagnostics

Return a combined health, events, and developer-log snapshot.

### startSession

Start a controlled browser session.

### nameSession

Rename a controlled session or its tab group.

### openTabs

List user-opened claimable Chrome tabs.

### claimTab

Claim a user-opened tab into a controlled session.

### getHistory

Read browser history entries. Returned entries are redacted before they reach
callers so obvious secrets and sensitive URL parameters do not leak through
history titles or URLs.

### clipboardReadText

Read plain text from the clipboard.

### clipboardWriteText

Write plain text to the clipboard.

### clipboardRead

Read structured clipboard items.

### clipboardWrite

Write structured clipboard items. When the SDK receives a direct string, it routes the request to `clipboardWriteText`. Structured writes accept `ClipboardItem`-style MIME map inputs, and binary payloads can be `Uint8Array`/`Buffer`, `ArrayBuffer`, or byte arrays.

### createTab

Create a controlled tab.

### switchTab

Switch the active tab in a session.

### openUrl

Navigate the controlled tab to a URL.

### goBack

Navigate backward in tab history.

### goForward

Navigate forward in tab history.

### reload

Reload the current tab.

### waitForLoadState

Wait for a tab load milestone.

### waitForUrl

Wait for a URL match.

### waitForSelector

Wait for a CSS selector state.

### waitForText

Wait for page text to appear or disappear.

### observe

Capture the current visible page observation. It intentionally avoids returning raw `document.body.innerText`; instead it summarizes page text so observations stay compact and less likely to dump huge bodies verbatim. Observation payloads can also include a sanitized frame tree derived from CDP `Page.getFrameTree`. That frame tree is useful for diagnostics, but it does not imply that the runtime can pierce arbitrary cross-origin frame DOMs directly. Elements behind closed custom-element roots are reported as `closed_unsupported` instead of being pierced.

### elementInfo

Inspect element metadata at viewport coordinates.

### locatorQuery

Run a Playwright-style locator read query. Locator kinds are `css`, `text`,
`role`, `label`, `placeholder`, `testId`, `altText`, `title`, and
`displayValue`. Same-origin frame resolution is required before DOM queries run.
Supported query kinds are `count`, `allTextContents`, `allInnerTexts`,
`textContent`, `innerText`, `innerHTML`, `getAttribute`, `isVisible`,
`isHidden`, `isEnabled`, `isDisabled`, `isEditable`, `inputValue`,
`isChecked`, and `boundingBox`.

`String(locator)` and `String(frameLocator)` produce compact debug labels. Negative indexes are preserved in those labels, including synchronous `locator.last()`.

The locator surface intentionally keeps parity helpers such as `innerHTML`,
`pressSequentially()`, and `page()`.

### locatorAction

Run a Playwright-style locator action. Supported action kinds are `click`,
`dblclick`, `dragTo`, `fill`, `type`, `press`, `clear`, `focus`, `blur`,
`scrollIntoViewIfNeeded`, `selectText`, `hover`, `highlight`, `setChecked`,
`selectOption`, `evaluate`, `evaluateAll`, and `dispatchEvent`. Actions resolve
actionability by trying the center first and then inset corners/edge points.

Passing `args.trial: true` performs an actionability preflight without mutating page state. The trial payload includes the chosen hit point. Actionability checks cover targets inside an inert subtree, explicit `pointer-events: none`, open shadow-root descendants inherit host/ancestor actionability blockers, disabled fieldsets respect legend semantics, `aria-disabled="true"` ancestors, and `isEnabled`, `isDisabled`, and `isEditable` use the same disabled semantics.

### locatorWait

Wait on a Playwright-style locator.

### resolveFrame

Resolve nested frame selectors to frame metadata. This mirrors Codex resource 1.1.5 style frame targeting: `Target.getTargets` can be used to discover an auto-detected-oopif-target-id-or-null, then continue resolving the remaining selectors in the right target context. The result may include `targetCandidates`, unresolved selectors, and enough diagnostics to explain when an OOPIF target actions dispatch path cannot be completed. Cross-target script contexts are created with `Page.createIsolatedWorld`.

### click

Click a target by ref, selector, or coordinates.

### drag

Drag the pointer through a series of points.

### moveMouse

Move the visible pointer.

### scroll

Scroll the controlled page.

### typeText

Type text into the page.

### evaluate

Evaluate JavaScript in the controlled page.

### pressKey

Dispatch a key press.

### handleDialog

Accept or dismiss a page dialog.

### screenshot

Capture a screenshot from the controlled tab.

### waitForFileChooser

Wait for a file chooser opened by the page.

### setFileChooserFiles

Assign files to a tracked file chooser.

### uploadFile

Upload files through a page file input. Prefer the file-chooser-aware flow when
the page exposes one so the runtime can keep ownership of the page target and
frame context.

### downloadMedia

Download a media or asset URL resolved from the page. Media downloads still go
through host blocklist enforcement before Chrome download APIs or fallback fetch
flows are used.

### attachTarget

Attach debugger control to a DevTools target. This is a low-level debugging
entry point intended for cases where top-level tab attachment is not enough.

### detachTarget

Detach debugger control from a DevTools target.

### cdp

Send a raw Chrome DevTools Protocol command. `Target.getTargets` is surfaced as
part of the same diagnostic workflow, but command payloads are still audited
without storing raw request bodies in buffered events.

### listTabs

List controlled tabs.

### getTab

Return metadata for one controlled tab.

### listDownloads

List Chrome downloads visible to the runtime.

### waitForDownload

Wait for a matching download state.

### getDevLogs

Read buffered console and runtime diagnostics. Console/log text, exception
descriptions, and URLs are redacted before they enter the event buffer, so
diagnostic fetches do not replay raw secret-bearing payloads.

### getCapabilities

List runtime capability descriptors. Unsupported capabilities such as bookmarks
and browser/system notifications are surfaced explicitly so clients can explain
why they are unavailable.

### closeTab

Close a controlled tab.

### finalizeSession

Finalize a session and mark kept tabs for handoff or deliverable use. The next `startSession` call for the same `sessionId` can resume live handoff leases. Active controlled tab leases publish `pageVisualStatus` updates, with active lease first, then unseen finalized tabs. The `/_favicon/` endpoint can return the page favicon so badges can reflect states such as active, handoff, deliverable, stopped, or taken over. `userTakeover` and `userHandoffRequired` remain separate events.

### endTurn

End the current turn for a session.

### stopSession

Stop a session and optionally close its tabs.

## Safety Notes

CAPTCHA/human-verification challenges, password-change final submissions,
browser security interstitial bypasses, and paywall bypass actions are treated
as handoff boundaries. Those flows emit `userHandoffRequired` and fail with
`user_handoff_required` so browser automation stops before crossing them.
