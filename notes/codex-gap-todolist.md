# Formax vs Codex Browser Control TODO

This is a clean-room roadmap for closing the observable gap between Formax and
Codex browser control. Use Codex public/manual docs and the locally observed
Codex plugin API as product references only. Do not copy bundled Codex source
code.

## Scope

Target: make Formax behave like a Codex-compatible Chrome browser runtime while
keeping a Formax-owned backend:

- Chrome extension: `extension/`
- Native host and RPC: `rust/native-host/`
- Shared protocol: `shared/`
- Node/browser SDK: `mcp-node-repl/browser-client.ts`
- Agent tool schemas: `agent/browserTools.ts`
- Skill/docs/tests: `skill/`, `docs/`, `tests/`

Reference sources used:

- Current Codex manual, especially Chrome extension, Computer Use, in-app
  browser, approvals/security, and MCP sections.
- Local Codex Chrome plugin docs:
  `/Users/david/.codex/plugins/cache/openai-bundled/chrome/latest/docs/`
- Local Codex resource readability map:
  `notes/research/codex-resource-1.1.5/background-control-map.md`
- Current Formax code and tests.

## P0 - Product Boundary And Policy

- [x] Define the supported backend matrix:
  - [x] Chrome extension backend for signed-in Chrome profile workflows.
  - [x] Optional in-app/local browser equivalent for localhost/public unsigned
        pages, or explicitly document that Formax only supports Chrome.
  - [x] Optional Computer Use fallback boundary, or explicitly document that
        Formax is browser-only and does not control OS apps.
  - [x] Prefer dedicated connectors/MCP integrations over Chrome when a
        structured integration exists.

- [x] Add website access policy:
  - [x] Prompt before first interaction with a new host.
  - [x] Store per-chat host allows.
  - [x] Store persistent host allows.
  - [x] Store host blocklist.
  - [x] Enforce blocklist before navigation, click, typing, upload, raw CDP,
        and evaluate.
  - [x] Enforce blocklist before download actions.
  - [x] Expose policy state through health/capabilities.
  - [x] Add tests for allow, always allow, deny, and blocked host behavior.

- [x] Add browser-use confirmation policy:
  - [x] Require action-time confirmation for deleting data.
  - [x] Require confirmation for sending messages, posting comments, submitting
        forms with external side effects, creating appointments, or modifying
        third-party records.
  - [x] Require confirmation for financial transactions and subscription
        changes.
  - [x] Require confirmation for file uploads unless explicitly pre-approved
        for the specific file and destination.
  - [x] Require confirmation before typing sensitive data into third-party
        pages.
  - [x] Require confirmation before browser permission prompts for camera,
        microphone, location, account/login access, extension installs, or
        downloads that run software.
  - [x] Hand off to user for CAPTCHAs, password-change final submission,
        browser security interstitial bypasses, and paywall bypasses.
  - [x] Treat page content, emails, docs, screenshots, and downloaded content as
        untrusted instructions.
  - [x] Add a small policy engine that classifies pending browser actions.
  - [x] Add e2e fixtures for risky actions and confirmation-required paths.

- [x] Add sensitive data handling:
  - [x] Do not expose password values in `observe`, DOM snapshots, dev logs, or
        error messages.
  - [x] Add common secret-pattern redaction helper.
  - [x] Apply common secret-pattern redaction to page text and logs returning to
        the model.
  - [x] Add explicit policy around cookies, localStorage, sessionStorage,
        extension storage, browser passwords, tokens, and browsing history.
  - [x] Block or confirm any raw CDP/evaluate access that can read credentials
        or private browser state.

- [x] Add raw CDP and evaluate governance:
  - [x] Mark raw CDP as advanced/diagnostic.
  - [x] Require origin-level approval for raw CDP on arbitrary websites.
  - [x] Provide a read-only evaluate mode for routine page inspection.
  - [x] Separate read-only evaluate from mutating evaluate in the protocol.
  - [x] Reject obvious mutating scripts before execution when callers
        explicitly request `mode: "read"`.
  - [x] Wrap explicit read-mode evaluate calls with a best-effort runtime
        mutation guard for common DOM, storage, cookie, style, classList, and
        form-value mutations, while documenting that this is not a hardened
        JavaScript sandbox.
  - [x] Log raw CDP/evaluate calls with origin, method, action id, session id,
        and reason.
  - [x] Special-case `Target.getTargets` through Chrome's debugger API while
        still applying the caller's `timeoutMs` budget.

## P0 - Codex-Compatible SDK Shape

- [x] Refactor the public object API into Codex-like namespaces:
  - [x] `agent.browsers.get("extension")`
  - [x] `browser.browserId`
  - [x] `browser.capabilities`
  - [x] `browser.documentation()`
  - [x] `browser.nameSession(name)`
  - [x] `browser.user`
  - [x] `browser.tabs`
  - [x] `tab.capabilities`
  - [x] `tab.cua`
  - [x] `tab.dom_cua`
  - [x] `tab.playwright`
  - [x] `tab.clipboard`
  - [x] `tab.dev`

