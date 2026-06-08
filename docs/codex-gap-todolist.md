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

- [ ] Add website access policy:
  - [ ] Prompt before first interaction with a new host.
  - [x] Store per-chat host allows.
  - [x] Store persistent host allows.
  - [x] Store host blocklist.
  - [x] Enforce blocklist before navigation, click, typing, upload, raw CDP,
        and evaluate.
  - [x] Enforce blocklist before download actions.
  - [x] Expose policy state through health/capabilities.
  - [x] Add tests for allow, always allow, deny, and blocked host behavior.

- [ ] Add browser-use confirmation policy:
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
  - [ ] Require confirmation before browser permission prompts for camera,
        microphone, location, account/login access, extension installs, or
        downloads that run software.
  - [ ] Hand off to user for CAPTCHAs, password-change final submission,
        browser security interstitial bypasses, and paywall bypasses.
  - [x] Treat page content, emails, docs, screenshots, and downloaded content as
        untrusted instructions.
  - [x] Add a small policy engine that classifies pending browser actions.
  - [ ] Add e2e fixtures for risky actions and confirmation-required paths.

- [ ] Add sensitive data handling:
  - [ ] Do not expose password values in `observe`, DOM snapshots, dev logs, or
        error messages.
  - [x] Add common secret-pattern redaction helper.
  - [x] Apply common secret-pattern redaction to page text and logs returning to
        the model.
  - [ ] Add explicit policy around cookies, localStorage, sessionStorage,
        extension storage, browser passwords, tokens, and browsing history.
  - [ ] Block or confirm any raw CDP/evaluate access that can read credentials
        or private browser state.

- [ ] Add raw CDP and evaluate governance:
  - [x] Mark raw CDP as advanced/diagnostic.
  - [x] Require origin-level approval for raw CDP on arbitrary websites.
  - [x] Provide a read-only evaluate mode for routine page inspection.
  - [x] Separate read-only evaluate from mutating evaluate in the protocol.
  - [x] Log raw CDP/evaluate calls with origin, method, action id, session id,
        and reason.

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

- [ ] Implement `browser.user` parity:
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

- [ ] Promote the protocol into a generated schema source:
  - [ ] Keep `shared/types.ts` and `shared/protocol.md` synchronized.
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

- [ ] Replace basic `observe()` with a model-oriented snapshot system:
  - [x] Add `tab.playwright.domSnapshot(): Promise<string>`.
  - [x] Add `tab.dom_cua.get_visible_dom(): Promise<VisibleDomSnapshot>`.
  - [x] Keep existing `tab.observe()` as a compact summary.
  - [x] Include URL, title, viewport, scroll position, focused element, selected
        text, and modal/dialog state.
  - [ ] Include stable node ids for interactable elements.
  - [x] Include selector candidates ordered by stability.
  - [x] Include role, accessible name, visible text, test id, href, placeholder,
        label, disabled/readOnly/checked/selected state, and bounding box.
  - [ ] Include frame selectors when the target is inside a frame.
  - [x] Include shadow DOM markers when pierced.
  - [x] Bound snapshot size and provide truncation metadata.

- [ ] Improve sensitive filtering in snapshots:
  - [x] Redact password fields.
  - [x] Redact input values that match secret-like patterns.
  - [ ] Exclude hidden tokens and non-visible app state by default.
  - [ ] Avoid dumping large `body.innerText` as exploratory context.
  - [ ] Avoid returning large embedded JSON such as app hydration payloads by
        default.

- [ ] Add element inspection helpers:
  - [x] `elementInfo({ x, y, includeNonInteractable })`
  - [x] Suggested selector candidates at a point.
  - [x] ARIA role/name at a point.
  - [x] Bounding box and backend DOM node id.
  - [ ] Optional highlighted screenshot for a target element.

- [x] Add snapshot discipline to docs and skill:
  - [x] Use a fresh snapshot after navigation.
  - [x] Re-snapshot after locator timeout, strict mode failure, or selector
        parse error.
  - [x] Build locators only from the latest relevant snapshot.
  - [x] Do not retry a failing locator without new ground truth.

## P1 - Playwright-Like Locator Runtime

