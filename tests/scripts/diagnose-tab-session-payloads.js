#!/usr/bin/env node

import { createBrowserClient } from "../../mcp-node-repl/browser-client.js";

function print(label, value) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const calls = [];
  const browser = createBrowserClient({
    initialSessionId: "session-from-runtime",
    callTool: async (name, args = {}) => {
      calls.push({ name, args: structuredClone(args) });

      if (name === "browser_user_open_tabs") {
        return {
          result: {
            tabs: [
              {
                id: 321,
                title: "Target tab",
                url: "https://space.bilibili.com/342646",
                active: true,
                claimToken: "claim-token-1"
              }
            ]
          },
          sessionId: "session-from-runtime"
        };
      }

      if (name === "browser_claim_tab") {
        return {
          result: {
            sessionId: "session-from-runtime",
            activeTabId: 321
          },
          sessionId: "session-from-runtime",
          tabId: 321
        };
      }

      if (name === "browser_finalize_session") {
        return {
          result: {
            ok: true
          },
          sessionId: "session-from-runtime"
        };
      }

      throw new Error(`Unexpected tool call: ${name}`);
    }
  });

  const openTabs = await browser.user.openTabs();
  const candidate = openTabs.find((tab) => tab.url.includes("space.bilibili.com/342646"));
  if (!candidate) {
    throw new Error("Expected a candidate tab from openTabs()");
  }

  const claimed = await browser.user.claimTab(candidate);
  await browser.tabs.finalize({ keep: [claimed] });

  print("recorded calls", calls);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