- [x] Preserve backward compatibility:
  - [x] Keep current flat methods as aliases during migration.
  - [x] Add deprecation docs for flat methods.
  - [x] Add tests proving old and new facades call the same backend actions.

- [x] Implement `browser.user` parity:
  - [x] `browser.user.openTabs()`
  - [x] `browser.user.claimTab(tabOrId)`
  - [x] `browser.user.history(options)`
  - [x] Open tab descriptors should use opaque ids or claim tokens, not raw
        Chrome tab ids as the primary API.
  - [x] Include tab title, URL, last opened/focused time, and tab group label.
  - [x] Require explicit approval before browser history access.
  - [x] Do not offer an always-allow path for browser history.

- [x] Implement `browser.tabs` parity:
  - [x] `browser.tabs.new()`
  - [x] `browser.tabs.list()`
  - [x] `browser.tabs.get(id)`
  - [x] `browser.tabs.selected()`
  - [x] `browser.tabs.finalize({ keep })`
  - [x] Support keep statuses: `handoff` and `deliverable`.
  - [x] Ensure agent-created omitted tabs close during finalize.
  - [x] Ensure claimed user tabs release instead of closing by default.
  - [x] Persist finalized handoff/deliverable favicon badge state in
        `chrome.storage.session` and clear unseen badges when the tab becomes
        active in the focused window.
  - [x] Publish active controlled-tab favicon badges and resolve effective
        badges with active lease precedence before finalized handoff/deliverable
        badges.
  - [x] Read and cache page favicon data through Chrome's `/_favicon/` endpoint
        for Codex-like badge overlays, with generated fallback icons when favicon
        fetch is unavailable.
  - [x] Resume live handoff tab leases on the next `startSession` call for the
        same `sessionId`, refreshing `turnId`, active tab, extension instance,
        stale tabs, and managed agent tab groups.
  - [x] Treat finalize as the final browser action for the turn in docs/skill.

- [x] Implement tab metadata helpers:
  - [x] `tab.id`
  - [x] `tab.url()`
  - [x] `tab.title()`
  - [x] `tab.goto(url)`
  - [x] `tab.back()`
  - [x] `tab.forward()`
  - [x] `tab.reload()`
  - [x] `tab.close()`

- [x] Implement capability objects:
  - [x] `browser.capabilities.list()`
  - [x] `browser.capabilities.get(id)`
  - [x] `tab.capabilities.list()`
  - [x] `tab.capabilities.get(id)`
  - [x] Capability-specific documentation strings.
  - [x] Capability availability and reason fields.
  - [x] Tests for unavailable capabilities.

## P0 - Protocol And Validation

- [x] Promote the protocol into a generated schema source:
  - [x] Keep `shared/types.ts` and `shared/protocol.md` synchronized.
  - [x] Add zod or JSON Schema definitions for every action.
  - [x] Generate agent tool schemas from shared schemas.
  - [x] Validate agent RPC params against shared schemas before sending.
  - [x] Validate native host HTTP RPC requests before forwarding.
  - [x] Validate extension incoming params before dispatch.
  - [x] Return structured error codes, not only text messages.

- [x] Add action annotations:
  - [x] Read-only vs side-effecting.
  - [x] Destructive.
  - [x] Requires host approval.
  - [x] Requires user confirmation.
  - [x] Requires file-system read.
  - [x] Requires browser history.
  - [x] Requires raw CDP.
  - [x] Requires sensitive-data review.

- [x] Harden native host RPC:
  - [x] Enforce action allowlist.
  - [x] Enforce request body size limit.
  - [x] Validate `timeoutMs` range per action.
  - [x] Require auth token by default outside dev.
  - [x] Bind only to loopback.
  - [x] Reject upload paths that are not absolute files.
  - [x] Reject file paths outside allowed local roots when policy requires it.
  - [x] Add per-action audit logging.

## P1 - Page Observation And DOM Snapshots

- [x] Replace basic `observe()` with a model-oriented snapshot system:
  - [x] Add `tab.playwright.domSnapshot(): Promise<string>`.
  - [x] Add `tab.dom_cua.get_visible_dom(): Promise<VisibleDomSnapshot>`.
  - [x] Keep existing `tab.observe()` as a compact summary.
  - [x] Include URL, title, viewport, scroll position, focused element, selected
        text, and modal/dialog state.
  - [x] Include stable node ids for interactable elements.
  - [x] Include selector candidates ordered by stability.
  - [x] Include role, accessible name, visible text, test id, href, placeholder,
        label, disabled/readOnly/checked/selected state, and bounding box.
  - [x] Include frame selectors when the target is inside a frame.
  - [x] Include shadow DOM markers when pierced.
  - [x] Bound snapshot size and provide truncation metadata.