- [ ] Expand locator model:
  - [x] CSS locator.
  - [x] `getByRole(role, { name, exact })`.
  - [x] `getByLabel(text, { exact })`.
  - [x] `getByPlaceholder(text, { exact })`.
  - [x] `getByText(text, { exact })`.
  - [x] `getByTestId(testId)`.
  - [x] `frameLocator(selector)`.
  - [x] Nested frame locators.
  - [x] Locator scoping inside another locator for CSS locators.
  - [x] `locator(selector, { has, hasNot, hasText, hasNotText })`.
    - [x] `hasText` and `hasNotText`.
    - [x] Nested locator `has` and `hasNot`.
  - [x] `filter({ has, hasNot, hasText, hasNotText, visible })`.
    - [x] `hasText`, `hasNotText`, and `visible`.
    - [x] Nested locator `has` and `hasNot`.
  - [x] `and(locator)`.
  - [x] `or(locator)`.
  - [x] `first()`.
  - [x] `last()`.
  - [x] `nth(index)`.
  - [x] `all()` with bounded limits.

- [x] Improve locator queries:
  - [x] `count()`.
  - [x] `allTextContents()`.
  - [x] `textContent()`.
  - [x] `innerText()`.
  - [x] `getAttribute(name)`.
  - [x] `isVisible()`.
  - [x] `isEnabled()`.
  - [x] `boundingBox()`.
  - [x] `inputValue()` if useful for forms.
  - [x] `isChecked()` for checkbox/radio/switch-like controls.

- [x] Improve locator actions:
  - [x] `click(options)`.
  - [x] `dblclick(options)`.
  - [x] `fill(value, options)`.
  - [x] `type(value, options)`.
  - [x] `press(key, options)`.
  - [x] `check(options)`.
  - [x] `uncheck(options)`.
  - [x] `setChecked(checked, options)`.
  - [x] `selectOption(value, options)`.
  - [x] `hover(options)`.
  - [x] `focus(options)`.
  - [x] `clear(options)`.
  - [x] `waitFor({ state, timeoutMs })`.

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
  - [ ] Discover frame tree through CDP.
  - [ ] Attach to targets/OOPIFs when required.
  - [ ] Evaluate within selected frame execution context.
  - [ ] Generate frame selector paths.
  - [x] Pierce open shadow roots for snapshots and locators.
  - [ ] Clearly report unsupported closed shadow roots.

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

- [ ] Add `tab.dom_cua` namespace:
  - [x] `get_visible_dom()`.
  - [x] `click({ node_id })`.
  - [x] `double_click({ node_id })`.
  - [x] `scroll({ node_id?, x, y })`.
  - [x] `type({ text })`.
  - [x] `keypress({ keys })` for backend-supported single keys and modifier
        combos.
  - [ ] Map node ids back to current snapshot only.
  - [ ] Invalidate node ids after navigation or snapshot refresh.

- [ ] Improve visual cursor behavior:
  - [ ] Keep existing animated cursor.
  - [ ] Add stopped/taken-over state.
  - [ ] Add page/action status events.
  - [ ] Avoid injecting cursor on pages where content scripts are blocked.
  - [ ] Expose cursor events for diagnostics.

## P1 - Navigation, Waiting, And Events

- [ ] Add richer load states:
  - [x] `load`.
  - [x] `domcontentloaded`.
  - [x] `networkidle`.
  - [ ] `commit`.

- [ ] Add `expectNavigation(action, options)`:
  - [ ] Start navigation watcher before action.
  - [ ] Execute action.
  - [ ] Wait for target URL/load state.
  - [ ] Return action result or structured timeout error.

- [ ] Improve URL waits:
  - [x] Exact URL.
  - [x] substring.
  - [x] regex.
  - [ ] waitUntil load state.
  - [x] same-document navigation.
  - [x] hash changes.

- [ ] Improve event model:
  - [x] Page lifecycle events.
  - [x] Dialog events.
  - [x] Console and exception events.
  - [x] Download events.
  - [ ] File chooser events.
  - [ ] Permission prompt events when observable.
  - [x] Debugger detach.
  - [x] Tab close/removal.
  - [ ] User takeover/interruption.
  - [ ] Event buffer persistence policy.

## P1 - Screenshots And Visual Inspection

