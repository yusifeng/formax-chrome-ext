#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
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
const HOST = "127.0.0.1";
const MAX_TOOL_CALLS = process.env.LLM_BROWSER_MAX_TOOL_CALLS
  ? Number(process.env.LLM_BROWSER_MAX_TOOL_CALLS)
  : Infinity;
const KEEP_TABS = process.env.KEEP_TABS === "1";
const API_URL = `${BASE_URL.replace(/\/+$/, "")}/chat/completions`;

const ALLOWED_TOOL_NAMES = new Set([
  "browser_health",
  "browser_start_session",
  "browser_open_url",
  "browser_wait_for_load_state",
  "browser_wait_for_selector",
  "browser_wait_for_text",
  "browser_observe",
  "browser_click",
  "browser_type_text",
  "browser_press_key",
  "browser_wait_for_url",
  "browser_evaluate",
  "browser_cdp",
  "browser_move_mouse",
  "browser_scroll",
  "browser_screenshot"
]);

if (!API_KEY) {
  console.error("DEEPSEEK_API_KEY or OPENAI_API_KEY is required.");
  process.exit(2);
}

let server;
let baseUrl;
let activeSessionId = null;
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

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

function appPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>LLM Browser Fixture</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        margin: 32px;
        line-height: 1.45;
      }

      .spacer {
        height: 900px;
        background: linear-gradient(#f8fafc, #e0f2fe);
      }
    </style>
  </head>
  <body>
    <h1>LLM Browser Fixture</h1>
    <p id="intro">Ready for LLM-driven browser verification.</p>

    <button id="count-button" type="button">Count click</button>
    <span id="count-result">Clicks: 0</span>

    <form id="test-form">
      <label>
        Name
        <input id="name-input" name="name" placeholder="Type a test name">
      </label>
      <button id="submit-button" type="submit">Submit</button>
    </form>
    <div id="submit-result">No submission yet</div>

    <div id="delayed-host"></div>
    <div class="spacer">Scroll target area</div>

    <script>
      window.testState = { clicks: 0, submissions: [] };

      document.getElementById("count-button").addEventListener("click", () => {
        window.testState.clicks += 1;
        document.getElementById("count-result").textContent =
          "Clicks: " + window.testState.clicks;
      });

      document.getElementById("test-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const value = document.getElementById("name-input").value;
        window.testState.submissions.push(value);
        document.getElementById("submit-result").textContent =
          "Submitted: " + value;
        history.pushState(null, "", "/submitted?name=" + encodeURIComponent(value));
      });

      setTimeout(() => {
        const delayed = document.createElement("div");
        delayed.id = "delayed-ready";
        delayed.textContent = "Delayed fixture ready";
        document.getElementById("delayed-host").appendChild(delayed);
      }, 300);
    </script>
  </body>
</html>`;
}

function startFixtureServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((_req, res) => {
      const body = appPage();
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(body)
      });
      res.end(body);
    });

    server.on("error", reject);
    server.listen(0, HOST, () => {
      baseUrl = `http://${HOST}:${server.address().port}`;
      resolve();
    });
  });
}

async function stopFixtureServer() {
  if (!server) {
    return;
  }

  server.closeIdleConnections?.();
  server.closeAllConnections?.();

  await Promise.race([
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
    new Promise((resolve) => setTimeout(resolve, 2000))
  ]);

  server = null;
}

function responseTools() {
  return browserToolSchemas
    .filter((schema) => ALLOWED_TOOL_NAMES.has(schema.name))
    .map((schema) => ({
      type: "function",
      function: {
        name: schema.name,
        description: schema.description,
        parameters: schema.parameters
      }
    }));
}

async function createChatCompletion(messages) {
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
      max_tokens: 1200
    })
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`OpenAI response failed: ${JSON.stringify(body, null, 2)}`);
  }

  return body;
}

