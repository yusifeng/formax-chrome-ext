# Formax Browser Protocol

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

HTTP callers should send the RPC auth token in `x-agent-browser-token`.
`AGENT_BROWSER_TOKEN` is the explicit override. When it is not set, the native
host requires a token by default and reads or creates one at
`AGENT_BROWSER_TOKEN_FILE`, or `~/.formax/browser-rpc-token` if no token file is
configured. Local development can opt out only by setting
`AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC=1`; packaged or normal runtime flows
should not use that opt-out.

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
    "code": "requires_host_approval",
    "message": "Concise user-facing error",
    "details": {
      "internalMessage": "Sanitized internal detail for logs/tests"
    }
  }
}
```

`error.message` is intended for end users and should stay concise. Diagnostic
or assertion code should read structured fields such as `error.code` and
`error.details.internalMessage`; the latter is sanitized and must not contain
request payloads, script bodies, credentials, or untrusted page content beyond
what the specific action already returned.

Native host HTTP RPC errors keep the legacy text field and include a structured
code:

```json
{
  "ok": false,
  "error": "Human-readable error",
  "errorCode": "requires_host_approval"
}
```

## Schema Source And Validation

Action names, tool names, capability annotations, and risk annotations are
registered in `shared/action-registry.ts`.

Agent-facing JSON Schema parameter definitions live in
`shared/browser-tool-schemas.ts`. `agent/browserTools.ts` exports those shared
schemas directly and validates tool/RPC params against them before sending
requests to the native host.

The native host keeps an independent forwarding boundary: it rejects unknown
actions, non-object `params`, unknown fields, missing required fields, obvious
type errors, key enum mismatches, invalid timeout ranges, and unsafe upload
paths before forwarding to the extension.

The extension keeps a second entry boundary in `extension/action-validator.ts`
for native messaging requests that bypass the agent SDK or native HTTP
validation. It rejects unknown actions, non-object `params`, unknown fields,
missing required fields, obvious type errors, and key enum mismatches before
dispatching to action handlers.

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
events, runtime exceptions, host approval requests, action audit events, and
download lifecycle events while any browser control session is active.

Every dispatched browser action emits a low-sensitive `browserActionAudit`
event after completion or failure. It does not include request params, script
bodies, CDP params, clipboard payloads, typed text, file contents, or page
snapshot data.

Action audit event example:

```json
{
  "type": "event",
  "name": "browserActionAudit",
  "auditKind": "action",
  "sequence": 44,
  "time": 1760000000000,
  "category": "navigation",
  "action": "openUrl",
  "actionId": "native request id",
  "sessionId": "uuid",
  "turnId": "turn-1",
  "tabId": 456,
  "origin": "https://example.com",
  "status": "ok",
  "resultCode": "ok",
  "errorCode": null,
  "confirmed": false,
  "originApproved": false,
  "confirmationId": null,
  "timing": {
    "startedAt": 1760000000000,
    "endedAt": 1760000000100,
    "durationMs": 100
  }
}
```

For failed actions, `status` is `"error"` and `errorCode` contains the
structured error code returned by the extension response envelope.

Host approval request event example:

```json
{
  "type": "event",
  "name": "hostApprovalRequired",
  "sequence": 45,
  "time": 1760000000000,
  "sessionId": "uuid",
  "tabId": 456,
  "action": "openUrl",
  "host": "example.com",
  "approvalId": "host:uuid:example.com:openUrl",
  "message": "Browser access to example.com requires approval before navigate.",
  "suggestedDecisions": {
    "allowForSession": {
      "decision": "allow",
      "host": "example.com",
      "sessionId": "uuid"
    },
    "alwaysAllow": {
      "decision": "always_allow",
      "host": "example.com"
    },
    "deny": {
      "decision": "deny",
      "host": "example.com"
    }
  }
}
```

The triggering action still fails with `requires_host_approval`. The MCP client
or host UI should present the request to the user, call `updatePolicy` with one
of the suggested decisions after approval, and then retry the original action.

Action confirmation request event example:

```json
{
  "type": "event",
  "name": "browserActionConfirmationRequired",
  "sequence": 46,
  "time": 1760000000000,
  "sessionId": "uuid",
  "tabId": 456,
  "action": "click",
  "host": "example.com",
  "confirmationId": "confirm:uuid:example.com:click:destructive_action",
  "message": "Browser action click requires confirmation (destructive_action).",
  "reasons": ["destructive_action"],
  "target": {
    "label": "Delete account",
    "text": "Delete account",
    "tagName": "button"
  },
  "requiredParams": {
    "confirmed": true,
    "confirmationId": "confirm:uuid:example.com:click:destructive_action"
  }
}
```

The triggering action still fails with `confirmation_required`. The MCP client
or host UI should present the action, host, reasons, and redacted target summary
to the user. After approval, retry the exact action with `confirmed: true` and
the supplied `confirmationId`; this does not create a persistent approval.

Origin approval request event example:

```json
{
  "type": "event",
  "name": "browserOriginApprovalRequired",
  "sequence": 47,
  "time": 1760000000000,
  "sessionId": "uuid",
  "tabId": 456,
  "action": "rawCdp",
  "host": "example.com",
  "approvalId": "origin:uuid:example.com:rawCdp",
  "message": "Browser action rawCdp on example.com requires originApproved=true.",
  "reasons": ["raw_cdp"],
  "requiredParams": {
    "originApproved": true
  }
}
```

The triggering action still fails with `origin_approval_required`. The MCP
client or host UI should present the action and origin to the user. After
approval, retry the exact raw CDP or page asset download action with
`originApproved: true`. If the action also exposes sensitive browser state, a
separate `browserActionConfirmationRequired` event may still require
`confirmed: true`.

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
  "name": "Checkout task",
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
  "nodeId": "n1k9q0pu",
  "stableNodeId": "n1k9q0pu",
  "role": "button",
  "label": "Submit",
  "sensitive": false,
  "tagName": "button",
  "shadowRoot": null,
  "shadowHostSelector": null,
  "frameSelectors": ["iframe#fixture"],
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

`nodeId` / `stableNodeId` are generated from relatively stable element features
such as frame path, role/name/text, test id, href, placeholder, shadow host, and
selector candidates. They are intended to stay stable across repeated snapshots
while the relevant page structure is unchanged. `ref` remains a snapshot-scoped
current-observation handle used by the extension to resolve the actual element.

The Node SDK's `tab.dom_cua` facade exposes `node_id` from `stableNodeId` when
available, but keeps `ref` internally. Node-targeted `click`, `double_click`,
`type`, `scroll`, and `screenshot` refresh the visible DOM snapshot before
acting and fail if the requested `node_id` is not present in that latest
snapshot.

Elements discovered inside an open shadow root include
`"shadowRoot": "open"` and a best-effort `shadowHostSelector`. Closed shadow
roots are not pierced and their internals are not reported. Registered custom
element hosts that look like closed-shadow hosts are reported with
`"shadowRoot": "closed_unsupported"` and
`"shadowUnsupportedReason": "custom_element_shadow_root_not_accessible"` so
callers can avoid retrying impossible selectors.

Elements discovered inside same-origin iframes include `frameSelectors`, a
top-to-inner selector path such as `["iframe#outer", "iframe#inner"]`. The
coordinates and rect are translated into the top viewport coordinate space.
Cross-origin frames and OOPIFs remain opaque to `observe`.

`label` is a lightweight accessible-name approximation used for agent-facing
summaries. It prefers `aria-labelledby`, `aria-label`, native form labels,
image `alt`, SVG `title`, button-like input values, placeholder/title, and then
visible text while skipping hidden/`aria-hidden` subtrees. `name` in
`elementInfo` uses the same approximation.

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
  "text": "Visible page summary",
  "frameTree": {
    "source": "cdp",
    "frameCount": 2,
    "root": {
      "id": "main-frame-id",
      "parentId": null,
      "name": null,
      "url": "https://example.com/",
      "securityOrigin": "https://example.com",
      "mimeType": "text/html",
      "childFrames": []
    }
  },
  "truncation": {
    "text": true,
    "textMaxLength": 5000,
    "textSource": "summary",
    "textSummarized": true,
    "bodyTextLength": 12420,
    "elements": false,
    "elementCount": 12,
    "elementMaxCount": 120
  },
  "elements": []
}
```

