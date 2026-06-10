# Formax Browser Backend Boundaries

This document defines the current Formax browser-control product boundary.

## Supported Backend Matrix

| Backend | Status | Use When | Notes |
| --- | --- | --- | --- |
| Chrome extension backend | Supported | A task depends on the user's real Chrome profile, logged-in sessions, cookies, installed extensions, or existing tabs. | This is the primary Formax backend. Use `agent.browsers.get("extension")`. |
| In-app/local browser backend | Not implemented | Localhost or public unsigned pages where no signed-in Chrome state is needed. | Future optional backend. `agent.browsers.discover()` reports it as unavailable with reason `not_implemented`. |
| OS Computer Use fallback | Not implemented | A task requires controlling native desktop apps outside the browser. | Current Formax is browser-only and must not claim OS-app control. |
| Dedicated connector or MCP integration | Preferred when available | A structured API exists for the target service, such as a repository, database, filesystem, issue tracker, or docs provider. | Use the structured integration before Chrome because it is usually safer, more deterministic, and easier to audit. |

## Backend Selection Policy

Use this order when more than one route could satisfy a task:

1. Dedicated connector, API, CLI, or MCP integration for the target system.
2. In-app/local browser backend if Formax adds one in the future and the task does not need the user's Chrome profile.
3. Chrome extension backend when the task needs real Chrome state, an existing tab, a logged-in session, cookies, or installed extensions.
4. No Formax fallback for OS-level Computer Use. Ask the user for a different tool/runtime if native desktop app control is required.

## Current Runtime Contract

The current packaged Formax runtime exposes only the Chrome extension backend.
The stable browser id is:

```text
extension
```

The supported setup path is:

```js
const { setupBrowserRuntime } = await import("./scripts/browser-client.mjs");
await setupBrowserRuntime({ globals: globalThis });
const browser = await agent.browsers.get("extension");
```

Backend discovery:

```js
const backends = agent.browsers.discover();
// extension: available
// local: unavailable, not_implemented
```

`agent.browsers.list()` returns only available backend ids for compatibility.
`agent.browsers.get("local")` fails clearly until the local backend exists.
`agent.browsers.closeUnused()` is currently a no-op because the packaged runtime
has only one available backend connection.

Requests for other browser ids should fail clearly rather than silently falling
back to Chrome.

## Non-Goals For The Current Backend

Formax Chrome control does not provide:

- operating-system app automation
- CAPTCHA solving
- paywall bypassing
- browser security interstitial bypassing
- arbitrary browser profile file reads
- direct password, cookie, token, localStorage, or browser history extraction without an explicit future policy surface

When a workflow reaches one of these boundaries, hand control back to the user
or use a dedicated integration that has an explicit authorization model.
