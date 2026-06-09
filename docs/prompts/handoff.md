# AI Handoff: Formax Chrome Browser Control Parity

This handoff is for another coding agent continuing work in this repository. The current goal is to keep moving the Chrome extension/native-host/MCP browser-control stack closer to Codex `codex-resource/1.1.5_0` behavior, especially page-control behavior originally concentrated in `codex-resource/1.1.5_0/background.js`, while preserving this repo's protocol, policy, native host, and SDK architecture.

## Repository Context

This repo contains a Chrome MV3 extension, Rust native messaging host, MCP `node_repl` server, browser client SDK, shared protocol/types/schemas, agent wrappers, docs, and tests.

Important source areas:

- `extension/`: MV3 extension runtime. TypeScript compiles to adjacent JavaScript files loaded by Chrome.
- `mcp-node-repl/`: Node-backed MCP server and browser-client facade.
- `agent/`: agent-facing browser tool wrappers and smoke scripts.
- `shared/`: shared protocol, schemas, action registry, types, policy/session utilities.
- `rust/native-host/`: native host request validation and forwarding boundary.
- `tests/`: Vitest unit/static tests and real-browser e2e scripts.
- `docs/`: generated and hand-written API/protocol/parity docs.

Main contract files:

- `shared/protocol.md`
- `shared/types.ts`
- `shared/browser-tool-schemas.ts`
- `shared/action-registry.ts`
- `agent/browserTools.ts`
- `extension/action-validator.ts`
- `rust/native-host/src/rpc.rs`

Keep protocol/schema/type/action changes synchronized across all of the above plus tests and generated docs.

## Important Constraints

- Do not revert unrelated or existing dirty worktree changes.
- The current dirty files are expected and mostly part of this parity pass.
- TypeScript source files compile to adjacent `.js` files. Prefer editing `.ts`, then run `npm run build` to regenerate `.js`.
- Generated docs must be regenerated after SDK/protocol changes:
  - `npm run docs:browser-api`
  - `npm run docs:protocol`
- The Chrome Web Store extension ID in project config is `dchkbbjmkheilkmencpckilhmmcppdne`.
- A local unpacked test extension ID used during this thread was `hooonkcoopaigliifkabcdjfmjjffmbm`.
- Do not run `npm run test:real` casually. It controls a real installed Chrome extension/native host. Run only when explicitly intended and after confirming extension/native host are installed and connected.
- Approval UX beyond current popup/banner support is intentionally deferred. Do not spend time on rich Codex-equivalent approval UI unless the user explicitly reprioritizes it.
- Browser content comments/annotations are intentionally out of scope.
- Do not claim full Playwright or full Codex parity where only facade-compatible or first-pass behavior exists.

## Current Worktree Snapshot

At handoff time the worktree has modifications in these files:

```text
agent/browserTools.js
agent/browserTools.ts
docs/browser-client-api.md
docs/codex-gap-todolist.md
docs/playwright.md
extension/action-validator.js
extension/action-validator.ts
extension/background.js
extension/background.ts
mcp-node-repl/browser-client.js
mcp-node-repl/browser-client.ts
rust/native-host/src/rpc.rs
shared/browser-tool-schemas.js
shared/browser-tool-schemas.ts
shared/protocol.md
shared/types.ts
tests/browser-client-facade.test.ts
tests/browser-tool-schemas.test.ts
tests/scripts/real-browser-e2e.js
```

Approximate cumulative diff at handoff:

```text
19 files changed, about 1842 insertions and 205 deletions
```

## Latest Verified Commands

The last full validation pass completed successfully after the read-only evaluate guard work:

```bash
npm run build
npm run docs:browser-api
npm run docs:protocol
npx vitest run tests/browser-tool-schemas.test.ts tests/browser-client-facade.test.ts
node --check tests/scripts/real-browser-e2e.js
npm run check:protocol-sync
npm run typecheck
npm test
(cd rust/native-host && cargo test)
git diff --check
```

Results observed:

- Vitest full suite: 7 files passed, 131 tests passed.
- Rust native host tests: 63 passed.
- Protocol action reference synchronized.
- `git diff --check` passed.
- `npm run test:real` was not run.

## What Was Done In This Parity Pass

### 1. Scope Cleanup And Non-Goals

Updated `docs/codex-gap-todolist.md` to clarify:

- In-app browser content comments/annotations are out of scope.
- Richer approval UX is deferred.
- Read-only evaluate hardened sandboxing is out of scope; current behavior is best-effort guard, not a browser-enforced immutable JS sandbox.

### 2. Download ID Parity

Added Codex-style download aliases:

- Chrome download summaries include `id`, `downloadId`, and `download_id`.
- SDK normalizes these aliases into download handles.
- Protocol/docs/tests updated.

Touched areas include:

- `shared/types.ts`
- `shared/protocol.md`
- `extension/background.ts`
- `mcp-node-repl/browser-client.ts`
- tests/docs

### 3. DOM CUA Stale Node Handling

Added a structured stale-node SDK error:

- `BrowserDomCuaStaleNodeError`
- code: `dom_cua_stale_node`
- refreshes latest snapshot and reports available ids/refs when a node cannot be resolved.

Relevant file:

- `mcp-node-repl/browser-client.ts`

### 4. Locator Surface Improvements

Added or improved:

- `LocatorHandle.toString()` and `FrameLocatorHandle.toString()` debug labels.
- `LocatorHandle.toJSON()` machine-readable plans.
- `locator.last()` is synchronous and uses `index: -1` instead of issuing an async count.
- Backend supports negative locator indexes from the end.
- `locator.innerHTML()` query.
- `locator.pressSequentially()` as an SDK alias for governed `locator.type()`.
- `locator.page()` returning the owning tab handle.
- Kept `tap()` intentionally unimplemented because backend has no real touch-input semantics; do not fake it as click.

Relevant files:

- `mcp-node-repl/browser-client.ts`
- `extension/background.ts`
- `shared/types.ts`
- `shared/browser-tool-schemas.ts`
- `extension/action-validator.ts`
- `rust/native-host/src/rpc.rs`
- `shared/protocol.md`
- `docs/playwright.md`
- `tests/browser-client-facade.test.ts`
- `tests/browser-tool-schemas.test.ts`

### 5. Actionability Improvements

Added/improved first-pass Playwright-style actionability behavior:

- Open shadow composed ancestor checks for inert, pointer-events none, aria-disabled, aria-readonly.
- Disabled fieldset first-legend exception handling.
- Editable semantics: native `readonly`, `aria-readonly`, contenteditable.
- `locator.isEnabled/isDisabled/isEditable` aligned with backend actionability checks.
- `trial: true` support returns target geometry without page mutation.
- OOPIF target input dispatch fix: locator click/drag/hover/fill can send `targetId` to CDP input paths where applicable.

Relevant files:

- `extension/background.ts`
- `mcp-node-repl/browser-client.ts`
- `shared/protocol.md`
- `docs/playwright.md`
- `tests/browser-tool-schemas.test.ts`
- `tests/scripts/real-browser-e2e.js`

### 6. Clipboard Parity

Added/improved:

- `tab.clipboard.readText()` / `writeText()` already existed.
- Typed `tab.clipboard.read()` / `write()` for clipboard items.
- SDK enriches typed read payloads with `dataUrl` when `mimeType + dataBase64` exist.
- SDK accepts `ClipboardItem`-style MIME map writes.
- SDK binary MIME map payloads normalize to `dataBase64`:
  - `Uint8Array` / `Buffer`
  - `ArrayBuffer`
  - byte arrays
- SDK direct string alias:
  - `tab.clipboard.write("text", { confirmed: true })`
  - routes through `browser_clipboard_write_text`, not typed item backend.

Relevant files:

- `mcp-node-repl/browser-client.ts`
- `shared/protocol.md`
- `docs/playwright.md`
- `docs/codex-gap-todolist.md`
- `tests/browser-client-facade.test.ts`
- `tests/browser-tool-schemas.test.ts`

### 7. Real-Browser Failure Coverage

Expanded `tests/scripts/real-browser-e2e.js` with fixture coverage for:

- strict duplicate locator failure
- missing locator target
- hidden actionability target
- occluded actionability target
- `trial: true` preflight returning geometry without page mutation
- local cross-origin iframe/OOPIF diagnostics and target-continuation checks when Chrome exposes a separate OOPIF target

`npm run test:real` was not run in this thread after these changes, but the script passes `node --check` and static tests verify coverage is wired.

### 8. Frame / OOPIF Progress

