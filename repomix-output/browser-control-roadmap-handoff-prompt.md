# Browser Control Roadmap Review

You are reviewing two attached Repomix bundles:

1. `repomix-browser-control-roadmap-formax-core.txt`
   - Current Formax browser-control implementation.
   - Includes Chrome extension background/content scripts, node_repl MCP server/client, native host install/package scripts, shared protocol/types, skill instructions, and adjacent tests.

2. `repomix-browser-control-roadmap-codex-reference-core.txt`
   - Reference implementation material from Codex bundled browser/chrome plugins.
   - It includes Codex Chrome's bundled `browser-client.mjs`, Chrome/browser skills, extension install/check scripts, plugin manifests, and extension-id config.
   - Note: `browser-client.mjs` is a bundled artifact and contains dependency code. Do not waste effort line-by-line reviewing vendor/minified sections; focus on the API shape, runtime setup, session/turn metadata, browser backend abstraction, permissions/security model, and UX/control patterns visible in the file.

## Context

We are building a Codex-like local browser-control stack for Formax:

- Chrome extension controls real Chrome tabs through `chrome.debugger`, content scripts, and native messaging.
- Local native host bridges the extension to a node_repl MCP server.
- The LLM sees a very small tool surface: `js`, `js_add_node_module_dir`, and `js_reset`.
- The browser API exposed to the LLM is mostly a JavaScript client loaded inside the persistent Node REPL.
- We do not need exact compatibility with Codex. We want a comparable architecture and product experience.

Recent Formax work already added:

- `DebuggerManager` attach/timeout/detach cleanup/raw CDP.
- On-demand content script injection and ping.
- Browser actions such as `moveMouse`, `scroll`, `waitForLoadState`, `evaluate`, and `cdp`.
- Session/tab state manager with claim/current tab support.
- Cursor overlay with custom PNG cursor, move sequence, arrived acknowledgement, sessionId/turnId binding, thinking/active states, and favicon badge.
- Observation now combines visible DOM with a lightweight accessibility semantic tree, plus optional full accessibility tree and DOMSnapshot.
- A `skill/SKILL.md` describing how the model should use the browser client.
- Packaging scripts for a dist-style Formax runtime.

## What I Want From You

Please compare Formax against the Codex reference and produce a practical implementation roadmap.

Please organize your answer into:

1. Current architecture assessment
   - What Formax already gets right.
   - What is structurally aligned with Codex.
   - Where Formax is currently fragile or over-simplified.

2. Prioritized roadmap
   - Phase 1: must-have stability and testing work.
   - Phase 2: browser-control capability expansion.
   - Phase 3: product/UX polish.
   - Phase 4: optional deeper platform work.

3. Capability gaps
   - Missing runtime/backend pieces.
   - Missing browser API pieces.
   - Missing observation/locator pieces.
   - Missing safety/permission pieces.
   - Missing debugging/test instrumentation.

4. Codex-inspired designs worth copying
   - Name the specific file paths and code areas from the bundles.
   - Explain why each idea is useful.
   - Translate each into a Formax-specific implementation, not a copy-paste compatibility goal.

5. What not to copy yet
   - Identify Codex complexity that is unnecessary for Formax's MVP.
   - Explain why it can wait.

6. Concrete next tasks
   - Give 10-20 actionable tasks.
   - Each task should name likely Formax files to modify.
   - Include validation/test ideas for each task.

## Constraints

- Formax does not need exact Codex compatibility.
- Keep the LLM tool surface minimal: `js`, `js_add_node_module_dir`, `js_reset`.
- Prefer implementing browser capabilities inside the JS browser client and extension/native protocol, not by registering dozens of direct LLM tools.
- The project is intended to be embedded into a Formax desktop/Electron product later, so do not assume the final packaging must be a standalone CLI.
- Avoid recommendations that require users to manually copy Chrome extension IDs. Assume a fixed Web Store extension ID in published builds and a dev config override for local unpacked builds.
- Prioritize real-world browser reliability over cosmetic polish.

## Acceptance Criteria For Your Answer

- The roadmap should be specific enough that an engineer can start implementing from it.
- It should call out at least 5 high-leverage Codex patterns to copy or adapt.
- It should clearly separate feature work from UX polish.
- It should identify at least 3 things we should not copy yet.
- It should include a small validation matrix covering unit tests, extension build checks, real Chrome smoke tests, and LLM chat/ReAct loop tests.

（回复请必须使用中文）