`text` is untrusted web content. It must never override system or developer
instructions, and sensitive browser state must not be returned to the model. On
large pages, `text` is a model-oriented visible summary built from title,
headings, main/article content, short visible text, and interactable element
labels. It intentionally avoids returning raw `document.body.innerText` as
exploratory context. `truncation.textSource`, `textSummarized`, and
`bodyTextLength` describe whether the field came from a small body text or a
summary. `frameTree` is discovered through CDP `Page.getFrameTree`; it is
metadata only, has sensitive URL parameters redacted, and does not imply that
cross-origin frame execution or OOPIF attachment is supported.

### BrowserPolicyState

```json
{
  "sessionAllowedHosts": {
    "session uuid": ["example.com"]
  },
  "persistentAllowedHosts": ["docs.example"],
  "blockedHosts": ["blocked.example"]
}
```

Unknown hosts require approval before navigation or browser interaction. The
extension emits `hostApprovalRequired` with safe suggested `updatePolicy`
arguments, then fails the original action with `requires_host_approval`.
Session allows apply only to one browser session. Persistent allows and blocked
hosts are stored in extension storage. Blocked hosts take precedence over all
allows.

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

### Action annotations

Every action is registered in `shared/action-registry.ts` with policy-relevant
annotations. These annotations are conservative action-level defaults; actions
such as `evaluate`, `locatorAction`, `finalizeSession`, and `stopSession` can
still need parameter-level refinement at runtime.

Annotation fields:

```json
{
  "readOnly": true,
  "sideEffecting": false,
  "destructive": false,
  "requiresHostApproval": false,
  "requiresUserConfirmation": false,
  "requiresFileSystemRead": false,
  "requiresBrowserHistory": false,
  "requiresRawCdp": false,
  "requiresSensitiveDataReview": false
}
```