function responseMessage(completion) {
  const message = completion.choices?.[0]?.message;

  if (!message) {
    throw new Error(`Chat completion did not return a message: ${JSON.stringify(completion)}`);
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

function guardToolCall(name, args) {
  if (!ALLOWED_TOOL_NAMES.has(name)) {
    throw new Error(`Tool is not allowed in LLM browser test: ${name}`);
  }

  if (
    name === "browser_open_url" &&
    typeof args.url === "string" &&
    !args.url.startsWith(baseUrl)
  ) {
    throw new Error(`browser_open_url is restricted to fixture URL: ${args.url}`);
  }

  if (name === "browser_cdp" && args.method !== "Runtime.evaluate") {
    throw new Error(`browser_cdp is restricted to Runtime.evaluate in this test`);
  }
}

async function executeToolCall(call) {
  const name = call.function?.name;
  const args = parseArguments(call);
  guardToolCall(name, args);

  const startedAt = Date.now();
  let result;
  let ok = true;
  let error = null;

  try {
    result = await callBrowserTool(name, args);
  } catch (caught) {
    ok = false;
    error = caught instanceof Error ? caught.message : String(caught);
    result = { ok: false, error };
  }

  if (
    result &&
    typeof result === "object" &&
    typeof result.sessionId === "string"
  ) {
    activeSessionId = result.sessionId;
  }

  if (
    result?.result &&
    typeof result.result === "object" &&
    typeof result.result.sessionId === "string"
  ) {
    activeSessionId = result.result.sessionId;
  }

  const durationMs = Date.now() - startedAt;
  const summarized = summarizeToolResult(result);

  toolTrace.push({
    name,
    args,
    ok,
    durationMs,
    error,
    result: summarized
  });

  console.log(`${ok ? "TOOL" : "TOOL_FAIL"} ${name} (${durationMs}ms)`);

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

function summarizeToolResult(value) {
  return trimLargeValues(value);
}

function trimLargeValues(value, depth = 0) {
  if (depth > 5) {
    return "[depth limit]";
  }

  if (typeof value === "string") {
    return value.length > 1200 ? `${value.slice(0, 1200)}...[truncated]` : value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => trimLargeValues(item, depth + 1));
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
      output.accessibilityTree = child.slice(0, 10);
      output.accessibilityTreeLength = child.length;
      continue;
    }

    if (key === "elements" && Array.isArray(child)) {
      output.elements = child.slice(0, 10);
      output.elementsLength = child.length;
      continue;
    }

    output[key] = trimLargeValues(child, depth + 1);
  }

  return output;
}

function buildInitialMessages() {
  return [
    {
      role: "system",
      content: [
        "You are testing a local browser-control tool protocol.",
        "Use only the provided tools. Do not claim success without checking tool results.",
        "Prefer selectors over element refs when a stable selector is given.",
        "Keep actions scoped to the provided localhost fixture URL.",
        "At the end, return compact JSON with passed, failedSteps, and observations."
      ].join("\n")
    },
    {
      role: "user",
      content: `Run this browser test against ${baseUrl}.

Required steps:
1. Check browser health.
2. Start an active session.
3. Open ${baseUrl}.
4. Wait for #delayed-ready to become visible.
5. Observe the page with accessibility and DOM snapshot enabled.
6. Click #count-button and verify the page shows "Clicks: 1".
7. Type "Codex LLM Test" into #name-input, press Enter, and wait for the URL to contain "/submitted?name=Codex%20LLM%20Test".
8. Verify with evaluate that:
   - document.title is "LLM Browser Fixture"
   - window.testState.clicks is 1
   - #submit-result text is "Submitted: Codex LLM Test"
9. Use raw CDP Runtime.evaluate to read document.title.
10. Move the mouse, scroll down, and take a PNG screenshot.

Mandatory tool-call checklist:
- browser_health
- browser_start_session
- browser_open_url
- browser_wait_for_selector
- browser_observe
- browser_click
- browser_type_text
- browser_press_key
- browser_wait_for_url
- browser_evaluate
- browser_cdp
- browser_move_mouse
- browser_scroll
- browser_screenshot

Do not skip browser_wait_for_url. Call it immediately after pressing Enter.

Return final JSON only:
{
  "passed": boolean,
  "failedSteps": string[],
  "observations": string[]
}`
    }
  ];
}

async function runLlmLoop() {
  const messages = buildInitialMessages();
  let toolCalls = 0;

  for (let iteration = 1; ; iteration += 1) {
    console.log(`LLM iteration ${iteration}`);
    const completion = await createChatCompletion(messages);
    const message = responseMessage(completion);
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
      return message.content || "";
    }

    for (const call of calls) {
      toolCalls += 1;

      if (Number.isFinite(MAX_TOOL_CALLS) && toolCalls > MAX_TOOL_CALLS) {
        throw new Error(`Exceeded max tool calls: ${MAX_TOOL_CALLS}`);
      }

      const output = await executeToolCall(call);
      messages.push(output);
    }
  }

}

