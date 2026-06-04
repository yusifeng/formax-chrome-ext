# Agent Browser Protocol

This file is the data contract between the Agent tool layer, the native host,
and the Chrome extension background service worker.

## Transport

Agent to native host uses local HTTP:

```json
{
  "action": "openUrl",
  "params": {},
  "timeoutMs": 30000
}
```

Native host to extension uses Chrome Native Messaging:

```json
{
  "type": "request",
  "id": "uuid",
  "action": "openUrl",
  "params": {}
}
```

Extension response:

```json
{
  "type": "response",
  "id": "uuid",
  "ok": true,
  "result": {
    "actionId": "uuid",
    "action": "openUrl",
    "ok": true,
    "sessionId": "session uuid",
    "tabId": 456,
    "timing": {
      "startedAt": 1760000000000,
      "endedAt": 1760000000100,
      "durationMs": 100
    },
    "result": {}
  }
}
```

Extension error:

```json
{
  "type": "response",
  "id": "uuid",
  "ok": false,
  "error": {
    "message": "Human-readable error"
  }
}
```

Extension event:

```json
{
  "type": "event",
  "name": "debuggerDetached",
  "sequence": 42,
  "time": 1760000000000,
  "sessionId": "uuid",
  "tabId": 456
}
```

Events are also kept in a bounded in-memory extension buffer so an agent can
query them later with `getEvents`. Buffered events include debugger detach,
controlled tab removal, selected CDP page lifecycle events, JavaScript dialog
events, runtime exceptions, and download lifecycle events while any browser
control session is active.

Download event example:

```json
{
  "type": "event",
  "name": "downloadCreated",
  "sequence": 43,
  "time": 1760000000000,
  "download": {
    "id": 1,
    "url": "https://example.com/file.zip",
    "filename": "/Downloads/file.zip",
    "state": "in_progress"
  }
}
```

Selected CDP page/runtime event example:

```json
{
  "type": "event",
  "name": "cdpEvent",
  "sequence": 44,
  "time": 1760000000000,
  "sessionId": "uuid",
  "tabId": 456,
  "method": "Page.loadEventFired",
  "params": {
    "timestamp": 12345.67
  }
}
```

## Core Data Types

### BrowserSession

```json
{
  "sessionId": "uuid",
  "groupId": 123,
  "activeTabId": 456,
  "tabIds": [456],
  "status": "active",
  "createdAt": 1760000000000,
  "lastActiveAt": 1760000000000
}
```

`status` is one of `active`, `stopped`, or `error`.

### BrowserElement

```json
{
  "ref": "e0",
  "role": "button",
  "label": "Submit",
  "sensitive": false,
  "tagName": "button",
  "x": 120,
  "y": 240,
  "rect": {
    "x": 90,
    "y": 220,
    "width": 60,
    "height": 40
  }
}
```

`ref` is valid only for the latest observation of the same page/frame. Agents
must observe again after navigation, refresh, or failed clicks.

### BrowserObservation

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "source": "chrome_page",
  "trust": "untrusted",
  "url": "https://example.com/",
  "title": "Example Domain",
  "viewport": {
    "width": 1280,
    "height": 720,
    "devicePixelRatio": 2
  },
  "text": "Visible page text",
  "elements": []
}
```

Page text is untrusted web content. It must never override system or developer
instructions, and sensitive browser state must not be returned to the model.

## Actions

Every successful action returns a `BrowserToolResult<T>` envelope:

```json
{
  "actionId": "native request id",
  "action": "openUrl",
  "ok": true,
  "sessionId": "uuid",
  "tabId": 456,
  "timing": {
    "startedAt": 1760000000000,
    "endedAt": 1760000000100,
    "durationMs": 100
  },
  "result": {}
}
```

The `result` field contains the action-specific result described below.

### health

Params:

```json
{}
```

Result:

```json
{
  "ok": true,
  "extensionId": "chrome extension id",
  "version": "0.1.0",
  "sessions": [],
  "attachedTabs": []
}
```

Envelope metadata for `health` uses `sessionId: null` and `tabId: null`.

### getEvents

Params:

```json
{
  "sessionId": "optional uuid",
  "tabId": 456,
  "name": "cdpEvent",
  "sinceSequence": 42,
  "limit": 100
}
```

Returns buffered extension events matching the optional filters. `sinceSequence`
is exclusive, so passing the last seen `sequence` returns only newer events.

Result payload:

```json
{
  "events": []
}
```

### clearEvents

Params:

```json
{
  "sessionId": "optional uuid",
  "tabId": 456,
  "name": "cdpEvent",
  "sinceSequence": 42
}
```

Clears buffered extension events matching the optional filters.

Result payload:

```json
{
  "cleared": 3
}
```

### startSession

Params:

```json
{
  "sessionId": "optional stable id",
  "active": true,
  "initialUrl": "about:blank"
}
```

Result payload: `BrowserSession`

### claimTab

Params:

```json
{
  "sessionId": "optional existing session",
  "tabId": 456,
  "active": true
}
```

If `tabId` is omitted, the extension claims the current active tab. If
`sessionId` is omitted, the extension creates a new session for the claimed tab.

Result payload: `BrowserSession`

### createTab

Params:

```json
{
  "sessionId": "optional existing session",
  "url": "about:blank",
  "active": true
}
```

Creates a new tab and adds it to the session's tab group. If `sessionId` is
omitted, the extension creates a new session for the new tab.

Result payload:

```json
{
  "session": {},
  "tab": {
    "id": 456,
    "windowId": 1,
    "title": "Example",
    "url": "https://example.com/",
    "active": true,
    "groupId": 123
  }
}