- [x] Improve sensitive filtering in snapshots:
  - [x] Redact password fields.
  - [x] Redact input values that match secret-like patterns.
  - [x] Exclude hidden tokens and non-visible app state by default.
  - [x] Avoid dumping large `body.innerText` as exploratory context.
  - [x] Avoid returning large embedded JSON such as app hydration payloads by
        default.

- [x] Add element inspection helpers:
  - [x] `elementInfo({ x, y, includeNonInteractable })`
  - [x] Suggested selector candidates at a point.
  - [x] ARIA role/name at a point.
  - [x] Bounding box and backend DOM node id.
  - [x] Optional highlighted screenshot for a target element.

- [x] Add snapshot discipline to docs and skill:
  - [x] Use a fresh snapshot after navigation.
  - [x] Re-snapshot after locator timeout, strict mode failure, or selector
        parse error.
  - [x] Build locators only from the latest relevant snapshot.
  - [x] Do not retry a failing locator without new ground truth.

## P1 - Playwright-Like Locator Runtime

- [x] Expand locator model:
  - [x] CSS locator.
  - [x] `getByRole(role, { name, exact })`.
  - [x] `getByLabel(text, { exact })`.
  - [x] `getByPlaceholder(text, { exact })`.
  - [x] `getByText(text, { exact })`.
  - [x] `getByTestId(testId)`.
  - [x] `getByAltText(text, { exact })`.
  - [x] `getByTitle(text, { exact })`.
  - [x] `getByDisplayValue(text, { exact })`.
  - [x] `frameLocator(selector)`.
  - [x] Nested frame locators.
  - [x] Locator scoping inside another locator for CSS locators.
  - [x] Locator-scoped semantic child locators such as
        `locator.getByRole(...)` and `locator.getByText(...)`.
  - [x] `locator(selector, { has, hasNot, hasText, hasNotText })`.
    - [x] `hasText` and `hasNotText`.
    - [x] Nested locator `has` and `hasNot`.
  - [x] `filter({ has, hasNot, hasText, hasNotText, visible })`.
    - [x] `hasText`, `hasNotText`, and `visible`.
    - [x] Nested locator `has` and `hasNot`.
  - [x] `and(locator)`.
  - [x] `or(locator)`.
  - [x] `first()`.
  - [x] Synchronous `last()` backed by `index: -1`.
  - [x] `nth(index)`, including negative indexes from the end of the matched set.
  - [x] `all()` with bounded limits.

- [x] Improve locator queries:
  - [x] `count()`.
  - [x] `allTextContents()`.
  - [x] `allInnerTexts()`.
  - [x] `textContent()`.
  - [x] `innerText()`.
  - [x] `getAttribute(name)`.
  - [x] `isVisible()`.
  - [x] `isHidden()`.
  - [x] `isEnabled()`.
  - [x] `isDisabled()`.
  - [x] `isEditable()`.
  - [x] `boundingBox()`.
  - [x] `inputValue()` if useful for forms.
  - [x] `isChecked()` for checkbox/radio/switch-like controls.

- [x] Improve locator actions:
  - [x] `click(options)`.
  - [x] `dblclick(options)`.
  - [x] `dragTo(target, options)`.
  - [x] `fill(value, options)`.
  - [x] `type(value, options)`.
  - [x] `press(key, options)`.
  - [x] `check(options)`.
  - [x] `uncheck(options)`.
  - [x] `setChecked(checked, options)`.
  - [x] `selectOption(value, options)` including value/label/index option
        specs.
  - [x] `hover(options)`.
  - [x] `highlight(options)`.
  - [x] `focus(options)`.
  - [x] `blur(options)`.
  - [x] `scrollIntoViewIfNeeded(options)`.
  - [x] `selectText(options)`.
  - [x] `clear(options)`.
  - [x] `waitFor({ state, timeoutMs })`.
  - [x] `evaluate(pageFunction, arg, options)` returning JSON-serializable
        values through the governed locator action path.
  - [x] `evaluateAll(pageFunction, arg, options)` returning JSON-serializable
        values through the governed locator action path.
  - [x] `dispatchEvent(type, eventInit, options)`.
  - [x] Playwright-style `timeout` option alias for waits, locator
        queries/actions, frame resolution, and navigation expectations.

- [x] Add Playwright-style actionability checks:
  - [x] Attached.
  - [x] Visible.
  - [x] Stable bounding box.
  - [x] Enabled.
  - [x] Editable for fill/type.
  - [x] Receives pointer events or reports occlusion.
  - [x] Scroll into correct scroll container.
  - [x] Detect detached element between resolve and action.
  - [x] Support `force` as an explicit escape hatch.
  - [x] Support `trial: true` as an actionability preflight without dispatching
        pointer/keyboard/focus/DOM side effects.
  - [x] Return clear strict-mode and timeout errors.

