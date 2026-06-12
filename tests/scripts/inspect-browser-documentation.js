#!/usr/bin/env node

import process from "node:process";
import { setupBrowserRuntime } from "../../build/runtime/scripts/browser-client.mjs";

function parseArgs(argv) {
  const args = {
    topic: null,
    agent: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--topic") {
      args.topic = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--agent") {
      args.agent = true;
      continue;
    }
  }

  return args;
}

function printValue(label, value) {
  console.log(`\n=== ${label} ===`);
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { agent, browser } = await setupBrowserRuntime({ globals: globalThis });
  const topics = agent.documentation.list();

  printValue("agent.documentation.list()", topics);

  if (args.topic) {
    const source = args.agent ? agent.documentation : browser;
    const value = await source.get?.(args.topic) ?? await source.documentation?.(args.topic);
    printValue(
      args.agent
        ? `agent.documentation.get(${JSON.stringify(args.topic)})`
        : `browser.documentation(${JSON.stringify(args.topic)})`,
      value
    );
    return;
  }

  printValue("browser.documentation()", await browser.documentation());
  printValue('agent.documentation.get("api")', await agent.documentation.get("api"));

  for (const topic of topics) {
    printValue(`browser.documentation(${JSON.stringify(topic)})`, await browser.documentation(topic));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
