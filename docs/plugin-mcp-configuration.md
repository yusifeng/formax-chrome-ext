# Plugin And MCP Configuration

This guide covers the user-facing configuration that happens after the Formax
runtime and Chrome extension are installed.

## Add The MCP Server

Installed runtime path:

```text
~/.formax/bin/formax-browser-mcp
```

macOS example:

```json
{
  "mcpServers": {
    "formax-browser": {
      "command": "/Users/<your-user>/.formax/bin/formax-browser-mcp"
    }
  }
}
```

Linux example:

```json
{
  "mcpServers": {
    "formax-browser": {
      "command": "/home/<your-user>/.formax/bin/formax-browser-mcp"
    }
  }
}
```

Restart the MCP client after adding the server.

## Enable The Skill

The installer exposes the skill at:

```text
~/.formax/plugins/cache/formax/chrome/latest/skills/control-chrome/SKILL.md
```

The legacy compatibility location remains:

```text
~/.formax/plugins/cache/formax/chrome/latest/skill/SKILL.md
```

If your agent supports custom skills, add the `skills/control-chrome/SKILL.md`
file. If it does not, paste the file contents into that agent's browser-control
system instructions.

## Configure Tool Approval Policy

If your MCP client supports per-tool approval policy, use the most restrictive
policy that still lets the Node REPL run:

- Allow the MCP `node_repl` JavaScript execution tool only for trusted local
  Formax browser-control tasks.
- Require confirmation for file uploads, browser history, clipboard reads and
  writes, sensitive typing, mutating `evaluate`, raw CDP, form submissions with
  side effects, permission grants, purchases, posts, and destructive actions.
- Do not create persistent always-allow approval for browser history or
  clipboard access.
- Keep raw CDP and mutating `evaluate` as explicitly approved diagnostic tools,
  not normal browsing primitives.
- Deny or ask on tools that expose arbitrary local filesystem reads unless the
  task needs a specific user-approved file.

Formax also enforces confirmations and policy checks in the native host and
extension backend. Client-side approval should be treated as an additional
safety layer, not the only guardrail.

## Use Only Node REPL Browser Control

The preferred Formax integration exposes browser control through JavaScript in
the persistent MCP `node_repl`:

```js
const browser = await agent.browsers.get("extension");
```

If your agent also exposes direct flat browser tools, disable them or hide them
when using this runtime. Reasons:

- The skill assumes state is stored in the persistent Node runtime.
- `browser.user.openTabs()` and `browser.user.claimTab()` provide safer user-tab
  claiming than naked tab IDs.
- Confirmation, policy, and session/finalize patterns are documented for the
  SDK object model.
- Keeping one browser-control surface avoids duplicate tab groups and mixed
  session ownership.

Use direct flat browser methods only as backward-compatible SDK aliases inside
the Node REPL, such as `browser.openUrl()` or `browser.observe()`. Do not expose
separate direct tools to the model when the node_repl object API is available.

After bootstrap, ask the runtime for the current browser-use guidance:

```js
await agent.documentation.get("browserUse");
await agent.documentation.get("tabs");
await agent.documentation.get("safety");
```

The `browserUse` topic mirrors the packaged skill's operating model: prefer
structured integrations before Chrome, reuse or claim one working tab, verify
after meaningful actions, resolve pending approvals only after user approval,
and finalize handoff or deliverable tabs as the final browser action.

## Verify Configuration

Run:

```bash
~/.formax/bin/formax-doctor
```

For machine-readable output:

```bash
~/.formax/bin/formax-doctor --json
```

Then reload the Formax extension in `chrome://extensions` or restart Chrome if
the runtime, native host manifest, or extension files changed.
