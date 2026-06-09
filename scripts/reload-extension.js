#!/usr/bin/env node

import { browserHealth, browserReloadExtension } from "../agent/browserTools.js";

const timeoutMs = 10000;
const startedAt = Date.now();

await browserReloadExtension();

while (Date.now() - startedAt < timeoutMs) {
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const health = (await browserHealth()).result;
    if (health?.ok === true && health.nativeConnected === true) {
      console.log(`Extension reloaded: ${health.extensionId ?? "unknown"}`);
      process.exit(0);
    }
  } catch {
    // The background service worker may be restarting.
  }
}

console.error("Timed out waiting for the extension to reconnect after reload.");
process.exit(1);