Implemented partial, diagnostic frame/OOPIF improvements:

- `resolveFrame` now returns diagnostics:
  - `resolvedSelectorCount`
  - `unresolvedFrameSelectors`
  - `targetCandidates`
- It can use `Target.getTargets` / target diagnostics to locate OOPIF-like targets.
- It can continue resolving remaining nested frame selectors inside a matched OOPIF target when possible.
- Locator actions now use frame-scoped execution and viewport-offset translation when resolvable.
- Locator pointer/text-input actions dispatch through matched `targetId` for OOPIF targets when applicable.

Still incomplete:

- Full OOPIF edge cases.
- Public-site and complex cross-frame failure coverage.
- Robust lifecycle handling around target attach/detach in all race cases.

Relevant files:

- `extension/background.ts`
- `agent/browserTools.ts`
- `shared/types.ts`
- `shared/protocol.md`
- `mcp-node-repl/browser-client.ts`
- `tests/scripts/real-browser-e2e.js`
- `tests/browser-tool-schemas.test.ts`

### 9. Playwright Namespace Facade

Added `tab.playwright` aliases over governed backend methods:

- Locators and `getBy*` helpers.
- `frameLocator`.
- navigation/page inspection:
  - `goto`
  - `openUrl`
  - `url`
  - `title`
  - `reload`
  - `back`
  - `forward`
  - `goBack`
  - `goForward`
- waits/screenshot:
  - `waitForLoadState`
  - `waitForURL` / `waitForUrl`
  - `waitForSelector`
  - `waitForText`
  - `waitForTimeout`
  - `waitForEvent("download")`
  - `waitForEvent("filechooser")`
  - `screenshot`
- keyboard/mouse aliases:
  - `keyboard.press/type/insertText`
  - `mouse.click/dblclick/move/wheel/drag`
- `expectNavigation` wrapper.

Important: these are SDK facade aliases. They do not bypass host approval, confirmation, origin approval, or navigation policy.

Relevant file:

- `mcp-node-repl/browser-client.ts`

### 10. Read-Only Evaluate Guard Clarification And Hardening

Current behavior:

- `mode: "read"` is for routine inspection.
- Obvious mutating scripts are rejected before execution with `read_only_evaluate_violation`.
- Runtime wrapper temporarily patches common mutation APIs/setters while the read evaluation runs.
- This is best-effort denylist + temporary runtime patch, not a hardened JS capability sandbox.

Recently strengthened runtime guard to include:

- `insertAdjacentHTML`
- `replaceWith/remove/before/after/append/prepend`
- `classList.add/remove/toggle/replace`
- `CSSStyleDeclaration.setProperty/removeProperty`
- setters for `outerHTML`, `className`, `id`, `cssText`, common form values

Relevant files:

- `extension/background.ts`
- `shared/protocol.md`
- `docs/playwright.md`
- `docs/codex-gap-todolist.md`
- `tests/browser-tool-schemas.test.ts`

## Important Current Non-Parity Items

These are documented in `docs/codex-gap-todolist.md` under "Current Known Non-Parity Items". Do not mark the whole goal complete unless these are intentionally resolved or explicitly re-scoped by the user.

### Clipboard Remaining Gaps

Current state is good for text, typed items, MIME maps, `dataUrl`, and binary SDK inputs.

Still incomplete:

- Browser permission-prompt UI parity.
- Broad native clipboard format parity.
- Potential richer read helpers if needed, but avoid inventing fake capabilities.

### Frame / OOPIF Remaining Gaps

Still one of the hardest areas.

Current state has partial OOPIF resolution diagnostics and target continuation.

Remaining work:

- More complex nested OOPIF target lifecycle cases.
- Public-site OOPIF/frame failures.
- Better target attach/detach race coverage.
- More direct comparison against `codex-resource/1.1.5_0/background.js` if available locally.

### Locator Surface Remaining Gaps

Current surface is fairly broad but not full Playwright.

Potential future work:

- Add only methods that can be faithfully backed by current primitives.
- Do not add `tap()` until backend has real touch semantics.
- Consider remaining Playwright locator APIs only if they map cleanly to backend behavior and tests can prove them.

### Actionability Remaining Gaps

Hard area.

Current first-pass actionability exists, including structured errors and real-browser fixture coverage.

Remaining work:

- Full Playwright parity is not done.
- Edge cases around CSS transforms, moving targets, nested scrolling, overlay detection, iframes/OOPIF, shadow DOM, labels, and browser-specific hit testing may remain.
- This should be approached with real-browser fixtures and structured error assertions, not just unit tests.

### Real-Browser Failure Tests Remaining Gaps

Current real-browser script covers local fixtures for strict/missing/hidden/occluded/trial and some frame/OOPIF diagnostics.

Remaining work:

- Public-site and complex cross-frame/OOPIF failure tests are not fully covered.
- `npm run test:real` should be run only when extension/native host are installed and connected.

### Approval UX Remaining Gaps

Current popup/banner/pending approval engine exists and can list/resolve approvals.

Deferred:

- Rich Codex-equivalent approval UX.
- The user agreed this can stay deferred for now.

## Suggested Next Steps

Continue from lower risk to higher risk:

1. Real-browser failure tests expansion

   Add more fixture cases or guarded real-site tests for already-implemented behavior. This is useful before touching deeper actionability/OOPIF code.

   Good candidates:

   - transformed element hit testing
   - nested scroll container target visibility
   - fixed overlay with pointer-events variations
   - iframe/OOPIF failure codes when target cannot be resolved
   - verify failed actions do not mutate page state

2. Actionability edge cases

   Expand the backend checks only when a failing fixture demonstrates a gap. Keep structured failure codes stable:

   - `strict_mode_violation`
   - `locator_not_found`
   - `locator_actionability`
   - `details.actionabilityCode` like `not_visible`, `disabled`, `not_editable`, `pointer_events_none`, `inert`, `occluded`

3. Frame/OOPIF hardening

   Work carefully. Prefer adding diagnostics and tests before behavior changes.

   Useful focus:

   - target lifecycle races
   - nested OOPIF frame selector continuation
   - target coordinate translation
   - error quality when only partial frame path resolves

4. Optional Codex source comparison

   If `codex-resource/1.1.5_0` exists in the workspace, compare `background.js` behavior directly before implementing deeper backend changes. The user specifically wants page-control behavior to stay close to that implementation where practical.

## Validation Matrix For Future Changes

For most SDK/protocol/backend changes, run:

```bash
npm run build
npm run docs:browser-api
npm run docs:protocol
npm run check:protocol-sync
npm run typecheck
npm test
(cd rust/native-host && cargo test)
git diff --check
```

For changes touching real-browser scripts, also run:

```bash
node --check tests/scripts/real-browser-e2e.js
```

For actual installed-browser validation, only when appropriate:

```bash
npm run check:extension-installed
npm run check:native-host
npm run test:real
```

Do not assume `npm run test:real` is safe in arbitrary CI or local contexts; it requires an installed connected extension/native host and controls real Chrome tabs.

## Coding Rules For The Next Agent

- Prefer `rg` for search.
- Use `apply_patch` for focused edits.
- Do not use destructive git commands.
- Do not revert unrelated dirty changes.
- Update generated JavaScript by running build, not by hand-editing JS outputs unless there is no practical alternative.
- After changing protocol/action/schema/type contracts, update all mirrored layers:
  - `shared/types.ts`
  - `shared/browser-tool-schemas.ts`
  - `extension/action-validator.ts`
  - `agent/browserTools.ts` if tool schema changes
  - `rust/native-host/src/rpc.rs` if native validation changes
  - `shared/protocol.md`
  - generated docs/tests
- Keep `docs/codex-gap-todolist.md` honest. Do not mark incomplete parity as complete.
- Avoid fake Playwright parity. If a method is only an alias, say so. If behavior cannot be faithfully implemented, leave it unclaimed.

## Files Most Likely Needed Next

For actionability/OOPIF/real-browser continuation:

- `extension/background.ts`
- `mcp-node-repl/browser-client.ts`
- `shared/types.ts`
- `shared/browser-tool-schemas.ts`
- `extension/action-validator.ts`
- `rust/native-host/src/rpc.rs`
- `agent/browserTools.ts`
- `shared/protocol.md`
- `docs/playwright.md`
- `docs/codex-gap-todolist.md`
- `tests/browser-client-facade.test.ts`
- `tests/browser-tool-schemas.test.ts`
- `tests/scripts/real-browser-e2e.js`