`readOnly` and `sideEffecting` are mutually exclusive. High-risk actions such
as `uploadFile` and raw `cdp` are marked as requiring host approval, user
confirmation, and sensitive-data review.

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
  "nativeConnected": true,
  "lastNativeError": null,
  "sessions": [],
  "policy": {
    "sessionAllowedHosts": {},
    "persistentAllowedHosts": [],
    "blockedHosts": []
  },
  "extensionInstanceId": "local extension instance uuid",
  "attachedTabs": [],
  "supportedActions": ["health", "reloadExtension"],
  "backendRevision": 5,
  "profile": {
    "activeProfileName": null,
    "activeProfileId": null,
    "activeProfileSource": "unavailable",
    "lastUsedProfileHint": null,
    "lastUsedProfileSource": "unavailable",
    "incognito": false,
    "extensionInstanceId": "local extension instance uuid",
    "readsProfileFiles": false
  },
  "permissions": {
    "required": ["debugger", "tabs"],
    "granted": true,
    "missing": [],
    "hostPermissions": ["<all_urls>"],
    "hostPermissionsGranted": true,
    "missingHostPermissions": []
  },
  "fileUrlAccess": {
    "detectable": true,
    "allowed": false
  },
  "nativeManifest": {
    "path": "/Users/example/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.formax.browserhost.json",
    "expectedOrigin": "chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/",
    "hostName": "com.formax.browserhost",
    "extensionId": "dchkbbjmkheilkmencpckilhmmcppdne",
    "extensionOrigin": "chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/",
    "originMatchesExtensionId": true
  }
}
```

`nativeManifest.originMatchesExtensionId` reports whether the native messaging
manifest origin expected by the native host matches the active extension id.
This is especially useful when testing a local unpacked extension whose Chrome
extension id differs from the Web Store id.

`profile` reports only safe runtime metadata. The extension does not read Chrome
profile files. `activeProfileName`, `activeProfileId`, and `lastUsedProfileHint`
are `null` with source `unavailable` unless native diagnostics supplies a short
non-path hint; `incognito` is the current extension context.

Envelope metadata for `health` uses `sessionId: null` and `tabId: null`.

### reloadExtension

Params:

```json
{}
```

Schedules `chrome.runtime.reload()` after the response is sent. This is intended
for local development and tests that detect a stale unpacked extension after
`npm run build`.

Result:

```json
{
  "reloading": true,
  "backendRevision": 3
}
```

### getEvents

Params:

```json
{
  "sessionId": "optional uuid",
  "tabId": 456,
  "name": "cdpEvent",
  "sinceSequence": 42,
  "limit": 100,
  "includeSnapshots": true,
  "snapshotLimit": 10
}
```

Returns buffered extension events matching the optional filters. `sinceSequence`
is exclusive, so passing the last seen `sequence` returns only newer events. If
`includeSnapshots` is true, the result also includes bounded session-scoped
event snapshots archived during `finalizeSession` and `stopSession`.

Result payload:

```json
{
  "events": [],
  "snapshots": [
    {
      "version": 1,
      "sessionId": "uuid",
      "reason": "finalizeSession",
      "createdAt": 1760000000000,
      "eventCount": 25,
      "firstSequence": 10,
      "lastSequence": 34,
      "events": []
    }
  ]
}
```

### clearEvents

Params:

```json
{
  "sessionId": "optional uuid",
  "tabId": 456,
  "name": "cdpEvent",
  "sinceSequence": 42,
  "includeSnapshots": true
}
```

Clears buffered extension events matching the optional filters. If
`includeSnapshots` is true, matching persisted session event snapshots are also
cleared.

Result payload:

```json
{
  "cleared": 3,
  "clearedSnapshots": 1
}
```

### startSession

Params:

```json
{
  "sessionId": "stable id from the app/native runtime",
  "turnId": "optional current turn id",
  "name": "optional session name",
  "active": true,
  "initialUrl": "about:blank"
}
```

`sessionId` is required. The extension does not create random browser sessions;
the app/native runtime owns stable session identity.

Result payload: `BrowserSession`

### waitForEvent

Params:

```json
{
  "sessionId": "optional uuid",
  "tabId": 456,
  "name": "cdpEvent",
  "sinceSequence": 42,
  "timeoutMs": 15000,
  "pollMs": 100
}
```

Waits for a buffered extension event matching the optional filters. Common
event names include `cdpEvent`, `downloadCreated`, `downloadChanged`,
`dialogOpened`, `fileChooserOpened`, `cursorMove`, `cursorArrived`,
`pageVisualStatus`, `debuggerDetached`, `userTakeover`,
`permissionPromptDetected`, `userHandoffRequired`, and `tabRemoved`.
`fileChooserOpened` is emitted after a controlled click targets an
`input[type=file]`, associated label, or wrapper that resolves to a file input.
The extension does not automate the native operating-system file dialog; it
suppresses the unsafe native chooser path and expects callers to use the
returned SDK handle's `setFiles()` method.

`pageVisualStatus` is a Codex-style visual status event mirrored to the page
content script. Supported phases are `active`, `thinking`, `handoff`,
`deliverable`, `stopped`, and `taken_over`. The content script renders these as
best-effort favicon badges and cursor state. `userTakeover` is emitted when the
debugger detaches unexpectedly, for example because the user opened DevTools or
otherwise interrupted automation.

`userHandoffRequired` is emitted when the extension refuses to automate actions
that must be completed by the user, including CAPTCHA/human-verification
challenges, password-change final submission, browser security interstitial
bypasses, and paywall bypasses. The page visual status is set to `handoff`
before the action fails with `user_handoff_required`.

`permissionPromptDetected` is emitted when an observable browser action target
looks like a browser/site permission grant, such as camera, microphone,
location, notification, account/login access, or extension install. This covers
page-visible permission grant targets; native Chrome permission bubbles are
still browser UI and may require manual user action.

Result payload:

```json
{
  "matched": true,
  "timedOut": false,
  "elapsedMs": 321,
  "event": {
    "type": "event",
    "name": "cdpEvent",
    "sequence": 45
  }
}
```

For file chooser events, the extension owns a short-lived chooser record and
returns both camelCase and Codex-style snake_case ids. Use
`waitForFileChooser`/`setFileChooserFiles` or the SDK handle's `setFiles()`
instead of re-targeting the element from the client:

```json
{
  "name": "fileChooserOpened",
  "tabId": 456,
  "fileChooserId": "fc-uuid",
  "file_chooser_id": "fc-uuid",
  "isMultiple": true,
  "is_multiple": true,
  "fileChooser": {
    "fileChooserId": "fc-uuid",
    "file_chooser_id": "fc-uuid",
    "ref": "e12",
    "selector": null,
    "multiple": true,
    "isMultiple": true,
    "is_multiple": true,
    "accept": ".png,.jpg",
    "name": "assets",
    "inputId": "asset-upload"
  }
}
```

### getDiagnostics

Params:

```json
{
  "sessionId": "optional uuid",
  "tabId": 456,
  "eventLimit": 100,
  "devLogLimit": 100,
  "includeSnapshots": true
}
```

Exports a bounded diagnostics snapshot for support and bug reports. The native
host injects non-secret native manifest metadata before forwarding the request
to the extension. The extension does not read Chrome profile files or native
manifest files directly. If the host or doctor layer supplies safe profile
hints, health includes them in `profile`; otherwise the fields stay null with
source `unavailable`.

The result includes health, recent events, optional event snapshots, recent dev
logs, active sessions, attached debugger tabs, native manifest metadata when the
native host can derive it, and extension id/version metadata.

Result payload:

```json
{
  "health": {},
  "events": [],
  "eventSnapshots": [],
  "devLogs": [],
  "activeSessions": [],
  "attachedTabs": [],
  "nativeManifest": {
    "path": "/Users/example/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.formax.browserhost.json",
    "expectedOrigin": "chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/",
    "hostName": "com.formax.browserhost",
    "extensionId": "dchkbbjmkheilkmencpckilhmmcppdne",
    "extensionOrigin": "chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/",
    "originMatchesExtensionId": true
  },
  "extension": {
    "id": "dchkbbjmkheilkmencpckilhmmcppdne",
    "version": "0.1.1",
    "backendRevision": 5
  }
}
```

### getPolicy

Params:

```json
{
  "sessionId": "optional uuid"
}
```

Returns the browser-use policy state. When `sessionId` is provided, the
`sessionAllowedHosts` map is filtered to that session.

Result payload:

```json
{
  "policy": {
    "sessionAllowedHosts": {
      "session-a": ["example.com"]
    },
    "persistentAllowedHosts": ["docs.example"],
    "blockedHosts": ["blocked.example"]
  }
}
```

### updatePolicy

Params:

```json
{
  "decision": "allow",
  "sessionId": "session-a",
  "host": "example.com",
  "url": "https://example.com/path",
  "reset": false
}
```

`decision` is one of:

- `allow`: allow the host for `sessionId`; `sessionId` is required.
- `always_allow`: persistently allow the host.
- `deny`: add the host to the blocklist.

Pass either `host` or `url`. `reset: true` clears all policy state and ignores
`decision`.

Result payload:

```json
{
  "policy": {
    "sessionAllowedHosts": {},
    "persistentAllowedHosts": [],
    "blockedHosts": ["example.com"]
  }
}
```

### nameSession

Params:

```json
{
  "sessionId": "existing session id",
  "name": "Checkout task"
}
```

Updates the in-memory session name and best-effort Chrome tab group title.

Result payload:

```json
{
  "session": {}
}
```

### openTabs

Params:

```json
{
  "currentWindow": true,
  "includeControlled": false
}
```

Lists user-visible Chrome tabs that can be claimed. Returned tabs include a
short-lived `claimToken`; pass that token to `claimTab` instead of guessing raw
Chrome tab IDs.

Result payload:

```json
{
  "tabs": [
    {
      "id": 456,
      "title": "Example",
      "url": "https://example.com/",
      "active": true,
      "groupId": 3,
      "groupLabel": "Research",
      "openedAt": 1780000100000,
      "lastFocusedAt": 1780000200000,
      "controlled": false,
      "claimToken": "token",
      "claimTokenExpiresAt": 1780000000000
    }
  ]
}
```

### claimTab

Params:

```json
{
  "sessionId": "stable id from the app/native runtime",
  "turnId": "optional current turn id",
  "claimToken": "token returned from openTabs",
  "active": true
}
```

`sessionId` is required. Prefer `claimToken` from `openTabs`; raw `tabId` claims
are only allowed when `allowUnsafeTabIdClaim` is true. Claiming creates or
updates a tab lease with `origin: "user"` and does not force the tab into the
managed Chrome group.

Result payload: `BrowserSession`

### getHistory

Params:

```json
{
  "query": "example",
  "from": 1780876800000,
  "to": 1780963200000,
  "limit": 25,
  "confirmed": true
}
```

Reads Chrome browsing history using the extension `history` permission.
`confirmed: true` is required on every request. Browser history has no
always-allow policy path because it is sensitive user telemetry. `from` and
`to` are Unix timestamps in milliseconds. `query` defaults to an empty string
and `limit` is bounded by the extension. Returned URLs redact sensitive query
parameter values such as tokens, passwords, API keys, auth/session ids, and
credential codes. Titles are also passed through common secret-pattern
redaction. Redacted entries include `redacted: true` and `redactionReasons`.

Bookmarks are intentionally not exposed. The extension does not request the
Chrome `bookmarks` permission, there is no bookmarks action in the protocol, and
`getCapabilities` reports `browser.user.bookmarks` as unavailable with reason
`unsupported_sensitive_browser_state`. This avoids returning long-lived personal
navigation preferences unless a future explicit feature adds a separate
confirmation and sensitivity policy.

Result payload:

```json
{
  "sensitive": true,
  "entries": [
    {
      "id": "123",
      "url": "https://example.com/",
      "title": "Example",
      "lastVisitTime": 1780876800000,
      "dateVisited": "2026-06-08T00:00:00.000Z",
      "visitCount": 2,
      "typedCount": 0,
      "redacted": false,
      "redactionReasons": []
    }
  ]
}
```

### clipboardReadText

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "confirmed": true
}
```

