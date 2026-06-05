import type {
  BrowserAction,
  CdpParams,
  CdpResult,
  CloseTabParams,
  CloseTabResult,
  EvaluateParams,
  EvaluateResult,
  FinalizeSessionParams,
  FinalizeSessionResult,
  GetCapabilitiesParams,
  GetCapabilitiesResult,
  ClearEventsParams,
  ClearEventsResult,
  GetDevLogsParams,
  GetDevLogsResult,
  GetEventsParams,
  GetEventsResult,
  GetTabParams,
  GetTabResult,
  HandleDialogParams,
  HandleDialogResult,
  BrowserKey,
  BrowserObservation,
  BrowserSession,
  BrowserToolResult,
  ClaimTabParams,
  ClickParams,
  CreateTabParams,
  CreateTabResult,
  HealthResult,
  JsonObject,
  ListDownloadsParams,
  ListDownloadsResult,
  ListTabsParams,
  ListTabsResult,
  LocatorActionParams,
  LocatorQueryParams,
  LocatorQueryResult,
  LocatorWaitParams,
  LocatorWaitResult,
  MoveMouseParams,
  MoveMouseResult,
  NavigationParams,
  NavigationResult,
  NameSessionParams,
  NameSessionResult,
  OpenUrlParams,
  ObserveParams,
  PressKeyParams,
  ReloadParams,
  ReloadExtensionResult,
  ScrollParams,
  ScreenshotParams,
  ScreenshotResult,
  StartSessionParams,
  StopSessionParams,
  StopSessionResult,
  SwitchTabParams,
  SwitchTabResult,
  TypeTextParams,
  UploadFileParams,
  WaitForDownloadParams,
  WaitForDownloadResult,
  WaitForEventParams,
  WaitForEventResult,
  WaitForLoadStateParams,
  WaitForLoadStateResult,
  WaitForUrlParams,
  WaitForUrlResult,
  WaitForSelectorParams,
  WaitForSelectorResult,
  WaitForTextParams,
  WaitForTextResult
} from "../shared/types.js";

const RPC_URL = process.env.AGENT_BROWSER_RPC_URL || "http://127.0.0.1:8765/rpc";
const RPC_TOKEN = process.env.AGENT_BROWSER_TOKEN || "";

async function browserRpc<T = unknown>(
  action: BrowserAction,
  params: JsonObject = {},
  timeoutMs = 30000
): Promise<BrowserToolResult<T>> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (RPC_TOKEN) {
    headers["x-agent-browser-token"] = RPC_TOKEN;
  }

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action,
      params,
      timeoutMs
    })
  });
  const json = (await response.json()) as {
    ok?: boolean;
    result?: BrowserToolResult<T>;
    error?: string;
  };

  if (!response.ok || json.ok !== true) {
    throw new Error(json.error || `Browser RPC failed: ${action}`);
  }

  return json.result as BrowserToolResult<T>;
}

export async function browserHealth() {
  return browserRpc<HealthResult>("health");
}

export async function browserReloadExtension() {
  return browserRpc<ReloadExtensionResult>("reloadExtension");
}

export async function browserGetEvents(args: GetEventsParams = {}) {
  return browserRpc<GetEventsResult>("getEvents", args as JsonObject);
}

export async function browserClearEvents(args: ClearEventsParams = {}) {
  return browserRpc<ClearEventsResult>("clearEvents", args as JsonObject);
}

export async function browserWaitForEvent(args: WaitForEventParams = {}) {
  return browserRpc<WaitForEventResult>("waitForEvent", args as JsonObject);
}

export async function browserStartSession(args: StartSessionParams = {}) {
  return browserRpc<BrowserSession>("startSession", args as JsonObject);
}

export async function browserNameSession(args: NameSessionParams) {
  return browserRpc<NameSessionResult>("nameSession", args as JsonObject);
}

