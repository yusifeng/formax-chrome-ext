import { describe, expect, it } from "vitest";
import { createBrowserClient } from "../mcp-node-repl/browser-client.js";
import type { BrowserToolResult, JsonObject } from "../shared/types.js";

type Call = {
  name: string;
  args: JsonObject;
};

function envelope(action: string, result: unknown, sessionId: string | null = null, tabId: number | null = null): BrowserToolResult<unknown> {
  return {
    actionId: `${action}-1`,
    action: action.replace(/^browser_/, "") as any,
    ok: true,
    sessionId,
    tabId,
    timing: {
      startedAt: 0,
      endedAt: 0,
      durationMs: 0
    },
    result
  };
}

function createMockBrowser() {
  const calls: Call[] = [];
  const browser = createBrowserClient({
    callTool: async (name, args = {}) => {
      calls.push({ name, args });

      if (name === "browser_create_tab") {
        return envelope(name, {
          session: {
            sessionId: "session-a",
            activeTabId: 101,
            tabIds: [101]
          },
          tab: {
            id: 101,
            windowId: 1,
            active: true,
            groupId: 1,
            sessionId: "session-a",
            controlled: true
          }
        }, "session-a", 101);
      }

      if (name === "browser_open_url") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          source: "chrome_page",
          trust: "untrusted",
          url: args.url,
          title: "Example",
          viewport: { width: 1, height: 1, devicePixelRatio: 1 },
          text: "",
          elements: []
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_locator_query") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          kind: args.kind,
          value: args.kind === "count" ? 1 : true,
          count: 1
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_wait_for_selector") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          selector: args.selector,
          matched: args.selector !== "#missing",
          timedOut: args.selector === "#missing",
          elapsedMs: 1
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_evaluate") {
        return envelope(name, {
          value: "evaluated"
        }, args.sessionId as string, args.tabId as number);
      }

      return envelope(name, {
        ok: true,
        sessionId: args.sessionId,
        tabId: args.tabId
      }, args.sessionId as string | null, args.tabId as number | null);
    }
  });

  return { browser, calls };
}

describe("browser-client object facade", () => {
  it("creates a tab, navigates, and carries explicit tab identity", async () => {
    const { browser, calls } = createMockBrowser();

    const tab = await browser.tabs.new("https://example.test", { active: true, timeoutMs: 123 });

    expect(tab.sessionId).toBe("session-a");
    expect(tab.tabId).toBe(101);
    expect(calls.map((call) => call.name)).toEqual([
      "browser_create_tab",
      "browser_open_url"
    ]);
    expect(calls[1].args).toMatchObject({
      sessionId: "session-a",
      tabId: 101,
      url: "https://example.test",
      active: true,
      timeoutMs: 123
    });
  });

  it("maps locator actions to locator primitives", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator("#name-input").fill("Alice", { waitMs: 50, strict: true });

    const action = calls.at(-1);
    expect(action).toEqual({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: { kind: "css", selector: "#name-input" },
        kind: "fill",
        waitMs: 50,
        args: { value: "Alice" }
      }
    });
  });

  it("defaults waits to throwing and supports soft waits", async () => {
    const { browser } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(tab.waitForSelector("#missing")).rejects.toThrow("waitForSelector timed out");
    await expect(tab.waitForSelector("#missing", { soft: true })).resolves.toMatchObject({
      matched: false,
      timedOut: true
    });
  });

  it("treats string click targets as selectors in object API", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.click("e1");
    await tab.click({ ref: "e1" });

    expect(calls.at(-2)).toMatchObject({
      name: "browser_click",
      args: { selector: "e1" }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_click",
      args: { ref: "e1" }
    });
  });

  it("returns evaluated page values directly from tab.evaluate", async () => {
    const { browser } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(tab.evaluate("document.title")).resolves.toBe("evaluated");
  });
});
