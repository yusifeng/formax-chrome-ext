# File Management

This page covers file uploads, downloads, and clipboard operations in the
Formax Chrome backend.

## Uploads

Only upload files when the user explicitly asks for the exact file and
destination.

Requirements:

- `confirmed: true`
- absolute local file path
- path exists and is a regular file
- file is under `AGENT_BROWSER_ALLOWED_UPLOAD_ROOTS` when that environment
  variable is set
- target resolves to an `input[type=file]`, an associated visible `<label>`, or
  a visible wrapper containing a file input through a locator, selector, or
  observed ref

Example:

```js
await tab.locator('input[type="file"]').setInputFiles("/absolute/path/file.txt", {
  confirmed: true,
});

await tab.locator('label[for="multi-upload"]').setInputFiles([
  "/absolute/path/first.txt",
  "/absolute/path/second.txt",
], {
  confirmed: true,
});
```

Direct protocol action:

```js
await tab.uploadFile({
  selector: 'input[type="file"]',
  filePath: "/absolute/path/file.txt",
  confirmed: true,
});

await tab.uploadFile({
  selector: 'label[for="multi-upload"]',
  filePaths: [
    "/absolute/path/first.txt",
    "/absolute/path/second.txt",
  ],
  confirmed: true,
});
```

If upload fails, see `docs/api-troubleshooting.md#upload-failures`.

## File URL Access

Chrome blocks extension access to `file://` URLs unless the user enables it.
Check:

```js
const health = await browser.health();
console.log(health.fileUrlAccess);
```

To enable it:

1. Open `chrome://extensions`.
2. Open Formax details.
3. Enable `Allow access to file URLs`.
4. Reload the extension.

This is only needed for workflows involving local file pages or Chrome file URL
access. Normal uploads to `https://` pages still require absolute path and
confirmation validation.

## Downloads

Start waiting before clicking a download trigger when possible:

```js
const downloadPromise = tab.playwright.waitForEvent("download", {
  urlContains: "report",
  timeoutMs: 30000,
});

await tab.getByRole("link", { name: "Download report" }).click();
const download = await downloadPromise;

console.log(download.suggestedFilename());
console.log(download.path());
```

Download handles provide:

- `suggestedFilename()`: best available filename from Chrome metadata or URL
- `path()`: local path when Chrome reports a completed download filename
- `toJSON()`: serializable download summary

Direct APIs:

```js
await browser.downloads.list({ state: "complete", limit: 20 });
await browser.downloads.wait({ filenameContains: ".csv", timeoutMs: 30000 });
```

Do not download large or suspicious files unless the user specifically requested
that download and destination.

## Clipboard

Clipboard reads and writes affect global user state or reveal sensitive
telemetry. Require confirmation every time:

```js
const text = await tab.clipboard.readText({ confirmed: true });
await tab.clipboard.writeText("approved text", { confirmed: true });
```

Typed clipboard payloads:

```js
await tab.clipboard.write([
  {
    types: [
      {
        mimeType: "text/plain",
        text: "approved text",
      },
    ],
  },
], { confirmed: true });
```

Do not paste clipboard contents into final answers unless the user explicitly
asked to inspect clipboard data.

## Local Paths In User Replies

Report local paths only when useful to the user, such as a completed download
path. Do not expose runtime token files, native host internals, stack traces, or
unrelated local profile paths.
