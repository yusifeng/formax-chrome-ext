# Formax

Formax connects local AI agents to Chrome through a Chrome extension and a
local runtime.

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
