你拿到的是 **repomix 打包代码 + 需求说明**，不是可执行仓库。
请先做静态架构分析，不要假设你能运行任何本地命令。

## Inputs

- 代码包：`repomix-codex-browser-api-core.txt`
- 说明：路径统一使用仓库相对路径（repo-relative）

## Project Context

这个项目正在把现有 Chrome 控制原型迁移成类 Codex 的产品形态：

```text
LLM
  -> MCP node_repl tools only: js / js_add_node_module_dir / js_reset
    -> persistent Node kernel
      -> browser-client SDK injected into globalThis
        -> existing agent/browserTools.ts
          -> native-host/host.ts
            -> extension/background.ts
              -> Chrome debugger / CDP / content script
```

当前已经有：

- MCP `node_repl` server：`mcp-node-repl/server.ts`
- persistent JS kernel：`mcp-node-repl/kernel.ts`, `mcp-node-repl/kernel-child.ts`
- first-pass browser runtime injection：`mcp-node-repl/browser-client.ts`
- old direct browser tool layer：`agent/browserTools.ts`
- native host HTTP/native messaging bridge：`native-host/host.ts`
- Chrome extension CDP implementation：`extension/background.ts`
- Debugger/session/content/event helpers：`extension/debugger-manager.ts`, `extension/session-manager.ts`, `extension/content.ts`, `extension/event-buffer.ts`
- protocol/types/tests/docs：`shared/types.ts`, `shared/protocol.md`, `test-scripts/*`, `tests/*`

## Target API Reference

From a Codex Chrome/browser-client API reference, the stable JS SDK surface appears to be roughly:

```text
agent.browsers.get
agent.browsers.list

browser.nameSession
browser.user.claimTab
browser.user.history
browser.user.openTabs
browser.tabs.finalize
browser.tabs.get
browser.tabs.list
browser.tabs.new
browser.tabs.selected

tab.back
tab.close
tab.forward
tab.goto
tab.reload
tab.screenshot
tab.title
tab.url

tab.cua.click
tab.cua.double_click
tab.cua.drag
tab.cua.keypress
tab.cua.move
tab.cua.scroll
tab.cua.type

tab.dom_cua.click
tab.dom_cua.double_click
tab.dom_cua.get_visible_dom
tab.dom_cua.keypress
tab.dom_cua.scroll
tab.dom_cua.type

tab.playwright.domSnapshot
tab.playwright.evaluate
tab.playwright.expectNavigation
tab.playwright.frameLocator
tab.playwright.getByLabel
tab.playwright.getByPlaceholder
tab.playwright.getByRole
tab.playwright.getByTestId
tab.playwright.getByText
tab.playwright.locator
tab.playwright.waitForEvent
tab.playwright.waitForLoadState
tab.playwright.waitForTimeout
tab.playwright.waitForURL

frameLocator.frameLocator
frameLocator.getByLabel
frameLocator.getByPlaceholder
frameLocator.getByRole
frameLocator.getByTestId
frameLocator.getByText
frameLocator.locator

locator.all
locator.allTextContents
locator.and
locator.check
locator.click
locator.count
locator.dblclick
locator.downloadMedia
locator.fill
locator.filter
locator.first
locator.getAttribute
locator.getByLabel
locator.getByPlaceholder
locator.getByRole
locator.getByTestId
locator.getByText
locator.innerText
locator.isEnabled
locator.isVisible
locator.last
locator.locator
locator.nth
locator.or
locator.press
locator.selectOption
locator.setChecked
locator.textContent
locator.type
locator.uncheck
locator.waitFor

tab.clipboard.read
tab.clipboard.readText
tab.clipboard.write
tab.clipboard.writeText
tab.dev.logs
browser.capabilities.get
browser.capabilities.list
tab.capabilities.get
tab.capabilities.list
```

The important product constraint: these are **not** direct LLM function-calling tools. The LLM should only see the MCP `node_repl` tools. The methods above should be JavaScript SDK APIs callable inside `js({ code })`.

## Hard Constraints

1. Do not suggest direct external registration of the 90+ browser methods as LLM tools.
2. Do not suggest rewriting the Chrome extension from scratch.
3. Preserve the existing native host + extension + CDP architecture unless you identify a concrete risk.
4. Separate:
   - backend primitive actions that require extension/native/CDP support
   - SDK facade methods that can be composed in `mcp-node-repl/browser-client.ts`
5. Assume this is for local development first, not a hardened multi-tenant sandbox.
6. Do not ask to run commands. This is static analysis only.

## Questions To Answer

1. Classify the target API surface into:
   - already supported by current code
   - implementable as browser-client facade only
   - requires new agent/native/extension action
   - requires non-trivial design work

2. What should be the minimal set of backend primitives?
   Please propose a small action list, ideally around 20-30 actions, that can support most of the JS SDK methods.

3. How should the JS object model be laid out?
   Please propose TypeScript-ish interfaces/classes for:
   - `Agent`
   - `Browsers`
   - `Browser`
   - `Tabs`
   - `Tab`
   - `CUAAPI`
   - `DomCUAAPI`
   - `PlaywrightAPI`
   - `PlaywrightLocator`
   - `PlaywrightFrameLocator`
   - capabilities/clipboard/dev logs

4. Which methods should be implemented first for a strong MVP?
   Please give a staged plan:
   - Stage 1: object model + core tab/nav/action
   - Stage 2: locator facade
   - Stage 3: DOM CUA + accessibility/DOMSnapshot
   - Stage 4: clipboard/dev logs/capabilities
   - Stage 5: UX/safety polish

5. How should locator methods map to existing primitives?
   For example:
   - `locator.count`
   - `locator.fill`
   - `locator.click`
   - `locator.isVisible`
   - `getByRole`
   - `frameLocator`
   - `expectNavigation`

6. What are the main design traps?
   Please call out risks around:
   - iframe/shadow DOM
   - stale locators
   - page content prompt injection
   - user tab claiming
   - raw CDP escape hatches
   - downloads/uploads/clipboard
   - service worker lifecycle

## Required Output

Please return:

1. **Architecture Verdict**
   - Is the current direction sound?
   - What is the biggest missing abstraction?

2. **Primitive vs Facade Matrix**
   - Table mapping API groups to backend primitive/facade/new work.

3. **Recommended Backend Primitive Set**
   - Concrete action names and which file should own each layer.

4. **Recommended SDK Object Model**
   - TypeScript-ish sketch, not full implementation.

5. **Implementation Plan**
   - Commit-sized steps with dependencies.

6. **Test Matrix**
   - Static list of local tests I should add/run later.

7. **Open Questions**
   - Anything that must be decided before implementation.

## Non-Goals

- Do not produce a giant patch.
- Do not re-list the entire bundle.
- Do not propose replacing this with Playwright.
- Do not propose exposing 90+ function-calling tools to the LLM.
