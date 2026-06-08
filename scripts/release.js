#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();

const platformMap = {
  darwin: "macos",
  linux: "linux",
};

const archMap = {
  arm64: "arm64",
  x64: "x64",
};

function printUsage() {
  console.log(`Usage: node scripts/release.js [options]

Builds the Formax runtime package, creates a platform archive, and publishes it
to a GitHub Release with the filename expected by the curl installer.

Options:
  --version <version>    Package version. Default: package.json version
  --tag <tag>            GitHub release tag. Default: v<version>
  --repo <owner/repo>    GitHub repo. Default: parsed from git remote origin
  --title <title>        Release title. Default: Formax <tag>
  --notes <text>         Release notes text
  --notes-file <path>    Release notes file
  --platform <platform>  Asset platform. Default: current platform
                         Supported: macos, linux
  --arch <arch>          Asset architecture. Default: current architecture
                         Supported: arm64, x64
  --skip-build           Do not run npm run package:dist
  --dry-run              Print the plan without creating or uploading a release
  --allow-dirty          Allow publishing from a dirty git worktree
  --draft                Create a draft release when the release does not exist
  --prerelease           Mark a newly-created release as prerelease
  --no-clobber           Do not replace an existing release asset
  --help, -h             Show this help

Examples:
  npm run release
  npm run release -- --tag v0.1.0
  npm run release -- --dry-run --allow-dirty
`);
}

function nextValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${arg}`);
  }
  return value;
}

function detectPlatform() {
  const platform = platformMap[process.platform];
  if (!platform) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  return platform;
}

function detectArch() {
  const arch = archMap[process.arch];
  if (!arch) {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }
  return arch;
}

function parseArgs(argv) {
  const args = {
    allowDirty: false,
    arch: detectArch(),
    clobber: true,
    draft: false,
    dryRun: false,
    notes: null,
    notesFile: null,
    platform: detectPlatform(),
    prerelease: false,
    repo: null,
    skipBuild: false,
    tag: null,
    title: null,
    version: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--allow-dirty") args.allowDirty = true;
    else if (arg === "--arch") {
      args.arch = nextValue(argv, i, arg);
      i += 1;
    } else if (arg === "--draft") args.draft = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-clobber") args.clobber = false;
    else if (arg === "--notes") {
      args.notes = nextValue(argv, i, arg);
      i += 1;
    } else if (arg === "--notes-file") {
      args.notesFile = path.resolve(nextValue(argv, i, arg));
      i += 1;
    } else if (arg === "--platform") {
      args.platform = nextValue(argv, i, arg);
      i += 1;
    } else if (arg === "--prerelease") args.prerelease = true;
    else if (arg === "--repo") {
      args.repo = nextValue(argv, i, arg);
      i += 1;
    } else if (arg === "--skip-build") args.skipBuild = true;
    else if (arg === "--tag") {
      args.tag = nextValue(argv, i, arg);
      i += 1;
    } else if (arg === "--title") {
      args.title = nextValue(argv, i, arg);
      i += 1;
    } else if (arg === "--version") {
      args.version = nextValue(argv, i, arg);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["macos", "linux"].includes(args.platform)) {
    throw new Error(`Unsupported release platform: ${args.platform}`);
  }

  if (!["arm64", "x64"].includes(args.arch)) {
    throw new Error(`Unsupported release architecture: ${args.arch}`);
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`$ ${printable}`);
  try {
    const result = await execFileAsync(command, args, {
      cwd: root,
      maxBuffer: 1024 * 1024 * 20,
      ...options,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result;
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string") {
      process.stdout.write(error.stdout);
    }
    if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string") {
      process.stderr.write(error.stderr);
    }
    throw error;
  }
}

async function commandOutput(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: root,
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout.trim();
}

async function requireCommand(command) {
  try {
    await execFileAsync(command, ["--version"], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error(`Missing required command: ${command}`);
  }
}

async function assertCleanWorktree(allowDirty) {
  const status = await commandOutput("git", ["status", "--porcelain"]);
  if (status && !allowDirty) {
    throw new Error("Git worktree is dirty. Commit changes first or pass --allow-dirty.");
  }
}

async function parseRepoFromRemote() {
  const remote = await commandOutput("git", ["remote", "get-url", "origin"]);
  const sshMatch = remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  const httpsMatch = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  throw new Error(`Cannot parse GitHub repo from origin remote: ${remote}`);
}

async function copyFiltered(src, dest) {
  const stat = await fs.stat(src);

  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "release-assets") continue;
      await copyFiltered(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

function runtimeArchiveEntries({ platform, arch }) {
  const executable = platform === "windows" ? "extension-host.exe" : "extension-host";

  return [
    ["install.js", "install.js"],
    ["package.json", "package.json"],
    ["package-lock.json", "package-lock.json"],
    ["config", "config"],
    ["skill", "skill"],
    [
      `extension-host/${platform}/${arch}/${executable}`,
      `extension-host/${platform}/${arch}/${executable}`,
    ],
    ["mcp-node-repl", "mcp-node-repl"],
    ["agent/browserTools.js", "agent/browserTools.js"],
    ["shared", "shared"],
    ["scripts/check-extension-installed.js", "scripts/check-extension-installed.js"],
    ["scripts/check-native-host-manifest.js", "scripts/check-native-host-manifest.js"],
  ];
}

async function copyArchiveEntries({ dist, packageDir, platform, arch }) {
  const missing = [];

  for (const [from, to] of runtimeArchiveEntries({ platform, arch })) {
    const src = path.join(dist, from);
    const dest = path.join(packageDir, to);

    if (!(await exists(src))) {
      missing.push(from);
      continue;
    }

    await copyFiltered(src, dest);
  }

  if (missing.length > 0) {
    throw new Error(`Release package is missing required entries: ${missing.join(", ")}`);
  }
}

async function createArchive({ arch, assetName, platform }) {
  const dist = path.join(root, "dist");
  const installScript = path.join(dist, "install.js");
  const assetDir = path.join(dist, "release-assets");
  const assetPath = path.join(assetDir, assetName);
  const packageName = assetName.replace(/\.tar\.gz$/, "");
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formax-release-"));
  const packageDir = path.join(tmpRoot, packageName);

  if (!(await exists(installScript))) {
    throw new Error("Missing dist/install.js. Run npm run package:dist first.");
  }

  await fs.rm(assetDir, { recursive: true, force: true });
  await fs.mkdir(assetDir, { recursive: true });
  await copyArchiveEntries({ dist, packageDir, platform, arch });

  try {
    await run("tar", ["-czf", assetPath, "-C", tmpRoot, packageName]);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }

  return assetPath;
}

async function releaseExists(tag, repo) {
  try {
    await execFileAsync("gh", ["release", "view", tag, "--repo", repo], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function publishRelease({ args, assetPath, notes, repo, tag, title }) {
  const existsAlready = await releaseExists(tag, repo);
  const assetArgs = [assetPath];
  if (args.clobber) assetArgs.push("--clobber");

  if (existsAlready) {
    await run("gh", ["release", "upload", tag, ...assetArgs, "--repo", repo]);
    return;
  }

  const target = await commandOutput("git", ["rev-parse", "HEAD"]);
  const createArgs = [
    "release",
    "create",
    tag,
    assetPath,
    "--repo",
    repo,
    "--target",
    target,
    "--title",
    title,
    "--notes",
    notes,
  ];

  if (args.draft) createArgs.push("--draft");
  if (args.prerelease) createArgs.push("--prerelease");

  await run("gh", createArgs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pkg = await readJson(path.join(root, "package.json"));
  const version = args.version ?? pkg.version;
  const tag = args.tag ?? `v${version.replace(/^v/, "")}`;
  const repo = args.repo ?? (await parseRepoFromRemote());
  const title = args.title ?? `Formax ${tag}`;
  const assetName = `formax-chrome-runtime-${args.platform}-${args.arch}.tar.gz`;
  const notes =
    args.notes ??
    (args.notesFile ? await fs.readFile(args.notesFile, "utf8") : `Formax runtime ${tag}.`);

  if (!version || typeof version !== "string") {
    throw new Error("Missing package version");
  }

  await requireCommand("git");
  await requireCommand("tar");
  if (!args.dryRun) await requireCommand("gh");
  await assertCleanWorktree(args.allowDirty);

  console.log("Formax release plan:");
  console.log(`  repo:      ${repo}`);
  console.log(`  tag:       ${tag}`);
  console.log(`  title:     ${title}`);
  console.log(`  platform:  ${args.platform}/${args.arch}`);
  console.log(`  asset:     ${assetName}`);
  console.log(`  build:     ${args.skipBuild ? "skipped" : "npm run package:dist"}`);
  console.log(`  publish:   ${args.dryRun ? "dry run" : "GitHub Release"}`);

  if (!args.skipBuild) {
    await run("npm", ["run", "package:dist"]);
    await assertCleanWorktree(args.allowDirty);
  }

  const executable = args.platform === "windows" ? "extension-host.exe" : "extension-host";
  const nativeHostPath = path.join(root, "dist", "extension-host", args.platform, args.arch, executable);
  if (!(await exists(nativeHostPath))) {
    throw new Error(`Missing native host binary in dist: ${nativeHostPath}`);
  }

  const assetPath = await createArchive({ arch: args.arch, assetName, platform: args.platform });
  console.log(`Created release asset: ${assetPath}`);

  if (args.dryRun) {
    console.log("\nDry run only; release was not created or uploaded.");
    return;
  }

  await publishRelease({ args, assetPath, notes, repo, tag, title });
  console.log(`Published ${assetName} to ${repo} ${tag}.`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