Reads plain text from the system clipboard through the extension offscreen
clipboard document. `confirmed: true` is required on every request. Clipboard
contents are sensitive user telemetry.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "text": "clipboard text",
  "sensitive": true
}
```

### clipboardWriteText

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "text": "text to place on the clipboard",
  "confirmed": true,
  "sensitive": false
}
```

Writes plain text to the system clipboard through the extension offscreen
clipboard document. `confirmed: true` is required on every request because
clipboard writes affect global user state.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "written": true,
  "textLength": 31
}
```

### clipboardRead

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "confirmed": true
}
```

Reads typed clipboard items from the system clipboard. Every payload includes a
`mimeType`, `dataBase64`, and `size`; text MIME types also include decoded
`text`. `confirmed: true` is required on every request.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "sensitive": true,
  "items": [
    {
      "types": [
        {
          "mimeType": "text/plain",
          "text": "clipboard text",
          "dataBase64": "Y2xpcGJvYXJkIHRleHQ=",
          "size": 14
        },
        {
          "mimeType": "image/png",
          "dataBase64": "iVBORw0KGgo=",
          "size": 8
        }
      ]
    }
  ]
}
```

### clipboardWrite

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "confirmed": true,
  "items": [
    {
      "types": [
        {
          "mimeType": "text/plain",
          "text": "text to place on the clipboard"
        },
        {
          "mimeType": "image/png",
          "dataBase64": "iVBORw0KGgo="
        }
      ]
    }
  ]
}
```

Writes typed clipboard items to the system clipboard. Each payload must provide
either `text` or `dataBase64`. `confirmed: true` is required on every request.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "written": true,
  "itemCount": 1
}
```

### createTab

Params:

```json
{
  "sessionId": "stable id from the app/native runtime",
  "turnId": "optional current turn id",
  "url": "about:blank",
  "active": true
}
```

`sessionId` is required. Creates a new agent-origin tab and adds it to the
existing managed Chrome group for active/handoff agent leases in the same
session. If no reusable managed group exists, a new one is created.

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
    "groupId": 123,
    "sessionId": "uuid",
    "controlled": true
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

Makes an already-controlled tab active, updates the session's `activeTabId`, and
attaches the debugger if needed. It does not claim arbitrary user tabs; use
`openTabs` and `claimTab` for that.

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
    "groupId": 123,
    "sessionId": "uuid",
    "controlled": true
  }
}
```

### listTabs

Params:

```json
{
  "sessionId": "optional session id",
  "controlledOnly": true,
  "currentWindow": true
}
```

Returns Chrome tab summaries. Each summary includes whether the tab is currently
controlled by an agent session.

Result payload:

```json
{
  "tabs": [
    {
      "id": 456,
      "windowId": 1,
      "title": "Example",
      "url": "https://example.com",
      "active": true,
      "groupId": 123,
      "sessionId": "uuid",
      "controlled": true
    }
  ]
}
```

### getTab

Params:

```json
{
  "sessionId": "optional session id",
  "tabId": 456
}
```

If `tabId` is omitted, the active tab in `sessionId` is returned.

Result payload:

```json
{
  "tab": {}
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
  "timeoutMs": 15000,
  "idleMs": 500
}
```

Supported states are `commit`, `domcontentloaded`, `load`, and `networkidle`.
If the current document already satisfies `domcontentloaded` or `load`, the
action returns immediately. `commit` waits for the next main-frame
`Page.frameNavigated` event after the call starts; it is not treated as already
satisfied by the current document. `networkidle` waits until Chrome reports no
in-flight network requests for `idleMs` milliseconds, defaulting to 500ms.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "state": "load",
  "reason": "already_satisfied"
}
```

For `commit`, `reason` is `Page.frameNavigated` on success or `timeout` when no
main-frame navigation commits before `timeoutMs`. For `networkidle`, `reason`
is `networkidle` on success or `timeout` when the network does not become idle
before `timeoutMs`.

### waitForUrl

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "url": "https://example.com/complete",
  "urlContains": "/complete",
  "urlRegex": "/complete(?:$|[?#])",
  "waitUntil": "load",
  "timeoutMs": 15000,
  "pollMs": 100,
  "idleMs": 500
}
```

At least one of `url`, `urlContains`, or `urlRegex` is required. If multiple
matchers are supplied, all must match. `waitUntil` optionally waits for a load
state after the URL matches. Supported values are `commit`, `domcontentloaded`,
`load`, and `networkidle`. `commit` is considered satisfied by the URL match
itself because the matching URL is observable only after navigation has
committed. `networkidle` uses `idleMs`, defaulting to 500ms. Timeout is reported
in the result payload.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "matched": true,
  "timedOut": false,
  "elapsedMs": 300,
  "url": "https://example.com/complete",
  "title": "Complete",
  "waitUntil": "load",
  "loadReason": "already_satisfied"
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

By default, `observe` returns a lightweight DOM-derived summary rather than a
full `body.innerText` dump. When
`includeAccessibility` is true, the extension adds a truncated
`accessibilityTree` from `Accessibility.getFullAXTree`. When `includeDomSnapshot`
is true, it adds a sanitized `DOMSnapshot.captureSnapshot` payload. Snapshot
strings are secret-redacted, large JSON-like payloads are replaced with compact
placeholders, and very large strings are truncated before returning to the
model. The lightweight summary recursively pierces open shadow roots for
interactable elements and
marks those elements with `shadowRoot: "open"` plus a best-effort
`shadowHostSelector`; likely closed-shadow custom-element hosts are marked with
`shadowRoot: "closed_unsupported"` and remain opaque.
Every observation also includes a CDP-derived `frameTree` when available.

