# Screenshots

- If you take a screenshot that the user should see, include the image inline
  in your Markdown response using Markdown image syntax:

  ```md
  ![screenshot](IMAGE_LINK)
  ```

- If the user has asked you to take screenshots, include them in your final
  response.
- If the user has asked you to test a website or verify frontend work, take
  screenshots at key moments and include the relevant ones in your final
  response.
- Prefer DOM extraction for structured text or data. Use screenshots when
  layout, canvas, charts, images, overlays, or visual confirmation matter.

## Full Page Screenshots

```js
const shot = await tab.screenshot({ fullPage: true });
console.log(shot.mimeType, shot.dataUrl);
```

`tab.playwright.screenshot(...)` routes through the same backend. Screenshot
results include `dataBase64`, `mimeType`, `dataUrl`, and `bytes`.

Do not paste long base64 strings into user-facing replies.

## Saving Screenshots

`path` and `saveToFile` are SDK-only options handled locally:

```js
await tab.screenshot({
  fullPage: true,
  path: "/absolute/path/page.png",
});
```

Use absolute paths.

## Element Screenshots

Use locator screenshots when you already have a stable target:

```js
await tab.locator("main").screenshot({
  path: "/absolute/path/main.png",
  padding: 8,
  highlight: true,
});
```

Use DOM CUA screenshots when you only have a current visible `node_id`:

```js
const visible = await tab.dom_cua.get_visible_dom();
const target = visible.nodes.find((node) => node.role === "button");
if (!target) throw new Error("No visible button node.");

await tab.dom_cua.screenshot({
  node_id: target.node_id,
  path: "/absolute/path/button.png",
  padding: 8,
  highlight: true,
});
```

If a node screenshot reports a stale `node_id`, refresh
`tab.dom_cua.get_visible_dom()` and choose a current node.

## When To Screenshot

Use screenshots when:

- the user asks to see the page
- visual layout or rendering matters
- the target is canvas, chart, image, video, or visual-only UI
- a locator failed and DOM state is not enough to explain the page
- you need before/after visual evidence

Do not use screenshots as exploratory text extraction when a targeted DOM read
or locator query can answer the question.

## Sensitive Content

Screenshots can contain private page content. Before sharing or saving one for
user-visible output, consider whether it contains passwords, tokens, private
messages, account identifiers, financial or health data, or private documents.

If sensitive content is visible, summarize the relevant state instead of
displaying the screenshot unless the user explicitly asked for the image.
