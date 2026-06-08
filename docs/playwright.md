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
await tab.getByText("Checkout").click();
await tab.locator("input[name='q']").fill("OpenAI Codex");
await tab.locator(".result-card", { hasText: "OpenAI" }).filter({ visible: true }).click();
await tab.locator(".result-card", { has: tab.getByRole("button", { name: "Open" }) }).click();
await tab.locator(".result-card").and(tab.getByText("Ready")).or(tab.getByText("Fallback")).count();
await tab.frameLocator("#outer-frame").frameLocator("#inner-frame").getByRole("button", { name: "Run" }).click();
```

When multiple elements match:

```js
const items = await tab.locator(".result").all({ limit: 10 });
await items[0].click();
```

Keep limits tight. `locator.all({ limit })` returns bounded `nth()` locator
handles; it does not serialize DOM content.

Top-frame locators pierce open shadow roots for `css`, `role`, `text`, `label`,
`placeholder`, and `testId` queries. Closed shadow roots remain opaque; if a
target lives there, use page-provided controls or coordinates after inspection
instead of assuming DOM access exists.

Semantic locators use a lightweight accessible-name approximation across
`observe`, `elementInfo`, and locator resolution. It covers `aria-labelledby`,
`aria-label`, native form labels, image alt text, SVG titles, button-like input
values, and visible text while skipping hidden or `aria-hidden` subtrees.

`locator(selector, { has, hasNot, hasText, hasNotText })` and
`locator.filter({ has, hasNot, hasText, hasNotText, visible })` are supported.
Nested `has`/`hasNot` filters accept another locator handle or a raw locator
plan and match within each candidate element.
`locator.and(other)` intersects two locators in the same page scope, while
`locator.or(other)` returns the union with duplicates removed.

`frameLocator(selector)` supports same-origin iframe and nested same-origin
iframe paths. Cross-origin frames and OOPIFs are reported as unsupported by the
backend rather than silently pierced.

## Actionability

Locator actions perform first-pass checks for:

- attached element
- visibility
- stable bounds
- enabled/editable controls
- pointer occlusion

Use `force: true` only after inspecting the page and confirming the target is
safe to interact with:

```js
await tab.getByRole("button", { name: "Continue" }).click({ force: true });
```

`force: true` still requires locator resolution, attachment, and stable bounds.

## Waiting

Use explicit waits around navigation and dynamic UI:

```js
await tab.goto("https://example.com");
await tab.waitForLoadState("load");
await tab.waitForUrl({ contains: "example.com" });
await tab.waitForText("Example Domain");
await tab.waitForSelector("main");
```

After a locator failure, modal change, reload, or unexpected mutation, take a
fresh snapshot:

```js
const observed = await tab.observe();
```

Do not retry a failing locator repeatedly without new page state.

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

Mutating `evaluate` calls require explicit confirmation:

```js
await tab.evaluate("document.querySelector('form').submit()", {
  confirmed: true,
  reason: "submit the form the user approved",
});
```

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
