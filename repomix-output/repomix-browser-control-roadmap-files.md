# Browser Control Roadmap Handoff Files

Prompt:

- `browser-control-roadmap-handoff-prompt.md`

Bundles:

- `repomix-browser-control-roadmap-formax-core.txt`
- `repomix-browser-control-roadmap-codex-reference-core.txt`

Formax bundle includes:

- `package.json`
- `README.md`
- `AGENTS.md`
- `skill/SKILL.md`
- `extension/manifest.json`
- `extension/background.ts`
- `extension/content.ts`
- `extension/debugger-manager.ts`
- `extension/session-manager.ts`
- `extension/event-buffer.ts`
- `mcp-node-repl/server.ts`
- `mcp-node-repl/kernel.ts`
- `mcp-node-repl/kernel-child.ts`
- `mcp-node-repl/browser-client.ts`
- `agent/browserTools.ts`
- `shared/types.ts`
- `shared/protocol.md`
- `shared/browser-policy.ts`
- `shared/session-store.ts`
- `tests/browser-client-facade.test.ts`
- `tests/browser-tool-schemas.test.ts`
- `tests/session-store.test.ts`
- `tests/scripts/llm-node-repl-chat.js`
- `tests/scripts/real-browser-e2e.js`
- `scripts/package-dist.js`
- `scripts/install-formax-runtime.js`
- `native-host/install-macos.sh`
- `native-host/com.example.agentbrowser.json.example`

Codex reference bundle includes:

- `codex-chrome/scripts/browser-client.mjs`
- `codex-chrome/scripts/extension-id.json`
- `codex-chrome/scripts/check-extension-installed.js`
- `codex-chrome/scripts/check-native-host-manifest.js`
- `codex-chrome/scripts/installManifest.mjs`
- `codex-chrome/skills/control-chrome/SKILL.md`
- `codex-chrome/.codex-plugin/plugin.json`
- `codex-browser/skills/control-in-app-browser/SKILL.md`
- `codex-browser/.codex-plugin/plugin.json`

Notes:

- `codex-browser/scripts/browser-client.mjs` and `codex-chrome/scripts/browser-client.mjs` were byte-identical in the captured reference. Only the Chrome copy is included to avoid doubling the bundle.
- The Codex browser client is bundled and large; reviewers should focus on API architecture, backend discovery, command routing, permission gates, and session/turn metadata rather than vendor dependency internals.
