# Formax

Formax connects local AI agents to Chrome through a Chrome extension and a
local runtime.

Formax currently supports the Chrome extension backend. It does not provide an
in-app browser backend or OS-level Computer Use fallback. See
`docs/backend-boundaries.md` for the supported backend matrix and connector
preference policy.

Browser API docs start at `docs/api.md`. The generated SDK reference is
`docs/browser-client-api.md`.

MCP and skill configuration details live in
`docs/plugin-mcp-configuration.md`.

## Install

### 1. Install the Formax runtime

Run the installer:

```bash
curl -fsSL https://curl-scripts.vercel.app/formax/install.sh | bash
```

The installer downloads the Formax runtime, installs it under `~/.formax`, and
creates the local commands and skill file:

```text
~/.formax/bin/formax-browser-mcp
~/.formax/bin/formax-doctor
~/.formax/bin/formax-uninstall
~/.formax/skills/formax-browser/SKILL.md
```

### 2. Install the Chrome extension

Install Formax from the Chrome Web Store:

[Install Formax for Chrome](https://curl-scripts.vercel.app/formax/chrome)

After installing, open `chrome://extensions`, make sure Formax is enabled, then
reload the extension. Click the Formax toolbar icon; the status should show
`Connected`.

If it does not connect, run:

```bash
~/.formax/bin/formax-doctor
```

See `docs/chrome-troubleshooting.md` for extension, native host, Chrome profile,
local unpacked extension ID, file URL access, debugger detach, and blocked-site
recovery steps.

### 3. Configure the MCP server

Add the Formax MCP server to your MCP client.

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

Restart your MCP client after adding the server.

If browser-client calls fail after the MCP server starts, see
`docs/api-troubleshooting.md` for health checks, confirmation failures, policy
blocks, stale handles, upload validation, and diagnostic guidance.

### 4. Enable the skill

The installer places the Formax browser skill at:

```text
~/.formax/skills/formax-browser/SKILL.md
```

If your agent supports custom skills, add this file. If it does not, use the
file contents as the browser-control instructions for that agent.

## Uninstall

Run:

```bash
~/.formax/bin/formax-uninstall
```

Then remove the Formax extension from Chrome.
