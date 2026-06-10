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
  "BrowserDownloadMediaResult",
  "BrowserDownloadHandle",
  "BrowserFileChooserHandle",
  "BrowserCapabilitiesFacade",
  "BrowserCapabilityHandle",
  "BrowserDevFacade",
  "TabHandle",
  "TabPlaywrightFacade",
  "TabPlaywrightKeyboardFacade",
  "TabPlaywrightMouseFacade",
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
    "nodeRepl.write(await browser.documentation());",
    "console.log(agent.documentation.list());",
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
    "await browser.tabs.finalize({ keep: [tab] });",
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
    "const event = await browser.events.wait({ name: \"downloadCompleted\", timeoutMs: 30000 });",
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
    "const { download } = await browser.downloads.wait({ urlContains: \"report\", timeoutMs: 30000 });",
    "console.log(download?.path());",
    "```"
  ],
  BrowserDownloadMediaResult: [
    "```js",
    "const result = await tab.locator(\"img.hero\").downloadMedia({ waitForCompletion: true });",
    "console.log(result.media.url, result.download?.path());",
    "```"
  ],
  BrowserDownloadHandle: [
    "```js",
    "const download = await tab.playwright.waitForEvent(\"download\", { timeoutMs: 30000 });",
    "console.log(download.suggestedFilename(), download.path(), download.toJSON());",
    "```"
  ],
  BrowserFileChooserHandle: [
    "```js",
    "const chooser = await tab.playwright.waitForEvent(\"filechooser\", { timeoutMs: 10000 });",
    "await chooser.setFiles(\"/absolute/path/file.txt\");",
    "console.log(chooser.isMultiple());",
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
    "console.log(await screenshots.documentation());",
    "```"
  ],
  BrowserDevFacade: [
    "```js",
    "const logs = await browser.dev.logs({ limit: 20 });",
    "const diagnostics = await browser.dev.diagnostics();",
    "```"
  ],
  TabHandle: [
    "```js",
    "await tab.goto(\"https://example.com\");",
    "const observed = await tab.observe();",
    "console.log(observed.url, observed.elements?.length);",
    "```"
  ],
  TabPlaywrightFacade: [
    "```js",
    "const snapshot = await tab.playwright.domSnapshot();",
    "console.log(snapshot.slice(0, 2000));",
    "const title = await tab.playwright.evaluate(() => document.title, undefined, { mode: \"read\" });",
    "```"
  ],
  TabPlaywrightKeyboardFacade: [
    "```js",
    "await tab.playwright.keyboard.press(\"Enter\");",
    "await tab.playwright.keyboard.type(\"Formax\");",
    "```"
  ],
  TabPlaywrightMouseFacade: [
    "```js",
    "await tab.playwright.mouse.click(120, 240);",
    "await tab.playwright.mouse.wheel(0, 600);",
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
    "const snapshot = await tab.dom_cua.get_visible_dom();",
    "const target = snapshot.nodes.find((node) => /Submit/i.test(`${node.role} ${node.name}`));",
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
    "const snapshot = await tab.dom_cua.get_visible_dom();",
    "console.log(snapshot.url, snapshot.nodes.length, snapshot.text.slice(0, 200));",
    "```"
  ],
  TabClipboardFacade: [
    "```js",
    "const text = await tab.clipboard.readText();",
    "await tab.clipboard.writeText(text.trim());",
    "```"
  ],
  LocatorHandle: [
    "```js",
    "const search = tab.getByPlaceholder(\"Search\");",
    "const count = await search.count();",
    "if (count !== 1) throw new Error(`Expected one search input, found ${count}.`);",
    "await search.fill(\"Formax browser runtime\");",
    "await search.press(\"Enter\");",
    "```"
  ],
  FrameLocatorHandle: [
    "```js",
    "const frame = tab.frameLocator(\"iframe[name='login']\");",
    "await frame.getByRole(\"button\", { name: \"Sign in\" }).click();",
    "```"
  ]
};