```

### switchTab

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456
}
```

Makes the tab active, updates the session's `activeTabId`, and attaches the
debugger if needed.

Result payload:

```json
{
  "session": {},
  "tab": {
    "id": 456,
    "windowId": 1,
    "title": "Example",
    "url": "https://example.com/",
    "active": true,
    "groupId": 123
  }
}
```

### openUrl

Params:

```json
{
  "sessionId": "optional existing session",
  "tabId": 456,
  "url": "https://example.com",
  "active": true,
  "timeoutMs": 15000
}
```

Result payload: `BrowserObservation`

### goBack

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "waitForLoad": true,
  "timeoutMs": 15000
}
```

Navigates the controlled tab back in browser history. If there is no previous
history entry, the action returns the current observation with
`navigated: false`.

Result payload: `NavigationResult`

### goForward

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "waitForLoad": true,
  "timeoutMs": 15000
}
```

Navigates the controlled tab forward in browser history. If there is no next
history entry, the action returns the current observation with
`navigated: false`.

Result payload: `NavigationResult`

### reload

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "ignoreCache": false,
  "waitForLoad": true,
  "timeoutMs": 15000
}
```

Reloads the controlled tab with `Page.reload`.

Result payload: `NavigationResult`

### waitForLoadState

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "state": "load",
  "timeoutMs": 15000
}
```

Supported states are `domcontentloaded` and `load`. If the current document
already satisfies the requested state, the action returns immediately.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "state": "load",
  "reason": "already_satisfied"
}
```

### waitForUrl

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "url": "https://example.com/complete",
  "urlContains": "/complete",
  "urlRegex": "/complete(?:$|[?#])",
  "timeoutMs": 15000,
  "pollMs": 100
}
```

At least one of `url`, `urlContains`, or `urlRegex` is required. If multiple
matchers are supplied, all must match. Timeout is reported in the result payload.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "matched": true,
  "timedOut": false,
  "elapsedMs": 300,
  "url": "https://example.com/complete",
  "title": "Complete"
}
```

### waitForSelector

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "selector": "button[type=submit]",
  "state": "visible",
  "timeoutMs": 15000,
  "pollMs": 100
}
```

Supported states are `attached`, `visible`, `hidden`, and `detached`.
The action returns a successful result with `timedOut: true` instead of throwing
when the state is not reached before the timeout.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "selector": "button[type=submit]",
  "state": "visible",
  "matched": true,
  "timedOut": false,
  "elapsedMs": 128,
  "element": {
    "tagName": "button",
    "text": "Submit"
  }
}
```

### waitForText

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "text": "Saved",
  "state": "present",
  "exact": false,
  "caseSensitive": false,
  "timeoutMs": 15000,
  "pollMs": 100
}
```

Supported states are `present` and `hidden`. Like `waitForSelector`, timeout is
reported in the result payload.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "text": "Saved",
  "state": "present",
  "matched": true,
  "timedOut": false,
  "elapsedMs": 220,
  "found": true
}
```

### observe

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "includeAccessibility": false,
  "maxAccessibilityNodes": 200,
  "includeDomSnapshot": false
}
```

Result payload: `BrowserObservation`

By default, `observe` returns a lightweight DOM-derived summary. When
`includeAccessibility` is true, the extension adds a truncated
`accessibilityTree` from `Accessibility.getFullAXTree`. When `includeDomSnapshot`
is true, it adds the raw `DOMSnapshot.captureSnapshot` payload.

### click

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "ref": "e0",
  "selector": "button[type=submit]",
  "x": 120,
  "y": 240,
  "button": "left",
  "clickCount": 1,
  "waitMs": 500
}
```

Targets can be specified by `ref` from the latest observation, by CSS
`selector`, or by viewport `x`/`y` coordinates. `button` defaults to `left`.

Result payload: `BrowserObservation`

### moveMouse

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "x": 120,
  "y": 240,
  "waitMs": 100
}
```

Moves both the visible agent cursor overlay and the Chrome mouse pointer to page
viewport coordinates.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "x": 120,
  "y": 240
}
```

### scroll

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "deltaX": 0,
  "deltaY": 600,
  "x": 640,
  "y": 360,
  "waitMs": 300
}
```

`x` and `y` are optional. If omitted, the extension scrolls from the viewport
center.

Result payload: `BrowserObservation`

