#!/usr/bin/env node

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveExtensionId } from "./extension-ids.js";

const root = process.cwd();

function parseArgs(argv) {
  const args = {
    config: path.join(root, "config", "extension-id.json"),
    extensionId: process.env.FORMAX_EXTENSION_ID || null,
    hostName: process.env.FORMAX_EXTENSION_HOST_NAME || null,
    json: false,
    manifestPath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    if (arg === "--config") args.config = path.resolve(next());
    else if (arg === "--extension-id") args.extensionId = next();
    else if (arg === "--host-name") args.hostName = next();
    else if (arg === "--manifest-path") args.manifestPath = path.resolve(next());
    else if (arg === "--json") args.json = true;
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
  console.log(`Usage: node scripts/check-native-host-manifest.js [options]

Options:
  --json                    Print machine-readable JSON
  --extension-id <id>       Override expected Chrome extension ID. Known labels: dev, prod
  --host-name <name>        Override expected native host name
  --manifest-path <path>    Native host manifest path override
  --config <path>           Extension config JSON. Default: ./config/extension-id.json
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

async function executable(filePath) {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function defaultManifestPath(hostName) {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
      `${hostName}.json`
    );
  }

  if (process.platform === "linux") {
    return path.join(
      os.homedir(),
      ".config",
      "google-chrome",
      "NativeMessagingHosts",
      `${hostName}.json`
    );
  }

  if (process.platform === "win32") {
    return path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Google",
      "Chrome",
      "User Data",
      "NativeMessagingHosts",
      `${hostName}.json`
    );
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await readJson(args.config);
  const extensionId = resolveExtensionId(args.extensionId ?? config.extensionId);
  const hostName = args.hostName ?? config.extensionHostName;
  const manifestPath = args.manifestPath ?? defaultManifestPath(hostName);
  const expectedOrigin = `chrome-extension://${extensionId}/`;
  const errors = [];
  let manifest = null;

  if (!(await exists(manifestPath))) {
    errors.push(`Native host manifest is missing: ${manifestPath}`);
  } else {
    manifest = await readJson(manifestPath);

    if (manifest.name !== hostName) {
      errors.push(`Expected manifest.name=${hostName}, got ${manifest.name}`);
    }

    if (manifest.type !== "stdio") {
      errors.push(`Expected manifest.type=stdio, got ${manifest.type}`);
    }

    if (typeof manifest.path !== "string" || manifest.path.length === 0) {
      errors.push("Manifest path is missing");
    } else if (!(await exists(manifest.path))) {
      errors.push(`Native host binary is missing: ${manifest.path}`);
    } else if (process.platform !== "win32" && !(await executable(manifest.path))) {
      errors.push(`Native host binary is not executable: ${manifest.path}`);
    }

    const origins = Array.isArray(manifest.allowed_origins)
      ? manifest.allowed_origins
      : [];

    if (!origins.includes(expectedOrigin)) {
      errors.push(`Expected allowed_origins to include ${expectedOrigin}`);
    }
  }

  const ok = errors.length === 0;
  const result = {
    ok,
    hostName,
    extensionId,
    expectedOrigin,
    manifestPath,
    manifest,
    errors,
    repairHint: ok
      ? null
      : "Run native-host/install-macos.sh or node scripts/install-formax-runtime.js with the correct --extension-id, then rerun this check.",
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${ok ? "OK" : "FAIL"} native host ${hostName}`);
    console.log(`Manifest: ${manifestPath}`);
    if (!ok) {
      for (const error of errors) console.log(`- ${error}`);
      console.log(`Repair: ${result.repairHint}`);
    }
  }

  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
