#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

loadDotEnv();

const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
const MODEL = process.env.LLM_NODE_REPL_MODEL || process.env.LLM_BROWSER_MODEL || "deepseek-v4-flash";
const BASE_URL =
  process.env.LLM_NODE_REPL_BASE_URL ||
  process.env.LLM_BROWSER_BASE_URL ||
  process.env.DEEPSEEK_BASE_URL ||
  "https://api.deepseek.com";
const API_URL = `${BASE_URL.replace(/\/+$/, "")}/chat/completions`;
const LOG_DIR = path.resolve(process.cwd(), process.env.LLM_NODE_REPL_LOG_DIR || "logs");
const LOG_PATH =
  process.env.LLM_NODE_REPL_LOG_PATH ||
  path.join(LOG_DIR, `llm-node-repl-chat-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const SKILL_PATH = path.resolve(
  process.cwd(),
  process.env.LLM_NODE_REPL_SKILL ||
    process.env.LLM_NODE_REPL_SYSTEM_PROMPT ||
    "skill/SKILL.md"
);

if (!API_KEY) {
  console.error("DEEPSEEK_API_KEY or OPENAI_API_KEY is required.");
  process.exit(2);
}

const systemMessage = {
  role: "system",
  content: loadSkill()
};

let messages = [systemMessage];
const toolTrace = [];
let turnId = 0;

const mcpClient = new Client({
  name: "formax-node-repl-llm-chat",
  version: "0.1.0"
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["mcp-node-repl/server.js"],
  cwd: process.cwd(),
  stderr: "pipe"
});

transport.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
  appendLog("mcp_stderr", {
    text: chunk.toString("utf8")
  });
});

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

function appendLog(event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    turnId,
    ...payload
  };

  fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
}

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

function loadSkill() {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch {
    return [
      "You are an interactive local agent. The user talks naturally; never ask the user to write JavaScript.",
      "You have only three external tools: js, js_add_node_module_dir, and js_reset.",
      "Use js to run your own JavaScript in the persistent Node runtime.",
      "When the user asks for browser control, bootstrap ./mcp-node-repl/browser-client.js.",
      "Reuse globalThis.__activeBrowserTab when possible and do not create multiple new tabs for retries.",
      "Keep replies brief and report what happened after tool calls."
    ].join("\n");
  }
}

function responseTools(mcpTools) {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}

async function createChatCompletion(tools) {
  appendLog("llm_request", {
    messageCount: messages.length,
    toolCount: tools.length,
    model: MODEL,
    baseUrl: BASE_URL
  });
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      stream: false,
      max_tokens: 2400
    })
  });

  const body = await response.json();

  if (!response.ok) {
    appendLog("llm_error", {
      status: response.status,
      body
    });
    throw new Error(`Chat completion failed: ${JSON.stringify(body, null, 2)}`);
  }

  const message = body.choices?.[0]?.message;

  if (!message) {
    appendLog("llm_error", {
      status: response.status,
      body
    });
    throw new Error(`Chat completion did not return a message: ${JSON.stringify(body)}`);
  }

  appendLog("llm_response", {
    content: message.content || "",
    toolCalls: (message.tool_calls || []).map((call) => ({
      id: call.id,
      name: call.function?.name,
      arguments: call.function?.arguments
    }))
  });

  return message;
}

function parseArguments(call) {
  const raw = call.function?.arguments;

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function toolContent(result) {
  return (result.content || [])
    .map((item) => {
      if (item.type === "text") {
        return item.text;
      }

      return JSON.stringify(item);
    })
    .join("\n");
}

async function executeToolCall(call) {
  const name = call.function?.name;
  const args = parseArguments(call);
  const startedAt = Date.now();
  let ok = true;
  let content;

  try {
    const result = await mcpClient.callTool({
      name,
      arguments: args
    });
    content = toolContent(result);
  } catch (error) {
    ok = false;
    content = error instanceof Error ? error.message : String(error);
  }

  toolTrace.push({
    name,
    args,
    ok,
    durationMs: Date.now() - startedAt,
    content
  });
  appendLog("tool_result", {
    name,
    args,
    ok,
    durationMs: Date.now() - startedAt,
    content
  });

  console.log(`tool> ${name} ${ok ? "ok" : "error"} (${Date.now() - startedAt}ms)`);

  return {
    role: "tool",
    tool_call_id: call.id,
    name,
    content
  };
}

function appendAssistantMessage(message) {
  const calls = message.tool_calls || [];
  const assistantMessage = {
    role: "assistant",
    content: message.content || ""
  };

  if (calls.length > 0) {
    assistantMessage.tool_calls = calls;
  }

  messages.push(assistantMessage);
  return calls;
}

async function runAssistantTurn(tools) {
  while (true) {
    const message = await createChatCompletion(tools);
    const calls = appendAssistantMessage(message);

    if (calls.length === 0) {
      if (message.content) {
        console.log(`assistant> ${message.content}`);
      }

      return;
    }

    for (const call of calls) {
      messages.push(await executeToolCall(call));
    }
  }
}

async function resetKernel() {
  await mcpClient.callTool({
    name: "js_reset",
    arguments: {}
  });
}

async function bootstrapBrowser() {
  await mcpClient.callTool({
    name: "js",
    arguments: {
      title: "Bootstrap browser runtime",
      code: [
        "if (!globalThis.browser) {",
        "  const { setupBrowserRuntime } = await import('./mcp-node-repl/browser-client.js');",
        "  await setupBrowserRuntime({ globals: globalThis });",
        "}",
        "return { browsers: agent.browsers.list(), kind: browser.kind, toolCount: browser.tools.length };"
      ].join("\n")
    }
  });
}

async function cleanupBrowserSessions() {
  const result = await mcpClient.callTool({
    name: "js",
    arguments: {
      title: "Cleanup browser sessions",
      timeout_ms: 15000,
      code: [
        "if (!globalThis.browser) {",
        "  const { setupBrowserRuntime } = await import('./mcp-node-repl/browser-client.js');",
        "  await setupBrowserRuntime({ globals: globalThis });",
        "}",
        "const browser = await agent.browsers.get('extension');",
        "const tabs = await browser.tabs.list({ all: true, controlledOnly: true });",
        "const sessionIds = Array.from(new Set(tabs.map((tab) => tab.sessionId).filter(Boolean)));",
        "const stopped = [];",
        "for (const sessionId of sessionIds) {",
        "  try {",
        "    stopped.push(await browser.stopSession({ sessionId, closeTabs: true }));",
        "  } catch (error) {",
        "    stopped.push({ sessionId, ok: false, error: error instanceof Error ? error.message : String(error) });",
        "  }",
        "}",
        "globalThis.__activeBrowserTab = undefined;",
        "return { controlledTabCount: tabs.length, sessionCount: sessionIds.length, stopped };"
      ].join("\n")
    }
  });

  return toolContent(result);
}

function printHelp() {
  console.log(
    [
      "Commands:",
      "  /help       Show this help.",
      "  /trace      Print MCP tool calls from this chat.",
      "  /log        Print the JSONL log path.",
      "  /bootstrap  Inject browser runtime into node_repl now.",
      "  /cleanup    Close controlled Agent browser sessions and tabs.",
      "  /reset      Clear chat messages and reset node_repl state.",
      "  /exit       Quit."
    ].join("\n")
  );
}

await mcpClient.connect(transport);
const mcpTools = (await mcpClient.listTools()).tools;
const tools = responseTools(mcpTools);
const rl = readline.createInterface({ input, output });

console.log(`LLM node_repl chat ready. model=${MODEL} base=${BASE_URL}`);
console.log(`MCP tools: ${mcpTools.map((tool) => tool.name).join(", ")}`);
console.log(`Log: ${LOG_PATH}`);
console.log("Type /help for commands.");
appendLog("chat_started", {
  model: MODEL,
  baseUrl: BASE_URL,
  apiUrl: API_URL,
  tools: mcpTools.map((tool) => tool.name),
  logPath: LOG_PATH,
  skillPath: SKILL_PATH
});

try {
  while (true) {
    let line;

    try {
      line = await rl.question("you> ");
    } catch (error) {
      if (error?.code === "ERR_USE_AFTER_CLOSE") {
        break;
      }

      throw error;
    }

    const text = line.trim();

    if (!text) {
      continue;
    }

    if (text === "/exit") {
      break;
    }

    if (text === "/help") {
      printHelp();
      continue;
    }

    if (text === "/trace") {
      console.log(JSON.stringify(toolTrace, null, 2));
      continue;
    }

    if (text === "/log") {
      console.log(LOG_PATH);
      continue;
    }

    if (text === "/bootstrap") {
      await bootstrapBrowser();
      console.log("browser runtime bootstrapped.");
      appendLog("bootstrap");
      continue;
    }

    if (text === "/cleanup") {
      try {
        const cleanup = await cleanupBrowserSessions();
        console.log(cleanup);
        appendLog("cleanup", {
          result: cleanup
        });
      } catch (error) {
        appendLog("cleanup_error", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        console.error(error instanceof Error ? error.stack || error.message : error);
      }
      continue;
    }

    if (text === "/reset") {
      messages = [systemMessage];
      toolTrace.length = 0;
      await resetKernel();
      console.log("chat context and node_repl state reset.");
      appendLog("reset");
      continue;
    }

    turnId += 1;
    appendLog("user_message", {
      content: text
    });
    messages.push({
      role: "user",
      content: text
    });

    try {
      await runAssistantTurn(tools);
      appendLog("turn_finished");
    } catch (error) {
      appendLog("turn_error", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      console.error(error instanceof Error ? error.stack || error.message : error);
    }
  }
} finally {
  appendLog("chat_stopped");
  rl.close();
  await mcpClient.close();
}