- [x] Improve accessible-name computation:
  - [x] `aria-labelledby`.
  - [x] `aria-label`.
  - [x] Native label association.
  - [x] Image alt text.
  - [x] Button/input values.
  - [x] SVG/title fallback.
  - [x] Hidden subtree rules.
  - [x] ARIA role mapping closer to browser accessibility semantics.

- [ ] Add frame and shadow DOM support:
  - [x] Discover frame tree through CDP.
  - [x] Attach to targets/OOPIFs when required.
  - [x] Evaluate within selected frame execution context.
  - [x] Resolve frame selector paths to CDP frame ids.
  - [x] Route locator actions through frame-scoped execution contexts when a
        frame id is resolvable, with viewport-offset coordinate translation.
  - [x] Preserve frame locator context for file chooser events and uploads.
  - [x] Generate frame selector paths.
  - [x] Pierce open shadow roots for snapshots and locators.
  - [x] Clearly report unsupported closed shadow roots.

## P1 - CUA And DOM CUA Parity

- [x] Add `tab.cua` namespace:
  - [x] `click({ x, y, button, keypress })` with modifier-key support.
  - [x] `double_click({ x, y, keypress })` with modifier-key support.
  - [x] `move({ x, y, keys })` with modifier-key support.
  - [x] `scroll({ x, y, scrollX, scrollY, keypress })` with modifier-key support.
  - [x] `type({ text })`.
  - [x] `keypress({ keys })` for backend-supported single keys and modifier
        combos.
  - [x] `drag({ path, keys })`.
  - [x] Support modifier keys: `Alt`, `Control`, `ControlOrMeta`, `Meta`,
        `Shift`.
  - [x] Support more keys than the current minimal key set.
  - [x] Support mouse buttons: left, right, middle, back, forward.

- [x] Add `tab.dom_cua` namespace:
  - [x] `get_visible_dom()`.
  - [x] `click({ node_id })`.
  - [x] `double_click({ node_id })`.
  - [x] `scroll({ node_id?, x, y })`.
  - [x] Refresh the latest visible DOM snapshot before node-targeted actions and
        surface stale node ids as `BrowserDomCuaStaleNodeError` with
        `dom_cua_stale_node` plus current visible node/ref hints.
  - [x] `type({ text })`.
  - [x] `keypress({ keys })` for backend-supported single keys and modifier
        combos.
  - [x] Map node ids back to current snapshot only.
  - [x] Invalidate node ids after navigation or snapshot refresh.

- [x] Improve visual cursor behavior:
  - [x] Keep existing animated cursor.
  - [x] Add stopped/taken-over state.
  - [x] Add page/action status events.
  - [x] Avoid injecting cursor on pages where content scripts are blocked.
  - [x] Expose cursor events for diagnostics.

## P1 - Navigation, Waiting, And Events

- [x] Add richer load states:
  - [x] `load`.
  - [x] `domcontentloaded`.
  - [x] `networkidle`.
  - [x] `commit`.

- [x] Add `expectNavigation(action, options)`:
  - [x] Start navigation watcher before action.
  - [x] Execute action.
  - [x] Wait for target URL/load state.
  - [x] Return action result or structured timeout error.

- [x] Improve URL waits:
  - [x] Exact URL.
  - [x] substring.
  - [x] regex.
  - [x] waitUntil load state.
  - [x] same-document navigation.
  - [x] hash changes.

- [x] Improve event model:
  - [x] Page lifecycle events.
  - [x] Dialog events.
  - [x] Console and exception events.
  - [x] Download events.
  - [x] File chooser events.
  - [x] Permission prompt events when observable.
  - [x] Debugger detach.
  - [x] Per-tab and per-target CDP command serialization.
  - [x] Native disconnect cleanup and debugger tab/target detach sweep events.
  - [x] Tab close/removal.
  - [x] User takeover/interruption.
  - [x] Event buffer persistence policy.

## P1 - Screenshots And Visual Inspection

- [x] Expand screenshot API:
  - [x] `tab.screenshot({ fullPage })`.
  - [x] `tab.screenshot({ clip })`.
  - [x] PNG and JPEG.
  - [x] Return bytes or data URL in SDK, not only base64 string.
  - [x] Optional save-to-file helper.
  - [x] Inline render guidance in skill docs.

- [x] Add element screenshots:
  - [x] Screenshot around element by node id or locator.
  - [x] Optional highlight overlay.
  - [x] Optional non-interactable element highlighting.

- [x] Add screenshot QA tests:
  - [x] Viewport screenshot nonblank.
  - [x] Full-page screenshot includes below-the-fold content.
  - [x] Clip screenshot dimensions match requested rectangle.
  - [x] High-DPI behavior.

## P1 - File Uploads, Downloads, And Media

