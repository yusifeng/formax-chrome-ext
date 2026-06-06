import { describe, expect, it } from "vitest";
import { createBrowserClient, setupBrowserRuntime } from "../mcp-node-repl/browser-client.js";
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
  let nextTabId = 100;
  const browser = createBrowserClient({
    callTool: async (name, args = {}) => {
      calls.push({ name, args });

      if (name === "browser_create_tab") {
        nextTabId += 1;
        return envelope(name, {
          session: {
            sessionId: "session-a",
            activeTabId: nextTabId,
            tabIds: [nextTabId]
          },
          tab: {
            id: nextTabId,
            windowId: 1,
            active: true,
            groupId: 1,
            sessionId: "session-a",
            controlled: true
          }
        }, "session-a", nextTabId);
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

      if (name === "browser_user_open_tabs") {
        return envelope(name, {
          tabs: [
            {
              id: 55,
              windowId: 1,
              active: true,
              groupId: -1,
              controlled: false,
              title: "Claim me",
              url: "https://example.test",
              claimToken: "claim-token-55",
              claimTokenExpiresAt: Date.now() + 300000
            }
          ]
        }, null, null);
      }

      if (name === "browser_claim_tab") {
        return envelope(name, {
          sessionId: "session-claimed",
          activeTabId: 55,
          tabIds: [55]
        }, "session-claimed", 55);
      }

      if (name === "browser_list_tabs") {
        return envelope(name, {
          tabs: []
        }, args.sessionId as string | null, null);
      }

      if (name === "browser_locator_query") {
        const count = args.kind === "count" && (args.locator as any)?.selector === ".many"
          ? 3
          : 1;
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          kind: args.kind,
          value: args.kind === "count" ? count : true,
          count
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

      if (name === "browser_reload_extension") {
        return envelope(name, {
          reloading: true,
          backendRevision: 3
        }, null, null);
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

  it("uses an initial session id for the first created tab", async () => {
    const calls: Call[] = [];
    const browser = createBrowserClient({
      initialSessionId: "chat-session-a",
      callTool: async (name, args = {}) => {
        calls.push({ name, args });
        return envelope(name, {
          session: {
            sessionId: "chat-session-a",
            activeTabId: 101,
            tabIds: [101]
          },
          tab: {
            id: 101,
            sessionId: "chat-session-a"
          }
        }, "chat-session-a", 101);
      }
    });

    await browser.tabs.new();

    expect(calls[0]).toMatchObject({
      name: "browser_create_tab",
      args: {
        sessionId: "chat-session-a"
      }
    });
  });

  it("generates a stable default session id for direct clients", async () => {
    const { browser, calls } = createMockBrowser();

    await browser.tabs.new();

    expect(calls[0]).toMatchObject({
      name: "browser_create_tab",
      args: {
        sessionId: expect.stringMatching(/^formax-/)
      }
    });
  });

  it("does not treat the preferred session id as an active session for tab listing", async () => {
    const { browser, calls } = createMockBrowser();

    await browser.tabs.list();

    expect(calls[0]).toEqual({
      name: "browser_list_tabs",
      args: {}
    });
  });

  it("uses the current session id when naming a session", async () => {
    const { browser, calls } = createMockBrowser();

    await browser.tabs.new();
    await browser.nameSession("Readable session");

    expect(calls.at(-1)).toEqual({
      name: "browser_name_session",
      args: {
        sessionId: "session-a",
        name: "Readable session"
      }
    });
  });

  it("keeps setupBrowserRuntime idempotent for one global runtime", async () => {
    const globals = {};
    const first = await setupBrowserRuntime({
      globals,
      defaultSessionId: "chat-session-a"
    });
    const second = await setupBrowserRuntime({
      globals,
      defaultSessionId: "chat-session-b"
    });

    expect(second.browser).toBe(first.browser);
    expect(second.agent).toBe(first.agent);
    expect((globals as { __formaxBrowserSessionId?: string }).__formaxBrowserSessionId).toBe("chat-session-a");
  });

  it("keeps two tab handles isolated from mutable browser state", async () => {
    const { browser, calls } = createMockBrowser();
    const tabA = await browser.tabs.new("https://a.example");
    const tabB = await browser.tabs.new("https://b.example");

    await tabA.locator("#only-a").click();
    await tabB.locator("#only-b").click();

    expect(tabA.tabId).toBe(101);
    expect(tabB.tabId).toBe(102);
    expect(calls.at(-2)).toMatchObject({
      name: "browser_locator_action",
      args: {
        tabId: 101,
        locator: { selector: "#only-a" }
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        tabId: 102,
        locator: { selector: "#only-b" }
      }
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
        locator: { kind: "css", selector: "#name-input", index: 0, strict: false },
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

  it("exposes runtime documentation topics", async () => {
    const { browser } = createMockBrowser();

    await expect(browser.documentation()).resolves.toMatchObject({
      name: "Formax browser runtime"
    });
    await expect(browser.documentation("tabs")).resolves.toMatchObject({
      recommendedFlow: expect.arrayContaining([
        expect.stringContaining("browser.user.openTabs()")
      ])
    });
  });

  it("claims user tabs through openTabs claim tokens", async () => {
    const { browser, calls } = createMockBrowser();
    const tabs = await browser.user.openTabs({ currentWindow: true });
    const tab = await browser.user.claimTab({
      ...(tabs[0] as JsonObject),
      turnId: "turn-1"
    });

    expect(tab.sessionId).toBe("session-claimed");
    expect(tab.tabId).toBe(55);
    expect(calls.at(-2)).toMatchObject({
      name: "browser_user_open_tabs",
      args: { currentWindow: true }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_claim_tab",
      args: {
        claimToken: "claim-token-55",
        turnId: "turn-1"
      }
    });
  });

  it("maps indexed locator file upload to upload primitive", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.locator("input[type=file]").nth(2).setInputFiles("/tmp/example.png", {
      waitMs: 25
    });

    expect(calls.at(-1)).toEqual({
      name: "browser_upload_file",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: "input[type=file]",
          index: 2,
          strict: false
        },
        filePath: "/tmp/example.png",
        waitMs: 25
      }
    });
  });

  it("maps last locator to count-derived index", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();
    const last = await tab.locator(".many").last();

    await last.click();

    expect(calls.at(-2)).toMatchObject({
      name: "browser_locator_query",
      args: {
        kind: "count",
        locator: {
          selector: ".many",
          index: 0
        }
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          selector: ".many",
          index: 2
        }
      }
    });
  });

  it("maps semantic locators to locator plans", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.getByRole("button", { name: "Submit", exact: true }).click();
    await tab.getByPlaceholder("Type a test name").fill("Alice");

    expect(calls.at(-2)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "role",
          role: "button",
          name: "Submit",
          exact: true,
          index: 0,
          strict: false
        },
        kind: "click"
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "placeholder",
          text: "Type a test name",
          exact: false,
          index: 0,
          strict: false
        },
        kind: "fill"
      }
    });
  });

  it("exposes reloadExtension and unsupported frame locator explicitly", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(browser.reloadExtension()).resolves.toMatchObject({
      reloading: true,
      backendRevision: 3
    });
    expect(tab.frameLocator("iframe").toJSON()).toMatchObject({
      type: "FrameLocator",
      selector: "iframe",
      supported: false
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_reload_extension"
    });
  });
});
