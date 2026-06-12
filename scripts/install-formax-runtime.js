#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolveExtensionId } from "./extension-ids.js";
import {
  installedRuntimePathFiles,
  renderRuntimePathTemplate,
  runtimeHomeDisplay,
  runtimeHomeFromInstallRoot,
} from "./runtime-path-template.js";

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDist = path.basename(scriptDir) === "scripts" ? path.join(root, "dist") : scriptDir;
const defaultInstallRoot = path.join(os.homedir(), ".formax", "plugins", "cache", "formax", "chrome");
const defaultBinDir = path.join(os.homedir(), ".formax", "bin");
const execFileAsync = promisify(execFile);

const platformMap = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

const archMap = {
  arm64: "arm64",
  x64: "x64",
};

function parseArgs(argv) {
  const args = {
    dist: defaultDist,
    binDir: defaultBinDir,
    dryRun: false,
    extensionId: null,
    includeDebug: false,
    installRoot: defaultInstallRoot,
    version: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === "--bin-dir") args.binDir = path.resolve(next());
    else if (arg === "--dist") args.dist = path.resolve(next());
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--extension-id") args.extensionId = next();
    else if (arg === "--include-debug") args.includeDebug = true;
    else if (arg === "--install-root") args.installRoot = path.resolve(next());
    else if (arg === "--version") args.version = next();
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
  console.log(`Usage: node scripts/install-formax-runtime.js [options]

Options:
  --dist <path>          Dist directory to install. Default: ./dist in the source repo, or the installer directory in a release package
  --bin-dir <path>       Directory for command wrappers. Default: ~/.formax/bin
  --install-root <path>  Versioned cache root. Default: ~/.formax/plugins/cache/formax/chrome
  --version <version>    Install version name. Default: package.json version from dist
  --extension-id <id>    Override Chrome extension ID, useful for local unpacked testing. Known labels: dev, prod
  --include-debug        Also install extension files, tests, docs, and installer helpers
  --dry-run              Print planned writes without changing files
`);
}

const runtimeEntries = [
  [".formax-plugin", ".formax-plugin"],
  ["config", "config"],
  ["skills", "skills"],
  ["extension-host", "extension-host"],
  ["mcp-node-repl", "mcp-node-repl"],
  ["scripts/browser-client.mjs", "scripts/browser-client.mjs"],
  ["scripts/formax-doctor.js", "scripts/formax-doctor.js"],
  ["scripts/formax-uninstall.js", "scripts/formax-uninstall.js"],
  ["scripts/check-extension-installed.js", "scripts/check-extension-installed.js"],
  ["scripts/check-native-host-manifest.js", "scripts/check-native-host-manifest.js"],
  ["docs/api.md", "docs/api.md"],
  ["docs/api-troubleshooting.md", "docs/api-troubleshooting.md"],
  ["docs/browser-client-api.md", "docs/browser-client-api.md"],
  ["docs/chrome-troubleshooting.md", "docs/chrome-troubleshooting.md"],
  ["docs/file-management.md", "docs/file-management.md"],
  ["docs/playwright.md", "docs/playwright.md"],
  ["docs/screenshots.md", "docs/screenshots.md"],
  ["package.json", "package.json"],
];

const ignoredRuntimeRelativePaths = new Set([
  path.normalize("mcp-node-repl/browser-client.js"),
  path.normalize("mcp-node-repl/kernel.js"),
]);

const debugEntries = [
  ["README.md", "README.md"],
  ["DIST-MANIFEST.json", "DIST-MANIFEST.json"],
  ["package-lock.json", "package-lock.json"],
  ["extension", "extension"],
  ["native-host", "native-host"],
  ["tests/scripts/mcp-node-repl-smoke.js", "tests/scripts/mcp-node-repl-smoke.js"],
  ["notes/prompts/handoff.md", "notes/prompts/handoff.md"],
  ["notes/prompts/browser-node-repl-system.md", "notes/prompts/browser-node-repl-system.md"],
  ["notes/codex-chrome-architecture-notes.md", "notes/codex-chrome-architecture-notes.md"],
  ["notes/codex-gap-handoff.md", "notes/codex-gap-handoff.md"],
  ["notes/codex-gap-todolist.md", "notes/codex-gap-todolist.md"],
  ["notes/research", "notes/research"],
];

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

async function copyFiltered(src, dest, relativePath = "") {
  const normalizedRelativePath = relativePath ? path.normalize(relativePath) : "";
  if (normalizedRelativePath && ignoredRuntimeRelativePaths.has(normalizedRelativePath)) {
    return;
  }

  const stat = await fs.stat(src);

  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.endsWith(".zip")) continue;
      const childRelativePath = relativePath
        ? path.join(relativePath, entry.name)
        : entry.name;
      await copyFiltered(
        path.join(src, entry.name),
        path.join(dest, entry.name),
        childRelativePath
      );
    }
    return;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyEntries(srcRoot, destRoot, entries) {
  const copied = [];
  const missing = [];

  for (const [from, to] of entries) {
    const src = path.join(srcRoot, from);
    const dest = path.join(destRoot, to);

    if (!(await exists(src))) {
      missing.push(from);
      continue;
    }

    await copyFiltered(src, dest, from);
    copied.push(to);
  }

  await fs.rm(path.join(destRoot, "mcp-node-repl", "browser-client.js"), { force: true });
  await fs.rm(path.join(destRoot, "mcp-node-repl", "kernel.js"), { force: true });

  return { copied, missing };
}

