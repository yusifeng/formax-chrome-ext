# File Management

Use this page before any task that touches a local file, a browser download, or
global clipboard state.

## Rules

- Use absolute local file paths.
- Upload only the exact file the user asked for.
- Do not automate the operating-system file picker.
- Start file chooser or download watchers before clicking the trigger.
- Verify the result with page state, event state, or a completed download
  handle.
- Do not paste clipboard contents into a final answer unless the user asked for
  them.

## File Uploads

Prefer a direct file input when it is available:

```js
const input = tab.locator('input[type="file"]');
const count = await input.count();
if (count !== 1) throw new Error(`Expected one file input, found ${count}.`);
await input.setInputFiles("/absolute/path/file.txt");
```

Use the file chooser flow when the page opens one from a visible control:

```js
const chooserPromise = tab.playwright.waitForEvent("filechooser", {
  timeoutMs: 10000,
});

await tab.getByRole("button", { name: "Upload" }).click();
const chooser = await chooserPromise;

if (chooser.isMultiple()) {
  await chooser.setFiles([
    "/absolute/path/first.txt",
    "/absolute/path/second.txt",
  ]);
} else {
  await chooser.setFiles("/absolute/path/file.txt");
}
```

Use `tab.uploadFile(...)` only when you intentionally want the direct helper:

```js
await tab.uploadFile({
  selector: 'input[type="file"]',
  filePath: "/absolute/path/file.txt",
});
```

The runtime requires absolute existing files and still applies native-host path
validation. If upload fails, read `api-troubleshooting` before retrying.

If the task involves attaching a local file and Chrome blocks it, tell the user
to open `chrome://extensions`, open Formax details, and enable `Allow access to
file URLs`.

## Downloads

Start waiting before clicking:

```js
const downloadPromise = tab.playwright.waitForEvent("download", {
  filenameContains: ".csv",
  timeoutMs: 30000,
});

await tab.getByRole("link", { name: "Download report" }).click();
const download = await downloadPromise;

console.log(download.suggestedFilename());
console.log(download.path());
```

Direct browser-scoped download helpers are also supported:

```js
const recent = await browser.downloads.list({ state: "complete", limit: 20 });
const result = await browser.downloads.wait({
  filenameContains: ".csv",
  timeoutMs: 30000,
});
```

Download handles expose `suggestedFilename()`, `path()`, and `toJSON()`.

Do not download large, unexpected, or suspicious files unless the user asked
for that download.

## Media Downloads

For image, video, or audio assets already present on the page, prefer
`locator.downloadMedia()` over guessing URLs:

```js
const result = await tab.locator("img.hero").downloadMedia({
  filename: "assets/hero.png",
  fallbackFetch: true,
  waitForCompletion: true,
});

console.log(result.media.url);
console.log(result.download?.suggestedFilename(), result.download?.path());
```

## Clipboard

Clipboard helpers live under `tab.clipboard` and affect global user state:

```js
const text = await tab.clipboard.readText();
await tab.clipboard.writeText(text.trim());
await tab.clipboard.write("text", options);
```

For typed writes, pass either backend-shaped items or a `ClipboardItem`-style
MIME map:

```js
await tab.clipboard.write([
  {
    types: [
      {
        mimeType: "text/plain",
        text: "Plain text",
      },
    ],
  },
]);

await tab.clipboard.write({
  "text/plain": "Plain text",
  "text/html": { text: "<strong>Plain text</strong>" },
});
```

Clipboard binary payloads can be `dataUrl`, `Uint8Array`/`Buffer`,
`ArrayBuffer`, or byte arrays.

Keep clipboard usage scoped to the task. Do not use clipboard as a hidden data
transfer channel when a direct API can express the work.

## File URL Access

Chrome blocks extension access to `file://` URLs unless the user enables it.
Check:

```js
const health = await browser.health();
console.log(health.fileUrlAccess);
```

Normal uploads to `https://` pages do not require navigating to `file://` URLs,
but they still depend on local file access and native-host path validation.
