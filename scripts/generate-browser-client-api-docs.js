#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "mcp-node-repl/browser-client.ts");
const outputPath = path.join(root, "docs/browser-client-api.md");

const exportedTypes = [
  "BrowserRuntimeAgent",
  "BrowserClient",
  "BrowserTabsFacade",
  "BrowserUserFacade",
  "BrowserEventsFacade",
  "BrowserDownloadsFacade",
  "BrowserDownloadListResult",
  "BrowserDownloadWaitResult",
  "BrowserDownloadHandle",
  "BrowserCapabilitiesFacade",
  "BrowserCapabilityHandle",
  "BrowserDevFacade",
  "TabHandle",
  "TabPlaywrightFacade",
  "TabCuaFacade",
  "TabDomCuaFacade",
  "VisibleDomNode",
  "VisibleDomSnapshot",
  "TabClipboardFacade",
  "LocatorHandle",
  "FrameLocatorHandle"
];

const source = await fs.readFile(sourcePath, "utf8");

const examples = {
  BrowserRuntimeAgent: [
    "```js",
    "const browser = await agent.browsers.get(\"extension\");",
    "await browser.documentation();",
    "```"
  ],
  BrowserClient: [
    "```js",
    "const health = await browser.health();",
    "const tab = await browser.tabs.new(\"https://example.com\");",
    "await tab.waitForLoadState(\"load\");",
    "```"
  ],
  BrowserTabsFacade: [
    "```js",
    "globalThis.__activeBrowserTab ||= await browser.tabs.new();",
    "const tab = globalThis.__activeBrowserTab;",
    "```"
  ],
  BrowserUserFacade: [
    "```js",
    "const openTabs = await browser.user.openTabs({ currentWindow: true });",
    "const candidate = openTabs.find((item) => /github/i.test(`${item.title} ${item.url}`));",
    "if (candidate) globalThis.__activeBrowserTab = await browser.user.claimTab(candidate);",
    "```"
  ],
  BrowserEventsFacade: [
    "```js",
    "const event = await browser.events.waitFor({ name: \"downloadCompleted\", timeoutMs: 30000 });",
    "const recent = await browser.events.get({ limit: 20 });",
    "```"
  ],
  BrowserDownloadsFacade: [
    "```js",
    "const result = await browser.downloads.wait({ filenameContains: \".csv\", timeoutMs: 30000 });",
    "console.log(result.download?.suggestedFilename(), result.download?.path());",
    "```"
  ],
  BrowserDownloadListResult: [
    "```js",
    "const { downloads } = await browser.downloads.list({ state: \"complete\", limit: 10 });",
    "console.log(downloads.map((download) => download.suggestedFilename()));",
    "```"
  ],
  BrowserDownloadWaitResult: [
    "```js",
    "const { download, timedOut } = await browser.downloads.wait({ urlContains: \"report\" });",
    "if (!timedOut) console.log(download?.path());",
    "```"
  ],
  BrowserDownloadHandle: [
    "```js",
    "const download = await tab.playwright.waitForEvent(\"download\", { timeoutMs: 30000 });",
    "console.log(download.suggestedFilename(), download.path(), download.toJSON());",
    "```"
  ],
  BrowserCapabilitiesFacade: [
    "```js",
    "const capabilities = await browser.capabilities.list();",
    "console.log(capabilities.map((capability) => capability.id));",
    "```"
  ],
  BrowserCapabilityHandle: [
    "```js",
    "const screenshots = await browser.capabilities.get(\"tab.screenshot\");",
    "console.log(screenshots.available, screenshots.reason);",
    "```"
  ],
  BrowserDevFacade: [
    "```js",
    "const logs = await browser.dev.logs({ limit: 20 });",
    "console.log(logs);",
    "```"
  ],
  TabHandle: [
    "```js",
    "await tab.goto(\"https://example.com\");",
    "const observed = await tab.observe();",
    "console.log(observed.url);",
    "```"
  ],
  TabPlaywrightFacade: [
    "```js",
    "const downloadPromise = tab.playwright.waitForEvent(\"download\", { timeoutMs: 30000 });",
    "await tab.getByRole(\"link\", { name: \"Download\" }).click();",
    "const download = await downloadPromise;",
    "```"
  ],
  TabCuaFacade: [
    "```js",
    "await tab.cua.click({ x: 120, y: 240 });",
    "await tab.cua.keypress({ keys: [\"Enter\"] });",
    "```"
  ],
  TabDomCuaFacade: [
    "```js",
    "const snapshot = await tab.dom_cua.snapshot();",
    "const target = snapshot.nodes.find((node) => /Submit/i.test(node.name || \"\"));",
    "if (target) await tab.dom_cua.click({ node_id: target.node_id });",
    "```"
  ],
  VisibleDomNode: [
    "```js",
    "const button = snapshot.nodes.find((node) => node.role === \"button\");",
    "console.log(button?.node_id, button?.box);",
    "```"
  ],
  VisibleDomSnapshot: [
    "```js",
    "const snapshot = await tab.dom_cua.snapshot();",
    "console.log(snapshot.url, snapshot.nodes.length);",
    "```"
  ],
  TabClipboardFacade: [
    "```js",
    "const text = await tab.clipboard.readText({ confirmed: true });",
    "await tab.clipboard.writeText(text.trim(), { confirmed: true });",
    "```"
  ],
  LocatorHandle: [
    "```js",
    "const search = tab.getByPlaceholder(\"Search\");",
    "await search.fill(\"Formax browser runtime\");",
    "await search.press(\"Enter\");",
    "```"
  ],
  FrameLocatorHandle: [
    "```js",
    "const frame = tab.frameLocator(\"iframe[name='login']\");",
    "console.log(frame.toJSON()); // supported: false until iframe locators are implemented",
    "```"
  ]
};