- [x] Replace direct-only upload with file chooser flow:
  - [x] `tab.playwright.waitForEvent("filechooser")`.
  - [x] File chooser object with `setFiles(paths)` and `isMultiple()`.
  - [x] Align chooser state with Codex-style `file_chooser_id` ownership in extension background.
  - [x] Start wait before clicking upload control.
  - [x] Support visible upload buttons/labels that open the chooser.
  - [x] Keep direct `input[type=file]` fallback for simple cases.
  - [x] Support multiple files when input allows it.
  - [x] Preserve frame locator context for file chooser `setFiles()`.
  - [x] Validate absolute local paths in native host.
  - [x] Provide clear Chrome "Allow access to file URLs" setup guidance.

- [x] Improve downloads:
  - [x] `tab.playwright.waitForEvent("download")`.
  - [x] Download object with filename/path/url/state metadata.
  - [x] Expose stable Chrome download ids with `id`, `downloadId`, and
        Codex-style `download_id` aliases across download lists, waits, media
        downloads, and SDK handles.
  - [x] `download.path()` equivalent where safe.
  - [x] `download.suggestedFilename()` equivalent.
  - [x] Support download timeout and filtering.
  - [x] Confirm or policy-check asset downloads when needed.
  - [x] Keep inbound Internet downloads no-confirm by default unless the file is
        going to be run/installed.

- [x] Add media download helper:
  - [x] `locator.downloadMedia(options)` for image/video/audio targets.
  - [x] Origin approval for page asset downloads.
  - [x] Fallback fetch with origin policy checks.

## P1 - Clipboard And Browser History

- [x] Add `tab.clipboard`:
  - [x] `readText()`.
  - [x] `writeText(text)`.
  - [x] `read()` for typed clipboard items.
  - [x] `write(items)` for typed clipboard items.
  - [x] Text and binary payload support.
  - [x] SDK `dataUrl` convenience for typed clipboard binary payload reads and
        writes.
  - [x] SDK `ClipboardItem`-style MIME map inputs for typed writes, normalized to
        the governed backend payload shape.
  - [x] SDK binary MIME map inputs for typed writes (`Uint8Array`/`Buffer`,
        `ArrayBuffer`, and byte arrays), normalized to `dataBase64`.
  - [x] SDK direct string `tab.clipboard.write("text")` alias routed through
        the confirmed text clipboard write path.
  - [x] Permission/confirmation policy for sensitive clipboard use.
  - [x] Tests for text read/write and binary item shape.

- [x] Add browser history:
  - [x] `browser.user.history({ query, from, to, limit })`.
  - [x] Explicit confirmation for every history access request.
  - [x] No always-allow for history.
  - [x] Include dateVisited, title, and URL.
  - [x] Redact or omit sensitive entries when policy requires it.
  - [x] Treat history output as sensitive telemetry.

## P1 - Dev Diagnostics And Troubleshooting

- [x] Improve dev logs:
  - [x] `tab.dev.logs({ levels, filter, limit })`.
  - [x] Normalize `warn` vs `warning`.
  - [x] Include ISO timestamp.
  - [x] Include source URL and line/column.
  - [x] Include runtime exceptions.
  - [x] Add filtering by substring and level array.

- [x] Improve health checks:
  - [x] Extension installed.
  - [x] Native host installed.
  - [x] Native manifest origin matches extension id.
  - [x] Extension connected.
  - [x] Chrome profile name and active profile where possible.
  - [x] Backend revision and supported actions.
  - [x] Chrome permission status.
  - [x] File URL access status if detectable.
  - [x] Current allow/block policy state.
  - [x] Pending extension update safety: defer reload while browser control is
        active and reload after active leases, debugger tab/target attachments,
        cursor waiters, and native disconnect cleanup are idle.

- [x] Add user-facing troubleshooting docs:
  - [x] Extension disconnected.
  - [x] Native host missing.
  - [x] Wrong Chrome profile.
  - [x] Local unpacked extension id mismatch.
  - [x] Stale extension background after rebuild.
  - [x] File upload permission missing.
  - [x] Blocked website.
  - [x] Debugger detached or user takeover.
  - [x] Chrome extension UI blocking automation.

- [x] Improve runtime errors:
  - [x] Avoid exposing raw internal errors to end users.
  - [x] Map common failures to concise messages.
  - [x] Keep structured details for logs/tests.

## P1 - Docs And Skill Parity

- [x] Split browser docs into Codex-like topics:
  - [x] `docs/api.md`
  - [x] `docs/playwright.md`
  - [x] `docs/confirmations.md`
  - [x] `docs/file-management.md`
  - [x] `docs/screenshots.md`
  - [x] `docs/chrome-troubleshooting.md`
  - [x] `docs/api-troubleshooting.md`

