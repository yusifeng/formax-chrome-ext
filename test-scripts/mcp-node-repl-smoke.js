#!/usr/bin/env node

import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({
  name: "formax-node-repl-smoke-test",
  version: "0.1.0"
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["mcp-node-repl/server.js"],
  cwd: process.cwd(),
  stderr: "pipe"
});

transport.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
});

function toolJson(result) {
  assert.equal(result.content?.[0]?.type, "text");
  return JSON.parse(result.content[0].text);
}

try {
  await client.connect(transport);

  const list = await client.listTools();
  assert.deepEqual(
    list.tools.map((tool) => tool.name),
    ["js", "js_add_node_module_dir", "js_reset"]
  );

  let result = toolJson(
    await client.callTool({
      name: "js",
      arguments: {
        code: "globalThis.answer = 41; nodeRepl.write('ready')"
      }
    })
  );
  assert.equal(result.output, "ready");

  result = toolJson(
    await client.callTool({
      name: "js",
      arguments: {
        code: "globalThis.answer += 1; return globalThis.answer"
      }
    })
  );
  assert.equal(result.result, 42);

  result = toolJson(
    await client.callTool({
      name: "js",
      arguments: {
        code: "const os = await import('node:os'); return os.platform()"
      }
    })
  );
  assert.equal(typeof result.result, "string");

  result = toolJson(
    await client.callTool({
      name: "js",
      arguments: {
        code: [
          "const runtime = await import('./mcp-node-repl/browser-client.js');",
          "await runtime.setupBrowserRuntime({ globals: globalThis });",
          "const extensionBrowser = await agent.browsers.get('extension');",
          "return {",
          "  browsers: agent.browsers.list(),",
          "  sameBrowser: extensionBrowser === browser,",
          "  hasOpenUrl: typeof browser.openUrl === 'function',",
          "  hasReloadExtension: typeof browser.reloadExtension === 'function',",
          "  hasRawCdp: typeof browser.rawCdp === 'function',",
          "  hasListTabs: typeof browser.listTabs === 'function',",
          "  hasGetTab: typeof browser.getTab === 'function',",
          "  hasWaitForEvent: typeof browser.waitForEvent === 'function',",
          "  hasCapabilities: typeof browser.getCapabilities === 'function',",
          "  hasDevLogs: typeof browser.getDevLogs === 'function',",
          "  hasLocatorQuery: typeof browser.locatorQuery === 'function',",
          "  hasLocatorAction: typeof browser.locatorAction === 'function',",
          "  hasLocatorWait: typeof browser.locatorWait === 'function',",
          "  hasTabsFacade: typeof browser.tabs?.new === 'function',",
          "  hasUserFacade: typeof browser.user?.claimTab === 'function',",
          "  hasEventsFacade: typeof browser.events?.wait === 'function',",
          "  hasDownloadsFacade: typeof browser.downloads?.waitFor === 'function',",
          "  hasCapabilitiesFacade: typeof browser.capabilities?.has === 'function',",
          "  hasSemanticTabMethods: (() => {",
          "    const proto = Object.getPrototypeOf(browser.tabs);",
          "    return typeof browser.tabs?.new === 'function';",
          "  })(),",
          "  toolCount: browser.tools.length",
          "};"
        ].join("\n")
      }
    })
  );
  assert.deepEqual(result.result.browsers, ["extension"]);
  assert.equal(result.result.sameBrowser, true);
  assert.equal(result.result.hasOpenUrl, true);
  assert.equal(result.result.hasReloadExtension, true);
  assert.equal(result.result.hasRawCdp, true);
  assert.equal(result.result.hasListTabs, true);
  assert.equal(result.result.hasGetTab, true);
  assert.equal(result.result.hasWaitForEvent, true);
  assert.equal(result.result.hasCapabilities, true);
  assert.equal(result.result.hasDevLogs, true);
  assert.equal(result.result.hasLocatorQuery, true);
  assert.equal(result.result.hasLocatorAction, true);
  assert.equal(result.result.hasLocatorWait, true);
  assert.equal(result.result.hasTabsFacade, true);
  assert.equal(result.result.hasUserFacade, true);
  assert.equal(result.result.hasEventsFacade, true);
  assert.equal(result.result.hasDownloadsFacade, true);
  assert.equal(result.result.hasCapabilitiesFacade, true);
  assert.equal(result.result.hasSemanticTabMethods, true);
  assert.equal(result.result.toolCount > 0, true);

  result = toolJson(
    await client.callTool({
      name: "js_add_node_module_dir",
      arguments: {
        path: "./node_modules"
      }
    })
  );
  assert.equal(result, true);

  result = toolJson(
    await client.callTool({
      name: "js_reset",
      arguments: {}
    })
  );
  assert.deepEqual(result, { ok: true });

  result = toolJson(
    await client.callTool({
      name: "js",
      arguments: {
        code: "return typeof globalThis.answer"
      }
    })
  );
  assert.equal(result.result, "undefined");

  console.log("MCP node_repl smoke test passed.");
} finally {
  await client.close();
}
