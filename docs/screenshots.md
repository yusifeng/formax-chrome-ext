# Screenshots

Screenshots are supporting evidence for visual state. Prefer DOM extraction for
structured text and data.

## Full Tab Screenshot

```js
const shot = await tab.screenshot();
console.log(shot.mimeType);
console.log(shot.dataUrl);
```

The SDK result includes:

- `dataBase64`
- `mimeType`
- `dataUrl`
- `bytes`

Use `dataUrl` for inline display or handoff. Use `bytes` for local image
inspection. Do not paste long base64 strings into user-facing replies unless the
user explicitly asks for raw image data.

## Save To File

`path` and `saveToFile` are SDK-only options. They are not sent to Chrome:

```js
await tab.screenshot({
  path: "/absolute/path/screenshot.png",
});
```

Use absolute paths for saved files.

## Element Screenshots

Locator crop:

```js
await tab.locator("main").screenshot({
  path: "/absolute/path/main.png",
  padding: 8,
});
```

DOM CUA crop:

```js
await tab.dom_cua.screenshot({
  node_id,
  path: "/absolute/path/node.png",
  padding: 8,
});
```

Element screenshots are SDK helpers. They derive a clip from the locator
bounding box or latest visible DOM node box, then call the tab screenshot API.

## When To Screenshot

Use screenshots when:

- visual confirmation is needed
- a locator failed and the page state is unclear
- layout, overlay, canvas, chart, or image content matters
- the user explicitly asks to see the page

Do not use screenshots as a substitute for DOM text when structured DOM text is
available.

## After Page Changes

Take a fresh `tab.observe()` or equivalent DOM snapshot after:

- navigation
- reload
- modal changes
- locator timeout
- strict-mode failure
- selector parse error
- unexpected page mutation

Then decide whether a screenshot adds useful visual evidence.

## Sensitive Content

Screenshots can contain private page content. Before sharing or saving a
screenshot, consider whether it includes:

- passwords or tokens
- personal messages
- account identifiers
- financial or health data
- private documents

If sensitive content is visible, summarize the relevant state instead of
displaying the image unless the user explicitly requested the screenshot.
