#!/usr/bin/env node

import { browserHealth, browserReloadExtension } from "../agent/browserTools.js";
import { resolveExtensionId } from "./extension-ids.js";

function parseArgs(argv) {
  const args = {
    extensionId: process.env.FORMAX_EXTENSION_ID || null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    if (arg === "--extension-id") args.extensionId = next();
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/reload-extension.js [options]

Options:
  --extension-id <id>    Expected extension ID after reload. Known labels: dev, prod
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

const timeoutMs = 10000;
const startedAt = Date.now();
const args = parseArgs(process.argv.slice(2));
const expectedExtensionId = resolveExtensionId(args.extensionId, { fallback: null });

await browserReloadExtension();

while (Date.now() - startedAt < timeoutMs) {
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const health = (await browserHealth()).result;
    if (health?.ok === true && health.nativeConnected === true) {
      if (
        expectedExtensionId &&
        typeof health.extensionId === "string" &&
        health.extensionId !== expectedExtensionId
      ) {
        throw new Error(
          `Extension reloaded with unexpected ID ${health.extensionId}; expected ${expectedExtensionId}.`
        );
      }
      console.log(`Extension reloaded: ${health.extensionId ?? "unknown"}`);
      process.exit(0);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Extension reloaded with unexpected ID")
    ) {
      console.error(error.message);
      process.exit(1);
    }
    // The background service worker may be restarting.
  }
}

console.error("Timed out waiting for the extension to reconnect after reload.");
process.exit(1);