### typeText

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "ref": "e1",
  "selector": "input[name=q]",
  "x": 120,
  "y": 240,
  "text": "hello",
  "clear": true,
  "waitMs": 300
}
```

If `ref` or `selector` is supplied, the extension focuses that element before
typing. If coordinates are supplied, the extension clicks there before typing.
If no target is supplied, text is inserted into the current focused element.

Result payload: `BrowserObservation`

### evaluate

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "script": "document.title",
  "awaitPromise": true,
  "timeoutMs": 10000
}
```

Evaluates JavaScript in the controlled tab with `returnByValue: true`.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "value": "Example Domain"
}
```

### pressKey

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "key": "Enter",
  "waitMs": 300
}
```

Supported keys in MVP: `Enter`, `Tab`, `Escape`, `Backspace`, `ArrowUp`,
`ArrowDown`, `ArrowLeft`, `ArrowRight`.

Result payload: `BrowserObservation`

### handleDialog

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "accept": true,
  "promptText": "optional prompt response"
}
```

Accepts or dismisses the currently open JavaScript alert, confirm, or prompt
dialog using `Page.handleJavaScriptDialog`.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "accepted": true
}
```

### screenshot

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "format": "png"
}
```

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "format": "png",
  "dataBase64": "..."
}
```

### uploadFile

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "ref": "e2",
  "filePath": "/absolute/path/to/image.png",
  "waitMs": 1000
}
```

The referenced element must be an `input[type=file]` from the latest
observation. The native host should validate local file existence before the
extension calls CDP.

Result payload: `BrowserObservation`

### listDownloads

Params:

```json
{
  "id": 12,
  "state": "complete",
  "urlContains": "report",
  "filenameContains": ".csv",
  "mimeContains": "text/csv",
  "startedAfter": 1760000000000,
  "limit": 50
}
```

Returns recent Chrome downloads matching the optional filters. `startedAfter` is
a Unix timestamp in milliseconds.

Result payload:

```json
{
  "downloads": [
    {
      "id": 12,
      "url": "https://example.com/report.csv",
      "filename": "/Users/me/Downloads/report.csv",
      "mime": "text/csv",
      "state": "complete",
      "totalBytes": 1024,
      "bytesReceived": 1024,
      "startTime": "2026-06-04T07:00:00.000Z"
    }
  ]
}
```

### waitForDownload

Params:

```json
{
  "state": "complete",
  "urlContains": "report",
  "filenameContains": ".csv",
  "timeoutMs": 30000,
  "pollMs": 250
}
```

Waits for the newest matching Chrome download to reach `complete`,
`interrupted`, `in_progress`, or `any`. Timeout is reported in the result
payload.

Result payload:

```json
{
  "matched": true,
  "timedOut": false,
  "state": "complete",
  "elapsedMs": 1400,
  "download": {
    "id": 12,
    "filename": "/Users/me/Downloads/report.csv",
    "state": "complete"
  }
}
```

### cdp

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "method": "DOMSnapshot.captureSnapshot",
  "params": {},
  "timeoutMs": 10000
}
```

`cdp` sends a raw Chrome DevTools Protocol command to a controlled tab. The
extension attaches the debugger if needed, serializes concurrent attach work for
the same tab, and applies a per-command timeout.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "method": "DOMSnapshot.captureSnapshot",
  "result": {}
}
```

### closeTab

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456
}
```

Detaches the debugger from the tab, closes the tab, and removes it from any
tracked session. If `tabId` is omitted, the session's active tab is used.

Result payload:

```json
{
  "closed": true,
  "sessionId": "uuid",
  "tabId": 456,
  "remainingSessions": []
}
```

### finalizeSession

Params:

```json
{
  "sessionId": "uuid",
  "keepTabIds": [456],
  "closeRest": true
}
```

Stops session tracking, detaches all debugger targets, keeps any listed tabs
open for user handoff, and closes the rest when `closeRest` is not false. This
is the cleanup path for agent-created browser work when some tabs are
deliverables.

Result payload:

```json
{
  "finalized": true,
  "sessionId": "uuid",
  "closedTabs": [789],
  "keptTabs": [456]
}
```

### stopSession

Params:

```json
{
  "sessionId": "uuid",
  "closeTabs": false
}
```

Result payload:

```json
{
  "stopped": true,
  "sessionId": "uuid",
  "closedTabs": []
}
```

## MVP Security Rules

- Navigation allows only `http:` and `https:`.
- `chrome://`, `edge://`, `file://`, and extension pages are blocked in MVP.
- Raw `cdp` commands are intended for trusted local tooling. Do not pass
  untrusted page text directly into CDP command names or script bodies.
- `evaluate` is also trusted local tooling; page-returned values remain
  untrusted web content.
- Password input values are never returned; password elements use
  `label: "[password field]"` and `sensitive: true`.
- Native host logs must use stderr only. stdout is reserved for native
  messaging frames.
- Agent-facing observations must be wrapped as untrusted web content.
