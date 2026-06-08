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
    expect(names).toContain("browser_get_policy");
    expect(names).toContain("browser_update_policy");
    expect(names).toContain("browser_name_session");
    expect(names).toContain("browser_user_open_tabs");
    expect(names).toContain("browser_list_tabs");
    expect(names).toContain("browser_get_tab");
    expect(names).toContain("browser_locator_query");
    expect(names).toContain("browser_locator_action");
    expect(names).toContain("browser_locator_wait");
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
      click: "ClickParams",
      drag: "DragParams",
      moveMouse: "MoveMouseParams",
      scroll: "ScrollParams",
      typeText: "TypeTextParams",
      evaluate: "EvaluateParams",
      pressKey: "PressKeyParams",
      handleDialog: "HandleDialogParams",
      screenshot: "ScreenshotParams",
      uploadFile: "UploadFileParams",
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
    ).toMatchObject({
      ok: false,
      code: "invalid_params",
      path: "$.state"
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
      path: "$.filePath"
    });

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
        clip: { x: 0, y: 0, width: 100, height: 80 }
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

  it("keeps locator actionability checks present in the extension backend", () => {
    const background = readFileSync("extension/background.ts", "utf8");

    expect(background).toContain("function locatorActionabilitySource");
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

    expect(background).toContain("await assertBrowserBlocklistForDownloads(downloads, params.sessionId);");
    expect(background).toContain("function assertBrowserBlocklistForUrl");
    expect(background).toContain('verdict.code !== "host_blocked"');
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

    expect(background).toContain("const refScope = (() => {");
    expect(background).toContain("crypto.randomUUID()");
    expect(background).toContain('const ref = refScope + "-e" + index;');
    expect(background).not.toContain('const ref = "e" + index;');
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

    expect(background).toContain("async function health()");
    expect(background).toContain("permissions: permissionStatus");
    expect(background).toContain("fileUrlAccess");
    expect(background).toContain("async function chromePermissionStatus");
    expect(background).toContain("async function chromeFileUrlAccessStatus");
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

  it("keeps diagnostics export wired to health, events, logs, sessions, and native manifest metadata", () => {
    const background = readFileSync("extension/background.ts", "utf8");
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
    expect(background).toContain("const healthSnapshot = await health()");
    expect(background).toContain("events: eventResult.events");
    expect(background).toContain("devLogs: devLogs.logs");
    expect(background).toContain("activeSessions: healthSnapshot.sessions");
    expect(background).toContain("attachedTabs: healthSnapshot.attachedTabs");
    expect(background).toContain("nativeManifest: normalizeNativeManifestDiagnostics");
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
});

function extractUnionMembers(source: string, typeName: string): string[] {
  const match = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));

  expect(match, typeName).not.toBeNull();

  return Array.from(match?.[1].matchAll(/\|\s*(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*))/g) ?? [], (item) => item[1] ?? item[2]);
}