- [x] Update `skill/SKILL.md`:
  - [x] Bootstrap with absolute installed browser-client path in packaged
        builds.
  - [x] Require reading complete browser documentation after setup.
  - [x] Instruct tab reuse.
  - [x] Instruct use of `browser.user.openTabs()` before claiming user tabs.
  - [x] Instruct finalize as final browser action.
  - [x] Instruct snapshot discipline.
  - [x] Instruct confirmation policy.
  - [x] Instruct not to reveal raw runtime errors.
  - [x] Instruct preference order: connector/MCP, in-app/local browser, Chrome
        for signed-in state.

- [x] Add API reference generated from actual SDK types:
  - [x] Keep docs synced with facade implementation.
  - [x] Include examples for every namespace.
  - [x] Include unsupported features and reasons.

## P2 - Packaging, Plugin Shape, And Installation

- [x] Align package layout with Codex-like plugin cache:
  - [x] Versioned directory.
  - [x] `latest` symlink.
  - [x] `.formax-plugin/plugin.json` or equivalent manifest.
  - [x] `scripts/browser-client.mjs`.
  - [x] `docs/`.
  - [x] `skills/control-chrome/SKILL.md`.
  - [x] `extension-host/<platform>/<arch>/extension-host`.
  - [x] Extension id config.
  - [x] install/doctor scripts.

- [x] Add installer UX:
  - [x] Install native host manifest.
  - [x] Verify extension id.
  - [x] Support Web Store id.
  - [x] Support local unpacked id override.
  - [x] Detect Chrome profile mismatch.
  - [x] Prompt/recommend reload after extension build changes.
  - [x] Doctor command with JSON and human output.

- [x] Add plugin/MCP configuration docs:
  - [x] How to add the MCP server.
  - [x] How to enable the skill.
  - [x] How to configure tool approval policy if the MCP client supports it.
  - [x] How to disable direct flat browser tools if using only node_repl.

## P2 - Testing And Evaluation Matrix

- [x] Add local fixture coverage:
  - [x] Basic form.
  - [x] Complex form.
  - [x] Disabled and readonly inputs.
  - [x] Hidden inputs and sensitive fields.
  - [x] Label-only controls.
  - [x] Repeated cards with identical links/buttons.
  - [x] Modal dialog.
  - [x] Menu/dropdown.
  - [x] Toast confirmation.
  - [x] Virtualized list.
  - [x] Contenteditable editor.
  - [x] Iframe.
  - [x] Nested iframe.
  - [x] Cross-origin iframe resolve diagnostics and target-continuation
        coverage when Chrome exposes an OOPIF target.
  - [x] Open shadow DOM.
  - [x] Canvas or visual-only target.
  - [x] Drag/drop target.
  - [x] File chooser via visible button.
  - [x] Multiple file upload.
  - [x] Download success and failure.
  - [x] Locator strict/not-found/actionability failure codes in real browser
        fixture paths.
  - [x] Locator `trial: true` real-browser preflight returns target geometry
        without changing page state.
  - [x] Browser alert/confirm/prompt.
  - [x] Permission prompt if feasible.
  - [x] Same-document navigation.
  - [x] Networkidle wait.
  - [x] Full-page screenshot.
  - [x] Clip screenshot.

- [x] Add real-site smoke tests:
  - [x] Public search page.
  - [x] Public docs page.
  - [x] GitHub public repository page.
  - [x] npm package page.
  - [x] Optional signed-in manual smoke behind env flag.
  - [x] Add `npm run test:real-sites`; requires installed/connected extension
        and native host to execute.

- [x] Add negative tests:
  - [x] Blocked host navigation.
  - [x] Raw CDP without approval.
  - [x] Upload without approval when required.
  - [x] Browser history without approval.
  - [x] Sensitive field redaction.
  - [x] Strict locator violation.
  - [x] Locator timeout recovery.
  - [x] Stale ref after navigation.
  - [x] Debugger detached.
  - [x] User tab closed mid-action.

- [x] Add SDK/facade tests:
  - [x] Namespace methods call correct backend actions.
  - [x] Backward-compatible aliases.
  - [x] Tab handle isolation.
  - [x] Current selected tab behavior.
  - [x] Finalize keep status mapping.
  - [x] Capability docs.
  - [x] Soft vs throwing waits.
  - [x] Locator chain serialization.
  - [x] Frame locator serialization.

- [x] Add protocol alignment tests:
  - [x] Registry actions match extension supported actions.
  - [x] Tool schemas match shared schemas.
  - [x] Protocol docs list every action.
  - [x] Native host validates every action shape.
  - [x] TypeScript and generated JSON Schema stay in sync.
  - [x] Locator plan/query/action enum sets stay aligned across shared schemas,
        TypeScript types, protocol docs, extension validation/background logic,
        and native host validation.

## P2 - Observability And Auditability

- [x] Add action audit trail:
  - [x] action id.
  - [x] session id.
  - [x] turn id.
  - [x] tab id.
  - [x] origin.
  - [x] high-level action category.
  - [x] confirmation id when applicable.
  - [x] timing.
  - [x] result/error code.

