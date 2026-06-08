#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.dirname(scriptDir);
const defaultInstallRoot = path.join(os.homedir(), ".formax", "plugins", "cache", "formax", "chrome");
const defaultBinDir = path.join(os.homedir(), ".formax", "bin");

function parseArgs(argv) {
  const args = {
    binDir: defaultBinDir,
    dryRun: false,
    installRoot: defaultInstallRoot,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    if (arg === "--bin-dir") args.binDir = path.resolve(next());
    else if (arg === "--install-root") args.installRoot = path.resolve(next());
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage: formax-uninstall [options]

Options:
  --install-root <path>  Runtime cache root. Default: ~/.formax/plugins/cache/formax/chrome
  --bin-dir <path>       Wrapper directory. Default: ~/.formax/bin
  --dry-run              Print planned removals without changing files
`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function nativeHostManifestPath(hostName) {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", `${hostName}.json`);
  }
  if (process.platform === "linux") {
    return path.join(os.homedir(), ".config", "google-chrome", "NativeMessagingHosts", `${hostName}.json`);
  }
  if (process.platform === "win32") {
    return path.join(os.homedir(), "AppData", "Local", "Formax", "NativeMessagingHosts", `${hostName}.json`);
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

async function removePath(filePath, dryRun, removed) {
  if (!(await exists(filePath))) return;
  removed.push(filePath);
  if (!dryRun) await fs.rm(filePath, { recursive: true, force: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.join(runtimeRoot, "config", "extension-id.json");
  const config = await readJson(configPath);
  const hostName = process.env.FORMAX_EXTENSION_HOST_NAME ?? config.extensionHostName;
  const manifestPath = nativeHostManifestPath(hostName);
  const removed = [];

  if (await exists(manifestPath)) {
    const manifest = await readJson(manifestPath);
    const manifestHostPath = typeof manifest.path === "string" ? path.resolve(manifest.path) : "";
    const installRoot = path.resolve(args.installRoot);
    if (manifestHostPath === "" || manifestHostPath.startsWith(`${installRoot}${path.sep}`)) {
      await removePath(manifestPath, args.dryRun, removed);
    } else {
      console.log(`Skipping native host manifest because it points outside ${installRoot}: ${manifestHostPath}`);
    }
  }

  for (const name of ["formax-browser-mcp", "formax-doctor", "formax-uninstall"]) {
    await removePath(path.join(args.binDir, name), args.dryRun, removed);
  }

  await removePath(args.installRoot, args.dryRun, removed);

  if (removed.length === 0) {
    console.log("No Formax runtime files found to remove.");
  } else {
    console.log(`${args.dryRun ? "Would remove" : "Removed"} Formax runtime files:`);
    for (const filePath of removed) console.log(`- ${filePath}`);
  }

  console.log("Remove the Formax Chrome extension from Chrome separately if desired.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
