# Playwright-Style Browser Usage

Formax is not Playwright, but the browser-client SDK exposes a small
Playwright-like facade for agent ergonomics.

## Recommended Flow

```js
const tab = globalThis.__activeBrowserTab || await browser.tabs.new();
globalThis.__activeBrowserTab = tab;

await tab.goto("https://example.com");
await tab.waitForLoadState("load");
await tab.getByRole("link", { name: "More information" }).click();
```

Prefer:

1. semantic locators
2. visible text and labels
3. CSS locators
4. observed refs
5. coordinates only as a last resort

## Locators

Common helpers:

```js
await tab.getByRole("button", { name: "Search" }).click();
await tab.getByLabel("Email").fill("user@example.com");
await tab.getByPlaceholder("Search").fill("zod");
await tab.getByDisplayValue("Alice").fill("Bob");
await tab.locator("select#country").selectOption([{ label: "Canada" }, { value: "mx" }, { index: 2 }]);
await tab.getByAltText("Product photo").click();
await tab.getByTitle("Help").hover();
await tab.getByText("Checkout").click();
await tab.locator("input[name='q']").fill("OpenAI Codex");
await tab.locator(".result-card", { hasText: "OpenAI" }).filter({ visible: true }).click();
await tab.locator(".result-card", { has: tab.getByRole("button", { name: "Open" }) }).click();
await tab.locator(".result-card").getByRole("button", { name: "Open" }).click();
await tab.locator(".result-card").and(tab.getByText("Ready")).or(tab.getByText("Fallback")).count();
await tab.frameLocator("#outer-frame").frameLocator("#inner-frame").getByRole("button", { name: "Run" }).click();
await tab.locator("#submit").highlight({ color: "rgba(255, 190, 80, 0.92)" });
await tab.locator("#search").pressSequentially("codex", { waitMs: 100 });
const html = await tab.locator(".result-card").innerHTML();
const owningTab = tab.locator(".result-card").page();
```

Locator page-function helpers are available when a higher-level query is not
enough:

```js
const label = await tab.locator("#submit").evaluate((element) => element.textContent, undefined, { mode: "read" });
const texts = await tab.locator(".item").evaluateAll((elements) => elements.map((element) => element.textContent), undefined, { mode: "read" });
await tab.locator("#submit").dispatchEvent("click", { detail: { source: "agent" } });
```

`evaluate` receives the selected element, `evaluateAll` receives the matched
element array, and both optionally receive a JSON-serializable second argument.
They use the governed side-effecting locator action path because page functions
can mutate the document; pass `mode: "read"` only for inspection code. Explicit
read mode rejects scripts that match obvious mutation patterns before execution.

When multiple elements match:

```js
const items = await tab.locator(".result").all({ limit: 10 });
const lastItem = tab.locator(".result").last();
await items[0].click();
```

Keep limits tight. `locator.all({ limit })` returns bounded `nth()` locator
handles; it does not serialize DOM content.
`locator.first()`, `locator.nth(index)`, and `locator.last()` are synchronous
locator derivations. Negative `nth()` indexes count from the end, so
`locator.last()` serializes as `index: -1` and does not issue a `count()` call.

For conditional flows, prefer locator queries such as `isVisible()`,
`isHidden()`, `isEnabled()`, `isDisabled()`, `isEditable()`, `isChecked()`, and
`inputValue()` before falling back to `evaluate`.
Use `innerHTML()`, `allInnerTexts()`, or `allTextContents()` for bounded content
extraction from a locator set.

For focused form/page interactions, use `locator.blur()`,
`locator.scrollIntoViewIfNeeded()`, and `locator.selectText()` instead of
custom page JavaScript when those actions express the intent.
`locator.pressSequentially(text, options)` is a Playwright-style alias for the
existing governed `locator.type(text, options)` action. It does not currently
implement Playwright's per-character `delay` option.
`locator.page()` returns the owning SDK tab handle.
Use `locator.dragTo(targetLocator, options)` for locator-to-locator drag/drop
before falling back to coordinate-based `tab.cua.drag`.
Use `locator.highlight(options)` for debugging or visual verification; it draws
a best-effort content-script overlay around the locator without taking a
screenshot.
Use `locator.selectOption(valueOrSpecs)` for selects; supported specs include
strings and `{ value }`, `{ label }`, or `{ index }` objects.

Top-frame locators pierce open shadow roots for `css`, `role`, `text`, `label`,
`placeholder`, `testId`, `altText`, `title`, and `displayValue` queries.
Closed shadow roots remain opaque; if a target lives there, use page-provided
controls or coordinates after inspection instead of assuming DOM access exists.