function assertLlmRun(finalText) {
  const names = new Set(toolTrace.map((entry) => entry.name));
  const failedTools = toolTrace.filter((entry) => !entry.ok);

  assert(failedTools.length === 0, "LLM tool run had failed tool calls", failedTools);

  for (const required of [
    "browser_health",
    "browser_start_session",
    "browser_open_url",
    "browser_wait_for_selector",
    "browser_observe",
    "browser_click",
    "browser_type_text",
    "browser_press_key",
    "browser_wait_for_url",
    "browser_evaluate",
    "browser_cdp",
    "browser_move_mouse",
    "browser_scroll",
    "browser_screenshot"
  ]) {
    assert(names.has(required), `LLM did not call required tool: ${required}`);
  }

  const evaluatedValues = toolTrace
    .filter((entry) => entry.name === "browser_evaluate")
    .map((entry) => entry.result?.result?.value);
  const hasEvaluatedTitle = evaluatedValues.some(
    (value) =>
      value === "LLM Browser Fixture" ||
      value?.title === "LLM Browser Fixture"
  );
  const hasEvaluatedClicks = evaluatedValues.some(
    (value) => value === 1 || value?.clicks === 1
  );
  const hasEvaluatedSubmit = evaluatedValues.some(
    (value) =>
      value === "Submitted: Codex LLM Test" ||
      value?.submitResult === "Submitted: Codex LLM Test"
  );

  assert(hasEvaluatedTitle, "LLM evaluate title assertion failed", evaluatedValues);
  assert(hasEvaluatedClicks, "LLM evaluate click assertion failed", evaluatedValues);
  assert(hasEvaluatedSubmit, "LLM evaluate submit assertion failed", evaluatedValues);

  const cdpTrace = toolTrace.findLast((entry) => entry.name === "browser_cdp");
  assert(
    cdpTrace?.result?.result?.result?.result?.value === "LLM Browser Fixture",
    "LLM raw CDP assertion failed",
    cdpTrace?.result
  );

  assert(
    /"passed"\s*:\s*true/.test(finalText),
    "LLM final response did not report passed=true",
    finalText
  );
}

try {
  await startFixtureServer();
  console.log(`Fixture server: ${baseUrl}`);
  console.log(`Model: ${MODEL}`);
  console.log(`API: ${API_URL}`);

  const finalText = await runLlmLoop();
  console.log("\nLLM final output:");
  console.log(finalText);

  assertLlmRun(finalText);
  console.log(`\nLLM browser agent test passed with ${toolTrace.length} tool calls.`);
} finally {
  if (activeSessionId && !KEEP_TABS) {
    await browserStopSession({
      sessionId: activeSessionId,
      closeTabs: true
    }).catch((error) => {
      console.error("WARN failed to stop browser session:", error);
    });
  }

  await stopFixtureServer();
}