export async function browserClaimTab(args: ClaimTabParams = {}) {
  return browserRpc<BrowserSession>("claimTab", args as JsonObject);
}

export async function browserCreateTab(args: CreateTabParams = {}) {
  return browserRpc<CreateTabResult>("createTab", args as JsonObject);
}

export async function browserSwitchTab(args: SwitchTabParams) {
  return browserRpc<SwitchTabResult>("switchTab", args as JsonObject);
}

export async function browserListTabs(args: ListTabsParams = {}) {
  return browserRpc<ListTabsResult>("listTabs", args as JsonObject);
}

export async function browserGetTab(args: GetTabParams = {}) {
  return browserRpc<GetTabResult>("getTab", args as JsonObject);
}

export async function browserOpenUrl(args: OpenUrlParams) {
  return browserRpc<BrowserObservation>("openUrl", args as JsonObject);
}

export async function browserGoBack(args: NavigationParams = {}) {
  return browserRpc<NavigationResult>("goBack", args as JsonObject);
}

export async function browserGoForward(args: NavigationParams = {}) {
  return browserRpc<NavigationResult>("goForward", args as JsonObject);
}

export async function browserReload(args: ReloadParams = {}) {
  return browserRpc<NavigationResult>("reload", args as JsonObject);
}

export async function browserWaitForLoadState(args: WaitForLoadStateParams) {
  return browserRpc<WaitForLoadStateResult>(
    "waitForLoadState",
    args as JsonObject
  );
}

export async function browserWaitForUrl(args: WaitForUrlParams) {
  return browserRpc<WaitForUrlResult>("waitForUrl", args as JsonObject);
}

export async function browserWaitForSelector(args: WaitForSelectorParams) {
  return browserRpc<WaitForSelectorResult>(
    "waitForSelector",
    args as JsonObject
  );
}

export async function browserWaitForText(args: WaitForTextParams) {
  return browserRpc<WaitForTextResult>("waitForText", args as JsonObject);
}

export async function browserObserve(args: ObserveParams) {
  return browserRpc<BrowserObservation>("observe", args as JsonObject);
}

export async function browserLocatorQuery(args: LocatorQueryParams) {
  return browserRpc<LocatorQueryResult>("locatorQuery", args as unknown as JsonObject);
}

export async function browserLocatorAction(args: LocatorActionParams) {
  return browserRpc<BrowserObservation>("locatorAction", args as unknown as JsonObject);
}

export async function browserLocatorWait(args: LocatorWaitParams) {
  return browserRpc<LocatorWaitResult>("locatorWait", args as unknown as JsonObject);
}

export async function browserClick(args: ClickParams) {
  return browserRpc<BrowserObservation>("click", args as JsonObject);
}

export async function browserMoveMouse(args: MoveMouseParams) {
  return browserRpc<MoveMouseResult>("moveMouse", args as unknown as JsonObject);
}

export async function browserScroll(args: ScrollParams) {
  return browserRpc<BrowserObservation>("scroll", args as JsonObject);
}

export async function browserTypeText(args: TypeTextParams) {
  return browserRpc<BrowserObservation>("typeText", args as JsonObject);
}

export async function browserEvaluate(args: EvaluateParams) {
  return browserRpc<EvaluateResult>("evaluate", args as unknown as JsonObject);
}

export async function browserPressKey(args: PressKeyParams) {
  return browserRpc("pressKey", args as JsonObject);
}

export async function browserHandleDialog(args: HandleDialogParams) {
  return browserRpc<HandleDialogResult>(
    "handleDialog",
    args as unknown as JsonObject
  );
}

export async function browserScreenshot(args: ScreenshotParams) {
  return browserRpc<ScreenshotResult>("screenshot", args as JsonObject);
}

export async function browserUploadFile(args: UploadFileParams) {
  return browserRpc<BrowserObservation>("uploadFile", args as unknown as JsonObject);
}

export async function browserCdp(args: CdpParams) {
  return browserRpc<CdpResult>("cdp", args as unknown as JsonObject);
}

