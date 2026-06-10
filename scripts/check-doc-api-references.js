#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiDocPath = path.join(root, "docs", "browser-client-api.md");
const runtimeSourcePath = path.join(root, "mcp-node-repl", "browser-client.ts");
const defaultTargets = [
  path.join(root, "skill", "SKILL.md"),
  path.join(root, "docs", "api.md"),
  path.join(root, "docs", "api-troubleshooting.md"),
  path.join(root, "docs", "chrome-troubleshooting.md"),
  path.join(root, "docs", "file-management.md"),
  path.join(root, "docs", "playwright.md"),
  path.join(root, "docs", "screenshots.md"),
];

const apiReferencePattern = /\b(?:agent|browser|tab|locator|frameLocator)\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g;

const ignoredReferences = new Set([
  "browser-client-api",
]);

function relative(filePath) {
  return path.relative(root, filePath) || filePath;
}

function extractReferences(text) {
  return new Set(text.match(apiReferencePattern) ?? []);
}

function extractTypeBlock(source, typeName) {
  const match = source.match(new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`));
  return match?.[1] ?? "";
}

function extractMethodNames(blockText) {
  const names = new Set();
  const pattern = /^\s*(?:readonly\s+)?([A-Za-z0-9_]+)\s*(?:\(|:)/gm;
  let match;

  while ((match = pattern.exec(blockText)) !== null) {
    names.add(match[1]);
  }

  return names;
}

function extractNestedMethodNames(blockText, propertyName) {
  const match = blockText.match(new RegExp(`${propertyName}: \\{([\\s\\S]*?)\\n\\s*\\};`));
  return extractMethodNames(match?.[1] ?? "");
}

function addPrefixedMethods(allowed, prefix, methodNames) {
  allowed.add(prefix);
  for (const name of methodNames) {
    allowed.add(`${prefix}.${name}`);
  }
}

function allowedFromSource(apiDocText, runtimeSourceText) {
  const allowed = new Set(extractReferences(apiDocText));

  const runtimeAgentBlock = extractTypeBlock(runtimeSourceText, "BrowserRuntimeAgent");
  addPrefixedMethods(allowed, "agent.browsers", extractNestedMethodNames(runtimeAgentBlock, "browsers"));
  addPrefixedMethods(allowed, "agent.documentation", extractNestedMethodNames(runtimeAgentBlock, "documentation"));

  const facadeTypeMap = [
    ["BrowserTabsFacade", "browser.tabs"],
    ["BrowserUserFacade", "browser.user"],
    ["BrowserEventsFacade", "browser.events"],
    ["BrowserDownloadsFacade", "browser.downloads"],
    ["BrowserCapabilitiesFacade", "browser.capabilities"],
    ["BrowserDevFacade", "browser.dev"],
    ["TabPlaywrightFacade", "tab.playwright"],
    ["TabCuaFacade", "tab.cua"],
    ["TabDomCuaFacade", "tab.dom_cua"],
    ["TabClipboardFacade", "tab.clipboard"],
    ["TabHandle", "tab"],
    ["LocatorHandle", "locator"],
    ["FrameLocatorHandle", "frameLocator"],
    ["BrowserClient", "browser"],
  ];

  for (const [typeName, prefix] of facadeTypeMap) {
    addPrefixedMethods(allowed, prefix, extractMethodNames(extractTypeBlock(runtimeSourceText, typeName)));
  }

  // Common top-level surfaces that may be described without a dedicated
  // explicit example in the generated API reference.
  for (const value of [
    "agent.browsers",
    "agent.documentation",
    "browser.tabs",
    "browser.user",
    "browser.events",
    "browser.downloads",
    "browser.capabilities",
    "browser.dev",
    "tab.playwright",
    "tab.cua",
    "tab.dom_cua",
    "tab.clipboard",
    "tab.dev",
    "locator",
    "frameLocator",
  ]) {
    allowed.add(value);
  }

  return allowed;
}

function isAllowedReference(reference, allowed) {
  if (ignoredReferences.has(reference)) return true;
  if (allowed.has(reference)) return true;

  for (const candidate of allowed) {
    if (candidate.startsWith(`${reference}.`)) return true;
  }

  return false;
}

function findLines(text, reference) {
  const lines = text.split("\n");
  const hits = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(reference)) {
      hits.push({
        line: index + 1,
        text: lines[index].trim(),
      });
    }
  }

  return hits;
}

async function main() {
  const [apiDoc, runtimeSource] = await Promise.all([
    fs.readFile(apiDocPath, "utf8"),
    fs.readFile(runtimeSourcePath, "utf8"),
  ]);
  const allowed = allowedFromSource(apiDoc, runtimeSource);
  const targets = process.argv.slice(2).map((value) => path.resolve(root, value));
  const files = targets.length > 0 ? targets : defaultTargets;
  const failures = [];

  for (const filePath of files) {
    const text = await fs.readFile(filePath, "utf8");
    const references = extractReferences(text);
    const unknown = [...references]
      .filter((reference) => !isAllowedReference(reference, allowed))
      .sort();

    if (unknown.length === 0) continue;

    failures.push({
      filePath,
      unknown: unknown.map((reference) => ({
        reference,
        lines: findLines(text, reference),
      })),
    });
  }

  if (failures.length === 0) {
      console.log(
        `OK: checked ${files.length} documentation files against ${relative(apiDocPath)} and ${relative(runtimeSourcePath)}`
      );
    return;
  }

  for (const failure of failures) {
    console.error(`Unknown API references in ${relative(failure.filePath)}:`);
    for (const entry of failure.unknown) {
      console.error(`  - ${entry.reference}`);
      for (const line of entry.lines) {
        console.error(`    ${line.line}: ${line.text}`);
      }
    }
  }

  process.exitCode = 1;
}

await main();