### elementInfo

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "x": 42,
  "y": 64,
  "includeNonInteractable": false
}
```

Inspects the element at viewport coordinates. By default, the extension returns
the nearest interactable ancestor for the hit target. Set
`includeNonInteractable: true` to inspect the raw element at the point instead.
Returned text is untrusted page content and sensitive field values are redacted.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "source": "chrome_page",
  "trust": "untrusted",
  "x": 42,
  "y": 64,
  "found": true,
  "nodeId": "n1k9q0pu",
  "stableNodeId": "n1k9q0pu",
  "backendNodeId": 123,
  "role": "button",
  "name": "Submit",
  "tagName": "button",
  "shadowRoot": null,
  "shadowHostSelector": null,
  "selectorCandidates": [
    { "kind": "id", "selector": "#submit" }
  ],
  "rect": { "x": 20, "y": 40, "width": 80, "height": 32 }
}
```

### locatorQuery

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "locator": {
    "kind": "css",
    "selector": "input[name=q]",
    "frameSelectors": ["iframe#fixture"],
    "and": { "kind": "css", "selector": ".enabled" },
    "or": { "kind": "role", "role": "button", "name": "Search" },
    "has": { "kind": "css", "selector": "label" },
    "hasNot": { "kind": "text", "text": "Archived" },
    "hasText": "Search",
    "hasNotText": "Archived",
    "visible": true,
    "index": 0,
    "strict": false
  },
  "kind": "isVisible",
  "args": {},
  "timeoutMs": 10000
}
```

First-pass locator primitive for SDK facades. Locator kinds are `css`, `text`,
`role`, `label`, `placeholder`, and `testId`. Same-origin frame targeting is
represented by `frameSelectors`, for example
`["iframe#outer", "iframe#inner"]`. Locator read paths such as `locatorQuery`
and `locatorWait` attempt to resolve frame selectors to a CDP `frameId` and run
inside that frame's isolated execution context. `boundingBox` stays on the
top-level same-origin DOM traversal path so screenshots keep top-viewport clip
coordinates. Locator actions still resolve `frameSelectors` through same-origin
DOM access. Use `resolveFrame` and frame-scoped
`evaluate({ frameId, targetId })` for explicit CDP frame context targeting;
automatic locator action routing into cross-origin/OOPIF frames is not yet
complete. Locator resolution recursively pierces open shadow roots for each
selector/query root. Closed shadow roots are opaque and cannot be targeted.
`index` selects a zero-based match for
first-element queries; `strict: true` requires exactly one match. Supported query kinds are `count`,
`allTextContents`, `textContent`, `innerText`, `getAttribute`, `isVisible`,
`isEnabled`, and `boundingBox`.

Semantic role and label locators use the same lightweight accessible-name
approximation as `observe` and `elementInfo`: `aria-labelledby`, `aria-label`,
native labels, image alt text, SVG title text, button-like input values, and
visible text with hidden/`aria-hidden` subtrees omitted.

### resolveFrame

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "frameSelectors": ["iframe#fixture", "iframe#nested"],
  "targetId": "optional-devtools-target-id",
  "timeoutMs": 10000
}
```

`resolveFrame` resolves a `frameLocator` selector path into CDP frame metadata.
The extension first walks the selector path in the page to collect iframe
attributes and same-origin document URLs, then compares that path with
`Page.getFrameTree` child frames to find the selected CDP `frameId`. If
`targetId` is supplied, discovery runs against that DevTools target. This
primitive is intentionally read-only and returns `matched: false` rather than
inventing a frame id when the DOM path cannot be matched to CDP metadata.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": null,
  "frameSelectors": ["iframe#fixture"],
  "matched": true,
  "accessible": true,
  "frameId": "CDP_FRAME_ID",
  "frame": {
    "id": "CDP_FRAME_ID",
    "parentId": "ROOT_FRAME_ID",
    "name": "fixture",
    "url": "https://example.test/frame",
    "childFrames": []
  },
  "path": [
    {
      "selector": "iframe#fixture",
      "index": 0,
      "accessible": true,
      "id": "fixture",
      "name": "fixture",
      "src": "https://example.test/frame",
      "url": "https://example.test/frame",
      "frameId": "CDP_FRAME_ID"
    }
  ]
}
```

Locator plans may also include filters:

```json
{
  "kind": "css",
  "selector": ".card",
  "has": { "kind": "css", "selector": ".badge", "hasText": "Ready" },
  "hasNot": { "kind": "text", "text": "Archived" },
  "hasText": "Alpha",
  "hasNotText": "Archived",
  "visible": true
}
```

`and` intersects the candidate set with another locator in the same page/root
scope. `or` unions the candidate set with another locator and removes duplicate
elements while preserving the original locator's ordering first.
`has` and `hasNot` resolve a nested locator within each candidate element.
`hasText` and `hasNotText` filter candidate element DOM text. `visible` filters
by computed visibility and non-zero bounds.

The SDK helper `locator.all({ limit })` is client-side: it calls `count()` and
returns bounded `nth(index)` locator handles. The default limit is 100, and a
non-positive limit is rejected before any backend request.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "kind": "isVisible",
  "value": true,
  "count": 1
}
```

### locatorAction

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "locator": {
    "kind": "css",
    "selector": "input[name=q]",
    "index": 0,
    "strict": true
  },
  "kind": "fill",
  "args": {
    "value": "hello",
    "force": false
  },
  "waitMs": 300
}
```

First-pass locator action primitive. Supported action kinds are `click`,
`dblclick`, `fill`, `type`, `press`, `clear`, `focus`, `hover`, `setChecked`,
and `selectOption`. Actions resolve the CSS locator at action time instead of
caching DOM nodes. Open shadow roots are pierced using the same semantics as
`locatorQuery`. `index` and `strict` use the same semantics as `locatorQuery`.

Locator actions perform Playwright-style first-pass actionability checks before
the backend dispatches keyboard or pointer input:

- the element must remain attached through the actionability check
- the element is scrolled into view with `scrollIntoView({ block: "center",
  inline: "center" })`
- the bounding box must be stable across two animation frames
- visible actions require non-zero visible bounds and visible computed style
- form and pointer actions require enabled controls
- fill/type/clear require an editable input, textarea, or contenteditable
  element
- click/dblclick/hover verify the element receives pointer events at its center
  or return an occlusion/out-of-viewport error

Passing `args.force: true` skips visible/enabled/editable/pointer checks while
still requiring locator resolution, attachment, and a stable bounding box.

Semantic locator examples:

```json
{ "kind": "text", "text": "Submit", "exact": true }
{ "kind": "role", "role": "button", "name": "Submit", "exact": true }
{ "kind": "label", "text": "Email" }
{ "kind": "placeholder", "text": "Search" }
{ "kind": "testId", "testId": "submit-name" }
{ "kind": "css", "selector": ".card", "hasText": "Alpha", "visible": true }
{ "kind": "css", "selector": ".card", "and": { "kind": "css", "selector": ".featured" } }
```

Result payload: `BrowserObservation`

### locatorWait

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "locator": {
    "kind": "css",
    "selector": "button[type=submit]",
    "index": 0,
    "strict": false
  },
  "state": "visible",
  "timeoutMs": 15000,
  "pollMs": 100
}
```