const ownershipRows = [
  ["`agent.documentation`", "Read packaged markdown docs by extensionless name."],
  ["`agent.browsers`", "Discover and select the `extension` backend."],
  ["`browser.tabs`", "Create, list, switch, close, claim current, and finalize controlled tabs."],
  ["`browser.user`", "Inspect and claim user-opened tabs, read redacted history, name/finalize/handoff/stop sessions."],
  ["`browser.events`", "Read, wait for, mark, and clear buffered browser events."],
  ["`browser.downloads`", "List and wait for Chrome downloads."],
  ["`browser.capabilities` / `tab.capabilities`", "Discover optional capability availability and documentation."],
  ["`tab`", "Page navigation, waits, observation, locators, screenshots, clipboard, uploads, evaluate, dialogs, and CDP."],
  ["`tab.playwright`", "Playwright-shaped aliases over the governed tab API. Limited subset only."],
  ["`tab.cua`", "Coordinate and keyboard/mouse actions."],
  ["`tab.dom_cua`", "Visible DOM snapshots and node-id based actions through `get_visible_dom()`."],
  ["`locator`", "Scoped element reads and actions created from tab or frame locator constructors."]
];

const guardrails = [
  "Only call methods listed in this file or another packaged Formax doc.",
  "`tab.observe()` returns a structured object, not a string.",
  "`tab.playwright.domSnapshot()` returns a string snapshot.",
  "`tab.dom_cua.get_visible_dom()` is the visible DOM snapshot method; there is no DOM CUA `snapshot` alias.",
  "Observed `ref`, `node_id`, and `selectorCandidates` are runtime handles and hints, not DOM attributes.",
  "Use `tab.evaluate(string, options)` for string scripts and `tab.playwright.evaluate(function, arg, options)` for Playwright-shaped function form.",
  "Check locator uniqueness with `count()` before meaningful actions when uniqueness is not obvious.",
  "After timeout, strict-mode failure, selector parse error, stale ref, or unexpected mutation, take a fresh snapshot and rebuild the locator."
];

const unsupportedFeatures = [
  ["Full upstream Playwright", "Formax exposes a documented subset only. Do not call undocumented Playwright methods."],
  ["Isolated browser contexts", "The backend controls the user's real Chrome profile through an extension, not a launched browser engine."],
  ["Bundled browser launch/download management", "Chrome is installed and managed by the user."],
  ["OS-level Computer Use", "Formax does not control native desktop apps or browser chrome UI."],
  ["Chrome internal pages", "`chrome://`, `edge://`, `file://`, and extension pages are blocked by MVP policy unless a specific future capability changes that boundary."],
  ["Arbitrary profile-file access", "The runtime must not read Chrome profile files, cookies, passwords, tokens, or local storage secrets."],
  ["Bookmarks", "Bookmarks are intentionally not exposed."],
  ["Browser/system notifications", "Browser/system notifications are intentionally not exposed."],
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

const content = [
  "# Browser Client API",
  "",
  "<!-- Generated by `node scripts/generate-browser-client-api-docs.js`. Do not edit by hand. -->",
  "",
  "This is the exact public Formax browser-client SDK surface exposed by",
  "`mcp-node-repl/browser-client.ts`. Use it when you need method ownership,",
  "signatures, and supported object shapes. For interaction strategy, read",
  "`docs/playwright.md`; for runtime setup, read `docs/api.md`.",
  "",
  "Regenerate after SDK facade changes:",
  "",
  "```bash",
  "npm run docs:browser-api",
  "```",
  "",
  "## Operating Contract",
  "",
  ...guardrails.map((item) => `- ${item}`),
  "",
  "## Surface Ownership",
  "",
  "| Surface | Owns |",
  "| --- | --- |",
  ...ownershipRows.map(([surface, owns]) => `| ${surface} | ${owns} |`),
  "",
  "## Common Starting Pattern",
  "",
  "```js",
  "const browser = await agent.browsers.get(\"extension\");",
  "globalThis.__activeBrowserTab ||= await browser.tabs.new();",
  "const tab = globalThis.__activeBrowserTab;",
  "",
  "const snapshot = await tab.playwright.domSnapshot();",
  "console.log(snapshot.slice(0, 2000));",
  "```",
  "",
  "## Type Reference",
  "",
  ...sections,
  "## Unsupported Features And Reasons",
  "",
  "| Feature | Reason |",
  "| --- | --- |",
  ...unsupportedFeatures.map(([feature, reason]) => `| ${feature} | ${reason} |`),
  ""
].join("\n");

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, content);
console.log(`Generated ${path.relative(root, outputPath)}`);
