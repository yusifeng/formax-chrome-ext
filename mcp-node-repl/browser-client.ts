import { browserToolSchemas, callBrowserTool } from "../agent/browserTools.js";
import type { BrowserToolResult, JsonObject } from "../shared/types.js";

type BrowserToolName = (typeof browserToolSchemas)[number]["name"];

type BrowserGlobals = Record<string, unknown> & {
  agent?: BrowserRuntimeAgent;
  browser?: BrowserClient;
};

export type BrowserRuntimeSetupOptions = {
  globals?: BrowserGlobals;
};

export type BrowserRuntimeAgent = {
  browsers: {
    get(name: "extension"): Promise<BrowserClient>;
    list(): string[];
  };
};

export type BrowserClient = {
  readonly kind: "extension";
  readonly tools: typeof browserToolSchemas;
  readonly state: {
    sessionId: string | null;
    tabId: number | null;
  };
  tool(name: BrowserToolName, args?: JsonObject): Promise<BrowserToolResult<unknown>>;
  health(): Promise<unknown>;
  getEvents(args?: JsonObject): Promise<unknown>;
  clearEvents(args?: JsonObject): Promise<unknown>;
  waitForEvent(args?: JsonObject): Promise<unknown>;
  startSession(args?: JsonObject): Promise<unknown>;
  nameSession(nameOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  claimTab(args?: JsonObject): Promise<unknown>;
  createTab(args?: JsonObject): Promise<unknown>;
  switchTab(args: JsonObject): Promise<unknown>;
  listTabs(args?: JsonObject): Promise<unknown>;
  getTab(args?: JsonObject): Promise<unknown>;
  openUrl(urlOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  goBack(args?: JsonObject): Promise<unknown>;
  goForward(args?: JsonObject): Promise<unknown>;
  reload(args?: JsonObject): Promise<unknown>;
  waitForLoadState(stateOrArgs?: string | JsonObject, args?: JsonObject): Promise<unknown>;
  waitForUrl(args: JsonObject): Promise<unknown>;
  waitForSelector(selectorOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  waitForText(textOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  observe(args?: JsonObject): Promise<unknown>;
  locatorQuery(args: JsonObject): Promise<unknown>;
  locatorAction(args: JsonObject): Promise<unknown>;
  locatorWait(args: JsonObject): Promise<unknown>;
  click(targetOrArgs?: string | JsonObject, args?: JsonObject): Promise<unknown>;
  moveMouse(xOrArgs: number | JsonObject, y?: number, args?: JsonObject): Promise<unknown>;
  scroll(deltaYOrArgs?: number | JsonObject, args?: JsonObject): Promise<unknown>;
  type(textOrArgs: string | JsonObject, maybeTextOrArgs?: string | JsonObject, args?: JsonObject): Promise<unknown>;
  typeText(args: JsonObject): Promise<unknown>;
  evaluate(scriptOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  pressKey(keyOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  handleDialog(args?: JsonObject): Promise<unknown>;
  screenshot(args?: JsonObject): Promise<unknown>;
  uploadFile(args: JsonObject): Promise<unknown>;
  cdp(methodOrArgs: string | JsonObject, params?: JsonObject, args?: JsonObject): Promise<unknown>;
  rawCdp(methodOrArgs: string | JsonObject, params?: JsonObject, args?: JsonObject): Promise<unknown>;
  getDevLogs(args?: JsonObject): Promise<unknown>;
  getCapabilities(args?: JsonObject): Promise<unknown>;
  listDownloads(args?: JsonObject): Promise<unknown>;
  waitForDownload(args?: JsonObject): Promise<unknown>;
  closeTab(args?: JsonObject): Promise<unknown>;
  finalizeSession(args: JsonObject): Promise<unknown>;
  stopSession(args?: JsonObject): Promise<unknown>;
};

const noDefaultActions = new Set<BrowserToolName>([
  "browser_health",
  "browser_get_events",
  "browser_clear_events",
  "browser_wait_for_event",
  "browser_start_session",
  "browser_name_session",
  "browser_claim_tab",
  "browser_list_tabs",
  "browser_get_tab",
  "browser_get_capabilities",
  "browser_list_downloads",
  "browser_wait_for_download"
]);

export async function setupBrowserRuntime(options: BrowserRuntimeSetupOptions = {}) {
  const globals = options.globals || (globalThis as BrowserGlobals);
  const browser = createBrowserClient();
  const existingAgent = globals.agent;
  const agent: BrowserRuntimeAgent = {
    ...(existingAgent && typeof existingAgent === "object" ? existingAgent : {}),
    browsers: {
      get: async (name: "extension") => {
        if (name !== "extension") {
          throw new Error(`Unknown browser runtime: ${name}`);
        }

        return browser;
      },
      list: () => ["extension"]
    }
  };

  globals.agent = agent;
  globals.browser = browser;

  return {
    agent,
    browser
  };
}

export function createBrowserClient(): BrowserClient {
  const state = {
    sessionId: null as string | null,
    tabId: null as number | null
  };

  async function run(name: BrowserToolName, args: JsonObject = {}) {
    const params = withDefaults(name, args, state);
    const envelope = await callBrowserTool(name, params);
    rememberBrowserTarget(envelope, state);
    return envelope as BrowserToolResult<unknown>;
  }

  async function result(name: BrowserToolName, args: JsonObject = {}) {
    const envelope = await run(name, args);
    return envelope.result;
  }

  const browser: BrowserClient = {
    kind: "extension",
    tools: browserToolSchemas,
    state,
    tool: run,
    health: () => result("browser_health"),
    getEvents: (args = {}) => result("browser_get_events", args),
    clearEvents: (args = {}) => result("browser_clear_events", args),
    waitForEvent: (args = {}) => result("browser_wait_for_event", args),
    startSession: (args = {}) => result("browser_start_session", args),
    nameSession: (nameOrArgs, args = {}) =>
      result("browser_name_session", stringArg("name", nameOrArgs, args)),
    claimTab: (args = {}) => result("browser_claim_tab", args),
    createTab: (args = {}) => result("browser_create_tab", args),
    switchTab: (args) => result("browser_switch_tab", args),
    listTabs: (args = {}) => result("browser_list_tabs", args),
    getTab: (args = {}) => result("browser_get_tab", args),
    openUrl: (urlOrArgs, args = {}) =>
      result("browser_open_url", stringArg("url", urlOrArgs, args)),
    goBack: (args = {}) => result("browser_go_back", args),
    goForward: (args = {}) => result("browser_go_forward", args),
    reload: (args = {}) => result("browser_reload", args),
    waitForLoadState: (stateOrArgs = "load", args = {}) =>
      result("browser_wait_for_load_state", stringArg("state", stateOrArgs, args)),
    waitForUrl: (args) => result("browser_wait_for_url", args),
    waitForSelector: (selectorOrArgs, args = {}) =>
      result("browser_wait_for_selector", stringArg("selector", selectorOrArgs, args)),
    waitForText: (textOrArgs, args = {}) =>
      result("browser_wait_for_text", stringArg("text", textOrArgs, args)),
    observe: (args = {}) => result("browser_observe", args),
    locatorQuery: (args) => result("browser_locator_query", args),
    locatorAction: (args) => result("browser_locator_action", args),
    locatorWait: (args) => result("browser_locator_wait", args),
    click: (targetOrArgs = {}, args = {}) =>
      result("browser_click", targetArg(targetOrArgs, args)),
    moveMouse: (xOrArgs, y, args = {}) =>
      result("browser_move_mouse", pointArg(xOrArgs, y, args)),
    scroll: (deltaYOrArgs = {}, args = {}) =>
      result("browser_scroll", scrollArg(deltaYOrArgs, args)),
    type: (textOrArgs, maybeTextOrArgs, args = {}) =>
      result("browser_type_text", typeArg(textOrArgs, maybeTextOrArgs, args)),
    typeText: (args) => result("browser_type_text", args),
    evaluate: (scriptOrArgs, args = {}) =>
      result("browser_evaluate", stringArg("script", scriptOrArgs, args)),
    pressKey: (keyOrArgs, args = {}) =>
      result("browser_press_key", stringArg("key", keyOrArgs, args)),
    handleDialog: (args = {}) => result("browser_handle_dialog", args),
    screenshot: (args = {}) => result("browser_screenshot", args),
    uploadFile: (args) => result("browser_upload_file", args),
    cdp: (methodOrArgs, params = {}, args = {}) =>
      result("browser_cdp", cdpArg(methodOrArgs, params, args)),
    rawCdp: (methodOrArgs, params = {}, args = {}) =>
      result("browser_cdp", cdpArg(methodOrArgs, params, args)),
    getDevLogs: (args = {}) => result("browser_get_dev_logs", args),
    getCapabilities: (args = {}) => result("browser_get_capabilities", args),
    listDownloads: (args = {}) => result("browser_list_downloads", args),
    waitForDownload: (args = {}) => result("browser_wait_for_download", args),
    closeTab: (args = {}) => result("browser_close_tab", args),
    finalizeSession: (args) => result("browser_finalize_session", args),
    stopSession: (args = {}) => result("browser_stop_session", args)
  };

  return browser;
}

function withDefaults(
  name: BrowserToolName,
  args: JsonObject,
  state: BrowserClient["state"]
): JsonObject {
  const params = { ...args };

  if (!noDefaultActions.has(name)) {
    if (state.sessionId && params.sessionId == null) {
      params.sessionId = state.sessionId;
    }

    if (state.tabId != null && params.tabId == null) {
      params.tabId = state.tabId;
    }
  }

  return params;
}

function rememberBrowserTarget(
  envelope: BrowserToolResult<unknown>,
  state: BrowserClient["state"]
) {
  if (typeof envelope.sessionId === "string") {
    state.sessionId = envelope.sessionId;
  }

  if (typeof envelope.tabId === "number") {
    state.tabId = envelope.tabId;
  }

  const result = envelope.result as {
    sessionId?: unknown;
    tabId?: unknown;
    activeTabId?: unknown;
  };

  if (typeof result?.sessionId === "string") {
    state.sessionId = result.sessionId;
  }

  if (typeof result?.tabId === "number") {
    state.tabId = result.tabId;
  }

  if (typeof result?.activeTabId === "number") {
    state.tabId = result.activeTabId;
  }
}

function stringArg(key: string, valueOrArgs: string | JsonObject, args: JsonObject) {
  if (typeof valueOrArgs === "string") {
    return {
      ...args,
      [key]: valueOrArgs
    };
  }

  return valueOrArgs;
}

function targetArg(targetOrArgs: string | JsonObject, args: JsonObject) {
  if (typeof targetOrArgs !== "string") {
    return targetOrArgs;
  }

  const key = looksLikeSelector(targetOrArgs) ? "selector" : "ref";

  return {
    ...args,
    [key]: targetOrArgs
  };
}

function pointArg(xOrArgs: number | JsonObject, y?: number, args: JsonObject = {}) {
  if (typeof xOrArgs !== "number") {
    return xOrArgs;
  }

  if (typeof y !== "number") {
    throw new Error("moveMouse(x, y) requires a numeric y coordinate");
  }

  return {
    ...args,
    x: xOrArgs,
    y
  };
}

function scrollArg(deltaYOrArgs: number | JsonObject, args: JsonObject) {
  if (typeof deltaYOrArgs !== "number") {
    return deltaYOrArgs;
  }

  return {
    ...args,
    deltaY: deltaYOrArgs
  };
}

function typeArg(
  textOrArgs: string | JsonObject,
  maybeTextOrArgs?: string | JsonObject,
  args: JsonObject = {}
) {
  if (typeof textOrArgs !== "string") {
    return textOrArgs;
  }

  if (typeof maybeTextOrArgs === "string") {
    return {
      ...args,
      selector: textOrArgs,
      text: maybeTextOrArgs
    };
  }

  return {
    ...(maybeTextOrArgs || args),
    text: textOrArgs
  };
}

function cdpArg(methodOrArgs: string | JsonObject, params: JsonObject, args: JsonObject) {
  if (typeof methodOrArgs !== "string") {
    return methodOrArgs;
  }

  return {
    ...args,
    method: methodOrArgs,
    params
  };
}

function looksLikeSelector(value: string) {
  return (
    value.startsWith("#") ||
    value.startsWith(".") ||
    value.startsWith("[") ||
    value.startsWith("/") ||
    value.includes(" ") ||
    value.includes(">") ||
    value.includes("[") ||
    value.includes("=") ||
    /^[a-z][a-z0-9-]*(?:[.#[:]|$)/i.test(value)
  );
}
