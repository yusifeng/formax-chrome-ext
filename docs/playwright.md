# Playwright-Style Browser Usage

Playwright is a critical part of the JavaScript API available to you.

You only have access to a limited subset of the Playwright API, so only call
functions that are explicitly defined in this file or in
`docs/browser-client-api.md`.

You do have access to `tab.playwright.evaluate(...)`, but only in a read-only
page scope when you use `mode: "read"`. Use locators for scoped interactions
and targeted checks. For bulk DOM inspection, prefer one bounded read-only
`evaluate(...)` that queries and projects the needed data. Avoid loops of
locator property calls.

The main surfaces are:

- `tab.getByRole(...)`, `tab.locator(...)`, and related helpers
- `tab.playwright.*` aliases over the same governed tab API
- `LocatorHandle` methods such as `count()`, `click()`, `fill()`, `evaluate()`,
  `screenshot()`, and `setInputFiles()`
- `FrameLocatorHandle` for iframe-scoped locator construction

## Snapshot Discipline

When using Playwright, keep and reuse a recent `tab.playwright.domSnapshot()`
when it is available and you need it for locator construction or retry
decisions. Treat the latest relevant snapshot as the source of truth for
locator construction and retry decisions.

- Keep and reuse the latest relevant `domSnapshot()` until it proves stale or
  you need locator ground truth for UI that was not present in it.
- Take a fresh `domSnapshot()` after navigation when you need to orient
  yourself or construct locators on the new page.
- If a click times out, strict mode fails, or a selector parse error occurs,
  take a fresh `domSnapshot()` before forming the next locator.
- Construct locators only from what appears in the latest snapshot. Do not
  guess labels, accessible names, or selectors.
- `tab.observe()` returns a structured object. It is not a string.
- `tab.dom_cua.get_visible_dom()` returns a structured visible DOM snapshot
  with current `node_id` values for DOM CUA actions.
- Do not print full snapshot text repeatedly when a smaller excerpt, a
  `count()`, a specific attribute, or a direct locator check would answer the
  question with fewer tokens.
- Use one broad observation to orient yourself. After that, narrow to the
  relevant section or a small number of strong candidates.
- Do not use `locator(...).allTextContents()`, `locator("body").textContent()`,
  or `locator("body").innerText()` as exploratory search tools across a page
  or large container.

## Hard Constraints For Playwright In This Runtime

- Do not pass a regex as `name` to `getByRole(...)` in this environment. Use a
  plain string `name` only.
- Do not call methods that are not explicitly documented for Formax.
- Do not treat Formax as full upstream Playwright.
- Do not use a guessed locator as an exploratory probe. If the latest snapshot
  does not clearly support the locator, do not spend timeout budget testing it.
- Do not click, fill, check, select, upload, or press on a locator until you
  have verified it resolves to exactly one element when uniqueness is not
  obvious.
- Do not retry the same failing locator without a fresh `domSnapshot()`.
- Do not use `.first()`, `.last()`, or `.nth()` unless you have just called
  `count()` on the same locator and explicitly confirmed why that position is
  correct.
- Do not treat observed `ref` values or `[data-agent-browser-ref="..."]`
  selector candidates as real DOM attributes.
- Do not call a DOM CUA `snapshot` alias. The method is
  `tab.dom_cua.get_visible_dom()`.
- Do not pass Playwright-style page functions to `tab.evaluate(...)`. Use
  `tab.playwright.evaluate(...)` for function form.

## Required Interaction Recipe

Before every click, fill, select-like action, or press:

1. Reuse the latest relevant `domSnapshot()` when it still contains the
   locator ground truth you need. Take a fresh one only when it does not.
2. Build the most stable locator from the latest snapshot.
3. If uniqueness is not obvious from the selector itself, call `count()` on
   that locator.
4. Proceed only if the locator resolves to exactly one element.
5. Perform the action.
6. After the action, collect another observation only when the next decision
   requires it. Prefer a targeted state check when it answers the question.

If `count()` is `0`:

- The selector is wrong, stale, hidden, or the UI state is not ready.
- Do not click anyway.
- Re-snapshot and rebuild the locator.

If `count()` is greater than `1`:

- The selector is ambiguous.
- Scope to the correct container or switch to a stronger attribute.
- Do not use `.first()` as a shortcut.

If the action should open content but the current page does not change as
expected:

- Do not immediately assume the click failed.
- Check whether a new selected tab opened with `browser.tabs.selected()`.
- If needed, inspect `browser.user.openTabs()` and claim the matching tab.
- Update `globalThis.__activeBrowserTab` to the new tab before continuing.

Example:

```js
const snapshot = await tab.playwright.domSnapshot();
console.log(snapshot.slice(0, 2000));

const search = tab.getByPlaceholder("Search");
const count = await search.count();
if (count !== 1) throw new Error(`Expected one search input, found ${count}.`);

await search.fill("Formax browser runtime");
await search.press("Enter");
await tab.waitForUrl({ urlContains: "search", timeoutMs: 10000, soft: true });
```

## Locator Strategy

Build locators from what the snapshot actually shows, not what looks visually
obvious.

Prefer the most stable contract, in this order:

1. `data-testid`
2. Stable `data-*` attributes
3. Stable `href` or a strong scoped attribute
4. Scoped semantic role plus accessible name using a string `name`
5. Label, placeholder, display value, alt text, title, or visible text
6. Scoped CSS selectors via `locator(...)`
7. `tab.dom_cua.get_visible_dom()` plus DOM CUA when locators cannot express
   the target

Treat generic labels such as `Menu`, `Close`, `Search`, `Submit`, `More`, or
single-letter options as ambiguous by default. Scope them to the correct
container before acting.

Treat accessible names as accessibility data, not visible text. Use
`getByRole(role, { name: "..." })` only when the role and accessible name are
clearly present in the latest snapshot and likely unique. If a site uses a
plain text input for search without `role="searchbox"` or `type="search"`, do
not assume `getByRole("searchbox")` will work.

If you already know the exact destination URL and no click-side effect matters,
prefer `tab.goto(url)` over a brittle locator click.

## Locator API

Common constructors:

```js
tab.locator("input[name='q']");
tab.getByRole("button", { name: "Search" });
tab.getByLabel("Email");
tab.getByPlaceholder("Search");
tab.getByText("Checkout");
tab.getByTestId("submit");
tab.getByAltText("Product photo");
tab.getByTitle("Help");
tab.getByDisplayValue("Alice");
tab.frameLocator("iframe[name='login']").getByRole("button", { name: "Sign in" });
```

Common reads and waits:

```js
const resultCount = await tab.locator(".result").count();
await tab.locator(".toast").waitFor({ state: "visible", timeout: 10000 });
const visible = await tab.getByText("Saved").isVisible();
const value = await tab.locator("input[name='q']").inputValue();
const href = await tab.getByText("Details").getAttribute("href");
```

Common actions:

```js
await tab.getByRole("button", { name: "Search" }).click();
await tab.getByLabel("Email").fill("user@example.com");
await tab.locator("select#country").selectOption({ value: "ca" });
await tab.getByRole("checkbox", { name: "Subscribe" }).setChecked(true);
await tab.locator("input[type='file']").setInputFiles("/absolute/path/file.txt");
```

Use `locator.filter(...)`, `locator.locator(...)`, `locator.and(...)`, and
`locator.or(...)` to narrow a target.

```js
const card = tab.locator(".result-card", { hasText: "Formax" });
const count = await card.count();
if (count !== 1) throw new Error(`Expected one Formax card, found ${count}.`);
await card.getByRole("link", { name: "Open" }).click();
```

Useful locator helpers:

- `locator.pressSequentially(text, options)` is an alias for governed typing on
  that locator. Use it when the page needs sequential input semantics.
- `locator.page()` returns the owning SDK tab handle.
- `locator.innerHTML()`, `locator.allInnerTexts()`, and
  `locator.allTextContents()` are supported for bounded, already-scoped
  extraction.
- `String(locator)` and `String(frameLocator)` are diagnostic labels.
  The string form is a compact diagnostic label, not a selector contract.
- `locator.last()` serializes as `index: -1` through the locator plan. Use it
  only after `count()` proves the last item is the intended target.

## Waiting

Prefer concrete waits over fixed sleeps:

```js
await tab.goto("https://example.com");
await tab.waitForLoadState("load");
await tab.waitForUrl({ urlContains: "example.com", timeoutMs: 10000 });
await tab.waitForText("Example Domain", { timeoutMs: 10000 });
await tab.locator("main").waitFor({ state: "visible", timeout: 10000 });
```

Playwright-style aliases route through the same backend:

```js
await tab.playwright.goto("https://example.com");
await tab.playwright.reload({ waitForLoad: true });
await tab.playwright.waitForText("Example Domain");
await tab.playwright.waitForSelector("main");
await tab.playwright.screenshot({ fullPage: true });
```

`tab.playwright.waitForSelector/waitForText` and `tab.playwright.screenshot`
are aliases over the documented tab wait and screenshot methods.

For action-triggered navigation, start the watcher before the action:

```js
await tab.playwright.expectNavigation(
  () => tab.getByRole("link", { name: "Continue" }).click(),
  { urlContains: "/next", waitUntil: "load", timeout: 10000 },
);
```

Use `tab.playwright.waitForTimeout(ms)` only for a known transition that lacks
a better signal, and follow it with a specific verification step.

## Evaluate

Use `tab.evaluate(script, options)` for string scripts:

```js
const links = await tab.evaluate(
  `Array.from(document.querySelectorAll("a")).slice(0, 10).map((a) => ({
    text: a.innerText.trim(),
    href: a.href
  }))`,
  { mode: "read", reason: "Extract visible links." },
);
```

Use `tab.playwright.evaluate(functionOrString, arg, options)` for
Playwright-shaped page functions:

```js
const title = await tab.playwright.evaluate(() => document.title, undefined, {
  mode: "read",
  reason: "Read document title.",
});
```

Use locator evaluate for scoped element reads:

```js
const label = await tab.locator("#submit").evaluate(
  (element) => element.textContent,
  undefined,
  { mode: "read" },
);
```

`mode: "read"` applies a best-effort denylist plus temporary patch against
obvious mutations. It is not a full JavaScript capability sandbox or
browser-enforced immutable execution. Use `mode: "write"` for intentional page
changes.

## DOM CUA And Coordinates

Use DOM CUA when Playwright-style locators cannot express the target but the
visible DOM snapshot identifies it:

```js
const visible = await tab.dom_cua.get_visible_dom();
const target = visible.nodes.find((node) => /Submit/i.test(`${node.role} ${node.name}`));
if (!target) throw new Error("Submit target was not visible.");
await tab.dom_cua.click({ node_id: target.node_id });
```

If a DOM CUA call reports a stale node, refresh
`tab.dom_cua.get_visible_dom()` and retry with a current `node_id`.

Use `tab.cua.*` coordinate methods only when the task is genuinely visual,
canvas-based, or otherwise not reachable through DOM or locator APIs.

## Clipboard

Clipboard helpers live under `tab.clipboard`.

```js
const text = await tab.clipboard.readText();
await tab.clipboard.writeText(text.trim());
await tab.clipboard.write("text", options);
```

`tab.clipboard.write("text", options)` routes to the plain text write helper.
For typed writes, pass a `ClipboardItem`-style MIME map:

```js
await tab.clipboard.write({
  "text/plain": "Plain text",
  "text/html": { text: "<strong>Plain text</strong>" },
});
```

Clipboard binary payloads can be `dataUrl`, `Uint8Array`/`Buffer`,
`ArrayBuffer`, or byte arrays.

## Error Recovery

- A strict mode violation means your locator is ambiguous.
- Do not retry the same locator after a strict mode violation.
- A selector parse error means the locator syntax is invalid in this runtime.
- A timeout usually means the target is missing, hidden, stale, offscreen, or
  the selector is wrong.
- Do not retry the same locator immediately after a timeout.
- If a checkbox or radio exists but `check()` or `setChecked()` reports that it
  is hidden or did not change state, click its scoped visible label or visible
  control once, then verify checked state.
- If role or accessible-name targeting is unstable, fall back deliberately to a
  stable attribute rather than brittle CSS structure.
- If two locator attempts fail on the same target, switch strategy: use a more
  stable attribute, scope to a stable container, use DOM CUA from a fresh
  visible DOM snapshot, navigate directly to a known URL, or report the
  blocker.