Supported states are `attached`, `visible`, `hidden`, and `detached`. `index`
and `strict` use the same semantics as `locatorQuery`.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "state": "visible",
  "matched": true,
  "timedOut": false,
  "elapsedMs": 220,
  "count": 1
}
```

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
  "modifiers": ["Shift"],
  "waitMs": 500,
  "confirmed": false
}
```

Targets can be specified by `ref` from the latest observation, by CSS
`selector`, or by viewport `x`/`y` coordinates. `button` defaults to `left`;
supported buttons are `left`, `middle`, `right`, `back`, and `forward`.
`modifiers` may contain `Alt`, `Control`, `ControlOrMeta`, `Meta`, and `Shift`.

Result payload: `BrowserObservation`

### drag

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "path": [
    { "x": 120, "y": 240 },
    { "x": 220, "y": 300 }
  ],
  "button": "left",
  "modifiers": ["ControlOrMeta", "Shift"],
  "waitMs": 300,
  "confirmed": false
}
```

Drags the Chrome mouse pointer through viewport coordinates. `path` must contain
at least two points. `button` defaults to `left`; supported buttons are `left`,
`middle`, `right`, `back`, and `forward`. `modifiers` may contain `Alt`,
`Control`, `ControlOrMeta`, `Meta`, and `Shift`.

Result payload: `BrowserObservation`

### moveMouse

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "x": 120,
  "y": 240,
  "modifiers": ["Alt"],
  "waitMs": 100
}
```

Moves both the visible agent cursor overlay and the Chrome mouse pointer to page
viewport coordinates. `modifiers` may contain `Alt`, `Control`,
`ControlOrMeta`, `Meta`, and `Shift`.

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
  "modifiers": ["Shift"],
  "waitMs": 300
}
```

`x` and `y` are optional. If omitted, the extension scrolls from the viewport
center. `modifiers` may contain `Alt`, `Control`, `ControlOrMeta`, `Meta`, and
`Shift`.

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
  "waitMs": 300,
  "sensitive": false,
  "confirmed": false
}
```

If `ref` or `selector` is supplied, the extension focuses that element before
typing. If coordinates are supplied, the extension clicks there before typing.
If no target is supplied, text is inserted into the current focused element.
Typing with `sensitive: true` requires `confirmed: true`.

Result payload: `BrowserObservation`

### evaluate

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": "optional-devtools-target-id",
  "frameId": "optional-cdp-frame-id",
  "script": "document.title",
  "awaitPromise": true,
  "timeoutMs": 10000,
  "mode": "read",
  "confirmed": false,
  "reason": "inspect page title"
}
```

Evaluates JavaScript in the controlled tab with `returnByValue: true`.
`mode: "read"` is for routine inspection. Mutating scripts or `mode: "write"`
require `confirmed: true`. In addition to the generic action audit event, the
extension emits a diagnostic `browserActionAudit` event with
`auditKind: "diagnostic"` for each evaluate call with origin, method, action id,
turn id, session id, and reason; the script body is not included in either audit
event. When `frameId` is supplied, the extension creates an isolated execution
world for that CDP frame through `Page.createIsolatedWorld` and passes the
returned `executionContextId` to `Runtime.evaluate`. When `targetId` is also
supplied, both `Page.createIsolatedWorld` and `Runtime.evaluate` are sent to
that DevTools target, allowing callers that discovered OOPIF/page targets to
evaluate in the selected target's frame context.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": null,
  "frameId": "optional-cdp-frame-id",
  "executionContextId": 42,
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

Supported keys include common Playwright-style key names: `Enter`, `Tab`,
`Escape`, `Backspace`, `Delete`, `Insert`, `Space`, `Home`, `End`, `PageUp`,
`PageDown`, arrow keys, `Pause`, `CapsLock`, `NumLock`, `ScrollLock`,
`ContextMenu`, `F1` through `F12`, single ASCII letters/digits, and simple
US-keyboard punctuation such as `/`, `-`, and `.`. Common aliases such as
`Esc`, `Del`, `Spacebar`, `Left`, `Right`, `PgUp`, `PgDown`, `Return`, `Ctrl`,
`Cmd`, `Command`, and `Option` are accepted. Modifier-only keys `Alt`,
`Control`, `ControlOrMeta`, `Meta`, and `Shift` are supported, as are modifier
combos such as `ControlOrMeta+Shift+Space` and `Ctrl+A`.

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

The wire protocol returns `dataBase64`. The Node browser-client SDK preserves
that field and adds local convenience fields: `mimeType`, `dataUrl`, and
`bytes` (`Uint8Array`). The SDK also accepts `path` or `saveToFile` as
absolute local output paths; those are client-side options and are not forwarded
to the extension.

Element screenshots are SDK helpers built on top of existing protocol actions:
`locator.screenshot()` first calls `locatorQuery` with `kind: "boundingBox"` and
then calls `screenshot` with a `clip`; `tab.dom_cua.screenshot({ node_id })`
uses the latest visible DOM snapshot to find the node box before calling
`screenshot`, failing if the node id is stale. Both helpers support `padding`,
`format`, `highlight: true`, `highlightColor`, `highlightDurationMs`, and the
SDK-only `path`/`saveToFile` output options. Highlighting draws a best-effort
content-script overlay around the target before the screenshot is captured;
restricted pages may still return a screenshot without the overlay.

`tab.playwright.expectNavigation(action, options)` is also an SDK helper. It
starts a navigation watcher before invoking the supplied action callback, then
returns both the action result and navigation result. With URL matchers it uses
`waitForUrl({ waitUntil })`; without URL matchers it waits for a main-frame
`commit` first and then the requested `waitUntil`/`state` load state.

### waitForFileChooser

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "timeoutMs": 15000,
  "pollMs": 100,
  "sinceSequence": 42
}
```

Waits for a `fileChooserOpened` event created by a controlled click. This is a
Codex-style convenience over the generic event buffer: the result exposes
`fileChooserId` and `file_chooser_id` so callers can set files without
reconstructing or guessing the DOM target.

Result payload:

```json
{
  "matched": true,
  "timedOut": false,
  "elapsedMs": 12,
  "fileChooserId": "fc-uuid",
  "file_chooser_id": "fc-uuid",
  "isMultiple": true,
  "is_multiple": true,
  "fileChooser": {
    "fileChooserId": "fc-uuid",
    "file_chooser_id": "fc-uuid",
    "multiple": true,
    "isMultiple": true,
    "is_multiple": true,
    "accept": ".png,.jpg"
  },
  "event": {
    "name": "fileChooserOpened"
  }
}
```

