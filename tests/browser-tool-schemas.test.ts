import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserToolSchemas, callBrowserTool } from "../agent/browserTools.js";
import {
  actionForToolName,
  annotationsForAction,
  browserActionRegistry,
  browserActions,
  browserToolNames,
  isReadOnlyAction
} from "../shared/action-registry.js";
import {
  browserActionParameterSchemas,
  getBrowserActionParameterSchema,
  validateBrowserActionParams
} from "../shared/browser-tool-schemas.js";

describe("browser tool schemas", () => {
  it("includes the basic backend primitives used by the node_repl browser SDK", () => {
    const names = new Set(browserToolSchemas.map((schema) => schema.name));

    expect(names).toContain("browser_wait_for_event");
    expect(names).toContain("browser_wait_for_file_chooser");
    expect(names).toContain("browser_set_file_chooser_files");
    expect(names).toContain("browser_download_media");
    expect(names).toContain("browser_get_policy");
    expect(names).toContain("browser_update_policy");
    expect(names).toContain("browser_name_session");
    expect(names).toContain("browser_user_open_tabs");
    expect(names).toContain("browser_list_tabs");
    expect(names).toContain("browser_get_tab");
    expect(names).toContain("browser_locator_query");
    expect(names).toContain("browser_locator_action");
    expect(names).toContain("browser_locator_wait");
    expect(names).toContain("browser_resolve_frame");
    expect(names).toContain("browser_get_dev_logs");
    expect(names).toContain("browser_get_capabilities");
  });

  it("keeps browser tool schemas aligned with the shared action registry", () => {
    const schemaNames = browserToolSchemas.map((schema) => schema.name);

    expect(new Set(schemaNames)).toEqual(new Set(browserToolNames));
    expect(new Set(schemaNames.map((name) => actionForToolName(name)))).toEqual(
      new Set(browserActions)
    );
  });

  it("keeps shared action parameter schemas aligned with tool schemas", () => {
    for (const entry of browserActionRegistry) {
      const toolSchema = browserToolSchemas.find(
        (schema) => schema.name === entry.toolName
      );

      expect(toolSchema, entry.action).toBeDefined();
      expect(browserActionParameterSchemas[entry.action]).toBe(
        toolSchema?.parameters
      );
      expect(getBrowserActionParameterSchema(entry.action)).toBe(
        toolSchema?.parameters
      );
    }
  });

  it("keeps TypeScript protocol unions aligned with shared JSON schemas", () => {
    const types = readFileSync("shared/types.ts", "utf8");
    const actionUnion = extractUnionMembers(types, "BrowserAction");
    const paramsUnion = extractUnionMembers(types, "BrowserActionParams");
    const expectedParamTypesByAction: Record<string, string> = {
      health: "JsonObject",
      reloadExtension: "JsonObject",
      getEvents: "GetEventsParams",
      clearEvents: "ClearEventsParams",
      waitForEvent: "WaitForEventParams",
      getDiagnostics: "GetDiagnosticsParams",
      getPolicy: "GetPolicyParams",
      updatePolicy: "UpdatePolicyParams",
      startSession: "StartSessionParams",
      nameSession: "NameSessionParams",
      openTabs: "UserOpenTabsParams",
      claimTab: "ClaimTabParams",
      getHistory: "BrowserHistoryParams",
      clipboardReadText: "ClipboardReadTextParams",
      clipboardWriteText: "ClipboardWriteTextParams",
      clipboardRead: "ClipboardReadParams",
      clipboardWrite: "ClipboardWriteParams",
      createTab: "CreateTabParams",
      switchTab: "SwitchTabParams",
      openUrl: "OpenUrlParams",
      goBack: "NavigationParams",
      goForward: "NavigationParams",
      reload: "ReloadParams",
      waitForLoadState: "WaitForLoadStateParams",
      waitForUrl: "WaitForUrlParams",
      waitForSelector: "WaitForSelectorParams",
      waitForText: "WaitForTextParams",
      observe: "ObserveParams",
      elementInfo: "BrowserElementInfoParams",
      locatorQuery: "LocatorQueryParams",
      locatorAction: "LocatorActionParams",
      locatorWait: "LocatorWaitParams",
      resolveFrame: "ResolveFrameParams",
      click: "ClickParams",
      drag: "DragParams",
      moveMouse: "MoveMouseParams",
      scroll: "ScrollParams",
      typeText: "TypeTextParams",
      evaluate: "EvaluateParams",
      pressKey: "PressKeyParams",
      handleDialog: "HandleDialogParams",
      screenshot: "ScreenshotParams",
      waitForFileChooser: "WaitForFileChooserParams",
      setFileChooserFiles: "SetFileChooserFilesParams",
      uploadFile: "UploadFileParams",
      downloadMedia: "DownloadMediaParams",
      attachTarget: "TargetAttachmentParams",
      detachTarget: "TargetAttachmentParams",
      cdp: "CdpParams",
      listTabs: "ListTabsParams",
      getTab: "GetTabParams",
      listDownloads: "ListDownloadsParams",
      waitForDownload: "WaitForDownloadParams",
      getDevLogs: "GetDevLogsParams",
      getCapabilities: "GetCapabilitiesParams",
      closeTab: "CloseTabParams",
      finalizeSession: "FinalizeSessionParams",
      endTurn: "EndTurnParams",
      stopSession: "StopSessionParams"
    };

    expect(new Set(actionUnion)).toEqual(new Set(browserActions));
    expect(new Set(Object.keys(expectedParamTypesByAction))).toEqual(new Set(browserActions));

    for (const action of browserActions) {
      expect(browserActionParameterSchemas[action], action).toBeDefined();
      expect(paramsUnion, action).toContain(expectedParamTypesByAction[action]);
    }
  });

  it("validates browser action params with the shared JSON schema subset", () => {
    expect(
      validateBrowserActionParams("openUrl", {
        url: "https://example.com",
        active: true
      })
    ).toEqual({ ok: true });

    expect(validateBrowserActionParams("openUrl", {})).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.url"
    });

    expect(
      validateBrowserActionParams("health", {
        unexpected: true
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.unexpected"
    });

    expect(
      validateBrowserActionParams("moveMouse", {
        x: 10,
        y: Number.POSITIVE_INFINITY
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.y"
    });

    expect(
      validateBrowserActionParams("locatorQuery", {
        locator: {
          kind: "xpath",
          selector: "//button"
        },
        kind: "count"
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.locator.kind"
    });

    expect(
      validateBrowserActionParams("locatorQuery", {
        locator: {
          kind: "css",
          selector: ".card",
          frameSelectors: ["#outer-frame", "#inner-frame"],
          and: {
            kind: "css",
            selector: ".featured"
          },
          or: {
            kind: "role",
            role: "button",
            name: "Open"
          },
          has: {
            kind: "css",
            selector: ".badge",
            hasText: "Ready"
          },
          hasNot: {
            kind: "text",
            text: "Archived"
          },
          hasText: "Alpha",
          hasNotText: "Archived",
          visible: true
        },
        kind: "count"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("resolveFrame", {
        sessionId: "session-a",
        tabId: 101,
        frameSelectors: ["#outer-frame", "#inner-frame"],
        targetId: "target-1",
        timeoutMs: 10000
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("locatorQuery", {
        locator: {
          kind: "css",
          selector: ".card",
          visible: "yes"
        },
        kind: "count"
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.locator.visible"
    });

    expect(
      validateBrowserActionParams("getDevLogs", {
        levels: ["error", "warning"],
        filter: "failed"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("waitForLoadState", {
        state: "networkidle",
        timeoutMs: 5000,
        idleMs: 200
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("waitForLoadState", {
        state: "commit"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("waitForUrl", {
        urlContains: "/complete",
        waitUntil: "networkidle",
        idleMs: 200
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("waitForUrl", {
        urlContains: "/complete",
        waitUntil: "paint"
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.waitUntil"
    });

    expect(
      validateBrowserActionParams("waitForDownload", {
        sessionId: "session-a",
        tabId: 101,
        state: "complete",
        filenameContains: "report"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("uploadFile", {
        selector: "label[for='multi-upload-input']",
        filePaths: ["/tmp/a.txt", "/tmp/b.txt"],
        confirmed: true
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("uploadFile", {
        selector: "input[type=file]",
        confirmed: true
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.files"
    });

    expect(
      validateBrowserActionParams("setFileChooserFiles", {
        fileChooserId: "fc-test",
        files: ["/tmp/a.txt"],
        confirmed: true
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("setFileChooserFiles", {
        fileChooserId: "fc-test",
        confirmed: true
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.files"
    });

    expect(
      validateBrowserActionParams("setFileChooserFiles", {
        files: ["/tmp/a.txt"],
        confirmed: true
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.fileChooserId"
    });

    expect(
      validateBrowserActionParams("downloadMedia", {
        locator: { kind: "css", selector: "img.hero" },
        attribute: "src",
        conflictAction: "uniquify",
        filename: "assets/photo.png",
        fallbackFetch: true,
        fallbackMaxBytes: 1048576,
        originApproved: true
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("elementInfo", {
        sessionId: "session-a",
        tabId: 101,
        x: 42,
        y: 64,
        includeNonInteractable: true
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("elementInfo", {
        x: 42
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.y"
    });

    expect(
      validateBrowserActionParams("evaluate", {
        targetId: "target-1",
        frameId: "frame-1",
        script: "document.title",
        mode: "read",
        reason: "inspect page title"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("cdp", {
        method: "DOMSnapshot.captureSnapshot",
        params: {},
        targetId: "page-target-1",
        originApproved: true,
        confirmed: true,
        reason: "diagnostic snapshot"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("attachTarget", {
        sessionId: "session-a",
        tabId: 101,
        targetId: "target-1",
        originApproved: true,
        confirmed: true,
        reason: "target lifecycle"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("detachTarget", {
        sessionId: "session-a",
        tabId: 101,
        targetId: "target-1",
        reason: "target lifecycle cleanup"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("getDevLogs", {
        levels: ["error", 1]
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.levels[1]"
    });

    expect(
      validateBrowserActionParams("screenshot", {
        fullPage: true,
        clip: { x: 0, y: 0, width: 100, height: 80 },
        highlight: true,
        highlightClip: { x: 5, y: 5, width: 40, height: 30 },
        highlightColor: "rgba(16, 185, 129, 0.96)",
        highlightDurationMs: 900
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("screenshot", {
        clip: { x: 0, y: 0, width: 100 }
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.clip.height"
    });

    expect(
      validateBrowserActionParams("click", {
        x: 10,
        y: 20,
        button: "back",
        modifiers: ["Shift"]
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("drag", {
        path: [
          { x: 10, y: 20 },
          { x: 40, y: 60 }
        ],
        modifiers: ["ControlOrMeta", "Shift"],
        waitMs: 20
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("drag", {
        path: [{ x: 10, y: 20 }],
        modifiers: ["BadModifier"]
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.modifiers[0]"
    });

    expect(
      validateBrowserActionParams("pressKey", {
        key: "Space"
      })
    ).toEqual({ ok: true });
    expect(validateBrowserActionParams("pressKey", { key: "Ctrl+A" })).toEqual({ ok: true });
    expect(validateBrowserActionParams("pressKey", { key: "F5" })).toEqual({ ok: true });
    expect(validateBrowserActionParams("pressKey", { key: "Esc" })).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("getHistory", {
        query: "example",
        from: 1780876800000,
        to: 1780963200000,
        limit: 10,
        confirmed: true
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("clipboardReadText", {
        confirmed: true
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("clipboardWriteText", {
        text: "hello",
        confirmed: true
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("clipboardWriteText", {
        confirmed: true
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.text"
    });

    expect(
      validateBrowserActionParams("clipboardWrite", {
        confirmed: true,
        items: [
          {
            types: [
              {
                mimeType: "image/png",
                dataBase64: "iVBORw0KGgo=",
                size: 8
              }
            ]
          }
        ]
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("clipboardWrite", {
        confirmed: true,
        items: [
          {
            types: [
              {
                dataBase64: "iVBORw0KGgo="
              }
            ]
          }
        ]
      })
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.items[0].types[0].mimeType"
    });
  });

  it("rejects invalid tool params before calling the RPC backend", async () => {
    await expect(
      callBrowserTool("browser_health", { unexpected: true })
    ).rejects.toThrow(/invalid_params: Invalid browser params for health/);
  });

  it("sends the RPC token from the configured token file", async () => {
    const oldToken = process.env.AGENT_BROWSER_TOKEN;
    const oldTokenFile = process.env.AGENT_BROWSER_TOKEN_FILE;
    const oldAllowUnauthenticated = process.env.AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC;
    const oldFetch = globalThis.fetch;
    const tmpDir = mkdtempSync(join(tmpdir(), "formax-token-test-"));
    const tokenFile = join(tmpDir, "browser-rpc-token");

    writeFileSync(tokenFile, "file-token\n");
    delete process.env.AGENT_BROWSER_TOKEN;
    delete process.env.AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC;
    process.env.AGENT_BROWSER_TOKEN_FILE = tokenFile;

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-agent-browser-token"]).toBe(
        "file-token"
      );

      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            ok: true,
            action: "health",
            result: { status: "ok" }
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    try {
      await expect(callBrowserTool("browser_health", {})).resolves.toMatchObject({
        ok: true,
        action: "health",
        result: { status: "ok" }
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = oldFetch;
      if (oldToken === undefined) {
        delete process.env.AGENT_BROWSER_TOKEN;
      } else {
        process.env.AGENT_BROWSER_TOKEN = oldToken;
      }
      if (oldTokenFile === undefined) {
        delete process.env.AGENT_BROWSER_TOKEN_FILE;
      } else {
        process.env.AGENT_BROWSER_TOKEN_FILE = oldTokenFile;
      }
      if (oldAllowUnauthenticated === undefined) {
        delete process.env.AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC;
      } else {
        process.env.AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC = oldAllowUnauthenticated;
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps extension SUPPORTED_ACTIONS aligned with the shared action registry", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const match = background.match(/const SUPPORTED_ACTIONS = \[([\s\S]*?)\];/);

    expect(match).not.toBeNull();

    const supportedActions = Array.from(
      match?.[1].matchAll(/"([^"]+)"/g) ?? [],
      (item) => item[1]
    );

    expect(supportedActions).toEqual(browserActionRegistry.map((entry) => entry.action));
  });

  it("keeps extension dispatch validation aligned with the shared action registry", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const validator = readFileSync("extension/action-validator.ts", "utf8");

    expect(background).toContain('"action-validator.js"');
    expect(background).toContain("validateExtensionActionParams(action, params);");

    const validatorActions = Array.from(
      validator.matchAll(/^  ([A-Za-z][A-Za-z0-9]*): \[/gm),
      (item) => item[1]
    );

    expect(new Set(validatorActions)).toEqual(new Set(browserActions));
  });

  it("keeps protocol docs action sections aligned with the shared action registry", () => {
    const protocol = readFileSync("shared/protocol.md", "utf8");

    for (const action of browserActions) {
      expect(protocol, action).toMatch(new RegExp(`^### ${action}$`, "m"));
    }
  });

  it("emits structured host approval prompts before first interaction with a new host", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain('name: "hostApprovalRequired"');
    expect(background).toContain("function hostApprovalPromptDetails");
    expect(background).toContain("function postHostApprovalRequiredEvent");
    expect(background).toContain("function hostApprovalId");
    expect(background).toContain('throw browserActionError("requires_host_approval"');
    expect(background).toContain("suggestedDecisions");
    expect(background).toContain("allowForSession");
    expect(background).toContain("sanitizeStructuredErrorDetails");
    expect(protocol).toContain("Host approval request event example");
    expect(protocol).toContain("The triggering action still fails with `requires_host_approval`");
    expect(types).toContain("export type BrowserHostApprovalRequiredEvent");
  });

  it("emits structured browser action confirmation prompts for risky actions", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain('name: "browserActionConfirmationRequired"');
    expect(background).toContain("function browserActionConfirmationDetails");
    expect(background).toContain("function postBrowserActionConfirmationRequiredEvent");
    expect(background).toContain("function browserActionConfirmationId");
    expect(background).toContain('throw browserActionError("confirmation_required"');
    expect(background).toContain("requiredParams: {");
    expect(protocol).toContain("Action confirmation request event example");
    expect(protocol).toContain("retry the exact action with `confirmed: true`");
    expect(types).toContain("export type BrowserActionConfirmationRequiredEvent");
  });

  it("emits structured origin approval prompts for raw CDP and page asset downloads", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain('name: "browserOriginApprovalRequired"');
    expect(background).toContain("function browserOriginApprovalDetails");
    expect(background).toContain("function postBrowserOriginApprovalRequiredEvent");
    expect(background).toContain("function browserOriginApprovalId");
    expect(background).toContain('throw browserActionError("origin_approval_required"');
    expect(background).toContain("originApproved: true");
    expect(protocol).toContain("Origin approval request event example");
    expect(protocol).toContain("retry the exact raw CDP or page asset download action");
    expect(types).toContain("export type BrowserOriginApprovalRequiredEvent");
  });

  it("keeps locator actionability checks present in the extension backend", () => {
    const background = readFileSync("extension/background.ts", "utf8");

    expect(background).toContain("function locatorActionabilitySource");
    expect(background).toContain("function pointerTargetContextExpression");
    expect(background).toContain("looksLikeBrowserPermissionPrompt(label, text)");
    expect(background).toContain("BROWSER_PERMISSION_TARGET_PATTERN");
    expect(background).toContain("confirmed: args.confirmed");
    expect(background).toContain("locatorActionabilityForce");
    expect(background).toContain('code: "detached"');
    expect(background).toContain('code: "not_visible"');
    expect(background).toContain('code: "not_stable"');
    expect(background).toContain('code: "disabled"');
    expect(background).toContain('code: "not_editable"');
    expect(background).toContain('code: "occluded"');
  });

  it("keeps download actions covered by extension host blocklist enforcement", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");

    expect(background).toContain("await assertBrowserBlocklistForDownloads(downloads, params.sessionId);");
    expect(background).toContain('await assertBrowserPolicyForUrl("download", media.url');
    expect(background).toContain("async function fetchMediaAsDataUrl");
    expect(background).toContain('method: "fetch_blob"');
    expect(background).toContain('await assertBrowserPolicyForUrl("download", fetched.finalUrl');
    expect(background).toContain("async function downloadMedia");
    expect(background).toContain("function mediaDownloadTargetExpression");
    expect(background).toContain('!classification.reasons.includes("sensitive_browser_state")');
    expect(background).toContain("function assertBrowserBlocklistForUrl");
    expect(background).toContain('verdict.code !== "host_blocked"');
    expect(client).toContain("downloadMedia(args");
    expect(client).toContain('"browser_download_media"');
  });

  it("keeps file chooser events wired to playwright wait handles", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain('name: "fileChooserOpened"');
    expect(background).toContain("function registerFileChooser");
    expect(background).toContain("function waitForFileChooser");
    expect(background).toContain("function setFileChooserFiles");
    expect(background).toContain("fileChooserId: fileChooser.fileChooserId");
    expect(background).toContain("const fileChooserFor = (node) =>");
    expect(client).toContain('normalized === "filechooser"');
    expect(client).toContain('"browser_wait_for_file_chooser"');
    expect(client).toContain('"browser_set_file_chooser_files"');
    expect(client).toContain("function createFileChooserHandle");
    expect(client).toContain("tab.browser.setFileChooserFiles({");
    expect(types).toContain("export type BrowserFileChooserEvent");
    expect(types).toContain("export type WaitForFileChooserParams");
    expect(types).toContain("export type SetFileChooserFilesParams");
  });

  it("keeps observations exposing a sanitized CDP frame tree", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain('await cdp(tabId, "Page.getFrameTree")');
    expect(background).toContain("function summarizePageFrameTreeNode");
    expect(background).toContain("function countFrameTreeNodes");
    expect(background).toContain("observation.frameTree = await getPageFrameTree(tabId)");
    expect(background).toContain("url: typeof frame.url === \"string\" ? sanitizeDebugUrl(frame.url) : null");
    expect(types).toContain("export type BrowserFrameTree");
    expect(types).toContain("frameTree?: BrowserFrameTree");
    expect(protocol).toContain("CDP `Page.getFrameTree`");
    expect(protocol).toContain("does not imply that");
  });

  it("matches Codex-style CDP target lifecycle entry points", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain('case "attachTarget"');
    expect(background).toContain('case "detachTarget"');
    expect(background).toContain('method === "Target.getTargets"');
    expect(background).toContain("chrome.debugger.getTargets()");
    expect(background).toContain("async function createEvaluationContextForFrame");
    expect(background).toContain('"Page.createIsolatedWorld"');
    expect(background).toContain("contextId: executionContextId");
    expect(background).toContain("async function resolveFrame");
    expect(background).toContain("function resolveFrameSelectorPathExpression");
    expect(background).toContain("function matchResolvedFramePathToFrameTree");
    expect(background).toContain("async function locatorExecutionTarget");
    expect(background).toContain('const useFrameScopedContext = kind !== "boundingBox"');
    expect(background).toContain("contextId: target.executionContextId");
    expect(background).toContain("stripLocatorFrameSelectors(locator)");
    expect(types).toContain("frameId?: string");
    expect(types).toContain("executionContextId?: number | null");
    expect(types).toContain("export type ResolveFrameParams");
    expect(protocol).toContain("Codex resource 1.1.5");
    expect(protocol).toContain("Target.getTargets");
    expect(protocol).toContain("Page.createIsolatedWorld");
    expect(protocol).toContain("### resolveFrame");
  });

  it("keeps user tab descriptors enriched with time and group metadata", () => {
    const background = readFileSync("extension/background.ts", "utf8");

    expect(background).toContain("const tabOpenedAt = new Map<number, number>();");
    expect(background).toContain("chrome.tabs.onCreated.addListener");
    expect(background).toContain("lastFocusedAt");
    expect(background).toContain("groupLabel");
    expect(background).toContain("async function tabGroupLabel");
  });

  it("keeps observed element refs scoped to avoid stale-ref reuse after navigation", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");

    expect(background).toContain("const refScope = (() => {");
    expect(background).toContain("crypto.randomUUID()");
    expect(background).toContain('const ref = refScope + "-e" + index;');
    expect(background).toContain("const stableNodeHash = (value) =>");
    expect(background).toContain("const stableNodeBaseFor = (el, frameSelectors) =>");
    expect(background).toContain("const stableNodeCounts = new Map();");
    expect(background).toContain("stableNodeId");
    expect(client).toContain("stableNodeId ?? ref");
    expect(client).toContain("candidate.node_id === nodeId || candidate.ref === nodeId");
    expect(client).toContain("ref: node.ref ?? node.node_id");
    expect(background).not.toContain('const ref = "e" + index;');
  });

  it("clearly reports unsupported closed shadow roots without piercing them", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");

    expect(background).toContain("isUnsupportedClosedShadowHost");
    expect(background).toContain('shadowRoot: "closed_unsupported"');
    expect(background).toContain('shadowUnsupportedReason: "custom_element_shadow_root_not_accessible"');
    expect(client).toContain('source.shadowRoot === "closed_unsupported"');
    expect(types).toContain('"closed_unsupported"');
    expect(protocol).toContain("closed_unsupported");
  });

  it("keeps observe page text summarized instead of dumping large body innerText", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");

    expect(background).toContain("const buildTextSummary = () =>");
    expect(background).toContain("MAX_BODY_TEXT_INLINE");
    expect(background).toContain("textSource: pageTextSummary.source");
    expect(background).toContain("bodyTextLength: bodyText.length");
    expect(background).toContain("text: pageTextSummary.text");
    expect(background).not.toContain("text: bodyText.slice(0, MAX_TEXT_LENGTH)");
    expect(protocol).toContain("It intentionally avoids returning raw `document.body.innerText`");
  });

  it("keeps browser history output redacted before returning to callers", () => {
    const background = readFileSync("extension/background.ts", "utf8");

    expect(background).toContain("entries: entries.map(redactHistoryEntry)");
    expect(background).toContain("function redactHistoryEntry");
    expect(background).toContain("function redactSensitiveUrl");
    expect(background).toContain("redactionReasons");
  });

  it("keeps health checks reporting Chrome permissions and file URL access", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const healthSchema = browserToolSchemas.find((schema) => schema.name === "browser_health");

    expect(healthSchema?.parameters.properties).toMatchObject({
      nativeDiagnostics: {
        type: "object",
        additionalProperties: true
      }
    });

    expect(background).toContain("async function health(params");
    expect(background).toContain("permissions: permissionStatus");
    expect(background).toContain("fileUrlAccess");
    expect(background).toContain("nativeManifestHealth");
    expect(background).toContain("originMatchesExtensionId");
    expect(background).toContain("const profile = browserProfileMetadata(params.nativeDiagnostics)");
    expect(background).toContain("profile,");
    expect(background).toContain("function browserProfileMetadata");
    expect(background).toContain("readsProfileFiles: false");
    expect(background).toContain("function safeProfileHint");
    expect(background).toContain("async function chromePermissionStatus");
    expect(background).toContain("async function chromeFileUrlAccessStatus");
    expect(protocol).toContain("The extension does not read Chrome");
    expect(protocol).toContain("activeProfileSource");
  });

  it("keeps bookmarks intentionally unsupported", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const skill = readFileSync("skill/SKILL.md", "utf8");
    const actions = browserActionRegistry.map((entry) => entry.action);
    const schemaNames = browserToolSchemas.map((schema) => schema.name);

    expect(manifest.permissions ?? []).not.toContain("bookmarks");
    expect(actions).not.toContain("getBookmarks");
    expect(actions).not.toContain("bookmarks");
    expect(schemaNames.some((name) => name.includes("bookmark"))).toBe(false);
    expect(background).toContain('browserCapability("browser.user.bookmarks"');
    expect(background).toContain('"unsupported_sensitive_browser_state"');
    expect(protocol).toContain("Bookmarks are intentionally not exposed");
    expect(skill).toContain("Bookmarks are intentionally not exposed");
  });

  it("keeps evaluate and raw CDP calls audited without payload bodies", () => {
    const background = readFileSync("extension/background.ts", "utf8");

    expect(background).toContain("async function postBrowserActionAudit");
    expect(background).toContain('auditKind: "action"');
    expect(background).toContain("category: actionAuditCategory(args.action)");
    expect(background).toContain("turnId: paramsMeta.turnId");
    expect(background).toContain("confirmationId: paramsMeta.confirmationId");
    expect(background).toContain("errorCode: args.errorCode ?? null");
    expect(background).toContain("durationMs: args.endedAt - args.startedAt");
    expect(background).toContain("postDiagnosticActionAudit({");
    expect(background).toContain('name: "browserActionAudit"');
    expect(background).toContain('auditKind: "diagnostic"');
    expect(background).toContain("actionId: activeActionContext?.actionId ?? null");
    expect(background).toContain("turnId: activeActionContext?.turnId ?? null");
    expect(background).toContain("originForAudit");
    expect(background).toContain("evaluateAuditReason");
    expect(background).not.toContain("scriptBody");
    expect(background).not.toContain("commandParams: commandParams");
  });

  it("redacts buffered dev log and runtime exception payloads before returning them", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain("function summarizeDebuggerEvent");
    expect(background).toContain("function sanitizeDebugText");
    expect(background).toContain("function sanitizeDebugUrl");
    expect(background).toContain("function devLogText");
    expect(background).toContain("function devLogUrl");
    expect(background).toContain("description: sanitizeDebugText(details.exception.description");
    expect(background).toContain("args.map((arg) => summarizeRemoteObject(arg))");
    expect(background).toContain("text: text.value");
    expect(background).toContain("redacted: text.redacted || url.redacted");
    expect(background).toContain("redactionReasons: Array.from(new Set([...text.reasons, ...url.reasons]))");
    expect(protocol).toContain("redacted before they enter the event buffer");
    expect(types).toContain("redactionReasons?: string[]");
  });

  it("keeps event snapshots persisted and cleared on session finalization", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const getEventsSchema = browserToolSchemas.find((schema) => schema.name === "browser_get_events");
    const clearEventsSchema = browserToolSchemas.find((schema) => schema.name === "browser_clear_events");

    expect(getEventsSchema?.parameters.properties).toMatchObject({
      includeSnapshots: { type: "boolean" },
      snapshotLimit: { type: "number" }
    });
    expect(clearEventsSchema?.parameters.properties).toMatchObject({
      includeSnapshots: { type: "boolean" }
    });
    expect(background).toContain("const EVENT_SNAPSHOT_STORAGE_KEY");
    expect(background).toContain("async function persistSessionEventSnapshot");
    expect(background).toContain("await storageSessionSet(EVENT_SNAPSHOT_STORAGE_KEY");
    expect(background).toContain('persistSessionEventSnapshot(sessionId, "finalizeSession")');
    expect(background).toContain('persistSessionEventSnapshot(sessionId, "stopSession")');
    expect(background).toContain("eventBuffer.clear({ sessionId })");
  });

  it("keeps Codex-like page visual status and takeover events wired", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const content = readFileSync("extension/content.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(content).toContain('message.type === "AGENT_PAGE_STATUS"');
    expect(content).toContain('"handoff"');
    expect(content).toContain('"deliverable"');
    expect(content).toContain('"stopped"');
    expect(content).toContain('"taken_over"');
    expect(content).toContain("function updateFaviconBadge");
    expect(content).toContain('message.type === "AGENT_HIGHLIGHT_RECT"');
    expect(content).toContain("function showHighlightRect");
    expect(background).toContain("const expectedDebuggerDetachTabs = new Set<number>();");
    expect(background).toContain('name: "pageVisualStatus"');
    expect(background).toContain('name: "userTakeover"');
    expect(background).toContain('name: "userHandoffRequired"');
    expect(background).toContain('name: "permissionPromptDetected"');
    expect(background).toContain("function postPermissionPromptDetectedIfNeeded");
    expect(background).toContain('classification.reasons.includes("browser_permission")');
    expect(background).toContain('type: "AGENT_PAGE_STATUS"');
    expect(background).toContain('type: "AGENT_HIGHLIGHT_RECT"');
    expect(background).toContain("async function showHighlightRect");
    expect(background).toContain('await setPageVisualStatus(tabId, "handoff"');
    expect(background).toContain('await setPageVisualStatus(tabId, "deliverable"');
    expect(background).toContain('await setPageVisualStatus(tabId, "stopped"');
    expect(background).toContain('setPageVisualStatus(source.tabId, "taken_over"');
    expect(background).toContain("await detachTabForLifecycle(tabId)");
    expect(protocol).toContain("pageVisualStatus");
    expect(protocol).toContain("userTakeover");
    expect(protocol).toContain("userHandoffRequired");
    expect(protocol).toContain("permissionPromptDetected");
    expect(types).toContain("export type BrowserPermissionPromptDetectedEvent");
  });

  it("keeps user-handoff safety boundaries wired before click automation", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain("CAPTCHA_HANDOFF_PATTERN");
    expect(background).toContain("SECURITY_INTERSTITIAL_PATTERN");
    expect(background).toContain("PAYWALL_BYPASS_PATTERN");
    expect(background).toContain("PASSWORD_CHANGE_ACTION_PATTERN");
    expect(background).toContain("await assertUserHandoffNotRequired(tabId");
    expect(background).toContain('throw new Error(`user_handoff_required: ${risk.reason}`)');
    expect(background).toContain("passwordFieldCount");
    expect(background).toContain('await setPageVisualStatus(tabId, "handoff"');
    expect(protocol).toContain("CAPTCHA/human-verification challenges");
    expect(protocol).toContain("user_handoff_required");
    expect(types).toContain("export type BrowserUserHandoffRequiredEvent");
  });

  it("keeps diagnostics export wired to health, events, logs, sessions, and native manifest metadata", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");
    const diagnosticsSchema = browserToolSchemas.find((schema) => schema.name === "browser_get_diagnostics");

    expect(diagnosticsSchema?.parameters.properties).toMatchObject({
      eventLimit: { type: "number" },
      devLogLimit: { type: "number" },
      includeSnapshots: { type: "boolean" },
      nativeDiagnostics: {
        type: "object",
        additionalProperties: true
      }
    });
    expect(background).toContain("async function getDiagnostics");
    expect(background).toContain("const healthSnapshot = await health(params)");
    expect(background).toContain("events: eventResult.events");
    expect(background).toContain("devLogs: devLogs.logs");
    expect(background).toContain("activeSessions: healthSnapshot.sessions");
    expect(background).toContain("attachedTabs: healthSnapshot.attachedTabs");
    expect(background).toContain("nativeManifest: healthSnapshot.nativeManifest");
    expect(types).toContain("export type BrowserProfileMetadata");
    expect(background).toContain("id: healthSnapshot.extensionId");
    expect(background).toContain("version: healthSnapshot.version");
  });

  it("allows confirmation ids on confirmed browser action schemas", () => {
    for (const schema of browserToolSchemas) {
      const properties = schema.parameters.properties ?? {};
      if (Object.prototype.hasOwnProperty.call(properties, "confirmed")) {
        expect(properties, schema.name).toHaveProperty("confirmationId", {
          type: "string"
        });
      }
    }
  });

  it("annotates every browser action with policy-relevant risk metadata", () => {
    for (const entry of browserActionRegistry) {
      expect(entry.annotations, entry.action).toMatchObject({
        readOnly: expect.any(Boolean),
        sideEffecting: expect.any(Boolean),
        destructive: expect.any(Boolean),
        requiresHostApproval: expect.any(Boolean),
        requiresUserConfirmation: expect.any(Boolean),
        requiresFileSystemRead: expect.any(Boolean),
        requiresBrowserHistory: expect.any(Boolean),
        requiresRawCdp: expect.any(Boolean),
        requiresSensitiveDataReview: expect.any(Boolean)
      });
      expect(entry.annotations.readOnly && entry.annotations.sideEffecting, entry.action).toBe(false);
      expect(annotationsForAction(entry.action)).toBe(entry.annotations);
      expect(isReadOnlyAction(entry.action)).toBe(entry.annotations.readOnly);
    }
  });

  it("marks known high-risk browser actions conservatively", () => {
    expect(annotationsForAction("openUrl")).toMatchObject({
      sideEffecting: true,
      requiresHostApproval: true
    });
    expect(annotationsForAction("uploadFile")).toMatchObject({
      sideEffecting: true,
      requiresHostApproval: true,
      requiresUserConfirmation: true,
      requiresFileSystemRead: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("setFileChooserFiles")).toMatchObject({
      sideEffecting: true,
      requiresHostApproval: true,
      requiresUserConfirmation: true,
      requiresFileSystemRead: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("downloadMedia")).toMatchObject({
      sideEffecting: true,
      requiresHostApproval: true,
      requiresUserConfirmation: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("attachTarget")).toMatchObject({
      sideEffecting: true,
      requiresHostApproval: true,
      requiresUserConfirmation: true,
      requiresRawCdp: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("detachTarget")).toMatchObject({
      sideEffecting: true,
      requiresRawCdp: true
    });
    expect(annotationsForAction("resolveFrame")).toMatchObject({
      readOnly: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("cdp")).toMatchObject({
      sideEffecting: true,
      requiresHostApproval: true,
      requiresRawCdp: true,
      requiresUserConfirmation: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("getHistory")).toMatchObject({
      readOnly: true,
      requiresBrowserHistory: true,
      requiresUserConfirmation: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("clipboardReadText")).toMatchObject({
      readOnly: true,
      requiresUserConfirmation: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("clipboardWriteText")).toMatchObject({
      sideEffecting: true,
      requiresUserConfirmation: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("clipboardRead")).toMatchObject({
      readOnly: true,
      requiresUserConfirmation: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("clipboardWrite")).toMatchObject({
      sideEffecting: true,
      requiresUserConfirmation: true,
      requiresSensitiveDataReview: true
    });
    expect(annotationsForAction("getEvents")).toMatchObject({
      readOnly: true,
      sideEffecting: false
    });
  });

  it("keeps runtime errors concise with structured internal details", () => {
    const background = readFileSync("extension/background.ts", "utf8");

    expect(background).toContain("function structuredError");
    expect(background).toContain("function userFacingErrorMessage");
    expect(background).toContain("details: {");
    expect(background).toContain("internalMessage");
    expect(background).toContain("The browser action failed. Check structured error details or diagnostics for more information.");
  });
});

function extractUnionMembers(source: string, typeName: string): string[] {
  const match = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));

  expect(match, typeName).not.toBeNull();

  return Array.from(match?.[1].matchAll(/\|\s*(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*))/g) ?? [], (item) => item[1] ?? item[2]);
}