async function replaceSymlink(target, linkPath, dryRun) {
  if (dryRun) return;

  await fs.rm(linkPath, { recursive: true, force: true });
  const relativeTarget = path.relative(path.dirname(linkPath), target);
  await fs.symlink(relativeTarget, linkPath, "dir");
}

function targetNames() {
  const platform = platformMap[process.platform];
  const arch = archMap[process.arch];
  if (!platform || !arch) {
    throw new Error(`Unsupported platform or architecture: ${process.platform} ${process.arch}`);
  }

  const executable = platform === "windows" ? "extension-host.exe" : "extension-host";
  return { platform, arch, executable };
}

function nativeHostManifestPath(hostName) {
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
      "Formax",
      "NativeMessagingHosts",
      `${hostName}.json`
    );
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

async function writeJson(filePath, value, dryRun) {
  if (dryRun) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function writeExecutable(filePath, content, dryRun) {
  if (dryRun) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
}

async function writeBinWrappers({ binDir, latestLink, installRoot, dryRun }) {
  const wrappers = [
    {
      name: "formax-browser-mcp",
      target: path.join(latestLink, "mcp-node-repl", "server.js"),
      args: [],
    },
    {
      name: "formax-doctor",
      target: path.join(latestLink, "scripts", "formax-doctor.js"),
      args: [],
    },
    {
      name: "formax-uninstall",
      target: path.join(latestLink, "scripts", "formax-uninstall.js"),
      args: ["--install-root", installRoot, "--bin-dir", binDir],
    },
  ];

  for (const wrapper of wrappers) {
    const extraArgs = wrapper.args.map(shellQuote).join(" ");
    const script = [
      "#!/bin/sh",
      "set -eu",
      `exec node ${shellQuote(wrapper.target)}${extraArgs ? ` ${extraArgs}` : ""} "$@"`,
      "",
    ].join("\n");
    await writeExecutable(path.join(binDir, wrapper.name), script, dryRun);
  }

  return wrappers.map((wrapper) => path.join(binDir, wrapper.name));
}

async function rewriteInstalledPackage(versionDir, includeDebug, dryRun) {
  if (includeDebug) {
    return false;
  }

  const packagePath = path.join(versionDir, "package.json");
  const runtimePackage = await readJson(packagePath);
  runtimePackage.dependencies = {};
  await writeJson(packagePath, runtimePackage, dryRun);
  return true;
}

async function rewriteInstalledConfig(versionDir, extensionId, dryRun) {
  if (!extensionId) {
    return false;
  }

  const configPath = path.join(versionDir, "config", "extension-id.json");
  const config = await readJson(configPath);
  config.extensionId = extensionId;
  await writeJson(configPath, config, dryRun);
  return true;
}

async function rewriteInstalledRuntimePaths(versionDir, installRoot, dryRun) {
  const runtimeHome = runtimeHomeFromInstallRoot(installRoot);
  const displayPath = runtimeHomeDisplay(runtimeHome);
  const basename = path.basename(runtimeHome);
  const rewritten = [];

  for (const relativePath of installedRuntimePathFiles) {
    const filePath = path.join(versionDir, relativePath);
    if (!(await exists(filePath))) {
      continue;
    }

    const original = await fs.readFile(filePath, "utf8");
    const rendered = renderRuntimePathTemplate(original, { runtimeHome })
      .replaceAll(
        "~/.formax/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs",
        `${displayPath}/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs`
      )
      .replaceAll(
        "${nodeRepl.homeDir}/.formax/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs",
        "${nodeRepl.homeDir}/" + `${basename}/plugins/cache/formax/chrome/latest/scripts/browser-client.mjs`
      );

    if (rendered === original) {
      continue;
    }

    rewritten.push(relativePath);
    if (!dryRun) {
      await fs.writeFile(filePath, rendered, "utf8");
    }
  }

  return rewritten;
}

async function installNodeDependencies(versionDir, dryRun) {
  const nodeModulesDir = path.join(versionDir, "node_modules");
  const packagePath = path.join(versionDir, "package.json");
  const runtimePackage = await readJson(packagePath);

  if (Object.keys(runtimePackage.dependencies || {}).length === 0) {
    if (dryRun) {
      console.log("  node deps:         none (runtime is self-contained)");
      return "dry-run";
    }

    return "self-contained";
  }

  const lockfilePath = path.join(versionDir, "package-lock.json");

  if (await exists(nodeModulesDir)) {
    return "bundled";
  }

  if (dryRun) {
    console.log(`  node deps:         would install production dependencies`);
    return "dry-run";
  }

  console.log("\nInstalling Formax Node dependencies...");
  const npmArgs = (await exists(lockfilePath))
    ? ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"]
    : ["install", "--omit=dev", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund"];

  try {
    await execFileAsync("npm", npmArgs, {
      cwd: versionDir,
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string") {
      process.stdout.write(error.stdout);
    }
    if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string") {
      process.stderr.write(error.stderr);
    }
    throw error;
  }

  return "installed";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distPackagePath = path.join(args.dist, "package.json");
  const distConfigPath = path.join(args.dist, "config", "extension-id.json");

  if (!(await exists(distPackagePath))) {
    throw new Error(`Missing dist package: ${distPackagePath}. Run npm run package:dist first.`);
  }

  if (!(await exists(distConfigPath))) {
    throw new Error(`Missing extension config: ${distConfigPath}`);
  }

  const distPackage = await readJson(distPackagePath);
  const config = await readJson(distConfigPath);
  const version = args.version ?? distPackage.version;
  const extensionId = resolveExtensionId(
    args.extensionId ?? process.env.FORMAX_EXTENSION_ID ?? config.extensionId
  );
  const hostName = process.env.FORMAX_EXTENSION_HOST_NAME ?? config.extensionHostName;

  if (!version || typeof version !== "string") throw new Error("Missing package version");
  if (!extensionId || typeof extensionId !== "string") throw new Error("Missing extension ID");
  if (!hostName || typeof hostName !== "string") throw new Error("Missing native host name");

  const versionDir = path.join(args.installRoot, version);
  const latestLink = path.join(args.installRoot, "latest");
  const { platform, arch, executable } = targetNames();
  const latestHostPath = path.join(latestLink, "extension-host", platform, arch, executable);
  const versionHostPath = path.join(versionDir, "extension-host", platform, arch, executable);

  if (!(await exists(path.join(args.dist, "extension-host", platform, arch, executable)))) {
    throw new Error(`Dist is missing native host binary for ${platform}/${arch}`);
  }

  const manifestPath = nativeHostManifestPath(hostName);
  const manifest = {
    name: hostName,
    description: "Formax Native Host",
    path: latestHostPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };

  console.log("Formax runtime install plan:");
  console.log(`  source dist:       ${args.dist}`);
  console.log(`  version dir:       ${versionDir}`);
  console.log(`  latest symlink:    ${latestLink} -> ${version}`);
  console.log(`  bin dir:           ${args.binDir}`);
  console.log(`  native host path:  ${latestHostPath}`);
  console.log(`  manifest path:     ${manifestPath}`);
  console.log(`  extension origin:  chrome-extension://${extensionId}/`);
  console.log(`  debug files:       ${args.includeDebug ? "included" : "excluded"}`);

  if (args.dryRun) {
    console.log("\nDry run only; no files were changed.");
    return;
  }

  await fs.rm(versionDir, { recursive: true, force: true });
  await fs.mkdir(versionDir, { recursive: true });
  const entries = args.includeDebug ? [...runtimeEntries, ...debugEntries] : runtimeEntries;
  const { copied, missing } = await copyEntries(args.dist, versionDir, entries);
  const selfContained = await rewriteInstalledPackage(versionDir, args.includeDebug, args.dryRun);
  const rewrittenExtensionId = await rewriteInstalledConfig(versionDir, extensionId, args.dryRun);
  const rewrittenRuntimePaths = await rewriteInstalledRuntimePaths(versionDir, args.installRoot, args.dryRun);
  const dependencyMode = await installNodeDependencies(versionDir, args.dryRun);
  await writeJson(
    path.join(versionDir, "FORMAX-RUNTIME-MANIFEST.json"),
    {
      generatedAt: new Date().toISOString(),
      sourceDist: args.dist,
      version,
      extensionId,
      hostName,
      debugIncluded: args.includeDebug,
      selfContained,
      rewrittenExtensionId,
      rewrittenRuntimePaths,
      nodeDependencies: dependencyMode,
      copied,
      missing,
    },
    args.dryRun
  );
  await replaceSymlink(versionDir, latestLink, args.dryRun);
  await fs.chmod(versionHostPath, 0o755);
  await writeJson(manifestPath, manifest, args.dryRun);
  const binWrappers = await writeBinWrappers({
    binDir: args.binDir,
    latestLink,
    installRoot: args.installRoot,
    dryRun: args.dryRun,
  });

  if (missing.length > 0) {
    console.warn(`WARN missing optional runtime entries: ${missing.join(", ")}`);
  }

  console.log("\nInstalled Formax browser runtime.");
  console.log(`Runtime root: ${path.join(runtimeHomeFromInstallRoot(args.installRoot), "plugins", "cache", "formax", "chrome", "latest")}`);
  console.log(`Skill path:   ${path.join(runtimeHomeFromInstallRoot(args.installRoot), "plugins", "cache", "formax", "chrome", "latest", "skills", "control-chrome", "SKILL.md")}`);
  console.log(`Native host manifest written to: ${manifestPath}`);
  console.log("Command wrappers:");
  for (const wrapper of binWrappers) console.log(`  ${wrapper}`);
  console.log("Reload the Formax extension in chrome://extensions, or restart Chrome, before testing native messaging.");
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