### setFileChooserFiles

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "fileChooserId": "fc-uuid",
  "file_chooser_id": "fc-uuid",
  "files": [
    "/absolute/path/to/first.png",
    "/absolute/path/to/second.png"
  ],
  "timeoutMs": 15000,
  "waitMs": 1000,
  "confirmed": true
}
```

Sets local files on a chooser returned by `waitForFileChooser`. `files` is the
Codex-style shape; `filePath` and `filePaths` remain accepted for local
compatibility. The native host validates every local file before the extension
uses the background-owned chooser record to resolve the original page target and
call CDP `DOM.setFileInputFiles`.

Result payload: `BrowserObservation`

### uploadFile

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "ref": "e2",
  "selector": "input[type=file]",
  "locator": {
    "kind": "css",
    "selector": "input[type=file]",
    "index": 0,
    "strict": true
  },
  "filePath": "/absolute/path/to/image.png",
  "filePaths": [
    "/absolute/path/to/first.png",
    "/absolute/path/to/second.png"
  ],
  "waitMs": 1000,
  "confirmed": true
}
```

Target the upload control with either `ref`, `selector`, or `locator`. Targets
may resolve directly to an `input[type=file]`, a visible `label` associated with
one, or a visible wrapper containing one. `ref` still refers to an element from
the latest observation; `selector` and `locator` resolve at action time. Pass
either `filePath` for one file or `filePaths` for multiple files. The native
host validates every local file before the extension calls CDP. Uploads require
`confirmed: true` unless a future policy layer pre-approves the exact file(s)
and destination.

Result payload: `BrowserObservation`

The Node browser-client SDK also supports the Playwright-style chooser flow:

```ts
const chooserPromise = tab.playwright.waitForEvent("filechooser");
await tab.locator('label[for="asset-upload"]').click();
const chooser = await chooserPromise;
await chooser.setFiles(["/absolute/path/a.png", "/absolute/path/b.jpg"], {
  confirmed: true
});
```

`chooser.isMultiple()` reflects the target input's `multiple` state.
`chooser.setFiles()` uses `setFileChooserFiles` with the background-owned
`file_chooser_id`, so native-host absolute path and allowed-root validation
still applies while the extension retains ownership of the page target.

### listDownloads

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
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

The wire protocol returns Chrome download summaries. The Node browser-client SDK
wraps each summary in a download handle with `suggestedFilename()`, `path()`,
and `toJSON()` helpers. `suggestedFilename()` is derived from the Chrome
download filename, falling back to the final URL when needed. `path()` returns a
local path only when Chrome reports a completed download with a filename.

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
  "sessionId": "uuid",
  "tabId": 456,
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

The Node browser-client SDK returns the same result shape with `download`
enriched as a download handle. `tab.playwright.waitForEvent("download", args)`
uses this action internally and returns the enriched `download` object directly;
it raises `BrowserTimeoutError` when the wait times out or no matching download
is found.

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

### downloadMedia

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "locator": {
    "kind": "css",
    "selector": "img.hero",
    "strict": true
  },
  "attribute": "auto",
  "filename": "assets/hero.png",
  "conflictAction": "uniquify",
  "saveAs": false,
  "waitForCompletion": true,
  "fallbackFetch": true,
  "fallbackMaxBytes": 26214400,
  "originApproved": true,
  "confirmed": false
}
```

Downloads an image/video/audio/source/link asset resolved from a locator. The
extension resolves the media URL in the page context, requires the URL to be
HTTP(S), checks the asset origin through browser policy, and then calls Chrome's
downloads API. `attribute` can be `auto`, `src`, `href`, `poster`, or
`backgroundImage`. `filename`, when supplied, must be a relative Chrome download
filename with no `..` segments.

By default the backend uses `chrome.downloads.download()` directly. If
`fallbackFetch: true` is supplied and direct download startup fails, the
extension fetches the media with browser credentials, bounds the response by
`fallbackMaxBytes` (default 25 MiB, hard-capped by the extension), re-checks
browser policy for any final redirected URL, and downloads the fetched bytes as a
data URL. This fallback is intended for page assets that need browser session
context; it is not a large-file downloader.

Page asset downloads require `originApproved: true`. Ordinary inbound media
downloads do not require `confirmed: true`; runnable or installable downloads
such as `.dmg`, `.exe`, `.pkg`, or `.sh` still require confirmation.

The Node browser-client SDK exposes this as:

```ts
const result = await tab.locator("img.hero").downloadMedia({
  originApproved: true,
  waitForCompletion: true
});
console.log(result.download?.suggestedFilename(), result.download?.path());
```

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "media": {
    "url": "https://example.com/assets/hero.png",
    "kind": "img",
    "tagName": "img",
    "attribute": "src",
    "filename": "assets/hero.png",
    "method": "chrome_downloads"
  },
  "download": {
    "id": 12,
    "filename": "/Users/me/Downloads/assets/hero.png",
    "state": "complete"
  },
  "matched": true,
  "timedOut": false,
  "elapsedMs": 1400
}
```

### attachTarget

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": "devtools-target-id",
  "originApproved": true,
  "confirmed": true,
  "reason": "inspect out-of-process iframe target"
}
```

`attachTarget` explicitly attaches the Chrome debugger to a DevTools target that
belongs to a controlled tab. This mirrors Codex resource 1.1.5's
background-level `attachTarget` lifecycle entry point instead of only relying
on implicit attachment during `cdp({ targetId })`. Because attaching gives the
runtime raw CDP control of that target, it uses the same host/origin approval
path as raw `cdp`.

Result payload:

```json
{
  "attached": true,
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": "devtools-target-id"
}
```

### detachTarget

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": "devtools-target-id",
  "reason": "cleanup target debugger attachment"
}
```

`detachTarget` releases an explicit target-level debugger attachment while
preserving the controlled tab/session bookkeeping. It is best-effort from the
caller perspective: detaching an already detached target clears local attachment
state and returns `attached: false`.

Result payload:

```json
{
  "attached": false,
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": "devtools-target-id"
}
```

### cdp

