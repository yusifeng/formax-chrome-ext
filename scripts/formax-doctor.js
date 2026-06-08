#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.dirname(scriptDir);

function parseArgs(argv) {
  const args = {
    chromeUserDataDir: null,
    extensionId: process.env.FORMAX_EXTENSION_ID || null,
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

    if (arg === "--chrome-user-data-dir") args.chromeUserDataDir = path.resolve(next());
    else if (arg === "--extension-id") args.extensionId = next();
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
  console.log(`Usage: formax-doctor [options]

Options:
  --json                         Print machine-readable JSON
  --extension-id <id>            Override expected Chrome extension ID
  --chrome-user-data-dir <path>  Chrome user data directory override
  --manifest-path <path>         Native host manifest path override
`);
}

async function runJsonCheck(scriptName, extraArgs) {
  const scriptPath = path.join(scriptDir, scriptName);
  const args = [scriptPath, "--json", "--config", path.join(runtimeRoot, "config", "extension-id.json"), ...extraArgs];

  try {
    const { stdout } = await execFileAsync(process.execPath, args, {
      cwd: runtimeRoot,
      maxBuffer: 1024 * 1024 * 10,
    });
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? error.stdout : null;
    if (typeof stdout === "string" && stdout.trim()) {
      try {
        return JSON.parse(stdout);
      } catch {
        // Fall through to the structured wrapper below.
      }
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeExtension(result) {
  if (result.ok) {
    return `Extension: OK (${result.enabledProfileCount} enabled profile${result.enabledProfileCount === 1 ? "" : "s"})`;
  }

  const installed = Number(result.installedProfileCount ?? 0);
  const enabled = Number(result.enabledProfileCount ?? 0);
  if (installed > 0 && enabled === 0) {
    return "Extension: FAIL (installed but disabled in Chrome profiles)";
  }
  return "Extension: FAIL (not enabled for the expected extension ID)";
}

function summarizeNativeHost(result) {
  if (result.ok) return `Native host: OK (${result.hostName})`;
  return `Native host: FAIL (${result.hostName || "unknown host"})`;
}

function printHuman(result) {
  console.log("Formax doctor");
  console.log(summarizeExtension(result.extension));
  console.log(summarizeNativeHost(result.nativeHost));

  if (!result.ok) {
    console.log("");
    console.log("Repair hints:");
    if (!result.extension.ok) {
      console.log(`- ${result.extension.repairHint || "Install or enable the Formax Chrome extension."}`);
      console.log("- If you are testing a local unpacked extension, rerun the runtime installer with --extension-id <chrome-extension-id>.");
    }
    if (!result.nativeHost.ok) {
      console.log(`- ${result.nativeHost.repairHint || "Reinstall the Formax runtime to rewrite the native host manifest."}`);
    }
    console.log("- After rebuilding or reinstalling extension files, reload Formax in chrome://extensions or restart Chrome.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sharedArgs = [];
  if (args.extensionId) sharedArgs.push("--extension-id", args.extensionId);

  const extensionArgs = [...sharedArgs];
  if (args.chromeUserDataDir) extensionArgs.push("--chrome-user-data-dir", args.chromeUserDataDir);

  const nativeHostArgs = [...sharedArgs];
  if (args.manifestPath) nativeHostArgs.push("--manifest-path", args.manifestPath);

  const [extension, nativeHost] = await Promise.all([
    runJsonCheck("check-extension-installed.js", extensionArgs),
    runJsonCheck("check-native-host-manifest.js", nativeHostArgs),
  ]);

  const result = {
    ok: Boolean(extension.ok && nativeHost.ok),
    extension,
    nativeHost,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