Semantic locators use a lightweight accessible-name approximation across
`observe`, `elementInfo`, and locator resolution. It covers `aria-labelledby`,
`aria-label`, native form labels, image alt text, SVG titles, button-like input
values, and visible text while skipping hidden or `aria-hidden` subtrees.

`locator(selector, { has, hasNot, hasText, hasNotText })` and
`locator.filter({ has, hasNot, hasText, hasNotText, visible })` are supported.
Nested `has`/`hasNot` filters accept another locator handle or a raw locator
plan and match within each candidate element.
`locator.locator(selector)` and locator-scoped `getByText`, `getByRole`,
`getByLabel`, `getByPlaceholder`, `getByTestId`, `getByAltText`, `getByTitle`,
and `getByDisplayValue` resolve inside the parent locator's matched subtree.
`locator.and(other)` intersects two locators in the same page scope, while
`locator.or(other)` returns the union with duplicates removed.

`frameLocator(selector)` supports iframe and nested iframe paths that can be
resolved to a CDP frame id. Locator reads, waits, and actions use a
frame-scoped execution context when available, then translate element
coordinates back to the top-level viewport for mouse events. OOPIF edge cases
are still best-effort rather than full Playwright parity.

File chooser handles opened through a frame locator retain the original locator
path, so `chooser.setFiles()` can set files in the same frame context while
still using native-host absolute path validation.

## Actionability

Locator actions perform first-pass checks for:

- attached element
- visibility
- stable bounds
- enabled/editable controls
- pointer occlusion

Editable checks require an enabled text input, textarea, or contenteditable
element and honor native `readonly` plus self/ancestor `aria-readonly="true"`.
Pointer hit testing accounts for open shadow-root descendants when the locator
targets the shadow host. For elements inside open shadow roots, actionability
also climbs host ancestors for inert, `aria-disabled`, `aria-readonly`, and
`pointer-events: none` blockers.

Use `force: true` only after inspecting the page and confirming the target is
safe to interact with:

```js
await tab.getByRole("button", { name: "Continue" }).click({ force: true });
```

`force: true` still requires locator resolution, attachment, and stable bounds.

Use `trial: true` to preflight a locator action without changing the page:

```js
await tab.getByRole("button", { name: "Continue" }).click({ trial: true });
```

`trial: true` resolves the locator and runs actionability checks, then returns
the target point/rect without dispatching pointer or keyboard input, focusing
the element, mutating DOM state, registering file choosers, or drawing
highlights.

Locator strict/actionability failures are structured. Strict mismatches surface
as `BrowserStrictModeError`; actionability failures surface as
`BrowserActionabilityError` with a reason such as `not_visible`, `disabled`,
`not_editable`, `occluded`, `outside_viewport`, `not_stable`, or `detached`.

For debugging, locator handles expose both readable and machine-readable
descriptions:

```js
const locator = tab.locator(".card").getByRole("button", { name: "Open" });
console.log(String(locator)); // Locator<locator(".card").getByRole("button", { name: "Open" })>
console.log(locator.toJSON()); // full locator plan sent to the backend
```

The string form is a compact diagnostic label, not a new selector contract.

## Waiting

Use explicit waits around navigation and dynamic UI:

```js
await tab.goto("https://example.com");
await tab.playwright.goto("https://example.com/inside-playwright-namespace");
console.log(await tab.playwright.url());
console.log(await tab.playwright.title());
await tab.playwright.reload({ waitForLoad: true });
await tab.waitForLoadState("commit"); // waits for the next main-frame navigation commit
await tab.waitForLoadState("load");
await tab.waitForUrl({ urlContains: "example.com", waitUntil: "load" });
await tab.waitForText("Example Domain");
await tab.waitForSelector("main");
await tab.playwright.waitForText("Example Domain");
await tab.playwright.waitForSelector("main");
await tab.playwright.screenshot({ fullPage: true });
```

`tab.playwright.goto/openUrl/url/title/reload/back/forward/goBack/goForward`,
`tab.playwright.waitForSelector/waitForText`, and
`tab.playwright.screenshot` are SDK aliases over the governed tab navigation,
wait, inspection, and screenshot methods. They exist for Playwright-style code
shape and still route through the same backend actions.

Playwright-style SDK helpers accept `timeout` as an alias for the backend
`timeoutMs` field:

```js
await tab.locator("#ready").waitFor({ state: "visible", timeout: 10_000 });
await tab.getByRole("button", { name: "Continue" }).click({ timeout: 10_000 });
```

For action-triggered navigations, start the watcher before the action:

```js
await tab.playwright.expectNavigation(
  () => tab.getByRole("link", { name: "Continue" }).click(),
  { urlContains: "/next", waitUntil: "load", timeout: 10000 }
);
```

After a locator failure, modal change, reload, or unexpected mutation, take a
fresh snapshot:

```js
const observed = await tab.observe();
```

Do not retry a failing locator repeatedly without new page state.

## Keyboard And Mouse Aliases

`tab.playwright.keyboard` and `tab.playwright.mouse` expose common
Playwright-style aliases over the governed CUA backend:

```js
await tab.playwright.keyboard.press("Enter");
await tab.playwright.keyboard.press(["ControlOrMeta", "A"]);
await tab.playwright.keyboard.type("OpenAI Codex");
await tab.playwright.mouse.click(120, 240);
await tab.playwright.mouse.dblclick(120, 240);
await tab.playwright.mouse.move(160, 280);
await tab.playwright.mouse.wheel(0, 600);
await tab.playwright.mouse.drag([{ x: 10, y: 10 }, { x: 80, y: 80 }]);
```

Prefer locators for semantic page interactions. Use these aliases when the task
really is keyboard/mouse oriented, when the page requires a global shortcut, or
after DOM inspection shows that a coordinate action is the appropriate fallback.

## Evaluate

Use `evaluate` for structured extraction when DOM access is clearer than
interactive locators:

```js
const links = await tab.evaluate(
  `Array.from(document.querySelectorAll("a")).slice(0, 10).map((a) => ({
    text: a.innerText.trim(),
    href: a.href
  }))`,
  { mode: "read", reason: "extract visible links" },
);
```

Mutating `evaluate` calls should be used intentionally:

```js
await tab.evaluate("document.querySelector('form').submit()", {
  mode: "write",
  reason: "submit the form",
});
```

Explicit `mode: "read"` calls use a conservative pre-execution guard that
rejects obvious DOM/storage/cookie mutations. The runtime wrapper also blocks
common mutation APIs and setters while the evaluation is running, including
DOM insertion/removal, `classList`, style mutation methods, `innerHTML`,
`outerHTML`, `textContent`, and common form value setters. This is still a
best-effort denylist plus temporary patch, not a hardened JavaScript sandbox;
use `mode: "write"` for intentional page changes.

## Clipboard

Clipboard reads and writes are sensitive operations:

```js
const text = await tab.clipboard.readText();
await tab.clipboard.writeText(text.trim());
await tab.clipboard.write("Plain text");
```

`tab.clipboard.write("text", options)` is an SDK convenience alias for
`tab.clipboard.writeText("text", options)`.

For typed clipboard writes, the SDK accepts the backend `{ types: [...] }`
shape and a `ClipboardItem`-style MIME map:

```js
await tab.clipboard.write({
  "text/plain": "Plain text",
  "text/html": { text: "<strong>Plain text</strong>" },
  "image/png": { dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
  "application/octet-stream": new Uint8Array([1, 2, 3])
});
```

The MIME map is normalized locally before the backend request; clipboard
binary payloads can be `dataUrl`, `Uint8Array`/`Buffer`, `ArrayBuffer`, or byte
arrays.

## Downloads

For download workflows:

```js
const downloadPromise = tab.playwright.waitForEvent("download", {
  urlContains: "report",
  timeoutMs: 30000,
});
await tab.getByRole("link", { name: "Download report" }).click();
const download = await downloadPromise;
console.log(download.suggestedFilename(), download.path());
```

Start waiting before clicking the download trigger when possible.

For page media assets, use the locator helper so the extension can resolve the
asset URL before starting the download:

```js
const result = await tab.locator("img.hero").downloadMedia({
  fallbackFetch: true,
  waitForCompletion: true,
});
console.log(result.download?.suggestedFilename(), result.download?.path());
```

Use `fallbackFetch: true` for session-bound media assets where direct Chrome
download startup fails; the extension still enforces a bounded response size.

## File Choosers

For upload controls that are opened by clicking a visible label or button-like
wrapper:

```js
const chooserPromise = tab.playwright.waitForEvent("filechooser");
await tab.locator('label[for="asset-upload"]').click();
const chooser = await chooserPromise;
await chooser.setFiles("/absolute/path/image.png");
```

The returned chooser supports `setFiles(paths)` and `isMultiple()`. The
extension background owns the short-lived `file_chooser_id`, so `setFiles()`
does not need to rediscover the DOM target. Setting files still uses the same
native-host upload validation as `locator.setInputFiles(...)`.

## Unsupported Playwright Expectations

Formax does not provide a full browser engine abstraction. These are not
equivalent to Playwright:

- no isolated browser contexts
- no bundled browser download/launch management
- no OS-level UI control
- no arbitrary Chrome profile file access
- no direct control of Chrome internal pages such as `chrome://extensions`

Use the Chrome extension backend when the task needs the user's real Chrome
profile, signed-in state, cookies, extensions, or existing tabs.
