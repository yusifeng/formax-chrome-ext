# Chrome Troubleshooting

Use this guide when Formax cannot control Chrome, the extension popup does not
show `Connected`, or a browser action fails because Chrome state changed.

## Quick Checks

For an installed runtime:

```bash
~/.formax/bin/formax-doctor
```

For source checkout development:

```bash
npm run check:extension-installed
npm run check:native-host
```

From the browser runtime, check health before retrying actions:

```js
const health = await browser.health();
console.log(JSON.stringify(health, null, 2));
```

The expected Web Store extension ID is:

```text
dchkbbjmkheilkmencpckilhmmcppdne
```

## Extension Disconnected

If the popup shows `Disconnected` or `browser.health()` reports
`nativeConnected: false`:

1. Open `chrome://extensions`.
2. Confirm Formax is installed and enabled.
3. Reload the extension.
4. Open the Formax toolbar popup and confirm it shows `Connected`.
5. Run `~/.formax/bin/formax-doctor` or the source checkout checks again.

If this is a source checkout, run `npm run build` before reloading the
extension.

## Native Host Missing

If Chrome cannot reach the native host:

- Installed runtime: run `~/.formax/bin/formax-doctor`
- Source checkout:

```bash
npm run package:dist
npm run install:formax-runtime
npm run check:native-host
```

The native host manifest must allow:

```text
chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/
```

## Wrong Chrome Profile

If Formax is installed in one Chrome profile but the user is browsing in
another:

1. Confirm the active Chrome window profile.
2. Check `browser.health().profile`.
3. Open `chrome://extensions` in that same window.
4. Install or enable Formax in that profile.
5. Retry `browser.user.openTabs({ currentWindow: true })`.

Do not guess tab IDs across profiles. Claim a tab only from descriptors
returned by `browser.user.openTabs()`.

## Local Unpacked Extension ID Mismatch

If local unpacked testing uses a different extension ID than the Web Store
build:

```bash
npm run install:formax-runtime -- --extension-id <local-unpacked-extension-id>
```

Then reload the unpacked extension in `chrome://extensions`, or restart Chrome.

## Stale Extension Background After Rebuild

If Chrome still behaves like the old build after a successful rebuild:

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Reload the unpacked Formax extension.
4. Re-run the failing action or `npm run test:real`.

Chrome extension service workers can keep old code until the extension is
reloaded.

For public website smoke coverage after local fixture checks pass:

```bash
npm run test:real-sites
```

## File Upload Permission Missing

If upload fails on a local `file://` page, or Chrome blocks local file access:

1. Open `chrome://extensions`.
2. Open Formax details.
3. Enable `Allow access to file URLs`.
4. Make sure the upload path is absolute.
5. If `AGENT_BROWSER_ALLOWED_UPLOAD_ROOTS` is set, use a file under an allowed
   root.

## Debugger Detached Or User Takeover

If an action fails after DevTools opened, the tab moved, or the user took over
the page:

1. Close DevTools for the controlled tab if it is open.
2. Run `tab.observe()` or `browser.user.openTabs()` again.
3. Reclaim the intended tab from a returned descriptor if needed.
4. Retry only after current tab state is clear.

If the user intentionally took over the tab, stop controlling it and report the
interruption.

## Chrome UI Blocking Automation

Formax controls web pages through the extension backend. It does not control
native Chrome UI or OS dialogs.

If permission bubbles, extension popups, download shelves, or browser overlays
cover the page:

1. Prefer DOM or locator actions over coordinates.
2. Close the Chrome UI overlay.
3. Take a fresh `tab.observe()`.
4. Use `force: true` only after confirming the page target is still safe.
