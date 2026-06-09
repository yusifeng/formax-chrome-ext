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
  BROWSER_LOCATOR_ACTION_KINDS,
  BROWSER_LOCATOR_PLAN_KINDS,
  BROWSER_LOCATOR_QUERY_KINDS,
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
      getPendingApprovals: "GetPendingApprovalsParams",
      resolveApproval: "ResolveApprovalParams",
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

  it("keeps locator protocol enums aligned across schema, extension, native host, and docs", () => {
    const expectedLocatorKinds = [...BROWSER_LOCATOR_PLAN_KINDS];
    const expectedQueryKinds = [...BROWSER_LOCATOR_QUERY_KINDS];
    const expectedActionKinds = [...BROWSER_LOCATOR_ACTION_KINDS];
    const types = readFileSync("shared/types.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const background = readFileSync("extension/background.ts", "utf8");
    const validator = readFileSync("extension/action-validator.ts", "utf8");
    const rustRpc = readFileSync("rust/native-host/src/rpc.rs", "utf8");
    const locatorSchemas = browserToolSchemas
      .map((schema) => schemaParameters(schema).locator)
      .filter((schema) => Boolean(schema));

    expect(locatorSchemas.length).toBeGreaterThan(0);
    for (const locatorSchema of locatorSchemas) {
      expect(locatorSchema?.properties?.kind?.enum).toEqual(expectedLocatorKinds);
    }

    expect(schemaParameters(schemaForTool("browser_locator_query")).kind?.enum).toEqual(
      expectedQueryKinds
    );
    expect(schemaParameters(schemaForTool("browser_locator_action")).kind?.enum).toEqual(
      expectedActionKinds
    );

    expect(extractInlineKindUnion(types, "LocatorPlan")).toEqual(expectedLocatorKinds);
    expect(extractUnionMembers(types, "LocatorQueryKind")).toEqual(expectedQueryKinds);
    expect(extractUnionMembers(types, "LocatorActionKind")).toEqual(expectedActionKinds);

    expect(
      extractStringArrayAfter(background, "function normalizeLocatorPlan", "background locator kinds")
    ).toEqual(expectedLocatorKinds);
    expect(
      extractStringArrayAfter(background, "function normalizeLocatorQueryKind", "background locator query kinds")
    ).toEqual(expectedQueryKinds);
    expect(
      extractStringArrayAfter(background, "function normalizeLocatorActionKind", "background locator action kinds")
    ).toEqual(expectedActionKinds);

    expect(
      extractStringArrayAfter(validator, "function validateExtensionLocator", "extension locator kinds")
    ).toEqual(expectedLocatorKinds);
    expect(
      extractStringArrayAfter(validator, "locatorQuery: {", "extension locator query kinds")
    ).toEqual(expectedQueryKinds);
    expect(
      extractStringArrayAfter(validator, "locatorAction: {", "extension locator action kinds")
    ).toEqual(expectedActionKinds);

    expect(
      extractRustKindEnumAfter(rustRpc, '"locatorQuery" => {', "native host locator query kinds")
    ).toEqual(expectedQueryKinds);
    expect(
      extractRustKindEnumAfter(rustRpc, '"locatorAction" => {', "native host locator action kinds")
    ).toEqual(expectedActionKinds);
    expect(
      extractRustKindEnumAfter(
        rustRpc,
        "validate_string_enum_for_map",
        "native host locator kinds"
      )
    ).toEqual(expectedLocatorKinds);

    const locatorQuerySection = extractMarkdownSection(protocol, "locatorQuery");
    const locatorActionSection = extractMarkdownSection(protocol, "locatorAction");

    expect(
      extractBacktickList(
        locatorQuerySection,
        /Locator kinds are ([\s\S]*?)\. Same-origin/,
        "protocol locator kinds"
      )
    ).toEqual(expectedLocatorKinds);
    expect(
      extractBacktickList(
        locatorQuerySection,
        /Supported\s+query kinds are ([\s\S]*?)\./,
        "protocol locator query kinds"
      )
    ).toEqual(expectedQueryKinds);
    expect(
      extractBacktickList(
        locatorActionSection,
        /Supported action kinds are ([\s\S]*?)\. Actions resolve/,
        "protocol locator action kinds"
      )
    ).toEqual(expectedActionKinds);
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
          within: {
            kind: "role",
            role: "region",
            name: "Products"
          },
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
          kind: "altText",
          text: "Product photo",
          exact: true
        },
        kind: "count"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("locatorQuery", {
        locator: {
          kind: "title",
          text: "Help"
        },
        kind: "count"
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("locatorQuery", {
        locator: {
          kind: "displayValue",
          text: "Alice"
        },
        kind: "count"
      })
    ).toEqual({ ok: true });

    for (const kind of ["allInnerTexts", "isHidden", "isDisabled", "isEditable"]) {
      expect(
        validateBrowserActionParams("locatorQuery", {
          locator: {
            kind: "css",
            selector: "#field"
          },
          kind
        })
      ).toEqual({ ok: true });
    }

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
      validateBrowserActionParams("locatorAction", {
        locator: {
          kind: "css",
          selector: "#submit"
        },
        kind: "evaluate",
        args: {
          script: "(element) => element.textContent",
          argument: null,
          mode: "read"
        }
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("locatorAction", {
        locator: {
          kind: "css",
          selector: ".item"
        },
        kind: "evaluateAll",
        args: {
          script: "(elements) => elements.length"
        }
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("locatorAction", {
        locator: {
          kind: "css",
          selector: "#submit"
        },
        kind: "dispatchEvent",
        args: {
          type: "click",
          eventInit: {
            detail: {
              source: "test"
            }
          }
        }
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("locatorAction", {
        locator: {
          kind: "role",
          role: "button",
          name: "Submit"
        },
        kind: "click",
        args: {
          trial: true
        }
      })
    ).toEqual({ ok: true });

    for (const kind of ["blur", "scrollIntoViewIfNeeded", "selectText", "highlight"]) {
      expect(
        validateBrowserActionParams("locatorAction", {
          locator: {
            kind: "css",
            selector: "#field"
          },
          kind,
          args: kind === "scrollIntoViewIfNeeded"
            ? { block: "nearest" }
            : kind === "highlight"
              ? { color: "rgba(255, 190, 80, 0.92)", durationMs: 1500 }
              : {}
        })
      ).toEqual({ ok: true });
    }

    expect(
      validateBrowserActionParams("locatorAction", {
        locator: {
          kind: "css",
          selector: ".source"
        },
        kind: "dragTo",
        args: {
          targetLocator: {
            kind: "text",
            text: "Drop here"
          },
          button: "left"
        }
      })
    ).toEqual({ ok: true });

    expect(
      validateBrowserActionParams("locatorAction", {
        locator: {
          kind: "css",
          selector: "select#country"
        },
        kind: "selectOption",
        args: {
          options: [
            { label: "Canada" },
            { value: "mx" },
            { index: 2 }
          ]
        }
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
        clip: { x: 0, y: 0, width: 100, height: 80, scale: 2 },
        highlight: true,
        highlightClip: { x: 5, y: 5, width: 40, height: 30, scale: 1 },
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
    expect(validateBrowserActionParams("pressKey", { key: "F24" })).toEqual({ ok: true });
    expect(validateBrowserActionParams("pressKey", { key: "NumpadEnter" })).toEqual({ ok: true });
    expect(validateBrowserActionParams("pressKey", { key: "AudioVolumeMute" })).toEqual({ ok: true });
    expect(validateBrowserActionParams("pressKey", { key: "Process" })).toEqual({ ok: true });
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
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const generatedReference = readFileSync("docs/protocol-action-reference.md", "utf8");

    for (const action of browserActions) {
      expect(protocol, action).toMatch(new RegExp(`^### ${action}$`, "m"));
      expect(generatedReference, action).toContain(`| \`${action}\` |`);
    }

    expect(packageJson.scripts).toMatchObject({
      "docs:protocol": "node scripts/generate-protocol-action-reference.js",
      "check:protocol-sync": "node scripts/generate-protocol-action-reference.js --check"
    });
    expect(protocol).toContain("npm run check:protocol-sync");
    expect(generatedReference).toContain("Generated by scripts/generate-protocol-action-reference.js");
    expect(generatedReference).toContain(`Total actions: ${browserActions.length}`);
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
    expect(background).toContain("function browserOriginApprovalSubject");
    expect(background).toContain("function postBrowserOriginApprovalRequiredEvent");
    expect(background).toContain("function browserOriginApprovalId");
    expect(background).toContain('throw browserActionError("origin_approval_required"');
    expect(background).toContain("originApproved: true");
    expect(background).toContain('kind: "rawCdp"');
    expect(background).toContain('kind: "download"');
    expect(protocol).toContain("Origin approval request event example");
    expect(protocol).toContain("redacted `subject` summary");
    expect(protocol).toContain('"method": "Runtime.evaluate"');
    expect(protocol).toContain("retry the exact raw CDP or page asset download action");
    expect(types).toContain("export type BrowserOriginApprovalRequiredEvent");
    expect(types).toContain("subject?: JsonObject");
  });

  it("keeps approval requests available through a pending approval engine", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const content = readFileSync("extension/content.ts", "utf8");
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const popup = readFileSync("extension/popup.ts", "utf8");
    const popupHtml = readFileSync("extension/popup.html", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const types = readFileSync("shared/types.ts", "utf8");

    expect(background).toContain("const pendingApprovals = new Map");
    expect(background).toContain("const approvalExpiryTimers = new Map");
    expect(background).toContain("function registerPendingApproval");
    expect(background).toContain("function scheduleApprovalExpiry");
    expect(background).toContain("function expirePendingApproval");
    expect(background).toContain("...(approval.target ? { target: approval.target } : {})");
    expect(background).toContain("async function publishPendingApprovalToTab");
    expect(background).toContain("async function clearPendingApprovalFromTab");
    expect(background).toContain("async function getPendingApprovals");
    expect(background).toContain("async function resolveApproval");
    expect(background).toContain('message?.type === "POPUP_PENDING_APPROVALS"');
    expect(background).toContain('message?.type === "POPUP_RESOLVE_APPROVAL"');
    expect(background).toContain('message?.type === "CONTENT_RESOLVE_APPROVAL"');
    expect(background).toContain('type: "AGENT_APPROVAL_REQUEST"');
    expect(background).toContain('type: "AGENT_APPROVAL_RESOLVED"');
    expect(background).toContain('name: "approvalResolved"');
    expect(content).toContain('message.type === "AGENT_APPROVAL_REQUEST"');
    expect(content).toContain('message.type === "AGENT_APPROVAL_RESOLVED"');
    expect(content).toContain('type: "CONTENT_RESOLVE_APPROVAL"');
    expect(content).toContain("const approvalExpiryTimers = new Map");
    expect(content).toContain("function scheduleApprovalExpiry");
    expect(content).toContain("function renderApprovalPanel");
    expect(content).toContain("function normalizeApprovalTarget");
    expect(content).toContain("function createApprovalDetails");
    expect(content).toContain("function approvalSubjectSummary");
    expect(content).toContain("originApproved=true");
    expect(content).toContain("function createApprovalButtons");
    expect(content).toContain('"Allow session"');
    expect(content).toContain('"Always allow"');
    expect(content).toContain("hostPolicyDecision(approval.suggestedDecisions?.alwaysAllow");
    expect(client).toContain("browser_get_pending_approvals");
    expect(client).toContain("browser_resolve_approval");
    expect(popupHtml).toContain("Pending approvals");
    expect(popup).toContain("async function loadApprovals");
    expect(popup).toContain('type: "POPUP_PENDING_APPROVALS"');
    expect(popup).toContain('type: "POPUP_RESOLVE_APPROVAL"');
    expect(popup).toContain("function approvalCard");
    expect(popup).toContain("function approvalDetailsList");
    expect(popup).toContain("function approvalSubjectSummary");
    expect(popup).toContain("function approvalRetryHints");
    expect(popup).toContain("originApproved=true");
    expect(popup).toContain("function approvalActionButtons");
    expect(popup).toContain('"Allow session"');
    expect(popup).toContain('"Always allow"');
    expect(popup).toContain("hostPolicyDecision(approval.suggestedDecisions?.alwaysAllow");
    expect(protocol).toContain("### getPendingApprovals");
    expect(protocol).toContain("### resolveApproval");
    expect(protocol).toContain("Chrome extension popup can list pending approvals");
    expect(protocol).toContain("allow for the active session");
    expect(protocol).toContain("host approval buttons pass the selected");
    expect(protocol).toContain("redacted `target` summary");
    expect(protocol).toContain("in-page approval banner");
    expect(protocol).toContain("The content banner also removes itself after `expiresAt`");
    expect(types).toContain("export type PendingApprovalRecord");
    expect(types).toContain("target?: {");
    expect(types).toContain("export type ResolveApprovalParams");
  });

  it("keeps locator actionability checks present in the extension backend", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");

    expect(background).toContain("function locatorActionabilitySource");
    expect(background).toContain("const trial = args.trial === true");
    expect(background).toContain("function locatorTrialResult");
    expect(background).toContain("function locatorTrialTarget");
    expect(background).toContain("function pointerTargetContextExpression");
    expect(background).toContain("const locatorActionabilityCandidatePoints = (rect) =>");
    expect(background).toContain("const locatorActionabilityOwnsPointerTop = (node, top) =>");
    expect(background).toContain("const host = root?.host instanceof Element ? root.host : null");
    expect(background).toContain("locatorActionabilityOwnsPointerTop(node, top)");
    expect(background).toContain("const locatorActionabilityComposedParent = (node) =>");
    expect(background).toContain("const locatorActionabilityComposedClosest = (node, predicate) =>");
    expect(background).toContain("const locatorActionabilityInert = (node) =>");
    expect(background).toContain("const locatorActionabilityPointerEvents = (node) =>");
    expect(background).toContain("locatorActionabilityComposedParent(current)");
    expect(background).toContain('current.getAttribute?.("aria-disabled") === "true"');
    expect(background).toContain('node.closest("fieldset[disabled]")');
    expect(background).toContain('child.tagName?.toLowerCase() === "legend"');
    expect(background).toContain("const locatorActionabilityReadonly = (node) =>");
    expect(background).toContain('current.getAttribute?.("aria-readonly") === "true"');
    expect(background).toContain("!locatorActionabilityEnabled(node) || locatorActionabilityReadonly(node)");
    expect(background).toContain("const isEnabled = (el) => {");
    expect(background).toContain("if (el.disabled || el.getAttribute(\"aria-disabled\") === \"true\") return false;");
    expect(background).toContain("const composedParent = (el) =>");
    expect(background).toContain("const composedClosest = (el, predicate) =>");
    expect(background).toContain("const fieldset = el.closest(\"fieldset[disabled]\");");
    expect(background).toContain("const isReadonly = (el) =>");
    expect(background).toContain("!el || !isEnabled(el) || isReadonly(el)");
    expect(background).toContain("hitPoint: receivesPointer.hitPoint");
    expect(background).toContain("hitPoint: hitPoint");
    expect(background).toContain("looksLikeBrowserPermissionPrompt(label, text)");
    expect(background).toContain("BROWSER_PERMISSION_TARGET_PATTERN");
    expect(background).toContain("confirmed: args.confirmed");
    expect(background).toContain("locatorActionabilityForce");
    expect(background).toContain('code: "detached"');
    expect(background).toContain('code: "not_visible"');
    expect(background).toContain('code: "not_stable"');
    expect(background).toContain('code: "disabled"');
    expect(background).toContain('code: "not_editable"');
    expect(background).toContain('code: "pointer_events_none"');
    expect(background).toContain('code: "inert"');
    expect(background).toContain('code: "occluded"');
    expect(background).toContain('code: "strict_mode_violation"');
    expect(background).toContain('code: "locator_not_found"');
    expect(background).toContain("function throwLocatorRuntimeError");
    expect(background).toContain('"locator_actionability"');
    expect(client).toContain('trial: typeof args.trial === "boolean" ? args.trial : undefined');
    expect(protocol).toContain("Passing `args.trial: true`");
    expect(protocol).toContain("trying the center first and then inset corners/edge points");
    expect(protocol).toContain("includes the chosen hit point");
    expect(protocol).toContain("inside an inert subtree");
    expect(protocol).toContain("`pointer-events: none`");
    expect(protocol).toContain("open shadow-root descendants inherit host/ancestor actionability blockers");
    expect(protocol).toContain("disabled fieldsets respect");
    expect(protocol).toContain('`aria-disabled="true"` ancestors');
    expect(protocol).toContain("`isEnabled`, `isDisabled`, and `isEditable` use the same disabled semantics");
  });

  it("keeps locator debug labels documented in the SDK surface", () => {
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const playwright = readFileSync("docs/playwright.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");

    expect(client).toContain("function locatorPlanDebugString");
    expect(client).toContain("function frameLocatorDebugString");
    expect(client).toContain("last() {");
    expect(client).toContain("return this.nth(-1);");
    expect(client).toContain('suffixes.push(index === -1 ? "last()"');
    expect(client).toContain("return `Locator<${locatorPlanDebugString(this.plan, this.selector)}>`;");
    expect(client).toContain("return `FrameLocator<${frameLocatorDebugString(this.frameSelectors)}>`;");
    expect(protocol).toContain("`String(locator)` and `String(frameLocator)`");
    expect(protocol).toContain("Negative indexes");
    expect(protocol).toContain("synchronous `locator.last()`");
    expect(playwright).toContain("The string form is a compact diagnostic label");
    expect(playwright).toContain("locator.last()` serializes as `index: -1`");
    expect(todo).toContain("`String(locator)`/`String(frameLocator)` debug labels");
    expect(todo).toContain("Synchronous `last()` backed by `index: -1`");
  });

  it("keeps locator surface parity helpers documented", () => {
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const api = readFileSync("docs/browser-client-api.md", "utf8");
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const playwright = readFileSync("docs/playwright.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");

    expect(client).toContain("innerHTML(args?: JsonObject): Promise<string | null>;");
    expect(client).toContain("const value = (await this.query(\"innerHTML\", args)).value;");
    expect(client).toContain("pressSequentially(value: string, args?: JsonObject): Promise<unknown>;");
    expect(client).toContain("return this.type(value, args);");
    expect(client).toContain("page(): TabHandle;");
    expect(client).toContain("return this.tab;");
    expect(api).toContain("innerHTML(args?: JsonObject): Promise<string | null>;");
    expect(api).toContain("pressSequentially(value: string, args?: JsonObject): Promise<unknown>;");
    expect(api).toContain("page(): TabHandle;");
    expect(background).toContain("\"innerHTML\"");
    expect(background).toContain("value = first ? first.innerHTML : null;");
    expect(protocol).toContain("`innerHTML`");
    expect(playwright).toContain("locator.pressSequentially(text, options)");
    expect(playwright).toContain("`locator.page()` returns the owning SDK tab handle.");
    expect(todo).toContain("`innerHTML()`, `pressSequentially()`, and `page()`");
  });

  it("keeps typed clipboard MIME map convenience documented in the SDK surface", () => {
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const playwright = readFileSync("docs/playwright.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");

    expect(client).toContain("write(items: string | unknown[] | JsonObject, args?: JsonObject): Promise<unknown>;");
    expect(client).toContain('if (typeof items === "string")');
    expect(client).toContain('return tab.browser.tool("browser_clipboard_write_text"');
    expect(client).toContain("function normalizeClipboardWriteMimeRecord");
    expect(client).toContain("function clipboardBinaryToBase64");
    expect(client).toContain("function isClipboardMimeTypeKey");
    expect(client).toContain("ArrayBuffer.isView(value)");
    expect(client).toContain("tab.clipboard.write(items) requires an item array or MIME payload object.");
    expect(protocol).toContain("When the SDK receives a direct string");
    expect(protocol).toContain("it routes the request to");
    expect(protocol).toContain("`ClipboardItem`-style MIME map inputs");
    expect(protocol).toContain("`Uint8Array`/`Buffer`, `ArrayBuffer`, or byte arrays");
    expect(playwright).toContain('tab.clipboard.write("text", options)');
    expect(playwright).toContain("a `ClipboardItem`-style MIME map");
    expect(playwright).toContain("binary payloads can be `dataUrl`, `Uint8Array`/`Buffer`");
    expect(todo).toContain("SDK direct string `tab.clipboard.write(\"text\")` alias");
    expect(todo).toContain("SDK `ClipboardItem`-style MIME map inputs");
    expect(todo).toContain("SDK binary MIME map inputs");
  });

  it("keeps real-browser failure smoke coverage wired into test:real", () => {
    const realE2e = readFileSync("tests/scripts/real-browser-e2e.js", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");

    expect(realE2e).toContain("real-browser locator failures surface stable structured codes");
    expect(realE2e).toContain("strict-duplicate-button");
    expect(realE2e).toContain("hidden-actionability-button");
    expect(realE2e).toContain("occluded-actionability-button");
    expect(realE2e).toContain("locator trial did not return trial payload");
    expect(realE2e).toContain("locator trial unexpectedly changed page state");
    expect(realE2e).toContain('trial: true');
    expect(realE2e).toContain('strictFailure.code === "strict_mode_violation"');
    expect(realE2e).toContain('missingFailure.code === "locator_not_found"');
    expect(realE2e).toContain('hiddenFailure.details?.actionabilityCode === "not_visible"');
    expect(realE2e).toContain('occludedFailure.details?.actionabilityCode === "occluded"');
    expect(todo).toContain("Locator strict/not-found/actionability failure codes in real browser");
    expect(todo).toContain("Locator `trial: true` real-browser preflight");
  });

  it("keeps cross-origin frame diagnostics wired into test:real", () => {
    const tools = readFileSync("agent/browserTools.ts", "utf8");
    const realE2e = readFileSync("tests/scripts/real-browser-e2e.js", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");

    expect(tools).toContain("export async function browserResolveFrame");
    expect(tools).toContain('case "browser_resolve_frame"');
    expect(realE2e).toContain("cross-origin frame resolve exposes partial OOPIF diagnostics");
    expect(realE2e).toContain("crossOriginServer");
    expect(realE2e).toContain("CROSS_ORIGIN_HOST");
    expect(realE2e).toContain("cross-origin-frame");
    expect(realE2e).toContain("cross-origin-nested-frame");
    expect(realE2e).toContain("browserResolveFrame");
    expect(realE2e).toContain("resolved.targetCandidates");
    expect(realE2e).toContain("Cross origin action clicked");
    expect(realE2e).toContain("verify cross-origin locator action");
    expect(realE2e).toContain('nested.targetId === resolved.targetId');
    expect(todo).toContain("Cross-origin iframe resolve diagnostics and target-continuation");
    expect(todo).toContain("nested target-continuation");
    expect(todo).toContain("locator click execution");
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
    expect(background).toContain("downloadId: download.id");
    expect(background).toContain("download_id: download.id");
    expect(background).toContain("downloadId: delta.id");
    expect(background).toContain("download_id: delta.id");
    expect(client).toContain("downloadMedia(args");
    expect(client).toContain('"browser_download_media"');
    expect(client).toContain("downloadId: id");
    expect(client).toContain("download_id: id");
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
    expect(background).toContain("locator: record.fileChooser.locator");
    expect(background).toContain("locator: locatorTarget.locator");
    expect(background).toContain("objectId");
    expect(background).toContain('"DOM.setFileInputFiles"');
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
    expect(background).toContain("withChromeMessageTimeout(");
    expect(background).toContain("chrome.debugger.getTargets()");
    expect(background).toContain("options.timeoutMs ?? DEFAULT_CDP_TIMEOUT_MS");
    expect(background).toContain("async function createEvaluationContextForFrame");
    expect(background).toContain('"Page.createIsolatedWorld"');
    expect(background).toContain("contextId: executionContextId");
    expect(background).toContain("async function resolveFrame");
    expect(background).toContain("function resolveFrameSelectorPathExpression");
    expect(background).toContain("function matchResolvedFramePathToFrameTree");
    expect(background).toContain("async function resolveFramePathTarget");
    expect(background).toContain("async function continueResolveFramePathInTarget");
    expect(background).toContain("function matchResolvedFramePathToFrameTreeRoot");
    expect(background).toContain("normalizeDebuggerTargetId");
    expect(background).toContain("targetViewportOffset");
    expect(background).toContain("resolvedSelectorCount");
    expect(background).toContain("unresolvedFrameSelectors");
    expect(background).toContain("diagnostics.targetCandidates");
    expect(background).toContain("candidates.slice(0, 10)");
    expect(background).toContain("finalResolvedStep?.accessible !== true");
    expect(background).toContain("async function locatorExecutionTarget");
    expect(background).toContain('const useFrameScopedContext = kind !== "boundingBox"');
    expect(background).toContain("contextId: target.executionContextId");
    expect(background).toContain("targetId: target.targetId");
    expect(background).toContain("const cdpOptions = targetId ? { targetId } : {};");
    expect(background).toContain("applyViewportOffsetToLocatorTarget");
    expect(background).toContain("resolveLocatorRef(tabId, target.locator");
    expect(background).toContain("stripLocatorFrameSelectors(locator)");
    expect(types).toContain("frameId?: string");
    expect(types).toContain("executionContextId?: number | null");
    expect(types).toContain("targetViewportOffset?: BrowserPoint");
    expect(types).toContain("resolvedSelectorCount?: number");
    expect(types).toContain("unresolvedFrameSelectors?: string[]");
    expect(types).toContain("targetCandidates?: Array<{");
    expect(types).toContain("export type ResolveFrameParams");
    expect(protocol).toContain("Codex resource 1.1.5");
    expect(protocol).toContain("Target.getTargets");
    expect(protocol).toContain("auto-detected-oopif-target-id-or-null");
    expect(protocol).toContain("continue resolving the remaining selectors");
    expect(protocol).toContain("`targetCandidates`");
    expect(protocol).toContain("OOPIF target actions dispatch");
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

  it("documents the node_repl browser-use operating model in skill, API docs, and runtime docs", () => {
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const api = readFileSync("docs/api.md", "utf8");
    const mcpConfig = readFileSync("docs/plugin-mcp-configuration.md", "utf8");
    const skill = readFileSync("skill/SKILL.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");

    expect(client).toContain("browserUse: () =>");
    expect(client).toContain("Expose only the node_repl JavaScript tool surface");
    expect(client).toContain("Use structured connectors, APIs, CLIs, or file parsers before Chrome");
    expect(client).toContain("browser.policy.pending()");
    expect(api).toContain('await agent.documentation.get("browserUse")');
    expect(api).toContain("intentionally exposes only the JavaScript");
    expect(mcpConfig).toContain('await agent.documentation.get("browserUse")');
    expect(mcpConfig).toContain("mirrors the packaged skill's operating model");
    expect(skill).toContain("## Browser-Use Operating Model");
    expect(skill).toContain("Use the Node REPL as the only MCP tool surface");
    expect(skill).toContain("Resolve pending approvals only after user approval");
    expect(todo).toContain('runtime `agent.documentation.get("browserUse")`');
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
    expect(client).toContain("export class BrowserDomCuaStaleNodeError extends Error");
    expect(client).toContain('readonly code = "dom_cua_stale_node"');
    expect(client).toContain("availableNodeIds: snapshot.nodes.map");
    expect(client).toContain("Refresh tab.dom_cua.get_visible_dom() and retry with a current node_id.");
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
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
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
    expect(manifest.permissions ?? []).toContain("favicon");
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

  it("keeps browser/system notifications intentionally unsupported", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const skill = readFileSync("skill/SKILL.md", "utf8");
    const actions = browserActionRegistry.map((entry) => entry.action);
    const schemaNames = browserToolSchemas.map((schema) => schema.name);

    expect(manifest.permissions ?? []).not.toContain("notifications");
    expect(actions.some((action) => action.toLowerCase().includes("notification"))).toBe(false);
    expect(schemaNames.some((name) => name.includes("notification"))).toBe(false);
    expect(background).toContain('browserCapability("browser.notifications"');
    expect(background).toContain('"unsupported_sensitive_browser_state"');
    expect(protocol).toContain("Browser/system notifications are intentionally not exposed");
    expect(skill).toContain("Browser/system notifications are intentionally not exposed");
  });

  it("keeps evaluate and raw CDP calls audited without payload bodies", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const playwright = readFileSync("docs/playwright.md", "utf8");

    expect(background).toContain("function assertReadOnlyEvaluateAllowed");
    expect(background).toContain("function readOnlyEvaluateExpression");
    expect(background).toContain("function readOnlyMutationGuardSource");
    expect(background).toContain('readOnlyMutationGuardSource({ restoreAllDeclaration: "" })');
    expect(background).toContain("HTMLElement.click");
    expect(background).toContain("EventTarget.dispatchEvent");
    expect(background).toContain("Storage.setItem");
    expect(background).toContain("Document.cookie");
    expect(background).toContain("Element.insertAdjacentHTML");
    expect(background).toContain("DOMTokenList.add");
    expect(background).toContain("CSSStyleDeclaration.setProperty");
    expect(background).toContain("Element.outerHTML");
    expect(background).toContain("Element.className");
    expect(background).toContain("CSSStyleDeclaration.cssText");
    expect(background).toContain("classList\\s*\\.\\s*(add|remove|toggle|replace)");
    expect(background).toContain("\\.style\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*=");
    expect(background).toContain('read_only_evaluate_violation');
    expect(background).toContain('reason: "mutating_script_pattern"');
    expect(background).toContain('assertReadOnlyEvaluateAllowed(script, params, "evaluate")');
    expect(background).toContain('assertReadOnlyEvaluateAllowed(script, args, `locator.${kind}`)');
    expect(protocol).toContain("read_only_evaluate_violation");
    expect(protocol).toContain("temporary runtime mutation guard");
    expect(protocol).toContain("best-effort denylist plus temporary runtime patch");
    expect(protocol).toContain("full JavaScript capability sandbox");
    expect(protocol).toContain("browser-enforced immutable execution");
    expect(protocol).toContain("classList");
    expect(protocol).toContain("style mutation methods");
    expect(protocol).toContain('Locator `evaluate` and `evaluateAll` calls that pass `args.mode: "read"`');
    expect(playwright).toContain("best-effort denylist plus temporary patch");
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
    expect(background).toContain("async function stopSessionInternal");
    expect(background).toContain('reason: "stopSession"');
    expect(background).toContain("persistSessionEventSnapshot(sessionId, options.reason)");
    expect(background).toContain("eventBuffer.clear({ sessionId })");
  });

  it("keeps Codex-like native disconnect cleanup wired to stop sessions and detach debuggers", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");
    const researchMap = readFileSync(
      "docs/research/codex-resource-1.1.5/background-control-map.md",
      "utf8"
    );

    expect(background).toContain("void cleanupAfterNativeDisconnect(lastNativeError)");
    expect(background).toContain("async function cleanupAfterNativeDisconnect");
    expect(background).toContain("async function cleanupAfterNativeDisconnectUnlocked");
    expect(background).toContain("async function detachAllDebuggersBestEffort");
    expect(background).toContain('name: "nativeDisconnected"');
    expect(background).toContain('name: "nativeDisconnectCleanup"');
    expect(background).toContain('name: "debuggerCleanup"');
    expect(background).toContain('reason: "nativeDisconnect"');
    expect(background).toContain("sessionManager.listSessions()");
    expect(background).toContain("debuggerManager.listAttachedTabs()");
    expect(background).toContain("debuggerManager.listAttachedTargets()");
    expect(background).toContain("chrome.debugger.getTargets()");
    expect(background).toContain("chrome.debugger.detach({ tabId })");
    expect(background).toContain("chrome.debugger.detach({ targetId })");
    expect(background).toContain("debuggerManager.markDetached({ tabId })");
    expect(background).toContain("debuggerManager.markDetached({ targetId })");
    expect(protocol).toContain("`nativeDisconnected` is emitted");
    expect(protocol).toContain("`nativeDisconnectCleanup` records active sessions stopped");
    expect(protocol).toContain("`debuggerCleanup` records debugger tab and target attachments detached");
    expect(todo).toContain("Native disconnect cleanup and debugger tab/target detach sweep events");
    expect(researchMap).toContain("Codex-like native disconnect cleanup");
  });

  it("keeps Codex-like extension update reload deferred while browser control is active", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");
    const researchMap = readFileSync(
      "docs/research/codex-resource-1.1.5/background-control-map.md",
      "utf8"
    );

    expect(background).toContain("const PENDING_UPDATE_STORAGE_KEY");
    expect(background).toContain("chrome.runtime.onUpdateAvailable.addListener");
    expect(background).toContain("async function handleExtensionUpdateAvailable");
    expect(background).toContain("async function maybeReloadForPendingUpdate");
    expect(background).toContain("function browserControlIsInUseForUpdate");
    expect(background).toContain("function activeControlledLeaseCount");
    expect(background).toContain("await storageSessionSet(PENDING_UPDATE_STORAGE_KEY");
    expect(background).toContain("await storageSessionRemove(PENDING_UPDATE_STORAGE_KEY)");
    expect(background).toContain('name: "extensionUpdateAvailable"');
    expect(background).toContain('name: "extensionUpdateDeferred"');
    expect(background).toContain('name: "extensionUpdateReloading"');
    expect(background).toContain('await maybeReloadForPendingUpdate("finalizeSession")');
    expect(background).toContain('await maybeReloadForPendingUpdate("endTurn")');
    expect(background).toContain("await maybeReloadForPendingUpdate(options.reason)");
    expect(background).toContain('await maybeReloadForPendingUpdate("nativeDisconnect")');
    expect(background).toContain("debuggerManager.listAttachedTabs().length");
    expect(background).toContain("debuggerManager.listAttachedTargets().length");
    expect(background).toContain("attachedTargetCount: debuggerManager.listAttachedTargets().length");
    expect(background).toContain("cursorArrivalWaiters.size");
    expect(background).toContain("nativeDisconnectCleanup != null");
    expect(protocol).toContain("`extensionUpdateAvailable` is emitted");
    expect(protocol).toContain("`extensionUpdateDeferred`");
    expect(protocol).toContain("`extensionUpdateReloading`");
    expect(todo).toContain("Pending extension update safety");
    expect(researchMap).toContain("defers extension update reload while browser control is active");
  });

  it("keeps Codex-like handoff leases resumable on the next session start", () => {
    const sessionManager = readFileSync("extension/session-manager.ts", "utf8");
    const protocol = readFileSync("shared/protocol.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");
    const researchMap = readFileSync(
      "docs/research/codex-resource-1.1.5/background-control-map.md",
      "utf8"
    );

    expect(sessionManager).toContain("await this.resumeHandoffTabs(existing.sessionId, params.turnId)");
    expect(sessionManager).toContain("async resumeHandoffTabs");
    expect(sessionManager).toContain('lease.state = "active"');
    expect(sessionManager).toContain("lease.turnId = normalizedTurnId");
    expect(sessionManager).toContain("lease.instanceId = instanceId");
    expect(sessionManager).toContain("delete lease.isActiveHandoff");
    expect(sessionManager).toContain("activeHandoffTabId");
    expect(sessionManager).toContain("await this.ensureAgentTabGroup(session, lease.tabId)");
    expect(sessionManager).toContain("this.tabLeases.delete(lease.tabId)");
    expect(protocol).toContain("next `startSession` call for the same `sessionId` can");
    expect(todo).toContain("Resume live handoff tab leases on the next `startSession` call");
    expect(researchMap).toContain("resumes live handoff leases when `startSession` is called again");
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
    expect(content).toContain('message.type === "TAB_FAVICON_BADGE"');
    expect(content).toContain("function setFaviconBadge");
    expect(content).toContain("data-formax-favicon-badge");
    expect(content).toContain('message.type === "AGENT_HIGHLIGHT_RECT"');
    expect(content).toContain("function showHighlightRect");
    expect(background).toContain("const FINALIZED_BADGE_STORAGE_KEY");
    expect(background).toContain("const finalizedBadgesByTab = new Map<number, FinalizedBadgePhase>();");
    expect(background).toContain("async function markFinalizedBadge");
    expect(background).toContain("async function publishFinalizedBadge");
    expect(background).toContain("function readEffectiveFaviconBadge");
    expect(background).toContain("function scheduleSessionFaviconBadges");
    expect(background).toContain("async function restoreSessionFaviconBadges");
    expect(background).toContain("void restoreSessionFaviconBadges()");
    expect(background).toContain("async function readFaviconDataUrl");
    expect(background).toContain("async function fetchChromeFaviconDataUrl");
    expect(background).toContain('chrome.runtime.getURL("/_favicon/")');
    expect(background).toContain("faviconDataUrlsByTab");
    expect(background).toContain("isFormaxFaviconBadgeUrl");
    expect(background).toContain("sanitizeFaviconContentType");
    expect(background).toContain('return "active"');
    expect(background).toContain("finalizedBadgesByTab.get(tabId) ?? null");
    expect(background).toContain("chrome.tabs.onActivated.addListener");
    expect(background).toContain("chrome.windows.onFocusChanged.addListener");
    expect(background).toContain("const expectedDebuggerDetachTabs = new Set<number>();");
    expect(background).toContain('name: "pageVisualStatus"');
    expect(background).toContain('name: "userTakeover"');
    expect(background).toContain('name: "userHandoffRequired"');
    expect(background).toContain('name: "permissionPromptDetected"');
    expect(background).toContain("function postPermissionPromptDetectedIfNeeded");
    expect(background).toContain('classification.reasons.includes("browser_permission")');
    expect(background).toContain('type: "AGENT_PAGE_STATUS"');
    expect(background).toContain('type: "TAB_FAVICON_BADGE"');
    expect(background).toContain("faviconDataUrl");
    expect(background).toContain('type: "AGENT_HIGHLIGHT_RECT"');
    expect(background).toContain("async function showHighlightRect");
    expect(background).toContain('await setPageVisualStatus(tabId, "handoff"');
    expect(background).toContain('await setPageVisualStatus(tabId, "deliverable"');
    expect(background).toContain('await setPageVisualStatus(tabId, "stopped"');
    expect(background).toContain('setPageVisualStatus(source.tabId, "taken_over"');
    expect(background).toContain("scheduleSessionFaviconBadges(session.sessionId)");
    expect(background).toContain("schedulePublishFinalizedBadge(tabId)");
    expect(background).toContain("await detachTabForLifecycle(tabId)");
    expect(protocol).toContain("pageVisualStatus");
    expect(protocol).toContain("Active controlled tab leases publish");
    expect(protocol).toContain("active lease first, then unseen finalized");
    expect(protocol).toContain("`/_favicon/` endpoint can return the page favicon");
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
    expect(background).toContain("attachedTargets: healthSnapshot.attachedTargets");
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

  it("keeps Playwright namespace page aliases documented", () => {
    const client = readFileSync("mcp-node-repl/browser-client.ts", "utf8");
    const api = readFileSync("docs/browser-client-api.md", "utf8");
    const playwright = readFileSync("docs/playwright.md", "utf8");
    const todo = readFileSync("docs/codex-gap-todolist.md", "utf8");

    expect(client).toContain("goto(url: string, args?: JsonObject): Promise<unknown>;");
    expect(client).toContain("goto: (url, args = {}) => tab.goto(url, args)");
    expect(client).toContain("url: (args = {}) => tab.url(args)");
    expect(client).toContain("title: (args = {}) => tab.title(args)");
    expect(client).toContain("reload: (args = {}) => tab.reload(args)");
    expect(client).toContain("back: (args = {}) => tab.back(args)");
    expect(client).toContain("forward: (args = {}) => tab.forward(args)");
    expect(client).toContain("waitForSelector(selectorOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;");
    expect(client).toContain("waitForSelector: (selectorOrArgs, args = {}) => tab.waitForSelector(selectorOrArgs, args)");
    expect(client).toContain("waitForText: (textOrArgs, args = {}) => tab.waitForText(textOrArgs, args)");
    expect(client).toContain("screenshot(args?: JsonObject): Promise<BrowserScreenshotResult>;");
    expect(client).toContain("screenshot: (args = {}) => tab.screenshot(args)");
    expect(api).toContain("goto(url: string, args?: JsonObject): Promise<unknown>;");
    expect(api).toContain("waitForSelector(selectorOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;");
    expect(api).toContain("screenshot(args?: JsonObject): Promise<BrowserScreenshotResult>;");
    expect(playwright).toContain("tab.playwright.waitForSelector/waitForText");
    expect(playwright).toContain("tab.playwright.screenshot");
    expect(todo).toContain("page navigation aliases (`goto`, `url`, `title`, `reload`, `back`, and");
    expect(todo).toContain("page-level wait and screenshot aliases");
  });

  it("keeps runtime errors concise with structured internal details", () => {
    const background = readFileSync("extension/background.ts", "utf8");

    expect(background).toContain("function structuredError");
    expect(background).toContain("function userFacingErrorMessage");
    expect(background).toContain("details: {");
    expect(background).toContain("internalMessage");
    expect(background).toContain('case "locator_actionability"');
    expect(background).toContain('case "strict_mode_violation"');
    expect(background).toContain("The browser action failed. Check structured error details or diagnostics for more information.");
  });
});

function extractUnionMembers(source: string, typeName: string): string[] {
  const match = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));

  expect(match, typeName).not.toBeNull();

  return Array.from(match?.[1].matchAll(/\|\s*(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*))/g) ?? [], (item) => item[1] ?? item[2]);
}

function schemaForTool(name: string) {
  const schema = browserToolSchemas.find((candidate) => candidate.name === name);

  expect(schema, name).toBeDefined();

  return schema!;
}

function schemaParameters(schema: { parameters: { properties?: unknown } }) {
  return (schema.parameters.properties ?? {}) as Record<string, {
    enum?: readonly unknown[];
    properties?: Record<string, { enum?: readonly unknown[] }>;
  }>;
}

function extractInlineKindUnion(source: string, typeName: string): string[] {
  const typeBlock = extractTypeBlock(source, typeName);
  const match = typeBlock.match(/kind:\s*([\s\S]*?);/);

  expect(match, `${typeName}.kind`).not.toBeNull();

  return extractQuotedStrings(match?.[1] ?? "");
}

function extractTypeBlock(source: string, typeName: string): string {
  const match = source.match(new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\};`));

  expect(match, typeName).not.toBeNull();

  return match?.[1] ?? "";
}

function extractStringArrayAfter(source: string, marker: string, label: string): string[] {
  const markerIndex = source.indexOf(marker);

  expect(markerIndex, label).toBeGreaterThanOrEqual(0);

  const openIndex = source.indexOf("[", markerIndex);
  const closeIndex = source.indexOf("]", openIndex);

  expect(openIndex, label).toBeGreaterThanOrEqual(0);
  expect(closeIndex, label).toBeGreaterThan(openIndex);

  return extractQuotedStrings(source.slice(openIndex, closeIndex + 1));
}

function extractRustKindEnumAfter(source: string, marker: string, label: string): string[] {
  const markerIndex = source.indexOf(marker);

  expect(markerIndex, label).toBeGreaterThanOrEqual(0);

  const searchIndex = marker === "validate_string_enum_for_map"
    ? markerIndex
    : source.indexOf("validate_string_enum", markerIndex);
  const kindIndex = source.indexOf('"kind"', searchIndex);
  const arrayIndex = source.indexOf("&[", kindIndex);
  const closeIndex = source.indexOf("]", arrayIndex);

  expect(searchIndex, label).toBeGreaterThanOrEqual(0);
  expect(kindIndex, label).toBeGreaterThanOrEqual(0);
  expect(arrayIndex, label).toBeGreaterThanOrEqual(0);
  expect(closeIndex, label).toBeGreaterThan(arrayIndex);

  return extractQuotedStrings(source.slice(arrayIndex, closeIndex + 1));
}

function extractMarkdownSection(source: string, heading: string): string {
  const marker = `### ${heading}`;
  const markerIndex = source.indexOf(marker);

  expect(markerIndex, heading).toBeGreaterThanOrEqual(0);

  const sectionStart = source.indexOf("\n", markerIndex) + 1;
  const nextSection = source.indexOf("\n### ", sectionStart);

  return source.slice(sectionStart, nextSection === -1 ? undefined : nextSection);
}

function extractBacktickList(source: string, pattern: RegExp, label: string): string[] {
  const match = source.match(pattern);

  expect(match, label).not.toBeNull();

  return Array.from((match?.[1] ?? "").matchAll(/`([^`]+)`/g), (item) => item[1]);
}

function extractQuotedStrings(source: string): string[] {
  return Array.from(source.matchAll(/"([^"]+)"/g), (item) => item[1]);
}