- [x] Expand screenshot API:
  - [x] `tab.screenshot({ fullPage })`.
  - [x] `tab.screenshot({ clip })`.
  - [x] PNG and JPEG.
  - [x] Return bytes or data URL in SDK, not only base64 string.
  - [x] Optional save-to-file helper.
  - [x] Inline render guidance in skill docs.

- [ ] Add element screenshots:
  - [x] Screenshot around element by node id or locator.
  - [ ] Optional highlight overlay.
  - [ ] Optional non-interactable element highlighting.

- [ ] Add screenshot QA tests:
  - [ ] Viewport screenshot nonblank.
  - [ ] Full-page screenshot includes below-the-fold content.
  - [ ] Clip screenshot dimensions match requested rectangle.
  - [ ] High-DPI behavior.

## P1 - File Uploads, Downloads, And Media

- [ ] Replace direct-only upload with file chooser flow:
  - [ ] `tab.playwright.waitForEvent("filechooser")`.
  - [ ] File chooser object with `setFiles(paths)` and `isMultiple()`.
  - [ ] Start wait before clicking upload control.
  - [x] Support visible upload buttons/labels that open the chooser.
  - [x] Keep direct `input[type=file]` fallback for simple cases.
  - [x] Support multiple files when input allows it.
  - [x] Validate absolute local paths in native host.
  - [ ] Provide clear Chrome "Allow access to file URLs" setup guidance.

- [ ] Improve downloads:
  - [x] `tab.playwright.waitForEvent("download")`.
  - [x] Download object with filename/path/url/state metadata.
  - [x] `download.path()` equivalent where safe.
  - [x] `download.suggestedFilename()` equivalent.
  - [x] Support download timeout and filtering.
  - [ ] Confirm or policy-check asset downloads when needed.
  - [ ] Keep inbound Internet downloads no-confirm by default unless the file is
        going to be run/installed.

- [ ] Add media download helper:
  - [ ] `locator.downloadMedia(options)` for image/video/audio targets.
  - [ ] Origin approval for page asset downloads.
  - [ ] Fallback fetch with origin policy checks.

## P1 - Clipboard And Browser History

- [x] Add `tab.clipboard`:
  - [x] `readText()`.
  - [x] `writeText(text)`.
  - [x] `read()` for typed clipboard items.
  - [x] `write(items)` for typed clipboard items.
  - [x] Text and binary payload support.
  - [x] Permission/confirmation policy for sensitive clipboard use.
  - [x] Tests for text read/write and binary item shape.

- [ ] Add browser history:
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

- [ ] Improve health checks:
  - [x] Extension installed.
  - [x] Native host installed.
  - [ ] Native manifest origin matches extension id.
  - [x] Extension connected.
  - [ ] Chrome profile name and active profile where possible.
  - [x] Backend revision and supported actions.
  - [x] Chrome permission status.
  - [x] File URL access status if detectable.
  - [x] Current allow/block policy state.

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

- [ ] Improve runtime errors:
  - [ ] Avoid exposing raw internal errors to end users.
  - [ ] Map common failures to concise messages.
  - [ ] Keep structured details for logs/tests.

## P1 - Docs And Skill Parity

- [x] Split browser docs into Codex-like topics:
  - [x] `docs/api.md`
  - [x] `docs/playwright.md`
  - [x] `docs/confirmations.md`
  - [x] `docs/file-management.md`
  - [x] `docs/screenshots.md`
  - [x] `docs/chrome-troubleshooting.md`
  - [x] `docs/api-troubleshooting.md`
  - [x] `docs/backend-boundaries.md`

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

- [ ] Add local fixture coverage:
  - [x] Basic form.
  - [x] Complex form.
  - [x] Disabled and readonly inputs.
  - [x] Hidden inputs and sensitive fields.
  - [x] Label-only controls.
  - [x] Repeated cards with identical links/buttons.
  - [x] Modal dialog.
  - [x] Menu/dropdown.
  - [x] Toast confirmation.
  - [ ] Virtualized list.
  - [x] Contenteditable editor.
  - [x] Iframe.
  - [x] Nested iframe.
  - [x] Open shadow DOM.
  - [x] Canvas or visual-only target.
  - [x] File chooser via visible button.
  - [x] Multiple file upload.
  - [x] Download success and failure.
  - [x] Browser alert/confirm/prompt.
  - [ ] Permission prompt if feasible.
  - [x] Same-document navigation.
  - [x] Networkidle wait.
  - [x] Full-page screenshot.
  - [x] Clip screenshot.