export async function browserGetDevLogs(args: GetDevLogsParams = {}) {
  return browserRpc<GetDevLogsResult>("getDevLogs", args as JsonObject);
}

export async function browserGetCapabilities(args: GetCapabilitiesParams = {}) {
  return browserRpc<GetCapabilitiesResult>("getCapabilities", args as JsonObject);
}

export async function browserListDownloads(args: ListDownloadsParams = {}) {
  return browserRpc<ListDownloadsResult>("listDownloads", args as JsonObject);
}

export async function browserWaitForDownload(args: WaitForDownloadParams = {}) {
  return browserRpc<WaitForDownloadResult>(
    "waitForDownload",
    args as JsonObject
  );
}

export async function browserCloseTab(args: CloseTabParams) {
  return browserRpc<CloseTabResult>("closeTab", args as JsonObject);
}

export async function browserFinalizeSession(args: FinalizeSessionParams) {
  return browserRpc<FinalizeSessionResult>(
    "finalizeSession",
    args as unknown as JsonObject
  );
}

export async function browserStopSession(args: StopSessionParams) {
  return browserRpc<StopSessionResult>("stopSession", args as JsonObject);
}

export const browserToolSchemas = [
  {
    name: "browser_health",
    description: "Check whether the browser extension and native host are connected.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "browser_reload_extension",
    description: "Ask the extension background to reload itself after the current response returns.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "browser_get_events",
    description: "Read recent buffered browser events such as navigation, dialogs, downloads, and debugger detach.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        name: { type: "string" },
        sinceSequence: { type: "number" },
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_clear_events",
    description: "Clear buffered browser events, optionally filtered by session, tab, name, or sequence.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        name: { type: "string" },
        sinceSequence: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_wait_for_event",
    description: "Wait for a buffered browser event such as navigation, dialog, download, or dev log.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        name: { type: "string" },
        sinceSequence: { type: "number" },
        limit: { type: "number" },
        timeoutMs: { type: "number" },
        pollMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_start_session",
    description: "Start a Chrome browser control session.",
    parameters: {
      type: "object",
      properties: {
        active: { type: "boolean" },
        initialUrl: { type: "string" },
        name: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_name_session",
    description: "Name an active browser automation session and its Chrome tab group.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        name: { type: "string" }
      },
      required: ["sessionId", "name"],
      additionalProperties: false
    }
  },
  {
    name: "browser_claim_tab",
    description: "Claim the current or specified Chrome tab into a browser control session.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        active: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_create_tab",
    description: "Create a new tab inside a browser control session.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        url: { type: "string" },
        active: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_switch_tab",
    description: "Make a controlled tab active inside its session.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_list_tabs",
    description: "List Chrome tabs, optionally filtered to controlled tabs or a browser session.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        controlledOnly: { type: "boolean" },
        currentWindow: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_get_tab",
    description: "Get one Chrome tab summary by tabId or the active tab in a session.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_open_url",
    description: "Open an http or https URL in a controlled Chrome tab.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        url: { type: "string" },
        active: { type: "boolean" },
        timeoutMs: { type: "number" }
      },
      required: ["url"],
      additionalProperties: false
    }
  },
  {
    name: "browser_go_back",
    description: "Navigate the controlled tab back in browser history.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        waitForLoad: { type: "boolean" },
        timeoutMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_go_forward",
    description: "Navigate the controlled tab forward in browser history.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        waitForLoad: { type: "boolean" },
        timeoutMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_reload",
    description: "Reload the controlled tab.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        ignoreCache: { type: "boolean" },
        waitForLoad: { type: "boolean" },
        timeoutMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_wait_for_load_state",
    description: "Wait until the controlled tab reaches a page load state.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        state: {
          type: "string",
          enum: ["load", "domcontentloaded"]
        },
        timeoutMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_wait_for_url",
    description: "Wait for the controlled tab URL to match an exact URL, substring, or regular expression.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        url: { type: "string" },
        urlContains: { type: "string" },
        urlRegex: { type: "string" },
        timeoutMs: { type: "number" },
        pollMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_wait_for_selector",
    description: "Wait for a CSS selector to become attached, visible, hidden, or detached.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        selector: { type: "string" },
        state: {
          type: "string",
          enum: ["attached", "visible", "hidden", "detached"]
        },
        timeoutMs: { type: "number" },
        pollMs: { type: "number" }
      },
      required: ["selector"],
      additionalProperties: false
    }
  },
  {
    name: "browser_wait_for_text",
    description: "Wait for page text to appear or disappear.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        text: { type: "string" },
        state: {
          type: "string",
          enum: ["present", "hidden"]
        },
        exact: { type: "boolean" },
        caseSensitive: { type: "boolean" },
        timeoutMs: { type: "number" },
        pollMs: { type: "number" }
      },
      required: ["text"],
      additionalProperties: false
    }
  },
  {
    name: "browser_observe",
    description: "Read the current page URL, title, visible text, and interactable elements.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        includeAccessibility: { type: "boolean" },
        maxAccessibilityNodes: { type: "number" },
        includeDomSnapshot: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_locator_query",
    description: "Query a CSS locator in the controlled tab for count, visibility, text, attributes, or bounds.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        locator: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
            selector: { type: "string" },
            text: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            testId: { type: "string" },
            exact: { type: "boolean" },
            index: { type: "number" },
            strict: { type: "boolean" }
          },
          required: ["kind"],
          additionalProperties: false
        },
        kind: {
          type: "string",
          enum: [
            "count",
            "allTextContents",
            "textContent",
            "innerText",
            "getAttribute",
            "isVisible",
            "isEnabled",
            "boundingBox"
          ]
        },
        args: {
          type: "object",
          additionalProperties: true
        },
        timeoutMs: { type: "number" }
      },
      required: ["locator", "kind"],
      additionalProperties: false
    }
  },
  {
    name: "browser_locator_action",
    description: "Perform a basic action on a CSS locator, resolving it at action time.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        locator: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
            selector: { type: "string" },
            text: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            testId: { type: "string" },
            exact: { type: "boolean" },
            index: { type: "number" },
            strict: { type: "boolean" }
          },
          required: ["kind"],
          additionalProperties: false
        },
        kind: {
          type: "string",
          enum: ["click", "dblclick", "fill", "type", "press", "clear", "focus", "hover", "setChecked", "selectOption"]
        },
        args: {
          type: "object",
          additionalProperties: true
        },
        timeoutMs: { type: "number" },
        waitMs: { type: "number" }
      },
      required: ["locator", "kind"],
      additionalProperties: false
    }
  },
  {
    name: "browser_locator_wait",
    description: "Wait for a CSS locator to become attached, visible, hidden, or detached.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        locator: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
            selector: { type: "string" },
            text: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            testId: { type: "string" },
            exact: { type: "boolean" },
            index: { type: "number" },
            strict: { type: "boolean" }
          },
          required: ["kind"],
          additionalProperties: false
        },
        state: {
          type: "string",
          enum: ["attached", "visible", "hidden", "detached"]
        },
        timeoutMs: { type: "number" },
        pollMs: { type: "number" }
      },
      required: ["locator"],
      additionalProperties: false
    }
  },
  {
    name: "browser_click",
    description: "Click a page target by observation ref, CSS selector, or viewport coordinates.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        ref: { type: "string" },
        selector: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        button: {
          type: "string",
          enum: ["left", "middle", "right"]
        },
        clickCount: { type: "number" },
        waitMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_move_mouse",
    description: "Move the visible agent cursor and Chrome mouse pointer to page coordinates.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        waitMs: { type: "number" }
      },
      required: ["x", "y"],
      additionalProperties: false
    }
  },
  {
    name: "browser_scroll",
    description: "Scroll the controlled tab by pixel deltas.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        deltaX: { type: "number" },
        deltaY: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        waitMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_type_text",
    description: "Type text into the focused page or into a target by ref, CSS selector, or coordinates.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        ref: { type: "string" },
        selector: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        text: { type: "string" },
        clear: { type: "boolean" },
        waitMs: { type: "number" }
      },
      required: ["text"],
      additionalProperties: false
    }
  },
  {
    name: "browser_evaluate",
    description: "Evaluate JavaScript in the controlled tab and return the JSON-serializable value.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        script: { type: "string" },
        awaitPromise: { type: "boolean" },
        timeoutMs: { type: "number" }
      },
      required: ["script"],
      additionalProperties: false
    }
  },
  {
    name: "browser_press_key",
    description: "Press a key in the controlled Chrome tab.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        key: {
          type: "string",
          enum: [
            "Enter",
            "Tab",
            "Escape",
            "Backspace",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight"
          ]
        },
        waitMs: { type: "number" }
      },
      required: ["key"],
      additionalProperties: false
    }
  },
  {
    name: "browser_handle_dialog",
    description: "Accept or dismiss the currently open JavaScript alert, confirm, or prompt dialog.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        accept: { type: "boolean" },
        promptText: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_screenshot",
    description: "Capture a screenshot of the controlled Chrome tab.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        format: {
          type: "string",
          enum: ["png", "jpeg"]
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_upload_file",
    description: "Upload a local file through an input[type=file] element by observation ref, selector, or locator.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        ref: { type: "string" },
        selector: { type: "string" },
        locator: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
            selector: { type: "string" },
            text: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            testId: { type: "string" },
            exact: { type: "boolean" },
            index: { type: "number" },
            strict: { type: "boolean" }
          },
          required: ["kind"],
          additionalProperties: false
        },
        filePath: { type: "string" },
        waitMs: { type: "number" }
      },
      required: ["filePath"],
      additionalProperties: false
    }
  },
  {
    name: "browser_cdp",
    description: "Send a raw Chrome DevTools Protocol command to a controlled tab.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        method: { type: "string" },
        params: {
          type: "object",
          additionalProperties: true
        },
        timeoutMs: { type: "number" }
      },
      required: ["method"],
      additionalProperties: false
    }
  },
  {
    name: "browser_get_dev_logs",
    description: "Read buffered console, log, and runtime exception entries for a tab.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" },
        level: { type: "string" },
        sinceSequence: { type: "number" },
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_get_capabilities",
    description: "List browser or tab capabilities advertised by the current backend.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["browser", "tab"]
        },
        sessionId: { type: "string" },
        tabId: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_list_downloads",
    description: "List recent Chrome downloads matching optional filters.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        state: {
          type: "string",
          enum: ["in_progress", "interrupted", "complete"]
        },
        urlContains: { type: "string" },
        filenameContains: { type: "string" },
        mimeContains: { type: "string" },
        startedAfter: { type: "number" },
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_wait_for_download",
    description: "Wait for a Chrome download to reach a target state and return its local filename.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
        state: {
          type: "string",
          enum: ["in_progress", "interrupted", "complete", "any"]
        },
        urlContains: { type: "string" },
        filenameContains: { type: "string" },
        mimeContains: { type: "string" },
        startedAfter: { type: "number" },
        limit: { type: "number" },
        timeoutMs: { type: "number" },
        pollMs: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_close_tab",
    description: "Close one controlled Chrome tab and clean up debugger/session state.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        tabId: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser_finalize_session",
    description: "End a browser control session, optionally keeping selected tabs open for the user.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        keepTabIds: {
          type: "array",
          items: { type: "number" }
        },
        closeRest: { type: "boolean" }
      },
      required: ["sessionId"],
      additionalProperties: false
    }
  },
  {
    name: "browser_stop_session",
    description: "Stop a Chrome browser control session and optionally close its tabs.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        closeTabs: { type: "boolean" }
      },
      required: ["sessionId"],
      additionalProperties: false
    }
  }
] as const;

