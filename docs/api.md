# Browser API

This is the hand-written entry point for the Formax browser runtime API. The
generated TypeScript reference lives in `docs/browser-client-api.md`.

## Runtime Setup

Use the guarded bootstrap from `skills/control-chrome/SKILL.md` when running inside the MCP
`node_repl`. It supports both source checkout imports and packaged installs
under:

```text
~/.formax/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs
```

Use `scripts/browser-client.mjs` as the package entry point.

Then get the Chrome extension backend:

```js
const browser = await agent.browsers.get("extension");
await browser.documentation();
```

Formax currently exposes the Chrome extension backend only. It has no in-app
browser backend and no OS-level Computer Use fallback. See
`docs/backend-boundaries.md`.

The recommended MCP integration intentionally exposes only the JavaScript
`node_repl` tool surface to the model. Import the Formax browser SDK inside that
persistent runtime and use the object API. Do not expose separate flat browser
tools alongside node_repl unless you are testing backward-compatible aliases;
mixing tool surfaces splits session state and tab handoff semantics.

To inspect backend availability:

```js
console.log(agent.browsers.list());      // ["extension"]
console.log(agent.browsers.discover());  // includes unavailable "local"
```

## Object Model

Prefer the object API:

```js
const browser = await agent.browsers.get("extension");
const tab = await browser.tabs.new("https://example.com");
await tab.waitForLoadState("load");
const snapshot = await tab.observe();
```

Core namespaces:

- `browser.tabs`: create, list, get, switch, close, and finalize controlled tabs.
- `browser.user`: inspect and claim user-opened tabs, read history,
  finalize handoffs, and stop user-facing sessions. Bookmarks and
  browser/system notifications are intentionally not exposed.
- `browser.events`: read, clear, and wait for buffered browser events.
- `browser.downloads`: list and wait for Chrome downloads.
- `browser.capabilities`: inspect supported backend capabilities.
- `browser.dev`: development and diagnostic helpers.
- `tab`: page navigation, locators, DOM observation, CUA-style actions,
  clipboard, screenshots, downloads, evaluate, and raw CDP.

Flat methods such as `browser.openUrl()`, `browser.observe()`, and
`browser.rawCdp()` remain as migration aliases. New code should prefer
namespaced methods.

## Tab Lifecycle

For a new task:

```js
globalThis.__activeBrowserTab ||= await browser.tabs.new();
const tab = globalThis.__activeBrowserTab;
```

For a user-opened tab:

```js
const openTabs = await browser.user.openTabs({ currentWindow: true });
const candidate = openTabs.find((item) => /docs|github/i.test(`${item.title} ${item.url}`));
if (!candidate) throw new Error("No matching user tab is available to claim.");
globalThis.__activeBrowserTab = await browser.user.claimTab(candidate);
```

Do not guess tab IDs. Use descriptors returned by `browser.user.openTabs()`.

Finalize as the last browser action in a turn:

```js
await browser.user.finalize({ keep: [globalThis.__activeBrowserTab] });
await browser.endTurn({ turnId: "turn-1" });
```

## Health And Diagnostics

Start troubleshooting with:

```js
const health = await browser.health();
```

Important fields:

- `nativeConnected`
- `extension`
- `permissions`
- `fileUrlAccess`

See `docs/chrome-troubleshooting.md` for Chrome connection issues and
`docs/api-troubleshooting.md` for API failure mapping.

## Documentation At Runtime

The SDK exposes runtime docs:

```js
await browser.documentation();
await agent.documentation.get("browserUse");
await agent.documentation.get("tabs");
await agent.documentation.get("locators");
await agent.documentation.get("downloads");
```

Read the full runtime documentation after bootstrap, then use topic docs when
you need current capability details.

## Topic Guides

- `docs/browser-client-api.md`: generated SDK type reference.
- `skills/control-chrome/SKILL.md`: browser-use operating model for agents using the MCP
  `node_repl`.
- `docs/playwright.md`: Playwright-style locator and wait patterns.
- `docs/file-management.md`: uploads, downloads, clipboard, and local files.
- `docs/screenshots.md`: full-page and element screenshot guidance.
- `docs/chrome-troubleshooting.md`: extension, native host, profile, and Chrome
  UI troubleshooting.
- `docs/api-troubleshooting.md`: API failure mapping and diagnostics.
- `docs/backend-boundaries.md`: supported backend matrix and fallback limits.

## Security Boundary

The native host validates RPC action names and request shapes before forwarding
to the extension. The extension enforces action validation and URL restrictions.

Do not expose raw runtime errors, tokens, stack traces, internal RPC payloads, or
unfiltered CDP parameters to end users. Summarize actionable failures and keep
structured details for logs/tests.