- [x] Add bounded event persistence:
  - [x] In-memory event buffer.
  - [x] Optional session-scoped persisted event snapshot.
  - [x] Clear-on-finalize behavior.
  - [x] Tests for event ordering and filtering.

- [x] Add diagnostics export:
  - [x] Health snapshot.
  - [x] Recent events.
  - [x] Recent dev logs.
  - [x] Active sessions.
  - [x] Attached debugger tabs.
  - [x] Native manifest path and origin.
  - [x] Extension id and version.

## P3 - Advanced Browser Capabilities

- [x] Browser profile metadata:
  - [x] Active profile name where safe.
  - [x] Last-used profile hint where safe.
  - [x] Extension instance id mapping.
  - [x] Avoid reading arbitrary profile data.

- [x] Bookmarks if needed:
  - [x] Decide whether to expose bookmarks at all.
  - [x] Do not expose bookmarks; keep the `bookmarks` permission absent and
        advertise `browser.user.bookmarks` as unavailable.
  - [x] If exposed in a future feature, require explicit confirmation and
        document sensitivity before adding any bookmarks action.

- [x] Notifications if needed:
  - [x] Detect permission prompts.
  - [x] Confirm before enabling notification permissions.
  - [x] Do not expose browser/system notifications; keep the `notifications`
        permission absent and advertise `browser.notifications` as unavailable.

- [x] Multi-backend support:
  - [x] Discover extension backend.
  - [x] Discover optional in-app/local backend as unavailable.
  - [x] Route by requested browser id.
  - [x] Close unused backend connections; currently a no-op because only the
        extension backend is available.

- [x] Browser content comments/annotations are intentionally out of scope:
  - [x] Element/area comments are not needed for the Chrome-extension browser
        control target.
  - [x] Style feedback controls are not needed unless an in-app browser is
        added later.
  - [x] Comment-to-code workflow is not part of this Codex-like Chrome control
        parity effort.

## Current Known Non-Parity Items

These are explicitly not equivalent to Codex yet:

- [x] Host allowlist/blocklist, first-host prompt request events, pending
      approvals, basic popup approval UI, and a best-effort in-page approval
      banner with expiry cleanup exist.
- [x] Browser-use confirmation policy and prompt request events exist for broad
      risky-action coverage, and a pending approval engine can list/resolve
      host, confirmation, and origin approvals through the SDK or extension
      popup or in-page banner. Host approval UI now exposes session allow,
      persistent allow, and deny choices; confirmation UI shows reasons,
      redacted targets, and retry params; origin UI shows reasons, redacted
      subjects, and retry params. Richer Codex-equivalent approval UX is
      intentionally deferred and not blocking the current page-control parity
      work.
- [x] Browser history access exists with per-request confirmation, with policy
      redaction rules for sensitive entries.
- [ ] Clipboard text and typed-item APIs exist with per-request confirmation,
      `dataUrl` helpers, and SDK `ClipboardItem`-style MIME map write inputs,
      plus SDK binary byte inputs normalized to `dataBase64`,
      but browser permission-prompt UI and broad native format parity are still
      incomplete.
- [ ] Same-origin `frameLocator`, nested frame locator support, CDP frame tree
      discovery, explicit target attach/detach, frame selector path resolution,
      explicit `evaluate({ targetId, frameId })`, and
      `frameLocator(...).evaluate()` exist; locator query/wait can use
      frame-scoped execution contexts when a CDP frame id is resolvable, and
      locator actions now use frame-scoped execution plus viewport-offset
      translation when resolvable. Locator pointer and text-input actions now
      dispatch through the matched `targetId` for OOPIF targets; debugger
      commands are serialized per attached tab/target. `resolveFrame` now best-effort uses
      `Target.getTargets` to locate matching OOPIF iframe/page targets when the
      selected iframe is inaccessible or the top-level frame tree cannot
      resolve a frame path, and it can continue resolving remaining nested
      frame selectors inside the matched OOPIF target. Full OOPIF target edge
      cases are still incomplete. `resolveFrame` now returns
      `resolvedSelectorCount` and `unresolvedFrameSelectors` diagnostics so
      partial frame/OOPIF resolution failures are easier to inspect, plus
      `targetCandidates` diagnostics for the scored DevTools targets considered
      during OOPIF matching. Real-browser coverage now includes a local
      cross-origin iframe fixture that verifies inaccessible-frame resolution
      and OOPIF target diagnostics are surfaced, plus nested target-continuation
      resolution and locator click execution when Chrome exposes a separate
      OOPIF target.
- [x] Open shadow DOM-aware locator/snapshot support exists; closed shadow
      roots remain opaque and are clearly reported as unsupported when
      observable as custom-element hosts.
