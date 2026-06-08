#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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
  --extension-id <id>    Override Chrome extension ID, useful for local unpacked testing
  --include-debug        Also install extension files, tests, docs, and installer helpers
  --dry-run              Print planned writes without changing files
`);
}

const runtimeEntries = [
  [".formax-plugin", ".formax-plugin"],
  ["config", "config"],
  ["skill", "skill"],
  ["skills", "skills"],
  ["extension-host", "extension-host"],
  ["mcp-node-repl", "mcp-node-repl"],
  ["agent/browserTools.js", "agent/browserTools.js"],
  ["shared", "shared"],
  ["docs", "docs"],
  ["scripts/browser-client.mjs", "scripts/browser-client.mjs"],
  ["scripts/formax-doctor.js", "scripts/formax-doctor.js"],
  ["scripts/formax-uninstall.js", "scripts/formax-uninstall.js"],
  ["scripts/check-extension-installed.js", "scripts/check-extension-installed.js"],
  ["scripts/check-native-host-manifest.js", "scripts/check-native-host-manifest.js"],
  ["package.json", "package.json"],
  ["package-lock.json", "package-lock.json"],
];

const optionalRuntimeEntries = [
  ["node_modules", "node_modules"],
];

const debugEntries = [
  ["README.md", "README.md"],
  ["DIST-MANIFEST.json", "DIST-MANIFEST.json"],
  ["extension", "extension"],
  ["native-host", "native-host"],
  ["tests/scripts/llm-node-repl-chat.js", "tests/scripts/llm-node-repl-chat.js"],
  ["tests/scripts/mcp-node-repl-smoke.js", "tests/scripts/mcp-node-repl-smoke.js"],
  ["docs/prompts/handoff.md", "docs/prompts/handoff.md"],
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

async function copyFiltered(src, dest) {
  const stat = await fs.stat(src);

  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.endsWith(".zip")) continue;
      await copyFiltered(path.join(src, entry.name), path.join(dest, entry.name));
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

    await copyFiltered(src, dest);
    copied.push(to);
  }

  return { copied, missing };
}

async function copyOptionalEntries(srcRoot, destRoot, entries) {
  const copied = [];

  for (const [from, to] of entries) {
    const src = path.join(srcRoot, from);
    const dest = path.join(destRoot, to);

    if (!(await exists(src))) {
      continue;
    }

    await copyFiltered(src, dest);
    copied.push(to);
  }

  return copied;
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

async function installNodeDependencies(versionDir, dryRun) {
  const nodeModulesDir = path.join(versionDir, "node_modules");
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
  const extensionId = args.extensionId ?? process.env.FORMAX_EXTENSION_ID ?? config.extensionId;
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
  copied.push(...(await copyOptionalEntries(args.dist, versionDir, optionalRuntimeEntries)));
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
  console.log(`Native host manifest written to: ${manifestPath}`);
  console.log("Command wrappers:");
  for (const wrapper of binWrappers) console.log(`  ${wrapper}`);
  console.log("Reload the Formax extension in chrome://extensions, or restart Chrome, before testing native messaging.");
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
