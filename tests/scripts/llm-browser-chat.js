#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  browserStopSession,
  browserToolSchemas,
  callBrowserTool
} from "../agent/browserTools.js";

loadDotEnv();

const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const MODEL = process.env.LLM_BROWSER_MODEL || "deepseek-v4-flash";
const BASE_URL =
  process.env.LLM_BROWSER_BASE_URL ||
  process.env.DEEPSEEK_BASE_URL ||
  "https://api.deepseek.com";
const API_URL = `${BASE_URL.replace(/\/+$/, "")}/chat/completions`;

if (!API_KEY) {
  console.error("DEEPSEEK_API_KEY or OPENAI_API_KEY is required.");
  process.exit(2);
}

const messages = [
  {
    role: "system",
    content: [
      "You are an interactive browser-debugging agent.",
      "Use the provided browser tools when the user asks you to inspect, control, test, or debug Chrome.",
      "Explain briefly what you learned after tool calls.",
      "Prefer stable selectors when possible, and ask for clarification only when the user request is ambiguous enough to risk doing the wrong thing.",
      "Keep browser actions scoped to the user's request. Do not close sessions unless the user asks or a cleanup command is used."
    ].join("\n")
  }
];

const trackedSessionIds = new Set();
const toolTrace = [];

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const text = fs.readFileSync(envPath, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function responseTools() {
  return browserToolSchemas.map((schema) => ({
    type: "function",
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters
    }
  }));
}

async function createChatCompletion() {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: responseTools(),
      tool_choice: "auto",
      stream: false,
      max_tokens: 1600
    })
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Chat completion failed: ${JSON.stringify(body, null, 2)}`);
  }

  const message = body.choices?.[0]?.message;

  if (!message) {
    throw new Error(`Chat completion did not return a message: ${JSON.stringify(body)}`);
  }

  return message;
}

function parseArguments(call) {
  const raw = call.function?.arguments;

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

async function executeToolCall(call) {
  const name = call.function?.name;
  const args = parseArguments(call);
  const startedAt = Date.now();
  let ok = true;
  let error = null;
  let result;

  try {
    result = await callBrowserTool(name, args);
  } catch (caught) {
    ok = false;
    error = caught instanceof Error ? caught.message : String(caught);
    result = { ok: false, error };
  }

  rememberSessionIds(result);
  const durationMs = Date.now() - startedAt;
  const summarized = summarizeToolResult(result);

  toolTrace.push({
    name,
    args,
    ok,
    error,
    durationMs,
    result: summarized
  });

  console.log(`${ok ? "tool" : "tool_fail"} ${name} ${JSON.stringify(args)} (${durationMs}ms)`);

  return {
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify({
      ok,
      error,
      result: summarized
    })
  };
}

function rememberSessionIds(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (typeof value.sessionId === "string") {
    trackedSessionIds.add(value.sessionId);
  }

  if (value.result && typeof value.result === "object") {
    rememberSessionIds(value.result);
  }

  if (value.session && typeof value.session === "object") {
    rememberSessionIds(value.session);
  }
}

function summarizeToolResult(value) {
  return trimLargeValues(value);
}

function trimLargeValues(value, depth = 0) {
  if (depth > 5) {
    return "[depth limit]";
  }

  if (typeof value === "string") {
    return value.length > 1800 ? `${value.slice(0, 1800)}...[truncated]` : value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => trimLargeValues(item, depth + 1));
  }

  const output = {};

  for (const [key, child] of Object.entries(value)) {
    if (key === "dataBase64" && typeof child === "string") {
      output.dataBase64Prefix = child.slice(0, 32);
      output.dataBase64Length = child.length;
      continue;
    }

    if (key === "domSnapshot" && child && typeof child === "object") {
      output.domSnapshot = "[dom snapshot present]";
      continue;
    }

    if (key === "accessibilityTree" && Array.isArray(child)) {
      output.accessibilityTree = child.slice(0, 15);
      output.accessibilityTreeLength = child.length;
      continue;
    }

    if (key === "elements" && Array.isArray(child)) {
      output.elements = child.slice(0, 20);
      output.elementsLength = child.length;
      continue;
    }

    output[key] = trimLargeValues(child, depth + 1);
  }

  return output;
}

async function runAssistantTurn() {
  for (;;) {
    const message = await createChatCompletion();
    const calls = message.tool_calls || [];

    const assistantMessage = {
      role: "assistant",
      content: message.content || null
    };

    if (calls.length > 0) {
      assistantMessage.tool_calls = calls;
    }

    messages.push(assistantMessage);

    if (calls.length === 0) {
      if (message.content) {
        console.log(`\nassistant> ${message.content.trim()}\n`);
      }
      return;
    }

    for (const call of calls) {
      const toolOutput = await executeToolCall(call);
      messages.push(toolOutput);
    }
  }
}

async function cleanupSessions() {
  const sessionIds = [...trackedSessionIds];

  for (const sessionId of sessionIds) {
    try {
      await browserStopSession({
        sessionId,
        closeTabs: true
      });
      console.log(`cleaned session ${sessionId}`);
      trackedSessionIds.delete(sessionId);
    } catch (error) {
      console.error(`failed to clean session ${sessionId}:`, error);
    }
  }
}

function printHelp() {
  console.log(`
Commands:
  /help       Show this help
  /reset      Clear chat context, keep browser sessions untouched
  /trace      Print tool trace summary
  /cleanup    Stop tracked browser sessions and close their tabs
  /exit       Quit

Examples:
  打开 https://example.com，观察页面，告诉我有哪些可点击元素
  新建 session 打开本地 fixture，点击按钮，解释每一步发生了什么
  用 raw CDP 读 document.title，然后和 observe 的 title 对比
`);
}

function printTrace() {
  if (toolTrace.length === 0) {
    console.log("No tool calls yet.");
    return;
  }

  for (const [index, entry] of toolTrace.entries()) {
    console.log(
      `${index + 1}. ${entry.ok ? "ok" : "fail"} ${entry.name} (${entry.durationMs}ms) ${JSON.stringify(entry.args)}`
    );
  }
}

const rl = readline.createInterface({
  input,
  output
});

console.log(`LLM browser chat`);
console.log(`Model: ${MODEL}`);
console.log(`API: ${API_URL}`);
console.log(`Type /help for commands.\n`);

try {
  for (;;) {
    let answer;

    try {
      answer = await rl.question("you> ");
    } catch (error) {
      if (error?.code === "ERR_USE_AFTER_CLOSE") {
        break;
      }

      throw error;
    }

    const line = answer.trim();

    if (!line) {
      continue;
    }

    if (line === "/exit" || line === "/quit") {
      break;
    }

    if (line === "/help") {
      printHelp();
      continue;
    }

    if (line === "/reset") {
      messages.splice(1);
      console.log("Chat context reset. Browser sessions were not closed.");
      continue;
    }

    if (line === "/trace") {
      printTrace();
      continue;
    }

    if (line === "/cleanup") {
      await cleanupSessions();
      continue;
    }

    messages.push({
      role: "user",
      content: line
    });

    await runAssistantTurn();
  }
} finally {
  rl.close();
}