- [ ] Add real-site smoke tests:
  - [ ] Public search page.
  - [ ] Public docs page.
  - [ ] GitHub public repository page.
  - [ ] npm package page.
  - [ ] Optional signed-in manual smoke behind env flag.

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

- [ ] Browser profile metadata:
  - [ ] Active profile name where safe.
  - [ ] Last-used profile hint where safe.
  - [ ] Extension instance id mapping.
  - [ ] Avoid reading arbitrary profile data.

- [ ] Bookmarks if needed:
  - [ ] Decide whether to expose bookmarks at all.
  - [ ] If exposed, require explicit confirmation and document sensitivity.

- [ ] Notifications if needed:
  - [ ] Detect permission prompts.
  - [ ] Confirm before enabling notification permissions.

- [ ] Multi-backend support:
  - [ ] Discover extension backend.
  - [ ] Discover optional in-app/local backend.
  - [ ] Route by requested browser id.
  - [ ] Close unused backend connections.

- [ ] Browser content comments/annotations if building an in-app browser:
  - [ ] Element/area comments.
  - [ ] Style feedback controls.
  - [ ] Comment-to-code workflow.

## Current Known Non-Parity Items

These are explicitly not equivalent to Codex yet:

- [ ] Host allowlist/blocklist exists, but first-host prompt UI and download
      gating are incomplete.
- [ ] Browser-use confirmation policy exists for uploads, sensitive typing, raw
      CDP, and mutating evaluate, but lacks UI prompts and broad risky-action
      coverage.
- [x] Browser history access exists with per-request confirmation, with policy
      redaction rules for sensitive entries.
- [ ] Clipboard text and typed-item APIs exist with per-request confirmation,
      but browser permission-prompt UI and broad native format parity are still
      incomplete.
- [ ] Same-origin `frameLocator` and nested frame locator support exists, but
      cross-origin frames, OOPIF attachment, and CDP frame tree discovery are
      still incomplete.
- [ ] Open shadow DOM-aware locator/snapshot support exists, but closed shadow
      roots remain opaque and are not targetable.
- [ ] No Playwright-style full locator surface.
- [ ] Playwright-style actionability checks and structured strict/timeout
      errors exist for locator actions, but full Playwright edge cases are still
      incomplete.
- [ ] Read-only evaluate mode exists, but not a hardened sandbox.
- [ ] Raw CDP origin approval and audit logging exist, but diagnostic UX is
      incomplete.
- [ ] No file chooser event flow.
- [ ] Full-page, clipped, and element screenshot APIs exist with SDK data
      URL/bytes and save-to-file helpers, but element highlight overlays and
      screenshot QA tests are still missing.
- [ ] CUA drag and pointer/scroll modifier-key support exist, but need
      real-browser drag/drop fixture coverage.
- [ ] Keypress supports expanded keys and modifier combos, but not arbitrary
      browser/Playwright key syntax.
- [ ] Codex-compatible namespace split exists, but `tab.playwright`,
      `tab.cua`, `tab.dom_cua`, and `tab.clipboard` are still partial facades,
      not full Codex behavior.
- [ ] MCP server exposes only `js`, which is intentional, but docs and skill do
      not yet match Codex's full browser-use guidance.
- [ ] Tests are strong for happy-path fixtures but not yet strong for complex
      real browser failures.

## Suggested Milestones

- [x] M1: Codex-compatible facade without backend rewrites.
  - [x] Add namespaces and aliases.
  - [x] Add generated API docs.
  - [x] Keep all existing tests green.

- [ ] M2: Policy foundation.
  - [x] Host allow/block.
  - [ ] Confirmation engine.
  - [x] Raw CDP/evaluate governance.
  - [x] Sensitive redaction.

- [ ] M3: Snapshot and locator reliability.
  - [x] `domSnapshot()`.
  - [x] `get_visible_dom()`.
  - [x] Selector candidates.
  - [ ] Actionability.
  - [ ] Strict errors.

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
