# Agent Notes

## Project Overview

This repository contains a Chrome extension, Rust native messaging host, MCP
`node_repl` server, browser client SDK, and agent/debug scripts for controlling
real Chrome tabs through high-level browser tools.

The main protocol contract lives in `shared/protocol.md` and `shared/types.ts`.
Keep protocol changes synchronized across the extension, MCP/browser client,
agent tool schemas, and tests.

## Source Layout

- `extension/`: Chrome MV3 extension sources. TypeScript compiles to adjacent
  JavaScript files that the unpacked extension loads.
- `mcp-node-repl/`: persistent Node-backed MCP server and browser-client bridge.
- `agent/`: agent-facing browser tool wrappers plus manual and LLM smoke scripts.
- `shared/`: shared schemas, types, policies, session store, and protocol docs.
- `rust/` and `native-host/`: native messaging host implementation, manifest
  templates, and platform installers.
- `scripts/`: package, install, and environment validation helpers.
- `tests/`: Vitest coverage and real-browser smoke/e2e scripts.

## Common Commands

Use:

```bash
npm run build
```

to build both runtime TypeScript and extension TypeScript.

Runtime JavaScript files under `extension/`, `agent/`, `mcp-node-repl/`, and
`shared/` are generated in place by TypeScript and are intentionally not
tracked by git. Keep editing the `.ts` sources, then run `npm run build` before
reloading the unpacked extension or running Node entrypoints directly.

Use:

```bash
npm run typecheck
npm test
```

for normal validation. `npm test` builds the runtime before running Vitest.

Use:

```bash
npm run test:mcp-node-repl
npm run check:extension-installed
npm run check:native-host
```

for focused MCP and installed-runtime checks.

Use:

```bash
npm run test:real
```

only after the extension and native host are installed and the extension popup
shows `Connected`. Reload the unpacked extension in `chrome://extensions` after
rebuilding extension files.

For the local unpacked development extension flow, use:

```bash
npm run install:formax-runtime:dev
```

This installs the runtime into `~/.formax-dev` and rewrites the native host
manifest for the fixed development extension ID alias `dev`.

## Chrome Extension ID

The Chrome Web Store extension ID for this project is:

```text
dchkbbjmkheilkmencpckilhmmcppdne
```

Keep this value in sync with:

- `config/extension-id.json`
- `native-host/com.formax.browserhost.json.example`
- generated native messaging manifests created by `native-host/install-macos.sh` or `native-host/install-linux.sh`

The native messaging host manifest must include:

```text
chrome-extension://dchkbbjmkheilkmencpckilhmmcppdne/
```

## Web Store vs Local Unpacked Builds

Chrome Web Store builds and local unpacked builds do not necessarily share the same extension ID.

The project configuration targets the Web Store ID above. This is the right value for published installs and for distributable packages that users install after installing the Chrome Web Store version.

When testing a local unpacked extension, Chrome may assign a different extension ID. If the local unpacked extension cannot connect to the native host, do not assume the native host is broken. Check the extension ID in `chrome://extensions` and either:

- install the Web Store build and use the Web Store ID, or
- run the native host installer with the local unpacked extension ID as an override for local testing.

On macOS, the published/Web Store flow is:

```bash
cd /Users/david/Documents/github/formax-extension
npm run package:dist
npm run install:formax-runtime
```

For a local unpacked extension with a different ID:

```bash
cd /Users/david/Documents/github/formax-extension
npm run install:formax-runtime -- --extension-id <local-unpacked-extension-id>
```

The repository also keeps a fixed local development install path and ID alias:

```bash
cd /Users/david/Documents/github/formax-extension
npm run install:formax-runtime:dev
```

That command installs into `~/.formax-dev` and uses the development extension
ID alias defined in `scripts/extension-ids.js`.

After changing the native host manifest or reloading/reinstalling the extension, reload the extension in Chrome or restart Chrome before testing native messaging again.

## Packaging

Use:

```bash
npm run package:dist
```

This rebuilds the runtime, extension JavaScript, Rust native host binary, and `dist/`.

Use:

```bash
npm run install:formax-runtime
```

to copy `dist/` into `~/.formax/plugins/cache/formax/chrome/<version>/`, update
the `latest` symlink, and write Chrome's native messaging manifest.

## Skill Bootstrap Path

The packaged skill bootstrap path is fixed. When `skill/SKILL.md` or packaged
skill content needs to import the browser client SDK, use exactly:

```text
~/.formax/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs
```

Do not add fallback search paths such as source-checkout-relative copies,
`.formax-dev`, `nodeRepl.cwd`, or alternate candidate lists unless the user
explicitly asks for that behavior.

The Chrome Web Store upload package is extension-only and should not include the MCP server, native host, skill, or debug scripts.

The full product distribution package contains the extension, native host, MCP node_repl server, browser client SDK, shared protocol files, skill, and debug scripts.
