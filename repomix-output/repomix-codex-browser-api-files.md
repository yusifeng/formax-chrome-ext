# Repomix Handoff Files

Bundle: `repomix-codex-browser-api-core.txt`
Prompt: `codex-browser-api-handoff-prompt.md`

## Included Files

- `README.md`
- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `mcp-node-repl/server.ts`
- `mcp-node-repl/kernel.ts`
- `mcp-node-repl/kernel-child.ts`
- `mcp-node-repl/browser-client.ts`
- `agent/browserTools.ts`
- `native-host/host.ts`
- `extension/manifest.json`
- `extension/background.ts`
- `extension/debugger-manager.ts`
- `extension/session-manager.ts`
- `extension/content.ts`
- `extension/event-buffer.ts`
- `shared/types.ts`
- `shared/protocol.md`
- `shared/browser-policy.ts`
- `shared/session-store.ts`
- `shared/native-frame.ts`
- `test-scripts/mcp-node-repl-smoke.js`
- `test-scripts/llm-node-repl-chat.js`
- `test-scripts/real-browser-e2e.js`
- `test-scripts/llm-browser-agent.js`
- `test-scripts/llm-browser-chat.js`
- `tests/browser-policy.test.ts`
- `tests/session-store.test.ts`
- `tests/native-frame.test.ts`

## Why These Files

- `mcp-node-repl/*` shows the new Codex-like outer tool layer and JS runtime.
- `mcp-node-repl/browser-client.ts` shows the first SDK facade that WebGPT should evaluate.
- `agent/browserTools.ts` shows the existing direct browser tool layer that should become an implementation detail.
- `native-host/host.ts` and `extension/*` show the real browser/CDP backend primitives currently available.
- `shared/*` documents the protocol/types/policy constraints.
- `test-scripts/*` and `tests/*` show current validation style and expected behavior.

## Main Review Question

How should the project implement a Codex-like `agent.browsers.*` JavaScript SDK surface while keeping only `js`, `js_add_node_module_dir`, and `js_reset` exposed as LLM tools?