Params:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": "optional-devtools-target-id",
  "method": "DOMSnapshot.captureSnapshot",
  "params": {},
  "timeoutMs": 10000,
  "originApproved": true,
  "confirmed": true,
  "reason": "capture diagnostic DOM snapshot"
}
```

`cdp` sends a raw Chrome DevTools Protocol command to a controlled tab. The
extension attaches the debugger if needed, serializes concurrent attach work for
the same tab, and applies a per-command timeout. When `targetId` is supplied,
the extension sends the command to that specific DevTools target instead of the
top-level tab target while still using the controlled tab for session, origin,
and audit context. `Target.getTargets` is special-cased through
`chrome.debugger.getTargets()` so callers can discover DevTools targets before
choosing whether to attach. Raw CDP requires origin-level approval through
`originApproved: true`. Raw CDP is advanced diagnostic tooling, not a normal
browsing primitive. In addition to the generic action audit event, the
extension emits a diagnostic `browserActionAudit` event with
`auditKind: "diagnostic"` for each raw CDP call with origin, method, action id,
turn id, session id, and reason; command params are not included in either
audit event.

Result payload:

```json
{
  "sessionId": "uuid",
  "tabId": 456,
  "targetId": "optional-devtools-target-id",
  "method": "DOMSnapshot.captureSnapshot",
  "result": {}
}
```

### getDevLogs

Params:

```json
{
  "sessionId": "optional uuid",
  "tabId": 456,
  "level": "error",
  "sinceSequence": 42,
  "limit": 100
}
```

Returns console, log, and runtime exception entries derived from buffered CDP
events. The extension currently buffers `Runtime.consoleAPICalled`,
`Runtime.exceptionThrown`, and `Log.entryAdded` while the debugger is attached.
Console arguments, log text, exception descriptions, stack traces, dialog text,
and URLs are secret-redacted before they enter the event buffer; dev log entries
include `redacted` and `redactionReasons` when text or URL values were changed.

Result payload:

```json
{
  "logs": [
    {
      "sequence": 45,
      "time": 1760000000000,
      "sessionId": "uuid",
      "tabId": 456,
      "source": "console",
      "level": "error",
      "text": "Example error",
      "redacted": false,
      "redactionReasons": []
    }
  ]
}
```

### getCapabilities

Params:

```json
{
  "scope": "browser",
  "sessionId": "optional uuid",
  "tabId": 456
}
```

Returns a first-pass capability registry for the current backend. This is not a
complete permission model yet; it gives the SDK enough information to expose
basic browser/tab capability listings and mark planned capabilities as
unavailable.

Result payload:

```json
{
  "capabilities": [
    {
      "id": "browser.tabs",
      "scope": "browser",
      "description": "List, create, select, and finalize controlled tabs.",
      "available": true
    }
  ]
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
  "handoffTabIds": [456],
  "deliverableTabIds": [654],
  "closeRest": true
}
```

Finalizes the current browser turn. `handoffTabIds` (or legacy `keepTabIds`) keep
their tab leases so the next turn can resume the same session and Chrome group.
`deliverableTabIds` stay open for the user but are released from agent control
and removed from the managed group. Remaining agent-created tabs are closed when
`closeRest` is not false; user-claimed tabs are released but not closed.
Before returning, the extension archives a bounded session-scoped event snapshot
to `chrome.storage.session` and clears that session's live events from the
in-memory event buffer.

Result payload:

```json
{
  "finalized": true,
  "sessionId": "uuid",
  "closedTabs": [789],
  "keptTabs": [456, 654],
  "handoffTabs": [456],
  "deliverableTabs": [654],
  "releasedTabs": [654],
  "eventSnapshot": {
    "version": 1,
    "sessionId": "uuid",
    "reason": "finalizeSession",
    "createdAt": 1760000000000,
    "eventCount": 25,
    "firstSequence": 10,
    "lastSequence": 34
  },
  "clearedEvents": 25
}
```

### endTurn

Params:

```json
{
  "sessionId": "uuid",
  "turnId": "turn-1"
}
```

Ends one browser-control turn and releases any active tab leases for that
`turnId`. Call `finalizeSession` first for tabs that should be handed off to the
next turn or delivered to the user.

Result payload:

```json
{
  "ended": true,
  "sessionId": "uuid",
  "turnId": "turn-1",
  "releasedTabs": [456]
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
  "closedTabs": [],
  "eventSnapshot": {
    "version": 1,
    "sessionId": "uuid",
    "reason": "stopSession",
    "createdAt": 1760000000000,
    "eventCount": 25,
    "firstSequence": 10,
    "lastSequence": 34
  },
  "clearedEvents": 25
}
```

## MVP Security Rules

- Navigation allows only `http:` and `https:`.
- `chrome://`, `edge://`, `file://`, and extension pages are blocked in MVP.
- Unknown `http`/`https` hosts emit `hostApprovalRequired` and require policy
  approval before navigation, click, typing, upload, evaluate, or raw CDP. Use
  `updatePolicy` to record session allows, persistent allows, or denied hosts,
  then retry the original action.
- File uploads and sensitive typing require `confirmed: true`.
- Clicks on targets that look like browser/site permission grants, such as
  camera, microphone, location, notification, account/login access, or extension
  install prompts, require `confirmed: true`.
- CAPTCHA/human-verification challenges, password-change final submission,
  browser security interstitial bypasses, and paywall bypasses are not automated;
  they emit `userHandoffRequired` and fail with `user_handoff_required`.
- Mutating `evaluate` calls require `confirmed: true`; read-only inspection can
  pass `mode: "read"`.
- Raw `cdp` calls require `originApproved: true`.
- Raw `cdp` calls that can read cookies, storage, credentials, tokens, or other
  private browser state also require `confirmed: true`; origin approval alone is
  not enough for sensitive reads.
- Read-only `evaluate` is allowed for routine inspection, but scripts that read
  cookies, localStorage, sessionStorage, IndexedDB, extension storage,
  passwords, credentials, tokens, or session identifiers require
  `confirmed: true`.
- Browser history reads require `confirmed: true` for each request and do not
  have a persistent or always-allow path.
- Clipboard reads and writes require `confirmed: true` for each request.
  Clipboard reads are sensitive telemetry; clipboard writes affect global user
  state.
- Native host RPC accepts only registered actions from `shared/action-registry`
  and validates each action's request shape before forwarding.
- Native host RPC requires `x-agent-browser-token` by default. Explicit
  `AGENT_BROWSER_TOKEN` wins; otherwise both the native host and agent SDK use
  `AGENT_BROWSER_TOKEN_FILE` or `~/.formax/browser-rpc-token`.
- `AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC=1` is only a local development and
  test opt-out.
- Native host RPC rejects request bodies above 1 MB.
- Native host RPC `timeoutMs` must be between 1 and 120000 milliseconds.
- Native host HTTP RPC binds only to loopback hosts (`127.0.0.1`, `localhost`,
  or `::1`).
- Native host upload validation rejects missing paths, relative paths,
  non-existing paths, and non-file paths before forwarding to the extension.
- When `AGENT_BROWSER_ALLOWED_UPLOAD_ROOTS` is set, native host upload
  validation also rejects files outside those roots. Use `:` as the separator
  on macOS/Linux and `;` on Windows.
- Native host logs a per-action audit line to stderr with action, status,
  duration, and sanitized error text. Request params are not logged.
- Raw `cdp` commands are intended for trusted local tooling. Do not pass
  untrusted page text directly into CDP command names or script bodies.
- `evaluate` is also trusted local tooling; page-returned values remain
  untrusted web content.
- Password input values are never returned; password elements use
  `label: "[password field]"` and `sensitive: true`.
- Buffered console/log/exception data is redacted before storage and before
  `getEvents`, `getDiagnostics`, or `getDevLogs` can return it.
- Native host logs must use stderr only. stdout is reserved for native
  messaging frames.
- Agent-facing observations must be wrapped as untrusted web content.
