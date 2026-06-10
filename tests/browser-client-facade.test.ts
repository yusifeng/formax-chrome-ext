import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowserDomCuaStaleNodeError,
  createBrowserClient,
  setupBrowserRuntime
} from "../mcp-node-repl/browser-client.js";
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

      if (name === "browser_get_tab") {
        return envelope(name, {
          tab: {
            id: args.tabId,
            url: "https://example.test/current",
            title: "Current Example"
          }
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
              groupLabel: "Research",
              openedAt: 1780000100000,
              lastFocusedAt: 1780000200000,
              controlled: false,
              title: "Claim me",
              url: "https://example.test",
              claimToken: "claim-token-55",
              claimTokenExpiresAt: Date.now() + 300000
            }
          ]
        }, null, null);
      }

      if (name === "browser_user_history") {
        return envelope(name, {
          sensitive: true,
          entries: [
            {
              id: "1",
              url: "https://example.test/callback?code=%5Bredacted%5D",
              title: "Example [redacted-secret]",
              dateVisited: "2026-06-08T00:00:00.000Z",
              lastVisitTime: 1780876800000,
              redacted: true,
              redactionReasons: ["sensitive_query_param", "secret_pattern"]
            }
          ]
        }, null, null);
      }

      if (name === "browser_get_capabilities") {
        return envelope(name, {
          capabilities: [
            {
              id: "browser.tabs",
              scope: "browser",
              description: "List, create, select, and finalize controlled tabs.",
              available: true
            },
            {
              id: "tab.locator.css",
              scope: "tab",
              description: "Use CSS selector based waits/actions.",
              available: true
            },
            {
              id: "clipboard",
              scope: "browser",
              description: "Read and write browser clipboard content.",
              available: true
            }
          ]
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_clipboard_read_text") {
        return envelope(name, {
          text: "clipboard text",
          sensitive: true
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_clipboard_write_text") {
        return envelope(name, {
          written: true,
          textLength: String(args.text ?? "").length
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_clipboard_read") {
        return envelope(name, {
          sensitive: true,
          items: [
            {
              types: [
                {
                  mimeType: "text/plain",
                  text: "clipboard text",
                  dataBase64: "Y2xpcGJvYXJkIHRleHQ=",
                  size: 14
                },
                {
                  mimeType: "image/png",
                  dataBase64: "iVBORw0KGgo=",
                  size: 8
                }
              ]
            }
          ]
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_clipboard_write") {
        return envelope(name, {
          written: true,
          itemCount: Array.isArray(args.items) ? args.items.length : 0
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_screenshot") {
        const format = args.format === "jpeg" ? "jpeg" : "png";

        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          format,
          fullPage: args.fullPage === true,
          clip: args.clip ?? null,
          dataBase64: "aGVsbG8="
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_wait_for_download") {
        return envelope(name, {
          matched: true,
          timedOut: false,
          state: args.state ?? "complete",
          elapsedMs: 25,
          download: {
            id: 7,
            url: "https://example.test/report.csv",
            finalUrl: "https://cdn.example.test/report.csv",
            filename: "/Users/david/Downloads/report.csv",
            mime: "text/csv",
            state: "complete",
            totalBytes: 12,
            bytesReceived: 12,
            startTime: "2026-06-08T00:00:00.000Z",
            endTime: "2026-06-08T00:00:01.000Z"
          }
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_download_media") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          media: {
            url: "https://cdn.example.test/assets/photo.png",
            kind: "img",
            tagName: "img",
            attribute: "src",
            filename: args.filename ?? null,
            method: "chrome_downloads"
          },
          download: {
            id: 8,
            url: "https://cdn.example.test/assets/photo.png",
            finalUrl: "https://cdn.example.test/assets/photo.png",
            filename: "/Users/david/Downloads/photo.png",
            mime: "image/png",
            state: "complete",
            totalBytes: 24,
            bytesReceived: 24,
            startTime: "2026-06-08T00:00:00.000Z",
            endTime: "2026-06-08T00:00:01.000Z"
          }
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_wait_for_file_chooser") {
        return envelope(name, {
          matched: true,
          timedOut: false,
          elapsedMs: 12,
          fileChooserId: "fc-test",
          file_chooser_id: "fc-test",
          isMultiple: true,
          is_multiple: true,
          fileChooser: {
            fileChooserId: "fc-test",
            file_chooser_id: "fc-test",
            ref: "upload-ref",
            selector: null,
            multiple: true,
            isMultiple: true,
            is_multiple: true,
            accept: ".png,.jpg",
            name: "assets",
            inputId: "asset-upload"
          },
          event: {
            sequence: 9,
            name: "fileChooserOpened",
            sessionId: args.sessionId,
            tabId: args.tabId,
            fileChooserId: "fc-test",
            file_chooser_id: "fc-test",
            fileChooser: {
              fileChooserId: "fc-test",
              file_chooser_id: "fc-test",
              ref: "upload-ref",
              selector: null,
              multiple: true,
              accept: ".png,.jpg",
              name: "assets",
              inputId: "asset-upload"
            }
          }
        }, args.sessionId as string | null, args.tabId as number | null);
      }

      if (name === "browser_list_downloads") {
        return envelope(name, {
          downloads: [
            {
              id: 7,
              url: "https://example.test/report.csv",
              filename: "/Users/david/Downloads/report.csv",
              mime: "text/csv",
              state: "complete",
              totalBytes: 12,
              bytesReceived: 12,
              startTime: "2026-06-08T00:00:00.000Z"
            }
          ]
        }, args.sessionId as string | null, null);
      }

      if (name === "browser_observe") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          source: "chrome_page",
          trust: "untrusted",
          url: "https://example.test",
          title: "Example",
          viewport: { width: 1, height: 1, devicePixelRatio: 1 },
          scroll: { x: 0, y: 10, maxX: 0, maxY: 500 },
          focusedElement: {
            role: "textbox",
            label: "Search",
            tagName: "input",
            rect: { x: 2, y: 3, width: 100, height: 20 }
          },
          selectedText: "selected",
          modalState: { hasModal: false, dialogs: [] },
          truncation: {
            text: false,
            textMaxLength: 5000,
            elements: false,
            elementCount: 1,
            elementMaxCount: 120
          },
          text: "Visible DOM",
          elements: [
            {
              ref: "e0",
              nodeId: "n-submit",
              stableNodeId: "n-submit",
              role: "button",
              label: "Submit",
              visibleText: "Submit",
              sensitive: false,
              tagName: "button",
              selectorCandidates: [
                { kind: "id", selector: "#submit" },
                { kind: "ref", selector: "[data-agent-browser-ref=\"e0\"]" }
              ],
              x: 10,
              y: 20,
              rect: { x: 1, y: 2, width: 18, height: 36 }
            }
          ],
          domSnapshot: { documents: [], strings: [] },
          domSnapshotSummary: { documentCount: 1 }
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_element_info") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          source: "chrome_page",
          trust: "untrusted",
          x: args.x,
          y: args.y,
          found: true,
          nodeId: "e0",
          backendNodeId: 777,
          role: "button",
          name: "Submit",
          visibleText: "Submit",
          tagName: "button",
          sensitive: false,
          selectorCandidates: [
            { kind: "id", selector: "#submit" }
          ],
          rect: { x: 1, y: 2, width: 18, height: 36 },
          center: { x: 10, y: 20 },
          rawHit: {
            tagName: "span",
            role: "span",
            name: "Submit",
            rect: { x: 2, y: 3, width: 10, height: 12 }
          }
        }, args.sessionId as string, args.tabId as number);
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
        const value = args.kind === "count"
          ? count
          : args.kind === "inputValue"
            ? "Alice"
            : args.kind === "allInnerTexts"
              ? ["One", "Two"]
              : args.kind === "innerHTML"
                ? "<strong>Alice</strong>"
              : args.kind === "isChecked"
                ? true
              : args.kind === "isHidden"
                ? false
                : args.kind === "isDisabled"
                  ? false
                  : args.kind === "isEditable"
                    ? true
                    : args.kind === "boundingBox"
                      ? { x: 11, y: 22, width: 33, height: 44 }
                      : true;
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          kind: args.kind,
          value,
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

      if (name === "browser_wait_for_text") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          text: args.text,
          matched: args.text !== "Missing",
          timedOut: args.text === "Missing",
          elapsedMs: 1
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_locator_wait") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          state: args.state ?? "visible",
          matched: true,
          timedOut: false,
          elapsedMs: 1
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_evaluate") {
        return envelope(name, {
          value: "evaluated"
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_resolve_frame") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          targetId: args.targetId ?? null,
          frameSelectors: args.frameSelectors,
          matched: true,
          accessible: true,
          frameId: "frame-123",
          resolvedSelectorCount: Array.isArray(args.frameSelectors) ? args.frameSelectors.length : 0,
          unresolvedFrameSelectors: [],
          targetCandidates: [
            {
              targetId: "target-123",
              type: "iframe",
              title: "fixture-frame",
              url: "https://example.test/frame",
              score: 3
            }
          ],
          frame: {
            id: "frame-123",
            parentId: "root-frame",
            name: "fixture-frame",
            url: "https://example.test/frame"
          },
          path: []
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_locator_action" && (args.locator as any)?.selector === ".blocked") {
        const error = new Error("locator_actionability: The locator target is occluded.") as Error & {
          code?: string;
          details?: JsonObject;
        };
        error.code = "locator_actionability";
        error.details = {
          selector: ".blocked",
          actionKind: args.kind,
          actionabilityCode: "occluded",
          count: 1
        };
        throw error;
      }

      if (name === "browser_locator_action" && args.kind === "evaluate") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          kind: args.kind,
          value: "Submit",
          count: 1
        }, args.sessionId as string, args.tabId as number);
      }

      if (name === "browser_locator_action" && args.kind === "evaluateAll") {
        return envelope(name, {
          sessionId: args.sessionId,
          tabId: args.tabId,
          kind: args.kind,
          value: ["One", "Two"],
          count: 2
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

  it("does not send stale tab ids to session-level tab creation or stop calls", async () => {
    const { browser, calls } = createMockBrowser();

    const first = await browser.tabs.new();
    expect(first.tabId).toBe(101);
    await browser.tabs.new();
    await browser.stop({ closeTabs: true });

    const createCalls = calls.filter((call) => call.name === "browser_create_tab");
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0].args).not.toHaveProperty("tabId");
    expect(createCalls[1].args).toMatchObject({ sessionId: "session-a" });
    expect(createCalls[1].args).not.toHaveProperty("tabId");

    const stopCall = calls.find((call) => call.name === "browser_stop_session");
    expect(stopCall?.args).toMatchObject({
      sessionId: "session-a",
      closeTabs: true
    });
    expect(stopCall?.args).not.toHaveProperty("tabId");
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

  it("discovers browser backends and routes only available runtimes", async () => {
    const globals = {};
    const { agent, browser } = await setupBrowserRuntime({
      globals,
      defaultSessionId: "chat-session-a"
    });

    expect(agent.browsers.list()).toEqual(["extension"]);
    expect(agent.browsers.discover()).toEqual([
      expect.objectContaining({
        browserId: "extension",
        available: true,
        type: "chrome-extension"
      }),
      expect.objectContaining({
        browserId: "local",
        available: false,
        reason: "not_implemented",
        type: "local-browser"
      })
    ]);
    await expect(agent.browsers.get("extension")).resolves.toBe(browser);
    await expect(agent.browsers.get("local")).rejects.toThrow("Browser runtime local is unavailable");
    await expect(agent.browsers.closeUnused()).resolves.toEqual({
      closed: [],
      kept: ["extension"]
    });
  });

  it("keeps two tab handles isolated from mutable browser state", async () => {
    const { browser, calls } = createMockBrowser();
    const tabA = await browser.tabs.new("https://a.example");
    const tabB = await browser.tabs.new("https://b.example");

    await tabA.locator("#only-a").click();
    await tabB.locator("#only-b").click();

    expect(tabA.tabId).toBe(101);
    expect(tabB.tabId).toBe(102);
    const locatorActionCalls = calls.filter((call) => call.name === "browser_locator_action");
    expect(locatorActionCalls.at(-2)).toMatchObject({
      name: "browser_locator_action",
      args: {
        tabId: 101,
        locator: { selector: "#only-a" }
      }
    });
    expect(locatorActionCalls.at(-1)).toMatchObject({
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
    await tab.locator("#name-input").pressSequentially("Bob", { waitMs: 20 });

    const action = calls.at(-2);
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
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: { kind: "css", selector: "#name-input" },
        kind: "type",
        waitMs: 20,
        args: {
          value: "Bob"
        }
      }
    });
    expect(tab.locator("#name-input").page()).toBe(tab);
  });

  it("maps locator evaluate helpers and dispatchEvent to locator actions", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await expect(
      tab.locator("#submit").evaluate((element, suffix) => `${(element as HTMLElement).textContent}${suffix}`, "!")
    ).resolves.toBe("Submit");
    await expect(
      tab.locator(".item").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).textContent))
    ).resolves.toEqual(["One", "Two"]);
    await tab.locator("#submit").dispatchEvent("click", { detail: { source: "test" } });

    const locatorActionCalls = calls.filter((call) => call.name === "browser_locator_action");
    expect(locatorActionCalls.at(-3)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: "#submit" },
        kind: "evaluate",
        args: {
          argument: "!"
        }
      }
    });
    expect((locatorActionCalls.at(-3)?.args as any).args.script).toContain("textContent");
    expect(locatorActionCalls.at(-2)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: ".item" },
        kind: "evaluateAll"
      }
    });
    expect(locatorActionCalls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: "#submit" },
        kind: "dispatchEvent",
        args: {
          type: "click",
          eventInit: { detail: { source: "test" } }
        }
      }
    });
  });

  it("maps locator utility actions to locator primitives", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator("#field").blur({ waitMs: 10 });
    await tab.locator("#field").scrollIntoViewIfNeeded({ actionArgs: { block: "nearest" } });
    await tab.locator("#field").selectText();

    const locatorActionCalls = calls.filter((call) => call.name === "browser_locator_action");
    expect(locatorActionCalls.at(-3)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: "#field" },
        kind: "blur",
        waitMs: 10
      }
    });
    expect(locatorActionCalls.at(-2)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: "#field" },
        kind: "scrollIntoViewIfNeeded",
        args: {
          block: "nearest"
        }
      }
    });
    expect(locatorActionCalls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: "#field" },
        kind: "selectText"
      }
    });
  });

  it("maps locator highlight to a non-screenshot locator action", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator("#submit").highlight({
      color: "rgba(255, 190, 80, 0.92)",
      durationMs: 1500,
      waitMs: 25
    });

    expect(calls.at(-1)).toEqual({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: "#submit",
          index: 0,
          strict: false
        },
        kind: "highlight",
        waitMs: 25,
        args: {
          color: "rgba(255, 190, 80, 0.92)",
          durationMs: 1500
        }
      }
    });
  });

  it("maps locator dragTo to a target locator action", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator(".source").dragTo(tab.getByText("Drop here"), {
      button: "left",
      waitMs: 25
    });

    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: ".source"
        },
        kind: "dragTo",
        waitMs: 25,
        args: {
          targetLocator: {
            kind: "text",
            text: "Drop here"
          },
          button: "left"
        }
      }
    });
  });

  it("passes locator force options through to the backend action args", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator("#submit").click({
      force: true,
      button: "right",
      waitMs: 25
    });

    expect(calls.at(-1)).toEqual({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: "#submit",
          index: 0,
          strict: false
        },
        kind: "click",
        waitMs: 25,
        args: {
          force: true,
          button: "right"
        }
      }
    });
  });

  it("passes locator trial options through to the backend action args", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.getByRole("button", { name: "Submit" }).click({
      trial: true,
      waitMs: 0
    });

    expect(calls.at(-1)).toEqual({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "role",
          role: "button",
          name: "Submit",
          exact: false,
          index: 0,
          strict: false
        },
        kind: "click",
        waitMs: 0,
        args: {
          trial: true
        }
      }
    });
  });

  it("maps Playwright-style selectOption specs to locator action args", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator("select#country").selectOption([
      { label: "Canada" },
      { value: "mx" },
      { index: 2 }
    ], { waitMs: 25 });

    expect(calls.at(-1)).toEqual({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: "select#country",
          index: 0,
          strict: false
        },
        kind: "selectOption",
        waitMs: 25,
        args: {
          options: [
            { label: "Canada" },
            { value: "mx" },
            { index: 2 }
          ]
        }
      }
    });
  });

  it("maps locator form queries to locator query primitives", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");
    const locator = tab.locator("#agree");

    await expect(locator.inputValue()).resolves.toBe("Alice");
    await expect(locator.allInnerTexts()).resolves.toEqual(["One", "Two"]);
    await expect(locator.innerHTML()).resolves.toBe("<strong>Alice</strong>");
    await expect(locator.isChecked()).resolves.toBe(true);
    await expect(locator.isHidden()).resolves.toBe(false);
    await expect(locator.isDisabled()).resolves.toBe(false);
    await expect(locator.isEditable()).resolves.toBe(true);

    const locatorQueryCalls = calls.filter((call) => call.name === "browser_locator_query");
    expect(locatorQueryCalls.at(-7)).toMatchObject({
      name: "browser_locator_query",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "inputValue"
      }
    });
    expect(locatorQueryCalls.at(-6)).toMatchObject({
      name: "browser_locator_query",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "allInnerTexts"
      }
    });
    expect(locatorQueryCalls.at(-5)).toMatchObject({
      name: "browser_locator_query",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "innerHTML"
      }
    });
    expect(locatorQueryCalls.at(-4)).toMatchObject({
      name: "browser_locator_query",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "isChecked"
      }
    });
    expect(locatorQueryCalls.at(-3)).toMatchObject({
      name: "browser_locator_query",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "isHidden"
      }
    });
    expect(locatorQueryCalls.at(-2)).toMatchObject({
      name: "browser_locator_query",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "isDisabled"
      }
    });
    expect(locatorQueryCalls.at(-1)).toMatchObject({
      name: "browser_locator_query",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "isEditable"
      }
    });
  });

  it("maps locator all to bounded nth locator handles", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    const locators = await tab.locator(".many").all({ limit: 2 });

    expect(locators.map((locator) => locator.toJSON())).toEqual([
      {
        type: "Locator",
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: ".many",
          index: 0,
          strict: false
        }
      },
      {
        type: "Locator",
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: ".many",
          index: 1,
          strict: false
        }
      }
    ]);
    expect(calls.at(-1)).toEqual({
      name: "browser_locator_query",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: ".many",
          index: 0,
          strict: false
        },
        kind: "count"
      }
    });
    await expect(tab.locator(".many").all({ limit: 0 })).rejects.toThrow(
      /locator.all.limit must be positive/
    );
  });

  it("serializes locator has, hasNot, hasText, hasNotText, and visible filters", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator(".card", {
      has: tab.locator(".badge", { hasText: "Ready" }),
      hasText: "Alpha"
    })
      .filter({
        hasNot: tab.locator(".archived"),
        hasNotText: "Archived",
        visible: true
      })
      .nth(1)
      .click({ waitMs: 10 });

    expect(calls.at(-1)).toEqual({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: ".card",
          has: {
            kind: "css",
            selector: ".badge",
            hasText: "Ready",
            index: 0,
            strict: false
          },
          hasNot: {
            kind: "css",
            selector: ".archived",
            index: 0,
            strict: false
          },
          hasText: "Alpha",
          hasNotText: "Archived",
          visible: true,
          index: 1,
          strict: false
        },
        kind: "click",
        waitMs: 10,
        args: {}
      }
    });
    expect(() => tab.locator(".card", { has: "bad" as any })).toThrow(
      /locator\.has must be a locator handle or locator plan object/
    );
  });

  it("serializes locator-scoped semantic child locators", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator(".card").getByRole("button", { name: "Open" }).click({ waitMs: 10 });
    await tab.getByText("Product card").getByTitle("Help").count();

    expect(calls.at(-2)).toEqual({
      name: "browser_locator_action",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "role",
          role: "button",
          name: "Open",
          exact: false,
          within: {
            kind: "css",
            selector: ".card",
            index: 0,
            strict: false
          },
          index: 0,
          strict: false
        },
        kind: "click",
        waitMs: 10,
        args: {}
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_locator_query",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "title",
          text: "Help",
          exact: false,
          within: {
            kind: "text",
            text: "Product card",
            exact: false,
            index: 0,
            strict: false
          },
          index: 0,
          strict: false
        },
        kind: "count"
      }
    });
  });

  it("serializes locator and/or combinators", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.locator(".card")
      .and(tab.locator(".featured"))
      .or(tab.getByText("Fallback card"))
      .count();

    expect(calls.at(-1)).toEqual({
      name: "browser_locator_query",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: ".card",
          and: {
            kind: "css",
            selector: ".featured",
            index: 0,
            strict: false
          },
          or: {
            kind: "text",
            text: "Fallback card",
            exact: false,
            index: 0,
            strict: false
          },
          index: 0,
          strict: false
        },
        kind: "count"
      }
    });
  });

  it("exposes readable debug strings for locator handles", async () => {
    const { browser } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    const locator = tab.locator(".card")
      .getByRole("button", { name: "Open" })
      .filter({ hasText: "Ready" })
      .nth(2);
    const frameLocator = tab.frameLocator("#outer-frame").frameLocator("#inner-frame");

    expect(String(locator)).toBe(
      'Locator<locator(".card").getByRole("button", { name: "Open" }).filter({ hasText: "Ready" }).nth(2)>'
    );
    expect(locator.toString()).toBe(String(locator));
    expect(String(frameLocator)).toBe('FrameLocator<frameLocator("#outer-frame").frameLocator("#inner-frame")>');
    expect(String(frameLocator.getByText("Save"))).toBe(
      'Locator<frameLocator("#outer-frame").frameLocator("#inner-frame").getByText("Save")>'
    );
    expect(locator.toJSON()).toMatchObject({
      type: "Locator",
      sessionId: "session-a",
      tabId: 101,
      locator: {
        kind: "role",
        role: "button",
        name: "Open"
      }
    });
  });

  it("maps locator check aliases to setChecked actions", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");
    const locator = tab.locator("#agree");

    await locator.check();
    await locator.uncheck();

    expect(calls.at(-2)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "setChecked",
        args: { checked: true }
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "css", selector: "#agree" },
        kind: "setChecked",
        args: { checked: false }
      }
    });
  });

  it("defaults waits to throwing and supports soft waits", async () => {
    const { browser } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(tab.waitForSelector("#missing")).rejects.toMatchObject({
      name: "BrowserTimeoutError",
      code: "timeout",
      operation: "waitForSelector",
      details: expect.objectContaining({
        matched: false,
        timedOut: true
      })
    });
    await expect(tab.waitForSelector("#missing", { soft: true })).resolves.toMatchObject({
      matched: false,
      timedOut: true
    });
  });

  it("normalizes Playwright timeout aliases before calling the backend", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.waitForSelector("#ready", { timeout: 123 });
    await tab.locator("#ready").waitFor({ state: "visible", timeout: 234 });
    await tab.locator("#ready").count({ timeout: 345 });
    await tab.locator("#ready").click({ timeout: 456, trial: true });
    await tab.frameLocator("#frame").resolve({ timeout: 567 });
    await tab.playwright.expectNavigation(
      () => tab.click({ selector: "#submit" }),
      { urlContains: "/done", timeout: 678 }
    );

    const waitSelectorCall = calls.find((call) => call.name === "browser_wait_for_selector");
    expect(waitSelectorCall?.args).toMatchObject({
      selector: "#ready",
      timeoutMs: 123
    });
    expect(waitSelectorCall?.args).not.toHaveProperty("timeout");

    const locatorWaitCall = calls.find((call) => call.name === "browser_locator_wait");
    expect(locatorWaitCall?.args).toMatchObject({
      state: "visible",
      timeoutMs: 234
    });
    expect(locatorWaitCall?.args).not.toHaveProperty("timeout");

    const locatorQueryCall = calls.find((call) => call.name === "browser_locator_query");
    expect(locatorQueryCall?.args).toMatchObject({
      kind: "count",
      timeoutMs: 345
    });
    expect(locatorQueryCall?.args).not.toHaveProperty("timeout");

    const locatorActionCall = calls.find((call) => call.name === "browser_locator_action");
    expect(locatorActionCall?.args).toMatchObject({
      kind: "click",
      timeoutMs: 456,
      args: {
        trial: true
      }
    });
    expect(locatorActionCall?.args).not.toHaveProperty("timeout");

    const resolveFrameCall = calls.find((call) => call.name === "browser_resolve_frame");
    expect(resolveFrameCall?.args).toMatchObject({
      frameSelectors: ["#frame"],
      timeoutMs: 567
    });
    expect(resolveFrameCall?.args).not.toHaveProperty("timeout");

    const waitUrlCall = calls.find((call) => call.name === "browser_wait_for_url");
    expect(waitUrlCall?.args).toMatchObject({
      urlContains: "/done",
      timeoutMs: 678
    });
    expect(waitUrlCall?.args).not.toHaveProperty("timeout");
  });

  it("omits undefined optional fields before local tool validation", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.locator("#ready").click({ waitMs: 25 });

    const locatorActionCall = calls.find((call) =>
      call.name === "browser_locator_action" &&
      (call.args as any).locator?.selector === "#ready"
    );
    expect(locatorActionCall?.args).toMatchObject({
      kind: "click",
      waitMs: 25
    });
    expect(locatorActionCall?.args).not.toHaveProperty("timeoutMs");
    expect(locatorActionCall?.args).not.toHaveProperty("timeout");
  });

  it("throws structured strict locator errors", async () => {
    const { browser } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(tab.locator(".many", { strict: true }).click()).rejects.toMatchObject({
      name: "BrowserStrictModeError",
      code: "strict_mode_violation",
      selector: ".many",
      count: 3
    });
  });

  it("throws structured actionability locator errors from backend details", async () => {
    const { browser } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(tab.locator(".blocked").click()).rejects.toMatchObject({
      name: "BrowserActionabilityError",
      code: "locator_actionability",
      selector: ".blocked",
      action: "click",
      reason: "occluded",
      details: expect.objectContaining({
        actionabilityCode: "occluded"
      })
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

    expect(tabs[0]).toMatchObject({
      title: "Claim me",
      url: "https://example.test",
      groupLabel: "Research",
      openedAt: 1780000100000,
      lastFocusedAt: 1780000200000
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

  it("maps browser user history to the backend action", async () => {
    const { browser, calls } = createMockBrowser();

    await expect(browser.user.history({
      query: "example",
      limit: 5
    })).resolves.toEqual([
      expect.objectContaining({
        url: "https://example.test/callback?code=%5Bredacted%5D",
        title: "Example [redacted-secret]",
        redacted: true,
        redactionReasons: ["sensitive_query_param", "secret_pattern"]
      })
    ]);

    expect(calls.at(-1)).toEqual({
      name: "browser_user_history",
      args: {
        query: "example",
        limit: 5
      }
    });
  });

  it("maps tab clipboard text helpers to backend actions", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await expect(tab.clipboard.readText()).resolves.toBe("clipboard text");
    await expect(tab.clipboard.writeText("hello")).resolves.toMatchObject({
      result: {
        written: true,
        textLength: 5
      }
    });
    await expect(tab.clipboard.write("direct text")).resolves.toMatchObject({
      result: {
        written: true,
        textLength: 11
      }
    });

    expect(calls.at(-3)).toEqual({
      name: "browser_clipboard_read_text",
      args: {
        sessionId: "session-a",
        tabId: 101
      }
    });
    expect(calls.at(-2)).toEqual({
      name: "browser_clipboard_write_text",
      args: {
        sessionId: "session-a",
        tabId: 101,
        text: "hello"
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_clipboard_write_text",
      args: {
        sessionId: "session-a",
        tabId: 101,
        text: "direct text"
      }
    });
  });

  it("maps tab clipboard typed item helpers to clipboard backend actions", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");
    const items = [
      {
        types: [
          {
            dataUrl: "data:image/png;base64,iVBORw0KGgo="
          }
        ]
      }
    ];

    await expect(tab.clipboard.read()).resolves.toEqual([
      expect.objectContaining({
        types: expect.arrayContaining([
          expect.objectContaining({ mimeType: "text/plain" }),
          expect.objectContaining({
            mimeType: "image/png",
            dataBase64: "iVBORw0KGgo=",
            dataUrl: "data:image/png;base64,iVBORw0KGgo="
          })
        ])
      })
    ]);
    await expect(tab.clipboard.write(items)).resolves.toMatchObject({
      result: {
        written: true,
        itemCount: 1
      }
    });

    expect(calls.at(-2)).toEqual({
      name: "browser_clipboard_read",
      args: {
        sessionId: "session-a",
        tabId: 101
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_clipboard_write",
      args: {
        sessionId: "session-a",
        tabId: 101,
        items: [
          {
            types: [
              {
                mimeType: "image/png",
                dataBase64: "iVBORw0KGgo="
              }
            ]
          }
        ]
      }
    });
  });

  it("accepts ClipboardItem-style MIME maps for typed clipboard writes", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new("https://example.test");

    await tab.clipboard.write([
      {
        "text/plain": "Plain text",
        "text/html": { text: "<strong>Plain text</strong>" },
        "image/png": { dataUrl: "data:image/png;base64,iVBORw0KGgo=" }
      }
    ]);
    await tab.clipboard.write({
      "text/plain": "Single item"
    });
    await tab.clipboard.write({
      "application/octet-stream": new Uint8Array([1, 2, 3]),
      "image/png": { bytes: Buffer.from([4, 5, 6]) },
      "application/pdf": { data: Uint8Array.from([7, 8]).buffer },
      "application/x-bytes": { bytes: [9, 10, 11] }
    });

    expect(calls.at(-3)).toEqual({
      name: "browser_clipboard_write",
      args: {
        sessionId: "session-a",
        tabId: 101,
        items: [
          {
            types: [
              {
                mimeType: "text/plain",
                text: "Plain text"
              },
              {
                mimeType: "text/html",
                text: "<strong>Plain text</strong>"
              },
              {
                mimeType: "image/png",
                dataBase64: "iVBORw0KGgo="
              }
            ]
          }
        ]
      }
    });
    expect(calls.at(-2)).toEqual({
      name: "browser_clipboard_write",
      args: {
        sessionId: "session-a",
        tabId: 101,
        items: [
          {
            types: [
              {
                mimeType: "text/plain",
                text: "Single item"
              }
            ]
          }
        ]
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_clipboard_write",
      args: {
        sessionId: "session-a",
        tabId: 101,
        items: [
          {
            types: [
              {
                mimeType: "application/octet-stream",
                dataBase64: "AQID"
              },
              {
                mimeType: "image/png",
                dataBase64: "BAUG"
              },
              {
                mimeType: "application/pdf",
                dataBase64: "Bwg="
              },
              {
                mimeType: "application/x-bytes",
                dataBase64: "CQoL"
              }
            ]
          }
        ]
      }
    });
  });

  it("enriches screenshot facade results with data URLs and bytes", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();
    const tmpDir = mkdtempSync(join(tmpdir(), "formax-screenshot-test-"));
    const outputPath = join(tmpDir, "shot.jpeg");

    try {
      const screenshot = await tab.screenshot({
        format: "jpeg",
        fullPage: true,
        path: outputPath
      });
      const flatScreenshot = await browser.screenshot({ format: "png" });

      expect(screenshot).toMatchObject({
        sessionId: "session-a",
        tabId: 101,
        format: "jpeg",
        mimeType: "image/jpeg",
        dataBase64: "aGVsbG8=",
        dataUrl: "data:image/jpeg;base64,aGVsbG8=",
        path: outputPath
      });
      expect(Buffer.from(screenshot.bytes).toString("utf8")).toBe("hello");
      expect(readFileSync(outputPath).toString("utf8")).toBe("hello");

      expect(flatScreenshot).toMatchObject({
        sessionId: "session-a",
        tabId: 101,
        format: "png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,aGVsbG8="
      });
      expect(Buffer.from(flatScreenshot.bytes).toString("utf8")).toBe("hello");

      expect(calls.at(-2)).toEqual({
        name: "browser_screenshot",
        args: {
          sessionId: "session-a",
          tabId: 101,
          format: "jpeg",
          fullPage: true
        }
      });
      expect(calls.at(-1)).toEqual({
        name: "browser_screenshot",
        args: {
          sessionId: "session-a",
          tabId: 101,
          format: "png"
        }
      });

      const callCount = calls.length;
      await expect(tab.screenshot({ path: "relative.png" })).rejects.toThrow(
        /screenshot.path must be an absolute file path/
      );
      expect(calls).toHaveLength(callCount);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("enriches download facade results with path and suggested filename helpers", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    const waitResult = await browser.downloads.waitFor({ state: "complete" }) as any;
    const download = await tab.playwright.waitForEvent("download", { state: "complete" }) as any;
    const listResult = await browser.downloads.list() as any;

    expect(waitResult.download.suggestedFilename()).toBe("report.csv");
    expect(waitResult.download.path()).toBe("/Users/david/Downloads/report.csv");
    expect(download.suggestedFilename()).toBe("report.csv");
    expect(download.path()).toBe("/Users/david/Downloads/report.csv");
    expect(download.toJSON()).toMatchObject({
      id: 7,
      downloadId: 7,
      download_id: 7,
      filename: "/Users/david/Downloads/report.csv",
      suggestedFilename: "report.csv"
    });
    expect(listResult.downloads[0].suggestedFilename()).toBe("report.csv");
    expect(calls.at(-2)).toMatchObject({
      name: "browser_wait_for_download",
      args: {
        sessionId: "session-a",
        tabId: 101,
        state: "complete"
      }
    });
  });

  it("maps locator downloadMedia to browser_download_media and enriches the download handle", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    const result = await tab.locator("img.hero").downloadMedia({
      filename: "assets/photo.png",
      waitForCompletion: true,
      fallbackFetch: true,
      fallbackMaxBytes: 1024 * 1024
    }) as any;

    expect(result.media).toMatchObject({
      url: "https://cdn.example.test/assets/photo.png",
      attribute: "src",
      method: "chrome_downloads"
    });
    expect(result.download.suggestedFilename()).toBe("photo.png");
    expect(result.download.path()).toBe("/Users/david/Downloads/photo.png");
    expect(result.download).toMatchObject({
      id: 8,
      downloadId: 8,
      download_id: 8
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_download_media",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: "img.hero",
          index: 0,
          strict: false
        },
        filename: "assets/photo.png",
        waitForCompletion: true,
        fallbackFetch: true,
        fallbackMaxBytes: 1024 * 1024
      }
    });
  });

  it("maps playwright filechooser events to setFiles handles", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    const fileChooser = await tab.playwright.waitForEvent("filechooser", { timeoutMs: 50 }) as any;

    expect(fileChooser.isMultiple()).toBe(true);
    expect(fileChooser.toJSON()).toMatchObject({
      fileChooserId: "fc-test",
      ref: "upload-ref",
      multiple: true,
      accept: ".png,.jpg"
    });

    await fileChooser.setFiles(["/tmp/a.png", "/tmp/b.jpg"], {
      waitMs: 25
    });

    expect(calls.at(-2)).toEqual({
      name: "browser_wait_for_file_chooser",
      args: {
        sessionId: "session-a",
        tabId: 101,
        timeoutMs: 50
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_set_file_chooser_files",
      args: {
        sessionId: "session-a",
        tabId: 101,
        fileChooserId: "fc-test",
        file_chooser_id: "fc-test",
        files: ["/tmp/a.png", "/tmp/b.jpg"],
        waitMs: 25
      }
    });
  });

  it("captures element screenshots from locators and dom_cua node ids", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(
      tab.locator("#submit").screenshot({ format: "png", padding: 3, highlight: true })
    ).resolves.toMatchObject({
      tabId: 101,
      format: "png",
      clip: {
        x: 8,
        y: 19,
        width: 39,
        height: 50
      },
      dataUrl: "data:image/png;base64,aGVsbG8="
    });

    await expect(
      tab.dom_cua.screenshot({ node_id: "e0", format: "jpeg", padding: 1 })
    ).resolves.toMatchObject({
      tabId: 101,
      format: "jpeg",
      clip: {
        x: 0,
        y: 1,
        width: 20,
        height: 38
      },
      dataUrl: "data:image/jpeg;base64,aGVsbG8="
    });

    expect(calls.at(-4)).toEqual({
      name: "browser_locator_query",
      args: {
        sessionId: "session-a",
        tabId: 101,
        locator: {
          kind: "css",
          selector: "#submit",
          index: 0,
          strict: false
        },
        kind: "boundingBox"
      }
    });
    expect(calls.at(-3)).toEqual({
      name: "browser_screenshot",
      args: {
        sessionId: "session-a",
        tabId: 101,
        format: "png",
        clip: {
          x: 8,
          y: 19,
          width: 39,
          height: 50
        },
        highlight: true,
        highlightClip: {
          x: 11,
          y: 22,
          width: 33,
          height: 44
        }
      }
    });
    expect(calls.at(-2)).toEqual({
      name: "browser_observe",
      args: {
        sessionId: "session-a",
        tabId: 101,
        includeDomSnapshot: false
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_screenshot",
      args: {
        sessionId: "session-a",
        tabId: 101,
        format: "jpeg",
        clip: {
          x: 0,
          y: 1,
          width: 20,
          height: 38
        }
      }
    });
  });

  it("maps indexed locator file uploads to upload primitive", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.locator("input[type=file]").nth(2).setInputFiles(["/tmp/a.png", "/tmp/b.png"], {
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
        filePaths: ["/tmp/a.png", "/tmp/b.png"],
        waitMs: 25
      }
    });
  });

  it("maps last locator to a synchronous negative index", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();
    const last = tab.locator(".many").last();

    expect(last.toJSON()).toMatchObject({
      locator: {
        selector: ".many",
        index: -1
      }
    });
    expect(String(last)).toBe('Locator<locator(".many").last()>');

    await last.click();

    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          selector: ".many",
          index: -1
        }
      }
    });
  });

  it("maps semantic locators to locator plans", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.getByRole("button", { name: "Submit", exact: true }).click();
    await tab.getByPlaceholder("Type a test name").fill("Alice");
    await tab.getByDisplayValue("Alice").fill("Bob");
    await tab.getByAltText("Product photo", { exact: true }).click();
    await tab.getByTitle("Help").hover();

    const locatorActionCalls = calls.filter((call) => call.name === "browser_locator_action");
    expect(locatorActionCalls.at(-5)).toMatchObject({
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
    expect(locatorActionCalls.at(-4)).toMatchObject({
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
    expect(locatorActionCalls.at(-3)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "displayValue",
          text: "Alice",
          exact: false,
          index: 0,
          strict: false
        },
        kind: "fill",
        args: {
          value: "Bob"
        }
      }
    });
    expect(locatorActionCalls.at(-2)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "altText",
          text: "Product photo",
          exact: true,
          index: 0,
          strict: false
        },
        kind: "click"
      }
    });
    expect(locatorActionCalls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "title",
          text: "Help",
          exact: false,
          index: 0,
          strict: false
        },
        kind: "hover"
      }
    });
  });

  it("exposes reloadExtension and serializes frame locators", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await expect(browser.reloadExtension()).resolves.toMatchObject({
      reloading: true,
      backendRevision: 3
    });
    expect(tab.frameLocator("iframe").toJSON()).toMatchObject({
      type: "FrameLocator",
      selector: "iframe",
      frameSelectors: ["iframe"],
      supported: true
    });
    await expect(tab.frameLocator("#fixture-frame").resolve()).resolves.toMatchObject({
      frameId: "frame-123",
      resolvedSelectorCount: 1,
      unresolvedFrameSelectors: [],
      targetCandidates: [
        expect.objectContaining({
          targetId: "target-123",
          score: 3
        })
      ]
    });
    await tab.frameLocator("#outer-frame")
      .frameLocator("#inner-frame")
      .getByRole("button", { name: "Nested" })
      .click();
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "role",
          role: "button",
          name: "Nested",
          frameSelectors: ["#outer-frame", "#inner-frame"]
        },
        kind: "click"
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action"
    });

    await tab.frameLocator("#fixture-frame").getByDisplayValue("Nested value").fill("Updated");
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "displayValue",
          text: "Nested value",
          frameSelectors: ["#fixture-frame"]
        },
        kind: "fill",
        args: {
          value: "Updated"
        }
      }
    });

    await tab.frameLocator("#fixture-frame").getByTitle("Frame help").hover();
    expect(calls.at(-1)).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: {
          kind: "title",
          text: "Frame help",
          frameSelectors: ["#fixture-frame"]
        },
        kind: "hover"
      }
    });

    await expect(
      tab.frameLocator("#fixture-frame").evaluate("document.title", {
        mode: "read",
        reason: "frame title"
      })
    ).resolves.toBe("evaluated");
    expect(calls.at(-2)).toMatchObject({
      name: "browser_resolve_frame",
      args: {
        frameSelectors: ["#fixture-frame"]
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_evaluate",
      args: {
        frameId: "frame-123",
        mode: "read",
        reason: "frame title"
      }
    });
  });

  it("exposes Codex-compatible browser and tab namespaces", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    expect(browser.browserId).toBe("extension");
    expect(typeof tab.playwright.locator).toBe("function");
    expect(typeof tab.cua.click).toBe("function");
    expect(typeof tab.dom_cua.get_visible_dom).toBe("function");
    expect(typeof tab.dom_cua.element_info).toBe("function");
    expect(typeof tab.dev.logs).toBe("function");
    expect(typeof tab.capabilities.has).toBe("function");

    await tab.playwright.locator("#name-input").fill("Alice", { waitMs: 25 });
    await tab.cua.click({ x: 42, y: 64, button: "back", keypress: "Shift" });
    await tab.cua.drag({
      path: [
        { x: 42, y: 64 },
        { x: 80, y: 96 }
      ],
      keys: ["ControlOrMeta", "Shift"],
      waitMs: 15
    });
    await tab.dom_cua.click({ node_id: "e0" });
    await tab.cua.keypress({ keys: ["ControlOrMeta", "Shift", "Space"] });
    await tab.dev.logs({ limit: 5 });

    expect(calls.at(-7)).toMatchObject({
      name: "browser_locator_action",
      args: {
        tabId: 101,
        locator: { kind: "css", selector: "#name-input" },
        kind: "fill",
        waitMs: 25,
        args: { value: "Alice" }
      }
    });
    expect(calls.at(-6)).toMatchObject({
      name: "browser_click",
      args: {
        tabId: 101,
        x: 42,
        y: 64,
        button: "back",
        modifiers: ["Shift"]
      }
    });
    expect(calls.at(-5)).toMatchObject({
      name: "browser_drag",
      args: {
        tabId: 101,
        path: [
          { x: 42, y: 64 },
          { x: 80, y: 96 }
        ],
        modifiers: ["ControlOrMeta", "Shift"],
        waitMs: 15
      }
    });
    expect(calls.at(-4)).toMatchObject({
      name: "browser_observe",
      args: {
        tabId: 101,
        includeDomSnapshot: false
      }
    });
    expect(calls.at(-3)).toMatchObject({
      name: "browser_click",
      args: {
        tabId: 101,
        ref: "e0"
      }
    });
    expect(calls.at(-2)).toMatchObject({
      name: "browser_press_key",
      args: {
        tabId: 101,
        key: "ControlOrMeta+Shift+Space"
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_get_dev_logs",
      args: {
        tabId: 101,
        limit: 5
      }
    });
  });

  it("normalizes common Playwright-style key aliases in the SDK facade", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.cua.keypress({ keys: ["Ctrl", "A"] });
    await tab.cua.keypress({ keys: "Esc" });
    await tab.cua.keypress({ keys: "NumpadEnter" });
    await tab.cua.keypress({ keys: "VolumeMute" });
    await tab.cua.keypress({ keys: "Process" });

    const keypressCalls = calls.filter((call) => call.name === "browser_press_key");
    expect(keypressCalls.at(-5)).toMatchObject({
      name: "browser_press_key",
      args: {
        tabId: 101,
        key: "Control+A"
      }
    });
    expect(keypressCalls.at(-1)).toMatchObject({
      name: "browser_press_key",
      args: {
        tabId: 101,
        key: "Process"
      }
    });
    expect(keypressCalls.at(-2)).toMatchObject({
      name: "browser_press_key",
      args: {
        tabId: 101,
        key: "AudioVolumeMute"
      }
    });
    expect(keypressCalls.at(-3)).toMatchObject({
      name: "browser_press_key",
      args: {
        tabId: 101,
        key: "NumpadEnter"
      }
    });
    expect(keypressCalls.at(-4)).toMatchObject({
      name: "browser_press_key",
      args: {
        tabId: 101,
        key: "Escape"
      }
    });
  });

  it("maps dom_cua node actions through the latest visible DOM snapshot", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.dom_cua.click({ node_id: "n-submit", waitMs: 10 });
    await tab.dom_cua.type({ node_id: "n-submit", text: "hello", clear: true, waitMs: 20 });
    const staleError = await tab.dom_cua.click({ node_id: "stale-e0" }).catch((error) => error);
    expect(staleError).toBeInstanceOf(BrowserDomCuaStaleNodeError);
    expect(staleError).toMatchObject({
      name: "BrowserDomCuaStaleNodeError",
      code: "dom_cua_stale_node",
      operation: "tab.dom_cua.click",
      nodeId: "stale-e0",
      details: {
        availableNodeIds: ["n-submit"],
        availableRefs: ["e0"]
      }
    });

    expect(calls.at(-5)).toEqual({
      name: "browser_observe",
      args: {
        sessionId: "session-a",
        tabId: 101,
        includeDomSnapshot: false
      }
    });
    expect(calls.at(-4)).toEqual({
      name: "browser_click",
      args: {
        sessionId: "session-a",
        tabId: 101,
        ref: "e0",
        waitMs: 10
      }
    });
    expect(calls.at(-3)).toEqual({
      name: "browser_observe",
      args: {
        sessionId: "session-a",
        tabId: 101,
        includeDomSnapshot: false
      }
    });
    expect(calls.at(-2)).toEqual({
      name: "browser_type_text",
      args: {
        sessionId: "session-a",
        tabId: 101,
        ref: "e0",
        text: "hello",
        clear: true,
        waitMs: 20
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_observe",
      args: {
        sessionId: "session-a",
        tabId: 101,
        includeDomSnapshot: false
      }
    });
  });

  it("maps dom_cua element inspection helpers", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    const info = await tab.dom_cua.element_info({
      x: 42,
      y: 64,
      includeNonInteractable: true
    }) as any;
    const aliasInfo = await tab.elementInfo({ x: 10, y: 20 }) as any;

    expect(info).toMatchObject({
      found: true,
      backendNodeId: 777,
      role: "button",
      name: "Submit",
      selectorCandidates: [
        { kind: "id", selector: "#submit" }
      ]
    });
    expect(aliasInfo).toMatchObject({
      found: true,
      backendNodeId: 777
    });
    expect(calls.at(-2)).toEqual({
      name: "browser_element_info",
      args: {
        sessionId: "session-a",
        tabId: 101,
        x: 42,
        y: 64,
        includeNonInteractable: true
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_element_info",
      args: {
        sessionId: "session-a",
        tabId: 101,
        x: 10,
        y: 20
      }
    });
  });

  it("maps Codex-compatible Playwright namespace helpers", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.playwright.getByRole("button", { name: "Submit" }).click();
    await tab.playwright.keyboard.press(["ControlOrMeta", "A"]);
    await tab.playwright.keyboard.type("hello", { waitMs: 15 });
    await tab.playwright.mouse.click(10, 20, { button: "right" });
    await tab.playwright.mouse.dblclick(11, 21);
    await tab.playwright.mouse.move(12, 22);
    await tab.playwright.mouse.wheel(0, 300);
    await tab.playwright.mouse.drag([{ x: 1, y: 2 }, { x: 10, y: 20 }]);
    await tab.playwright.goto("https://example.test/playwright", { waitForLoad: true });
    await expect(tab.playwright.url()).resolves.toBe("https://example.test/current");
    await expect(tab.playwright.title()).resolves.toBe("Current Example");
    await tab.playwright.reload({ ignoreCache: true });
    await tab.playwright.back({ waitForLoad: true });
    await tab.playwright.forward({ waitForLoad: true });
    await tab.playwright.waitForLoadState({ state: "networkidle", timeoutMs: 55, idleMs: 200 });
    await tab.playwright.waitForURL("submitted", { waitUntil: "load", timeoutMs: 66 });
    await tab.playwright.waitForSelector("#ready", { timeoutMs: 77 });
    await tab.playwright.waitForText("Ready", { timeoutMs: 88 });
    const screenshot = await tab.playwright.screenshot({ format: "png", fullPage: true });
    const snapshot = await tab.playwright.domSnapshot();

    expect(screenshot.dataUrl).toBe("data:image/png;base64,aGVsbG8=");
    expect(snapshot).toContain("documents");
    const locatorActionCall = calls.find((call) =>
      call.name === "browser_locator_action" &&
        (call.args.locator as any)?.kind === "role"
    );
    expect(locatorActionCall).toMatchObject({
      name: "browser_locator_action",
      args: {
        locator: { kind: "role", role: "button", name: "Submit" },
        kind: "click"
      }
    });
    const pressCall = calls.find((call) => call.name === "browser_press_key");
    expect(pressCall).toMatchObject({
      name: "browser_press_key",
      args: {
        key: "ControlOrMeta+A"
      }
    });
    const typeCall = calls.find((call) => call.name === "browser_type_text");
    expect(typeCall).toMatchObject({
      name: "browser_type_text",
      args: {
        text: "hello",
        waitMs: 15
      }
    });
    const clickCall = calls.find((call) => call.name === "browser_click" && call.args.button === "right");
    expect(clickCall).toMatchObject({
      name: "browser_click",
      args: {
        x: 10,
        y: 20,
        button: "right"
      }
    });
    const dblclickCall = calls.find((call) => call.name === "browser_click" && call.args.clickCount === 2);
    expect(dblclickCall).toMatchObject({
      name: "browser_click",
      args: {
        x: 11,
        y: 21,
        clickCount: 2
      }
    });
    const moveCall = calls.find((call) => call.name === "browser_move_mouse");
    expect(moveCall).toMatchObject({
      name: "browser_move_mouse",
      args: {
        x: 12,
        y: 22
      }
    });
    const scrollCall = calls.find((call) => call.name === "browser_scroll");
    expect(scrollCall).toMatchObject({
      name: "browser_scroll",
      args: {
        deltaX: 0,
        deltaY: 300
      }
    });
    const dragCall = calls.find((call) => call.name === "browser_drag");
    expect(dragCall).toMatchObject({
      name: "browser_drag",
      args: {
        path: [{ x: 1, y: 2 }, { x: 10, y: 20 }]
      }
    });
    expect(calls.find((call) => call.name === "browser_open_url" && call.args.url === "https://example.test/playwright")).toMatchObject({
      name: "browser_open_url",
      args: {
        waitForLoad: true
      }
    });
    expect(calls.filter((call) => call.name === "browser_get_tab")).toHaveLength(2);
    expect(calls.find((call) => call.name === "browser_reload")).toMatchObject({
      name: "browser_reload",
      args: {
        ignoreCache: true
      }
    });
    expect(calls.find((call) => call.name === "browser_go_back")).toMatchObject({
      name: "browser_go_back",
      args: {
        waitForLoad: true
      }
    });
    expect(calls.find((call) => call.name === "browser_go_forward")).toMatchObject({
      name: "browser_go_forward",
      args: {
        waitForLoad: true
      }
    });
    expect(calls.find((call) => call.name === "browser_wait_for_load_state")).toMatchObject({
      name: "browser_wait_for_load_state",
      args: {
        state: "networkidle",
        timeoutMs: 55,
        idleMs: 200
      }
    });
    expect(calls.find((call) => call.name === "browser_wait_for_url")).toMatchObject({
      name: "browser_wait_for_url",
      args: {
        urlContains: "submitted",
        waitUntil: "load",
        timeoutMs: 66
      }
    });
    expect(calls.find((call) => call.name === "browser_wait_for_selector")).toMatchObject({
      name: "browser_wait_for_selector",
      args: {
        selector: "#ready",
        timeoutMs: 77
      }
    });
    expect(calls.find((call) => call.name === "browser_wait_for_text")).toMatchObject({
      name: "browser_wait_for_text",
      args: {
        text: "Ready",
        timeoutMs: 88
      }
    });
    expect(calls.find((call) => call.name === "browser_screenshot")).toMatchObject({
      name: "browser_screenshot",
      args: {
        format: "png",
        fullPage: true
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_observe",
      args: {
        includeDomSnapshot: true
      }
    });
  });

  it("wraps actions with Playwright expectNavigation URL waits", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    const result = await tab.playwright.expectNavigation(
      () => tab.click({ selector: "#submit-button", waitMs: 10 }),
      { urlContains: "/submitted", waitUntil: "load", timeoutMs: 500 }
    ) as any;

    expect(result).toMatchObject({
      action: {
        ok: true,
        sessionId: "session-a",
        tabId: 101
      },
      navigation: {
        ok: true,
        sessionId: "session-a",
        tabId: 101
      }
    });
    expect(calls.at(-2)).toEqual({
      name: "browser_wait_for_url",
      args: {
        sessionId: "session-a",
        tabId: 101,
        urlContains: "/submitted",
        waitUntil: "load",
        timeoutMs: 500
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_click",
      args: {
        sessionId: "session-a",
        tabId: 101,
        selector: "#submit-button",
        waitMs: 10
      }
    });
  });

  it("wraps actions with commit-first Playwright expectNavigation load waits", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.playwright.expectNavigation(
      () => tab.click({ selector: "#second-link" }),
      { waitUntil: "domcontentloaded", timeoutMs: 700 }
    );

    expect(calls.at(-3)).toEqual({
      name: "browser_wait_for_load_state",
      args: {
        sessionId: "session-a",
        tabId: 101,
        state: "commit",
        timeoutMs: 700
      }
    });
    expect(calls.at(-2)).toEqual({
      name: "browser_click",
      args: {
        sessionId: "session-a",
        tabId: 101,
        selector: "#second-link"
      }
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_wait_for_load_state",
      args: {
        sessionId: "session-a",
        tabId: 101,
        state: "domcontentloaded"
      }
    });
  });

  it("returns a structured visible DOM snapshot for dom_cua", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    const snapshot = await tab.dom_cua.get_visible_dom();

    expect(snapshot).toMatchObject({
      type: "VisibleDomSnapshot",
      url: "https://example.test",
      title: "Example",
      scroll: { x: 0, y: 10, maxX: 0, maxY: 500 },
      focusedElement: {
        role: "textbox",
        label: "Search"
      },
      selectedText: "selected",
      modalState: { hasModal: false, dialogs: [] },
      truncation: {
        text: false,
        elements: false
      },
      text: "Visible DOM",
      nodes: [
        {
          node_id: "n-submit",
          ref: "e0",
          stableNodeId: "n-submit",
          role: "button",
          name: "Submit",
          visibleText: "Submit",
          tag: "button",
          sensitive: false,
          selectorCandidates: [
            { kind: "id", selector: "#submit" },
            { kind: "ref", selector: "[data-agent-browser-ref=\"e0\"]" }
          ],
          center: { x: 10, y: 20 },
          box: { x: 1, y: 2, width: 18, height: 36 }
        }
      ]
    });
    expect(calls.at(-1)).toMatchObject({
      name: "browser_observe",
      args: {
        includeDomSnapshot: false
      }
    });
  });

  it("maps dom_cua node scroll through the latest visible DOM snapshot", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();

    await tab.dom_cua.scroll({ node_id: "e0", x: 5, y: 60, waitMs: 25 });

    expect(calls.at(-2)).toEqual({
      name: "browser_observe",
      args: {
        sessionId: "session-a",
        tabId: 101,
        includeDomSnapshot: false
      }
    });
    expect(calls.at(-1)).toEqual({
      name: "browser_scroll",
      args: {
        sessionId: "session-a",
        tabId: 101,
        x: 10,
        y: 20,
        deltaX: 5,
        deltaY: 60,
        waitMs: 25
      }
    });
  });

  it("exposes selected tab, finalize, and capability documentation", async () => {
    const { browser, calls } = createMockBrowser();
    const tab = await browser.tabs.new();
    const selected = await browser.tabs.selected();

    expect(selected?.tabId).toBe(tab.tabId);

    const capability = await tab.capabilities.get("tab.locator.css");
    await expect(capability.documentation()).resolves.toContain("tab.locator.css");
    await expect(tab.capabilities.has("tab.locator.css")).resolves.toBe(true);
    await expect(browser.capabilities.has("clipboard")).resolves.toBe(true);
    await expect(browser.capabilities.require("clipboard")).resolves.toMatchObject({
      id: "clipboard",
      available: true
    });

    await browser.tabs.finalize({
      keep: [tab],
      closeRest: true
    });

    expect(calls.at(-1)).toMatchObject({
      name: "browser_finalize_session",
      args: {
        sessionId: "session-a",
        keepTabIds: [101],
        closeRest: true
      }
    });
  });

  it("reports unsupported Codex-compatible surfaces explicitly", async () => {
    const { browser } = createMockBrowser();
    const tab = await browser.tabs.new();

    expect(tab.playwright.frameLocator("iframe").toJSON()).toMatchObject({
      type: "FrameLocator",
      supported: true
    });
  });
});
