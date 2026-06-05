import { builtinModules, createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import vm from "node:vm";

type RequestMessage = {
  id: number;
  method: "execute" | "addModuleDir";
  params?: Record<string, unknown>;
};

const moduleDirs = new Set(
  (process.env.NODE_REPL_NODE_MODULE_DIRS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item))
);

let responseMeta: Record<string, unknown> = {};
let output = "";

function formatConsoleArgs(args: unknown[]) {
  return args
    .map((arg) => typeof arg === "string" ? arg : inspect(arg, { depth: 6, colors: false }))
    .join(" ");
}

const sandboxConsole = {
  assert: (condition: unknown, ...args: unknown[]) => {
    if (!condition) {
      output += `Assertion failed${args.length ? `: ${formatConsoleArgs(args)}` : ""}\n`;
    }
  },
  debug: (...args: unknown[]) => {
    output += `${formatConsoleArgs(args)}\n`;
  },
  error: (...args: unknown[]) => {
    output += `${formatConsoleArgs(args)}\n`;
  },
  info: (...args: unknown[]) => {
    output += `${formatConsoleArgs(args)}\n`;
  },
  log: (...args: unknown[]) => {
    output += `${formatConsoleArgs(args)}\n`;
  },
  table: (...args: unknown[]) => {
    output += `${formatConsoleArgs(args)}\n`;
  },
  warn: (...args: unknown[]) => {
    output += `${formatConsoleArgs(args)}\n`;
  }
};

const sandbox: Record<string, unknown> = {
  AbortController,
  AbortSignal,
  atob,
  btoa,
  Blob,
  Buffer,
  clearImmediate,
  clearInterval,
  clearTimeout,
  console: sandboxConsole,
  crypto,
  fetch,
  FormData,
  globalThis: undefined,
  Headers,
  queueMicrotask,
  Request,
  Response,
  setImmediate,
  setInterval,
  setTimeout,
  structuredClone,
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder
};

sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox, {
  name: "node-repl-kernel"
});

const builtinSpecifiers = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
]);

function resolveImport(specifier: string): string {
  if (builtinSpecifiers.has(specifier)) {
    return specifier.startsWith("node:") ? specifier : `node:${specifier}`;
  }

  if (specifier.startsWith("file:") || specifier.startsWith("data:")) {
    return specifier;
  }

  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return pathToFileURL(path.resolve(process.cwd(), specifier)).href;
  }

  const bases = [
    process.cwd(),
    ...Array.from(moduleDirs).map((moduleDir) =>
      path.basename(moduleDir) === "node_modules" ? path.dirname(moduleDir) : moduleDir
    )
  ];

  for (const base of bases) {
    try {
      return pathToFileURL(createRequire(path.join(base, "__node_repl__.js")).resolve(specifier))
        .href;
    } catch {
      // Try the next module root.
    }
  }

  return specifier;
}

function makeNodeReplHelpers() {
  responseMeta = {};
  output = "";

  return {
    cwd: process.cwd(),
    homeDir: os.homedir(),
    tmpDir: os.tmpdir(),
    requestMeta: {},
    emitImage: async () => {
      throw new Error("nodeRepl.emitImage is not implemented in this MVP");
    },
    setResponseMeta: (meta: Record<string, unknown>) => {
      responseMeta = {
        ...responseMeta,
        ...meta
      };
    },
    write: (text: unknown) => {
      output += String(text);
    }
  };
}

async function execute(code: string) {
  if (typeof code !== "string") {
    throw new Error("code must be a string");
  }

  sandbox.nodeRepl = makeNodeReplHelpers();

  const script = new vm.Script(`(async () => {\n${code}\n})()`, {
    filename: "node-repl-input.js",
    importModuleDynamically: async (specifier) => import(resolveImport(specifier))
  });

  const result = await script.runInContext(context);

  return {
    result,
    output,
    responseMeta
  };
}

function addModuleDir(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("path must be a non-empty string");
  }

  moduleDirs.add(path.resolve(value));
  return true;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
}

function send(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleRequest(message: RequestMessage) {
  try {
    if (message.method === "execute") {
      send({
        id: message.id,
        result: await execute(String(message.params?.code ?? ""))
      });
      return;
    }

    if (message.method === "addModuleDir") {
      send({
        id: message.id,
        result: addModuleDir(message.params?.path)
      });
      return;
    }

    throw new Error(`Unknown kernel method: ${String(message.method)}`);
  } catch (error) {
    send({
      id: message.id,
      error: serializeError(error)
    });
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  let message: RequestMessage;

  try {
    message = JSON.parse(line);
  } catch (error) {
    send({
      id: null,
      error: serializeError(error)
    });
    return;
  }

  void handleRequest(message);
});
