#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolveExtensionId } from "./extension-ids.js";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);

function parseArgs(argv) {
  const args = {
    extensionId: process.env.FORMAX_EXTENSION_ID || null,
    scriptPath: null,
    scriptArgs: [],
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
      console.log(`Usage: node scripts/run-real-browser-test.js <script> [args...] [options]

Options:
  --extension-id <id>    Extension ID or alias to use for reload preflight. Known labels: dev, prod
`);
      process.exit(0);
    } else if (!args.scriptPath) {
      args.scriptPath = arg;
    } else {
      args.scriptArgs.push(arg);
    }
  }

  if (!args.scriptPath) {
    throw new Error("Missing real-browser test script path.");
  }

  return args;
}

async function runNode(scriptPath, scriptArgs, extraEnv) {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [scriptPath, ...scriptArgs],
      {
        cwd: root,
        env: { ...process.env, ...extraEnv },
        maxBuffer: 1024 * 1024 * 50,
      }
    );

    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } catch (error) {
    if (error && typeof error === "object") {
      const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
      const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    }
    throw error;
  }
}

const args = parseArgs(process.argv.slice(2));
const extensionId = resolveExtensionId(args.extensionId, { fallback: null });
const env = extensionId ? { FORMAX_EXTENSION_ID: extensionId } : {};

await runNode(path.join(scriptDir, "reload-extension.js"), extensionId ? ["--extension-id", extensionId] : [], env);
await runNode(path.resolve(root, args.scriptPath), args.scriptArgs, env);
