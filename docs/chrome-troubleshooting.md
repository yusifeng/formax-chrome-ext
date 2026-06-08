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

From the browser runtime, inspect health before retrying actions:

```js
const health = await browser.health();
console.log(JSON.stringify(health, null, 2));
```

The expected Web Store extension ID is:

```text
dchkbbjmkheilkmencpckilhmmcppdne
```

## Extension Disconnected

Symptoms:

- Formax toolbar popup shows `Disconnected`.
- `browser.health()` reports `nativeConnected: false`.
- Actions fail before a tab opens or before a debugger attaches.

Fix:

1. Open `chrome://extensions`.
2. Confirm Formax is installed and enabled.
3. Click the extension reload button.
4. Click the Formax toolbar icon and confirm it shows `Connected`.
5. Run `~/.formax/bin/formax-doctor` or the source checkout checks again.

If this is a source checkout, rebuild before reloading:

```bash
npm run build
```

## Native Host Missing

Symptoms:

- Chrome extension is installed, but the popup never reaches `Connected`.
- `browser.health()` reports `nativeConnected: false`.
- Chrome native messaging errors mention host not found or forbidden.

Fix for installed runtime:

```bash
~/.formax/bin/formax-doctor
```

Fix for source checkout:

```bash
npm run package:dist
npm run install:formax-runtime
npm run check:native-host
```

The native host manifest must allow the active extension origin:

```text
chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/
```

On macOS, the user-level manifest is normally under:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
```

On Linux, it is normally under:

```text
~/.config/google-chrome/NativeMessagingHosts/
```

## Wrong Chrome Profile

Symptoms:

- The extension is installed in one Chrome profile, but the user is browsing in
  another profile.
- Formax cannot see the tab the user expects.
- `browser.user.openTabs({ currentWindow: true })` returns a different set of
  tabs than the user is looking at.

Fix:

1. Confirm the active Chrome window profile avatar/name.
2. Open `chrome://extensions` in that same window.
3. Install or enable Formax in that profile.
4. Retry `browser.user.openTabs({ currentWindow: true })` before claiming a tab.

Do not guess tab IDs across profiles. Claim a tab only from descriptors returned
by `browser.user.openTabs()`.

## Local Unpacked Extension ID Mismatch

Symptoms:

- A Web Store install works, but a locally loaded unpacked extension does not.
- Native messaging reports that access is forbidden.
- The ID in `chrome://extensions` is not `dchkbbjmkheilkmencpckilhmmcppdne`.

Cause:

Chrome can assign a different ID to local unpacked builds. The native host
manifest must list the exact active extension origin.

Fix for source checkout local testing:

```bash
npm run install:formax-runtime -- --extension-id <local-unpacked-extension-id>
```

Then reload the unpacked extension in `chrome://extensions`, or restart Chrome.

## Stale Extension Background After Rebuild

Symptoms:

- `browser.health()` works, but newer actions or schemas fail.
- Real-browser tests say the extension background is stale.
- A TypeScript rebuild succeeded, but Chrome still behaves like the old build.

Fix:

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Click reload on the unpacked Formax extension.
4. Re-run the failing action or `npm run test:real`.

Chrome extension service workers can keep old code until the extension is
reloaded.

## File Upload Permission Missing

Symptoms:

- Upload actions fail before the page receives the file.
- `browser.health()` reports file URL access is disabled.
- The target page is a local `file://` test page or the browser blocks the file
  chooser flow.

Fix:

1. Open `chrome://extensions`.
2. Open Formax details.
3. Enable `Allow access to file URLs` when the task involves local file pages.
4. For source/runtime upload validation, make sure the file path is absolute.
5. If `AGENT_BROWSER_ALLOWED_UPLOAD_ROOTS` is set, place the file under one of
   those allowed roots.

Never upload a file unless the user explicitly requested that exact file and
destination.

## Blocked Website

Symptoms:

- Navigation, clicking, typing, upload, evaluate, raw CDP, downloads, or history
  lookup fails with a blocked-host policy message.
- `browser.getPolicy()` shows the host under `blockedHosts`.

Fix:

1. Treat the block as intentional until the user says otherwise.
2. Explain the blocked host, not the internal stack trace.
3. If the user wants to unblock it, update policy explicitly for that host.

Do not bypass a blocked host with raw CDP, constructed URLs, or another tab.

## Debugger Detached Or User Takeover

Symptoms:

- An action fails after the user opens DevTools, closes the tab, moves it, or
  interacts with the page during automation.
- Events include `debuggerDetached`.
- The page state no longer matches the last snapshot.

Fix:

1. Ask the user to close DevTools for the controlled tab if it is open.
2. Run `tab.observe()` or `browser.user.openTabs()` again to get fresh state.
3. Reclaim the intended tab from a returned descriptor if needed.
4. Retry only after the current tab/session is clear.

If the user intentionally took over the tab, stop controlling it and report that
manual takeover interrupted automation.

## Chrome Extension UI Blocking Automation

Symptoms:

- Chrome permission bubbles, extension popups, download shelves, or browser UI
  overlays cover the page.
- Locator actionability reports pointer occlusion.
- Coordinate clicks hit browser chrome instead of page content.

Fix:

1. Prefer DOM/locator actions over coordinates.
2. Ask the user to close Chrome UI overlays if they are outside page DOM.
3. Take a fresh `tab.observe()` after the overlay is dismissed.
4. Use `force: true` only after inspecting the page and confirming the overlay is
   not hiding the target.

Formax controls web pages through the extension backend. It does not control
native Chrome UI or OS dialogs.