export async function callBrowserTool(name: string, args: JsonObject) {
  switch (name) {
    case "browser_health":
      return browserHealth();
    case "browser_reload_extension":
      return browserReloadExtension();
    case "browser_get_events":
      return browserGetEvents(args as GetEventsParams);
    case "browser_clear_events":
      return browserClearEvents(args as ClearEventsParams);
    case "browser_wait_for_event":
      return browserWaitForEvent(args as WaitForEventParams);
    case "browser_start_session":
      return browserStartSession(args as StartSessionParams);
    case "browser_name_session":
      return browserNameSession(args as NameSessionParams);
    case "browser_claim_tab":
      return browserClaimTab(args as ClaimTabParams);
    case "browser_create_tab":
      return browserCreateTab(args as CreateTabParams);
    case "browser_switch_tab":
      return browserSwitchTab(args as SwitchTabParams);
    case "browser_list_tabs":
      return browserListTabs(args as ListTabsParams);
    case "browser_get_tab":
      return browserGetTab(args as GetTabParams);
    case "browser_open_url":
      return browserOpenUrl(args as OpenUrlParams);
    case "browser_go_back":
      return browserGoBack(args as NavigationParams);
    case "browser_go_forward":
      return browserGoForward(args as NavigationParams);
    case "browser_reload":
      return browserReload(args as ReloadParams);
    case "browser_wait_for_load_state":
      return browserWaitForLoadState(args as WaitForLoadStateParams);
    case "browser_wait_for_url":
      return browserWaitForUrl(args as WaitForUrlParams);
    case "browser_wait_for_selector":
      return browserWaitForSelector(args as WaitForSelectorParams);
    case "browser_wait_for_text":
      return browserWaitForText(args as WaitForTextParams);
    case "browser_observe":
      return browserObserve(args as ObserveParams);
    case "browser_locator_query":
      return browserLocatorQuery(args as unknown as LocatorQueryParams);
    case "browser_locator_action":
      return browserLocatorAction(args as unknown as LocatorActionParams);
    case "browser_locator_wait":
      return browserLocatorWait(args as unknown as LocatorWaitParams);
    case "browser_click":
      return browserClick(args as ClickParams);
    case "browser_move_mouse":
      return browserMoveMouse(args as unknown as MoveMouseParams);
    case "browser_scroll":
      return browserScroll(args as ScrollParams);
    case "browser_type_text":
      return browserTypeText(args as TypeTextParams);
    case "browser_evaluate":
      return browserEvaluate(args as unknown as EvaluateParams);
    case "browser_press_key":
      return browserPressKey(args as PressKeyParams);
    case "browser_handle_dialog":
      return browserHandleDialog(args as unknown as HandleDialogParams);
    case "browser_screenshot":
      return browserScreenshot(args as ScreenshotParams);
    case "browser_upload_file":
      return browserUploadFile(args as unknown as UploadFileParams);
    case "browser_cdp":
      return browserCdp(args as unknown as CdpParams);
    case "browser_get_dev_logs":
      return browserGetDevLogs(args as GetDevLogsParams);
    case "browser_get_capabilities":
      return browserGetCapabilities(args as GetCapabilitiesParams);
    case "browser_list_downloads":
      return browserListDownloads(args as ListDownloadsParams);
    case "browser_wait_for_download":
      return browserWaitForDownload(args as WaitForDownloadParams);
    case "browser_close_tab":
      return browserCloseTab(args as CloseTabParams);
    case "browser_finalize_session":
      return browserFinalizeSession(args as unknown as FinalizeSessionParams);
    case "browser_stop_session":
      return browserStopSession(args as StopSessionParams);
    default:
      throw new Error(`Unknown browser tool: ${name}`);
  }
}