const unsupportedFeatures = [
  ["Isolated browser contexts", "The backend controls the user's real Chrome profile through an extension, not a launched browser engine."],
  ["Bundled browser launch/download management", "Chrome is installed and managed by the user."],
  ["OS-level Computer Use", "Formax does not control native desktop apps or browser chrome UI."],
  ["Chrome internal pages", "`chrome://`, `edge://`, `file://`, and extension pages are blocked by MVP policy unless a specific future capability changes that boundary."],
  ["Arbitrary profile-file access", "The runtime must not read Chrome profile files, cookies, passwords, tokens, or local storage secrets."],
  ["Persistent approval for clipboard/history", "Clipboard and history are sensitive telemetry and require confirmation for every request."],
  ["Bypassing blocked hosts", "Blocked host policy applies to navigation, interaction, uploads, evaluate, raw CDP, downloads, and history."],
  ["Native Chrome UI automation", "Permission bubbles, extension popups, and OS file pickers are outside the page DOM and require user action."]
];

function extractExportedType(name) {
  const marker = `export type ${name} =`;
  const start = source.indexOf(marker);

  if (start < 0) {
    throw new Error(`Cannot find exported type ${name} in ${sourcePath}`);
  }

  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) {
    throw new Error(`Cannot find body for exported type ${name}`);
  }

  let depth = 0;
  let bodyEnd = -1;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        bodyEnd = index + 1;
        break;
      }
    }
  }

  if (bodyEnd < 0) {
    throw new Error(`Cannot find end of exported type ${name}`);
  }

  let end = bodyEnd;
  while (/\s/.test(source[end] ?? "")) {
    end += 1;
  }
  if (source[end] === ";") {
    end += 1;
  }

  return source.slice(start, end);
}

const sections = exportedTypes.map((name) => {
  const declaration = extractExportedType(name);
  const section = [
    `## ${name}`,
    "",
    "```ts",
    declaration,
    "```"
  ];
  if (examples[name]) {
    section.push("", "Example:", "", ...examples[name]);
  }
  section.push("");
  return section.join("\n");
});

const unsupportedSection = [
  "## Unsupported Features And Reasons",
  "",
  "| Feature | Reason |",
  "| --- | --- |",
  ...unsupportedFeatures.map(([feature, reason]) => `| ${feature} | ${reason} |`)
].join("\n");

const content = [
  "# Browser Client API",
  "",
  "<!-- Generated by `node scripts/generate-browser-client-api-docs.js`. Do not edit by hand. -->",
  "",
  "This file documents the public Formax browser-client SDK facade exposed by",
  "`mcp-node-repl/browser-client.ts`. It describes the TypeScript surface area,",
  "including Codex-compatible namespaces. Runtime availability still depends on",
  "`browser.capabilities` and `tab.capabilities`; unsupported surfaces are kept",
  "explicit so callers fail with clear errors instead of silently taking a wrong",
  "path.",
  "",
  "Regenerate after SDK facade changes:",
  "",
  "```bash",
  "npm run docs:browser-api",
  "```",
  "",
  ...sections,
  unsupportedSection,
  ""
].join("\n");

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, content);
console.log(`Generated ${path.relative(root, outputPath)}`);
