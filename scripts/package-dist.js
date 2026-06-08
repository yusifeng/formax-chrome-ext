#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

const copyEntries = [
  ["README.md", "README.md"],
  ["config", "config"],
  ["skill", "skill"],
  ["build/extension-host", "extension-host"],
  ["mcp-node-repl", "mcp-node-repl"],
  ["agent/browserTools.js", "agent/browserTools.js"],
  ["shared", "shared"],
  ["extension", "extension"],
  ["scripts/install-formax-runtime.js", "install.js"],
  ["native-host/com.formax.browserhost.json.example", "native-host/com.formax.browserhost.json.example"],
  ["native-host/install-linux.sh", "native-host/install-linux.sh"],
  ["native-host/install-macos.sh", "native-host/install-macos.sh"],
  ["native-host/install-windows.reg", "native-host/install-windows.reg"],
  ["scripts/check-extension-installed.js", "scripts/check-extension-installed.js"],
  ["scripts/check-native-host-manifest.js", "scripts/check-native-host-manifest.js"],
  ["tests/scripts/llm-node-repl-chat.js", "tests/scripts/llm-node-repl-chat.js"],
  ["tests/scripts/mcp-node-repl-smoke.js", "tests/scripts/mcp-node-repl-smoke.js"],
  ["docs/prompts/handoff.md", "docs/prompts/handoff.md"]
];

const ignoredExtensions = new Set([".ts", ".map"]);
const ignoredNames = new Set(["com.example.agentbrowser.json", "com.formax.browserhost.json"]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyFiltered(src, dest) {
  const stat = await fs.stat(src);

  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoredNames.has(entry.name) || ignoredExtensions.has(path.extname(entry.name))) {
        continue;
      }

      await copyFiltered(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }

  if (ignoredNames.has(path.basename(src)) || ignoredExtensions.has(path.extname(src))) {
    return;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const rootPackage = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(dist, { recursive: true });

  const copied = [];
  const missing = [];

  for (const [from, to] of copyEntries) {
    const src = path.join(root, from);
    const dest = path.join(dist, to);

    if (!(await exists(src))) {
      missing.push(from);
      continue;
    }

    await copyFiltered(src, dest);
    copied.push(to);
  }

  await writeJson(path.join(dist, "package.json"), {
    name: "formax-runtime-dist",
    version: rootPackage.version,
    private: true,
    type: "module",
    scripts: {
      "install:formax-runtime": "node install.js",
      "mcp:node-repl": "node mcp-node-repl/server.js",
      "chat:node-repl": "node tests/scripts/llm-node-repl-chat.js",
      "test:mcp-node-repl": "node tests/scripts/mcp-node-repl-smoke.js"
    },
    dependencies: rootPackage.dependencies || {}
  });
  await fs.copyFile(path.join(root, "package-lock.json"), path.join(dist, "package-lock.json"));
  copied.push("package-lock.json");

  await writeJson(path.join(dist, "DIST-MANIFEST.json"), {
    generatedAt: new Date().toISOString(),
    sourcePackage: {
      name: rootPackage.name,
      version: rootPackage.version
    },
    products: {
      installer: "install.js",
      mcpServer: "mcp-node-repl/server.js",
      chromeExtension: "extension/manifest.json",
      nativeHost: "extension-host/<platform>/<arch>/extension-host",
      browserClientSdk: "mcp-node-repl/browser-client.js",
      skill: "skill/SKILL.md",
      debugHarness: "tests/scripts/llm-node-repl-chat.js"
    },
    copied,
    missing
  });

  if (missing.length > 0) {
    console.warn(`WARN missing optional package entries: ${missing.join(", ")}`);
  }

  console.log(`Packaged Formax runtime into ${dist}`);
}

await main();
