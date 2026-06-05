# Repomix Browser SDK Facade File Manifest

Bundle:

- `repomix-output/repomix-browser-sdk-facade-core.txt`

Prompt:

- `repomix-output/browser-sdk-facade-handoff-prompt.md`

Tier:

- `core`

Purpose:

- Ask WebGPT to review the current completed backend primitives and propose the next SDK/object facade layer for LLM use through `node_repl`.

Included files:

- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `tsconfig.extension.json`
- `shared/types.ts`
- `shared/protocol.md`
- `shared/native-frame.ts`
- `shared/browser-policy.ts`
- `agent/browserTools.ts`
- `native-host/host.ts`
- `extension/manifest.json`
- `extension/background.ts`
- `extension/debugger-manager.ts`
- `extension/session-manager.ts`
- `extension/event-buffer.ts`
- `extension/content.ts`
- `mcp-node-repl/server.ts`
- `mcp-node-repl/kernel.ts`
- `mcp-node-repl/kernel-child.ts`
- `mcp-node-repl/browser-client.ts`
- `test-scripts/mcp-node-repl-smoke.js`
- `test-scripts/llm-node-repl-chat.js`
- `test-scripts/real-browser-e2e.js`
- `tests/browser-tool-schemas.test.ts`

Current verification status:

- `npm run typecheck`: passed
- `npm test`: passed, 14/14
- `npm run test:mcp-node-repl`: passed
- `npm run test:real`: passed, 13/13

Notes:

- Existing WebGPT replies in `repomix-output/1.md` and `repomix-output/2.md` were preserved and not repacked.
- This package is for static review; the recipient should not be asked to execute local commands.

