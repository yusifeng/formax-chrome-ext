# WebGPT Handoff: Browser SDK Facade Over Backend Primitives

You are reviewing a local Chrome-control project. The attached bundle is:

- `repomix-output/repomix-browser-sdk-facade-core.txt`

## Current State

The project has moved to a Codex-like shape:

```text
LLM calls only node_repl MCP tools: js / js_add_node_module_dir / js_reset
  -> JS imports mcp-node-repl/browser-client.ts
  -> browser-client calls agent/browserTools.ts
  -> native-host/host.ts
  -> extension/background.ts
  -> Chrome debugger / CDP / content script
```

Backend primitives are implemented and verified. Current verification:

```text
npm run typecheck          passed
npm test                   passed, 14/14
npm run test:mcp-node-repl passed
npm run test:real          passed, 13/13
```

Important implemented backend primitives include:

- tabs/session/capabilities/events: `nameSession`, `listTabs`, `getTab`, `waitForEvent`, `getCapabilities`
- navigation and waits: `openUrl`, `goBack`, `goForward`, `reload`, `waitForLoadState`, `waitForUrl`, `waitForSelector`, `waitForText`
- observation: `observe` with DOM refs, accessibility tree, DOMSnapshot
- locator primitives: `locatorQuery`, `locatorAction`, `locatorWait`
- input/CUA: `click`, `moveMouse`, `scroll`, `typeText`, `pressKey`
- CDP/dev/runtime: `evaluate`, `cdp`, `getDevLogs`
- files/download/dialog/screenshot: `uploadFile`, `listDownloads`, `waitForDownload`, `handleDialog`, `screenshot`

The current weak point is that `mcp-node-repl/browser-client.ts` is still mostly a flat client, e.g.:

```js
await browser.locatorAction({
  locator: { kind: "css", selector: "#name-input" },
  kind: "fill",
  args: { value: "Alice" }
});
```

The desired next step is an SDK/object facade suitable for LLM use inside `js()`:

```js
const browser = await agent.browsers.get("extension");
const tab = await browser.tabs.new("https://example.com");

await tab.locator("#q").fill("123");
await tab.locator("button").click();
await tab.waitForLoadState("load");
```

This is not for strict Codex compatibility. The goal is to implement something broadly similar and ergonomic.

## Hard Constraints

- Do not propose exposing 90 direct MCP tools.
- Keep the external MCP surface to the current three tools unless there is a very strong reason:
  - `js`
  - `js_add_node_module_dir`
  - `js_reset`
- Prefer implementing most additional browser API methods in `mcp-node-repl/browser-client.ts` using existing backend primitives.
- Add new extension/backend primitives only when an API truly cannot be composed safely from existing primitives.
- Treat current passing tests as important regression gates.
- Static review only: do not ask to run commands.

## What I Want From You

Please review the bundle and produce a concrete implementation plan for the next phase:

1. Propose the object model shape:
   - `Agent`
   - `Browser`
   - `Browser.tabs`
   - `Browser.user`
   - `Tab`
   - `Locator`
   - optional `FrameLocator`
   - optional clipboard/dev/capabilities handles

2. Map the larger Codex-like API surface into categories:
   - can be implemented immediately in `browser-client.ts` by composing current primitives
   - needs small additions to backend primitives
   - should be MVP-simplified or deferred

3. Give a prioritized method list for the next PR:
   - minimal useful set
   - nice-to-have set
   - defer set

4. For each recommended method, specify:
   - public JS signature
   - underlying primitive(s)
   - state it needs to carry, such as `sessionId`, `tabId`, locator plan
   - important edge cases

5. Identify any design traps in the current code:
   - stale session/tab state
   - locator chaining semantics
   - waits/events race conditions
   - frame support
   - raw CDP escape hatch
   - LLM ergonomics

6. Suggest focused tests:
   - unit/smoke tests for object facade
   - real-browser E2E checks that prove the facade works

## Non-goals

- Do not rewrite the extension architecture.
- Do not suggest browser automation through AppleScript or external Chrome scripting.
- Do not suggest Playwright as the backend engine; the project is intentionally using Chrome extension + native host + CDP.
- Do not spend effort on visual cursor polish, badge UI, or viewport controls in this phase.

## Expected Output

Please answer with:

- recommended SDK object model
- method mapping table
- exact next implementation steps
- tests to add
- risks and deferrals

