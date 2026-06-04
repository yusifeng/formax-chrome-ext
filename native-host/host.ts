#!/usr/bin/env node

import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeNativeMessages, encodeNativeMessage } from "../shared/native-frame.js";

const HTTP_HOST = "127.0.0.1";
const HTTP_PORT = Number(process.env.AGENT_BROWSER_PORT || 8765);
const RPC_TOKEN = process.env.AGENT_BROWSER_TOKEN || "";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

let inputBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
const pending = new Map<string, PendingRequest>();

process.stdin.on("data", (chunk: Buffer) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  try {
    const decoded = decodeNativeMessages(inputBuffer);
    inputBuffer = decoded.remaining;

    for (const message of decoded.messages) {
      handleChromeMessage(message);
    }
  } catch (error) {
    console.error("[native-host] failed to parse native message:", error);
  }
});

process.stdin.on("end", () => {
  console.error("[native-host] Chrome closed native messaging stdin. Exiting.");
  process.exit(0);
});

process.stdin.resume();

function sendToChrome(message: unknown): void {
  process.stdout.write(encodeNativeMessage(message));
}

function handleChromeMessage(message: unknown): void {
  if (!message || typeof message !== "object") {
    console.error("[native-host] unknown non-object message from extension");
    return;
  }

  const typed = message as {
    type?: string;
    id?: string;
    ok?: boolean;
    result?: unknown;
    error?: { message?: string };
    extensionId?: string;
    version?: string;
  };

  if (typed.type === "hello") {
    console.error(
      `[native-host] connected to extension ${typed.extensionId}, version ${typed.version}`
    );
    return;
  }

  if (typed.type === "event") {
    console.error("[extension-event]", JSON.stringify(message));
    return;
  }

  if (typed.type !== "response" || typeof typed.id !== "string") {
    console.error("[native-host] unknown message from extension:", JSON.stringify(message));
    return;
  }

  const item = pending.get(typed.id);

  if (!item) {
    console.error("[native-host] response for unknown request id:", typed.id);
    return;
  }

  pending.delete(typed.id);
  clearTimeout(item.timer);

  if (typed.ok === true) {
    item.resolve(typed.result);
    return;
  }

  const messageText =
    typed.error?.message || JSON.stringify(typed.error) || "Unknown extension error";

  item.reject(new Error(messageText));
}

function callExtension(
  action: string,
  params: Record<string, unknown>,
  timeoutMs = 30000
): Promise<unknown> {
  const id = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for extension action: ${action}`));
    }, timeoutMs);

    pending.set(id, {
      resolve,
      reject,
      timer
    });

    sendToChrome({
      type: "request",
      id,
      action,
      params
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "POST" || req.url !== "/rpc") {
      sendJson(res, 404, {
        ok: false,
        error: "Not found"
      });
      return;
    }

    if (RPC_TOKEN) {
      const incomingToken = req.headers["x-agent-browser-token"];

      if (incomingToken !== RPC_TOKEN) {
        sendJson(res, 401, {
          ok: false,
          error: "Unauthorized"
        });
        return;
      }
    }

    const body = await readRequestBody(req);
    const parsed = JSON.parse(body || "{}") as {
      action?: unknown;
      params?: unknown;
      timeoutMs?: unknown;
    };

    if (!parsed.action || typeof parsed.action !== "string") {
      sendJson(res, 400, {
        ok: false,
        error: "Missing action"
      });
      return;
    }

    const params =
      parsed.params && typeof parsed.params === "object"
        ? (parsed.params as Record<string, unknown>)
        : {};
    const timeoutMs = typeof parsed.timeoutMs === "number" ? parsed.timeoutMs : 30000;
    await validateActionParams(parsed.action, params);

    const result = await callExtension(parsed.action, params, timeoutMs);

    sendJson(res, 200, {
      ok: true,
      result
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(HTTP_PORT, HTTP_HOST, () => {
  console.error(
    `[native-host] HTTP RPC listening on http://${HTTP_HOST}:${HTTP_PORT}/rpc`
  );
});

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";

    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(data);
    });
    req.on("error", reject);
  });
}

async function validateActionParams(
  action: string,
  params: Record<string, unknown>
): Promise<void> {
  if (action !== "uploadFile") {
    return;
  }

  if (typeof params.filePath !== "string" || !params.filePath.trim()) {
    throw new Error("uploadFile.params.filePath must be a non-empty string");
  }

  if (!path.isAbsolute(params.filePath)) {
    throw new Error("uploadFile.params.filePath must be an absolute path");
  }

  const stat = await fs.stat(params.filePath);

  if (!stat.isFile()) {
    throw new Error(`uploadFile path is not a file: ${params.filePath}`);
  }
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });

  res.end(body);
}