- [ ] Playwright-style locator surface now includes common semantic locators,
      chaining/filtering, locator-scoped `getBy*` helpers, `getByAltText`,
      `getByTitle`, queries, actions, `getByDisplayValue`, `evaluate`,
      `evaluateAll`, `dispatchEvent`, `highlight`, and readable
      `String(locator)`/`String(frameLocator)` debug labels backed by
      machine-readable `toJSON()` locator plans, but it is still not the full
      Playwright locator API.
- [ ] Playwright-style actionability checks and structured strict/timeout
      errors exist for locator actions, including backend `strict_mode_violation`
      and `locator_actionability` codes mapped by the SDK, plus `trial: true`
      actionability preflight and multi-point pointer hit testing, but full
      Playwright edge cases are still incomplete. Explicit inert-subtree and
      `pointer-events: none` failures are now reported as actionability codes,
      and enabled checks account for ancestor `aria-disabled` plus disabled
      fieldset first-legend exceptions. Editable checks account for native
      `readonly`, ancestor `aria-readonly`, and contenteditable state. Locator
      `isEnabled`, `isDisabled`, and `isEditable` query semantics are aligned
      with those checks, including open shadow-root host ancestors for
      `aria-disabled`/`aria-readonly`. Pointer hit testing now treats open
      shadow-root descendants as belonging to their shadow host for
      host-targeted locators, and actionability checks climb composed ancestors
      for inert and `pointer-events: none`. Real-browser coverage verifies
      `trial: true` returns target geometry without mutating page state.
- [x] Read-only evaluate mode exists with conservative pre-execution and
      temporary runtime mutation guards. The protocol, docs, and skill now state
      this is not a fully hardened JavaScript capability sandbox; hardened
      sandboxing is intentionally out of scope for the current parity pass.
- [x] Raw CDP origin approval, prompt request events, and audit logging exist,
      and the extension popup or in-page banner can approve/deny pending origin
      approvals with reason, subject, and retry-param details, but richer origin
      approval UX is intentionally deferred with the broader approval UX work.
- [x] File chooser event flow exists for controlled upload targets; no OS-level
      native chooser automation is attempted.
- [x] Full-page, clipped, and element screenshot APIs exist with SDK data
      URL/bytes, save-to-file helpers, and optional element highlight overlays.
- [x] CUA drag and pointer/scroll modifier-key support exist with
      real-browser drag/drop fixture coverage.
- [x] Keypress supports common Playwright-style key names, aliases, printable
      keys, modifier combos, F1-F24, IME/composition keys, media keys, and
      numpad-specific variants.
- [ ] Codex-compatible namespace split exists, but `tab.playwright`,
      `tab.cua`, `tab.dom_cua`, and `tab.clipboard` are still partial facades,
      not full Codex behavior. `tab.playwright` now includes common
      page navigation aliases (`goto`, `url`, `title`, `reload`, `back`, and
      `forward`), page-level wait and screenshot aliases
      (`waitForSelector`, `waitForText`, and `screenshot`), plus `keyboard`
      and `mouse` aliases over the governed CUA backend in addition to
      locator, wait, evaluate, download, and file chooser helpers.
- [x] Locator surface now includes the common Playwright-style read/input
      helpers that can be faithfully backed by existing primitives, including
      `innerHTML()`, `pressSequentially()`, and `page()`. Touch-specific
      `tap()` remains intentionally unclaimed until the backend has real touch
      input semantics instead of a click alias.
- [ ] MCP server exposes only `js`, which is intentional. Skill, API docs, MCP
      configuration docs, and the runtime documentation API now document the
      Formax browser-use operating model, but this still does not fully match
      Codex's complete browser-use guidance.
- [ ] Tests now cover local real-browser fixture failures for locator
      strict-mode, missing targets, hidden targets, and occlusion/actionability,
      but public-site and complex cross-frame/OOPIF failures are still not fully
      covered.

## Suggested Milestones

- [x] M1: Codex-compatible facade without backend rewrites.
  - [x] Add namespaces and aliases.
  - [x] Add generated API docs.
  - [x] Keep all existing tests green.

- [x] M2: Policy foundation.
  - [x] Host allow/block.
  - [x] Confirmation engine.
  - [x] Raw CDP/evaluate governance.
  - [x] Sensitive redaction.

- [ ] M3: Snapshot and locator reliability.
  - [x] `domSnapshot()`.
  - [x] `get_visible_dom()`.
  - [x] Selector candidates.
  - [ ] Actionability.
  - [x] Strict errors.

- [ ] M4: Complex page support.
  - [ ] Frames.
  - [ ] Shadow DOM.
  - [ ] File chooser.
  - [ ] Full-page/clip screenshots.
  - [ ] Clipboard/history.

- [ ] M5: Test and release hardening.
  - [ ] Full fixture matrix.
  - [ ] Real-site smoke tests.
  - [ ] Installer/doctor polish.
  - [ ] Troubleshooting docs.
  - [ ] Packaging layout parity.
