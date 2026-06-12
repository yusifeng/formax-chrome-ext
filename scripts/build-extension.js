#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const sourceDir = path.join(root, "extension");
const buildDir = path.join(root, "build", "extension");
const tscCli = path.join(root, "node_modules", "typescript", "bin", "tsc");

async function copyStaticExtensionAssets(src, dest) {
  const stat = await fs.stat(src);

  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const ext = path.extname(entry.name);
      if (ext === ".ts" || ext === ".js" || ext === ".map") {
        continue;
      }

      await copyStaticExtensionAssets(
        path.join(src, entry.name),
        path.join(dest, entry.name)
      );
    }
    return;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function main() {
  await fs.rm(buildDir, { recursive: true, force: true });
  await execFileAsync(process.execPath, [tscCli, "-p", "tsconfig.extension.json"], {
    cwd: root,
  });
  await copyStaticExtensionAssets(sourceDir, buildDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
