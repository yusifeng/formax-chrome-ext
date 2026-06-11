#!/usr/bin/env node

import os from "node:os";
import path from "node:path";

export const RUNTIME_HOME_DISPLAY_TOKEN = "__FORMAX_RUNTIME_HOME_DISPLAY__";
export const RUNTIME_HOME_BASENAME_TOKEN = "__FORMAX_RUNTIME_HOME_BASENAME__";

export const templatedRuntimeFiles = [
  "docs/api.md",
  "docs/api-troubleshooting.md",
];

export const installedRuntimePathFiles = [
  ...templatedRuntimeFiles,
  "skills/control-chrome/SKILL.md",
  "notes/prompts/browser-node-repl-system.md",
];

export function runtimeHomeFromInstallRoot(installRoot) {
  return path.resolve(installRoot, "..", "..", "..", "..");
}

export function runtimeHomeDisplay(runtimeHome) {
  const homeDir = os.homedir();
  if (runtimeHome === homeDir) {
    return "~";
  }
  if (runtimeHome.startsWith(`${homeDir}${path.sep}`)) {
    const relative = path.relative(homeDir, runtimeHome).split(path.sep).join("/");
    return `~/${relative}`;
  }
  return runtimeHome.split(path.sep).join("/");
}

export function renderRuntimePathTemplate(content, { runtimeHome }) {
  const display = runtimeHomeDisplay(runtimeHome);
  const basename = path.basename(runtimeHome);

  return content
    .replaceAll(RUNTIME_HOME_DISPLAY_TOKEN, display)
    .replaceAll(RUNTIME_HOME_BASENAME_TOKEN, basename);
}
