#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const platformMap = {
  darwin: "macos",
  linux: "linux",
  win32: "windows"
};
const archMap = {
  arm64: "arm64",
  x64: "x64"
};

function targetNames() {
  const platform = platformMap[process.platform];
  const arch = archMap[process.arch];

  if (!platform || !arch) {
    throw new Error(`Unsupported platform or architecture: ${process.platform} ${process.arch}`);
  }

  const executable = platform === "windows" ? "extension-host.exe" : "extension-host";

  return {
    platform,
    arch,
    executable
  };
}

async function run(command, args, options = {}) {
  try {
    await execFileAsync(command, args, {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
      ...options
    });
  } catch (error) {
    const stdout = error?.stdout ? `\nstdout:\n${error.stdout}` : "";
    const stderr = error?.stderr ? `\nstderr:\n${error.stderr}` : "";
    throw new Error(`${command} ${args.join(" ")} failed.${stdout}${stderr}`);
  }
}

async function main() {
  const { platform, arch, executable } = targetNames();
  const workDir = path.join(root, "build", "extension-host", platform, arch);
  const outDir = path.join(root, "extension-host", platform, arch);
  const bundledMain = path.join(workDir, "main.cjs");
  const seaConfig = path.join(workDir, "sea-config.json");
  const seaBlob = path.join(workDir, "sea-prep.blob");
  const outputBinary = path.join(outDir, executable);

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(root, "native-host", "host.js")],
    outfile: bundledMain,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    banner: {
      js: "#!/usr/bin/env node"
    }
  });

  await fs.writeFile(
    seaConfig,
    `${JSON.stringify(
      {
        main: bundledMain,
        output: seaBlob,
        disableExperimentalSEAWarning: true
      },
      null,
      2
    )}\n`
  );

  await run(process.execPath, ["--experimental-sea-config", seaConfig]);
  await fs.copyFile(process.execPath, outputBinary);
  await fs.chmod(outputBinary, 0o755);

  if (process.platform === "darwin") {
    await run("codesign", ["--remove-signature", outputBinary]);
  }

  await run(path.join(root, "node_modules", ".bin", "postject"), [
    outputBinary,
    "NODE_SEA_BLOB",
    seaBlob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
  ]);

  if (process.platform === "darwin") {
    await run("codesign", ["--sign", "-", outputBinary]);
  }

  console.log(`Built extension host binary: ${outputBinary}`);
}

await main();
