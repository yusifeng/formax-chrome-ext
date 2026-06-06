#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();

function parseArgs(argv) {
  const args = {
    chromeUserDataDir: null,
    config: path.join(root, "config", "extension-id.json"),
    extensionId: process.env.FORMAX_EXTENSION_ID || null,
    json: false,
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
    else if (arg === "--config") args.config = path.resolve(next());
    else if (arg === "--extension-id") args.extensionId = next();
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
  console.log(`Usage: node scripts/check-extension-installed.js [options]

Options:
  --json                         Print machine-readable JSON
  --extension-id <id>            Override extension ID
  --config <path>                Extension config JSON. Default: ./config/extension-id.json
  --chrome-user-data-dir <path>  Chrome user data directory override
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

async function readdirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function defaultChromeUserDataDir() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
  }

  if (process.platform === "linux") {
    return path.join(os.homedir(), ".config", "google-chrome");
  }

  if (process.platform === "win32") {
    return path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data");
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

async function discoverProfileDirs(userDataDir) {
  const entries = await readdirSafe(userDataDir);
  const dirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const preferencesPath = path.join(userDataDir, entry.name, "Preferences");
    const securePreferencesPath = path.join(userDataDir, entry.name, "Secure Preferences");
    if ((await exists(preferencesPath)) || (await exists(securePreferencesPath))) {
      dirs.push({
        name: entry.name,
        path: path.join(userDataDir, entry.name),
        preferencesPath,
        securePreferencesPath,
      });
    }
  }

  return dirs.sort((a, b) => a.name.localeCompare(b.name));
}

function readExtensionSettings(preferences, extensionId) {
  return preferences?.extensions?.settings?.[extensionId] ?? null;
}

function summarizeSetting(setting) {
  if (!setting) {
    return {
      installed: false,
      enabled: false,
      state: null,
      fromWebStore: false,
      version: null,
      location: null,
      path: null,
    };
  }

  const state = typeof setting.state === "number" ? setting.state : null;
  const disableReasons = Array.isArray(setting.disable_reasons)
    ? setting.disable_reasons
    : [];
  const enabled = state === 1 || (state == null && disableReasons.length === 0);

  return {
    installed: true,
    enabled,
    state,
    disableReasons,
    fromWebStore: setting.from_webstore === true,
    version:
      typeof setting.manifest?.version === "string"
        ? setting.manifest.version
        : typeof setting.service_worker_registration_info?.version === "string"
          ? setting.service_worker_registration_info.version
          : null,
    location: setting.location ?? null,
    path: setting.path ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await readJson(args.config);
  const extensionId = args.extensionId ?? config.extensionId;
  const chromeUserDataDir = args.chromeUserDataDir ?? defaultChromeUserDataDir();
  const profiles = await discoverProfileDirs(chromeUserDataDir);
  const profileResults = [];

  for (const profile of profiles) {
    try {
      const preferences = (await exists(profile.preferencesPath))
        ? await readJson(profile.preferencesPath)
        : {};
      const securePreferences = (await exists(profile.securePreferencesPath))
        ? await readJson(profile.securePreferencesPath)
        : {};
      const setting =
        readExtensionSettings(securePreferences, extensionId) ??
        readExtensionSettings(preferences, extensionId);
      const summary = summarizeSetting(setting);
      profileResults.push({
        profile: profile.name,
        preferencesPath: profile.preferencesPath,
        securePreferencesPath: profile.securePreferencesPath,
        ...summary,
      });
    } catch (error) {
      profileResults.push({
        profile: profile.name,
        preferencesPath: profile.preferencesPath,
        securePreferencesPath: profile.securePreferencesPath,
        installed: false,
        enabled: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const installedProfiles = profileResults.filter((profile) => profile.installed);
  const enabledProfiles = installedProfiles.filter((profile) => profile.enabled);
  const ok = enabledProfiles.length > 0;
  const result = {
    ok,
    extensionId,
    chromeUserDataDir,
    profileCount: profiles.length,
    installedProfileCount: installedProfiles.length,
    enabledProfileCount: enabledProfiles.length,
    profiles: profileResults,
    repairHint: ok
      ? null
      : "Install or enable the Formax Chrome extension in Chrome, then rerun this check. For local unpacked builds pass --extension-id or FORMAX_EXTENSION_ID.",
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${ok ? "OK" : "FAIL"} extension ${extensionId}`);
    console.log(`Chrome user data: ${chromeUserDataDir}`);
    console.log(`Profiles: ${profiles.length}, installed: ${installedProfiles.length}, enabled: ${enabledProfiles.length}`);
    if (!ok) console.log(`Repair: ${result.repairHint}`);
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
