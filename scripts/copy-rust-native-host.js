#!/usr/bin/env node

/**
 * Builds the Rust native host and copies it to build/extension-host/<platform>/<arch>/extension-host.
 *
 * Usage: node scripts/copy-rust-native-host.js
 *
 * Prerequisites: Rust toolchain (rustc, cargo) must be installed.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();

const platformMap = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

const archMap = {
  arm64: "arm64",
  x64: "x64",
};

function targetNames() {
  const platform = platformMap[process.platform];
  const arch = archMap[process.arch];

  if (!platform || !arch) {
    throw new Error(
      `Unsupported platform or architecture: ${process.platform} ${process.arch}`
    );
  }

  const executable = platform === "windows" ? "extension-host.exe" : "extension-host";

  return { platform, arch, executable };
}

async function main() {
  const { platform, arch, executable } = targetNames();
  const manifestPath = path.join(root, "rust", "native-host", "Cargo.toml");
  const releaseBinary = path.join(
    root,
    "rust",
    "native-host",
    "target",
    "release",
    "formax-native-host"
  );
  const outDir = path.join(root, "build", "extension-host", platform, arch);
  const outPath = path.join(outDir, executable);

  // 1. Build the Rust binary
  console.log(`Building Rust native host (release)...`);
  execFileSync("cargo", [
    "build",
    "--release",
    "--manifest-path",
    manifestPath,
  ]);

  // 2. Recreate output directory so stale build artifacts from older host
  // implementations cannot leak into packaging.
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // 3. Copy binary to build/extension-host path
  await fs.copyFile(releaseBinary, outPath);
  await fs.chmod(outPath, 0o755);

  const stat = await fs.stat(outPath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

  console.log(`Copied Rust host binary to: ${outPath}`);
  console.log(`Binary size: ${sizeMB} MB`);
}

await main();
