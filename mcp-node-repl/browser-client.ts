import { browserToolSchemas, callBrowserTool } from "../agent/browserTools.js";
import type { BrowserToolResult, JsonObject } from "../shared/types.js";

type BrowserToolName = (typeof browserToolSchemas)[number]["name"];
type BrowserToolCaller = typeof callBrowserTool;

type BrowserGlobals = Record<string, unknown> & {
  agent?: BrowserRuntimeAgent;
  browser?: BrowserClient;
};

type BrowserState = {
  sessionId: string | null;
  tabId: number | null;
};

type WaitResult = {
  matched?: boolean;
  timedOut?: boolean;
  reason?: string;
};

type BrowserTransport = {
  state: BrowserState;
  run(name: BrowserToolName, args?: JsonObject): Promise<BrowserToolResult<unknown>>;
  result<T = unknown>(name: BrowserToolName, args?: JsonObject): Promise<T>;
};

export type BrowserRuntimeSetupOptions = {
  globals?: BrowserGlobals;
};

export type CreateBrowserClientOptions = {
  callTool?: BrowserToolCaller;
};

export type BrowserRuntimeAgent = {
  browsers: {
    get(name: "extension"): Promise<BrowserClient>;
    list(): string[];
  };
};

export type BrowserTabsFacade = {
  new: (urlOrArgs?: string | JsonObject, args?: JsonObject) => Promise<TabHandle>;
  claim(args?: JsonObject): Promise<TabHandle>;
  current(): Promise<TabHandle>;
  get(tabId?: number, args?: JsonObject): Promise<TabHandle>;
  list(args?: JsonObject): Promise<unknown[]>;
  switch(tabOrId: TabHandle | number): Promise<TabHandle>;
  close(tabOrId?: TabHandle | number): Promise<unknown>;
};

export type BrowserUserFacade = {
  claimTab(args?: JsonObject): Promise<TabHandle>;
  nameSession(name: string, args?: JsonObject): Promise<unknown>;
  handoff(args?: JsonObject & { keep?: Array<TabHandle | number> }): Promise<unknown>;
  finalize(args?: JsonObject & { keep?: Array<TabHandle | number> }): Promise<unknown>;
  stop(args?: JsonObject): Promise<unknown>;
};

export type BrowserEventsFacade = {
  get(args?: JsonObject): Promise<unknown>;
  clear(args?: JsonObject): Promise<unknown>;
  wait(args?: JsonObject): Promise<unknown>;
  mark(args?: JsonObject): Promise<{ sequence: number | null; event: unknown | null }>;
};

export type BrowserDownloadsFacade = {
  list(args?: JsonObject): Promise<unknown>;
  wait(args?: JsonObject): Promise<unknown>;
  waitFor(args?: JsonObject): Promise<unknown>;
};

export type BrowserCapabilitiesFacade = {
  list(args?: JsonObject): Promise<unknown[]>;
  has(id: string, args?: JsonObject): Promise<boolean>;
  require(id: string, args?: JsonObject): Promise<unknown>;
};

export type BrowserDevFacade = {
  logs(args?: JsonObject): Promise<unknown>;
};

export type TabHandle = {
  readonly browser: BrowserClient;
  readonly sessionId: string;
  readonly tabId: number;
  readonly id: number;
  info(): Promise<unknown>;
  bringToFront(): Promise<TabHandle>;
  goto(url: string, args?: JsonObject): Promise<unknown>;
  openUrl(url: string, args?: JsonObject): Promise<unknown>;
  reload(args?: JsonObject): Promise<unknown>;
  goBack(args?: JsonObject): Promise<unknown>;
  goForward(args?: JsonObject): Promise<unknown>;
  waitForLoadState(stateOrArgs?: string | JsonObject, args?: JsonObject): Promise<unknown>;
  waitForUrl(matchOrArgs: string | RegExp | JsonObject, args?: JsonObject): Promise<unknown>;
  waitForSelector(selectorOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  waitForText(textOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  observe(args?: JsonObject): Promise<unknown>;
  locator(selector: string, args?: JsonObject): LocatorHandle;
  frameLocator(selector: string): FrameLocatorHandle;
  click(targetOrArgs?: string | JsonObject, args?: JsonObject): Promise<unknown>;
  moveMouse(xOrArgs: number | JsonObject, y?: number, args?: JsonObject): Promise<unknown>;
  scroll(deltaYOrArgs?: number | JsonObject, args?: JsonObject): Promise<unknown>;
  type(textOrArgs: string | JsonObject, maybeTextOrArgs?: string | JsonObject, args?: JsonObject): Promise<unknown>;
  pressKey(keyOrArgs: string | JsonObject, args?: JsonObject): Promise<unknown>;
  evaluate<T = unknown>(scriptOrArgs: string | JsonObject, args?: JsonObject): Promise<T>;
  cdp<T = unknown>(methodOrArgs: string | JsonObject, params?: JsonObject, args?: JsonObject): Promise<T>;
  rawCdp<T = unknown>(methodOrArgs: string | JsonObject, params?: JsonObject, args?: JsonObject): Promise<T>;
  getDevLogs(args?: JsonObject): Promise<unknown>;
  handleDialog(args?: JsonObject): Promise<unknown>;
  screenshot(args?: JsonObject): Promise<unknown>;
  uploadFile(refOrArgs: string | JsonObject, filePath?: string, args?: JsonObject): Promise<unknown>;
  close(): Promise<unknown>;
  toJSON(): JsonObject;
};

export type LocatorHandle = {
  readonly tab: TabHandle;
  readonly selector: string;
  readonly plan: JsonObject;
  locator(childSelector: string, args?: JsonObject): LocatorHandle;
  waitFor(args?: JsonObject): Promise<unknown>;
  count(args?: JsonObject): Promise<number>;
  allTextContents(args?: JsonObject): Promise<string[]>;
  textContent(args?: JsonObject): Promise<string | null>;
  innerText(args?: JsonObject): Promise<string>;
  getAttribute(name: string, args?: JsonObject): Promise<string | null>;
  isVisible(args?: JsonObject): Promise<boolean>;
  isEnabled(args?: JsonObject): Promise<boolean>;
  boundingBox(args?: JsonObject): Promise<unknown>;
  click(args?: JsonObject): Promise<unknown>;
  dblclick(args?: JsonObject): Promise<unknown>;
  fill(value: string, args?: JsonObject): Promise<unknown>;
  type(value: string, args?: JsonObject): Promise<unknown>;
  press(key: string, args?: JsonObject): Promise<unknown>;
  setChecked(checked?: boolean, args?: JsonObject): Promise<unknown>;
  selectOption(value: string | string[], args?: JsonObject): Promise<unknown>;
  toJSON(): JsonObject;
};

export type FrameLocatorHandle = {
  readonly selector: string;
  toJSON(): JsonObject;
};

export type BrowserClient = {
  readonly kind: "extension";
  readonly tools: typeof browserToolSchemas;
  readonly state: BrowserState;
  readonly tabs: BrowserTabsFacade;
  readonly user: BrowserUserFacade;
  readonly events: BrowserEventsFacade;
  readonly downloads: BrowserDownloadsFacade;
  readonly capabilities: BrowserCapabilitiesFacade;
  readonly dev: BrowserDevFacade;
  tool(name: BrowserToolName, args?: JsonObject): Promise<BrowserToolResult<unknown>>;
  health(): Promise<unknown>;
  name(name: string, args?: JsonObject): Promise<unknown>;
  currentTab(): Promise<TabHandle>;
  finalize(args?: JsonObject & { keep?: Array<TabHandle | number> }): Promise<unknown>;
  stop(args?: JsonObject): Promise<unknown>;
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

export function createBrowserClient(options: CreateBrowserClientOptions = {}): BrowserClient {
  const state: BrowserState = {
    sessionId: null,
    tabId: null
  };
  const caller = options.callTool || callBrowserTool;
  let browser: BrowserClient;

  const transport: BrowserTransport = {
    state,
    run: async (name, args = {}) => {
      const params = withDefaults(name, args, state);
      const envelope = await caller(name, params);
      rememberBrowserTarget(envelope, state);
      return envelope as BrowserToolResult<unknown>;
    },
    result: async <T = unknown>(name: BrowserToolName, args: JsonObject = {}): Promise<T> => {
      const envelope = await transport.run(name, args);
      return envelope.result as T;
    }
  };

  function result<T = unknown>(name: BrowserToolName, args: JsonObject = {}): Promise<T> {
    return transport.result<T>(name, args);
  }

  const tabs = createTabsFacade(() => browser, transport);
  const user = createUserFacade(() => browser, transport, tabs);
  const events = createEventsFacade(transport);
  const downloads = createDownloadsFacade(transport);
  const capabilities = createCapabilitiesFacade(transport);
  const dev = {
    logs: (args = {}) => result("browser_get_dev_logs", args)
  };

  browser = {
    kind: "extension",
    tools: browserToolSchemas,
    state,
    tabs,
    user,
    events,
    downloads,
    capabilities,
    dev,
    tool: transport.run,
    health: () => result("browser_health"),
    name: (name, args = {}) => result("browser_name_session", withCurrentSession(state, { ...args, name })),
    currentTab: () => tabs.current(),
    finalize: (args = {}) => result("browser_finalize_session", finalizeArgs(state, args)),
    stop: (args = {}) => stopCurrentSession(transport, state, args),
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

class TabHandleImpl implements TabHandle {
  readonly browser: BrowserClient;
  readonly sessionId: string;
  readonly tabId: number;
  readonly id: number;
  private closed = false;
  private readonly transport: BrowserTransport;

  constructor(browser: BrowserClient, transport: BrowserTransport, sessionId: string, tabId: number) {
    this.browser = browser;
    this.transport = transport;
    this.sessionId = sessionId;
    this.tabId = tabId;
    this.id = tabId;
  }

  async info() {
    this.assertOpen();
    const result = await this.transport.result<{ tab: unknown }>("browser_get_tab", this.targetArgs());
    return result.tab;
  }

  async bringToFront() {
    this.assertOpen();
    await this.transport.result("browser_switch_tab", this.targetArgs());
    return this;
  }

  goto(url: string, args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_open_url", this.targetArgs({ ...args, url }));
  }

  openUrl(url: string, args: JsonObject = {}) {
    return this.goto(url, args);
  }

  reload(args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_reload", this.targetArgs(args));
  }

  goBack(args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_go_back", this.targetArgs(args));
  }

  goForward(args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_go_forward", this.targetArgs(args));
  }

  async waitForLoadState(stateOrArgs: string | JsonObject = "load", args: JsonObject = {}) {
    this.assertOpen();
    const params = stringArg("state", stateOrArgs, args);
    const result = await this.transport.result<WaitResult>(
      "browser_wait_for_load_state",
      this.targetArgs(stripClientOptions(params))
    );
    return assertWaitResult(result, "waitForLoadState", params.soft === true);
  }

  async waitForUrl(matchOrArgs: string | RegExp | JsonObject, args: JsonObject = {}) {
    this.assertOpen();
    const params = normalizeUrlMatcher(matchOrArgs, args);
    const result = await this.transport.result<WaitResult>(
      "browser_wait_for_url",
      this.targetArgs(stripClientOptions(params))
    );
    return assertWaitResult(result, "waitForUrl", params.soft === true);
  }

  async waitForSelector(selectorOrArgs: string | JsonObject, args: JsonObject = {}) {
    this.assertOpen();
    const params = stringArg("selector", selectorOrArgs, args);
    const result = await this.transport.result<WaitResult>(
      "browser_wait_for_selector",
      this.targetArgs(stripClientOptions(params))
    );
    return assertWaitResult(result, "waitForSelector", params.soft === true);
  }

  async waitForText(textOrArgs: string | JsonObject, args: JsonObject = {}) {
    this.assertOpen();
    const params = stringArg("text", textOrArgs, args);
    const result = await this.transport.result<WaitResult>(
      "browser_wait_for_text",
      this.targetArgs(stripClientOptions(params))
    );
    return assertWaitResult(result, "waitForText", params.soft === true);
  }

  observe(args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_observe", this.targetArgs(args));
  }

  locator(selector: string, args: JsonObject = {}) {
    this.assertOpen();
    return new LocatorHandleImpl(this.transport, this, requireNonEmptyString(selector, "locator.selector"), args);
  }

  frameLocator(selector: string) {
    this.assertOpen();
    return new UnsupportedFrameLocator(requireNonEmptyString(selector, "frameLocator.selector"));
  }

  click(targetOrArgs: string | JsonObject = {}, args: JsonObject = {}) {
    this.assertOpen();
    const params = typeof targetOrArgs === "string"
      ? { ...args, selector: targetOrArgs }
      : targetOrArgs;
    return this.transport.result("browser_click", this.targetArgs(params));
  }

  moveMouse(xOrArgs: number | JsonObject, y?: number, args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_move_mouse", this.targetArgs(pointArg(xOrArgs, y, args)));
  }

  scroll(deltaYOrArgs: number | JsonObject = {}, args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_scroll", this.targetArgs(scrollArg(deltaYOrArgs, args)));
  }

  type(
    textOrArgs: string | JsonObject,
    maybeTextOrArgs?: string | JsonObject,
    args: JsonObject = {}
  ) {
    this.assertOpen();
    return this.transport.result(
      "browser_type_text",
      this.targetArgs(typeArg(textOrArgs, maybeTextOrArgs, args))
    );
  }

  pressKey(keyOrArgs: string | JsonObject, args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result(
      "browser_press_key",
      this.targetArgs(stringArg("key", keyOrArgs, args))
    );
  }

  async evaluate<T = unknown>(scriptOrArgs: string | JsonObject, args: JsonObject = {}) {
    this.assertOpen();
    const evaluated = await this.transport.result<{ value?: T }>(
      "browser_evaluate",
      this.targetArgs(stringArg("script", scriptOrArgs, args))
    );
    return evaluated?.value as T;
  }

  cdp<T = unknown>(methodOrArgs: string | JsonObject, params: JsonObject = {}, args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result<T>("browser_cdp", this.targetArgs(cdpArg(methodOrArgs, params, args)));
  }

  rawCdp<T = unknown>(methodOrArgs: string | JsonObject, params: JsonObject = {}, args: JsonObject = {}) {
    return this.cdp<T>(methodOrArgs, params, args);
  }

  getDevLogs(args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_get_dev_logs", this.targetArgs(args));
  }

  handleDialog(args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_handle_dialog", this.targetArgs(args));
  }

  screenshot(args: JsonObject = {}) {
    this.assertOpen();
    return this.transport.result("browser_screenshot", this.targetArgs(args));
  }

  uploadFile(refOrArgs: string | JsonObject, filePath?: string, args: JsonObject = {}) {
    this.assertOpen();
    const params = typeof refOrArgs === "string"
      ? { ...args, ref: refOrArgs, filePath }
      : refOrArgs;
    return this.transport.result("browser_upload_file", this.targetArgs(params));
  }

  async close() {
    this.assertOpen();
    const result = await this.transport.result("browser_close_tab", this.targetArgs());
    this.closed = true;
    if (this.browser.state.tabId === this.tabId) {
      this.browser.state.tabId = null;
    }
    return result;
  }

  toJSON() {
    return {
      type: "Tab",
      sessionId: this.sessionId,
      tabId: this.tabId
    };
  }

  targetArgs(args: JsonObject = {}) {
    return {
      ...args,
      sessionId: this.sessionId,
      tabId: this.tabId
    };
  }

  private assertOpen() {
    if (this.closed) {
      throw new Error(`Tab ${this.tabId} is closed; create or claim another tab before using it.`);
    }
  }
}

class LocatorHandleImpl implements LocatorHandle {
  readonly tab: TabHandle;
  readonly selector: string;
  readonly plan: JsonObject;
  private readonly strict: boolean;
  private readonly transport: BrowserTransport;

  constructor(transport: BrowserTransport, tab: TabHandle, selector: string, args: JsonObject = {}) {
    this.transport = transport;
    this.tab = tab;
    this.selector = selector;
    this.strict = args.strict === true;
    this.plan = {
      kind: "css",
      selector
    };
  }

  locator(childSelector: string, args: JsonObject = {}) {
    const child = requireNonEmptyString(childSelector, "locator.childSelector");
    return new LocatorHandleImpl(this.transport, this.tab, `${this.selector} ${child}`, {
      strict: args.strict ?? this.strict
    });
  }

  async waitFor(args: JsonObject = {}) {
    const result = await this.transport.result<WaitResult>(
      "browser_locator_wait",
      this.targetArgs(stripClientOptions(args))
    );
    return assertWaitResult(result, "locator.waitFor", args.soft === true);
  }

  async count(args: JsonObject = {}) {
    return Number((await this.query("count", args)).value ?? 0);
  }

  async allTextContents(args: JsonObject = {}) {
    const value = (await this.query("allTextContents", args)).value;
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }

  async textContent(args: JsonObject = {}) {
    const value = (await this.query("textContent", args)).value;
    return value == null ? null : String(value);
  }

  async innerText(args: JsonObject = {}) {
    const value = (await this.query("innerText", args)).value;
    return value == null ? "" : String(value);
  }

  async getAttribute(name: string, args: JsonObject = {}) {
    const value = (await this.query("getAttribute", {
      ...args,
      args: {
        ...(objectArg(args.args)),
        name: requireNonEmptyString(name, "locator.getAttribute.name")
      }
    })).value;
    return value == null ? null : String(value);
  }

  async isVisible(args: JsonObject = {}) {
    return (await this.query("isVisible", args)).value === true;
  }

  async isEnabled(args: JsonObject = {}) {
    return (await this.query("isEnabled", args)).value === true;
  }

  async boundingBox(args: JsonObject = {}) {
    return (await this.query("boundingBox", args)).value ?? null;
  }

  click(args: JsonObject = {}) {
    return this.action("click", {}, args);
  }

  dblclick(args: JsonObject = {}) {
    return this.action("dblclick", {}, args);
  }

  fill(value: string, args: JsonObject = {}) {
    return this.action("fill", { value, clear: args.clear }, args);
  }

  type(value: string, args: JsonObject = {}) {
    return this.action("type", { value, clear: args.clear }, args);
  }

  press(key: string, args: JsonObject = {}) {
    return this.action("press", { key }, args);
  }

  setChecked(checked = true, args: JsonObject = {}) {
    return this.action("setChecked", { checked }, args);
  }

  selectOption(value: string | string[], args: JsonObject = {}) {
    const actionArgs = Array.isArray(value) ? { values: value } : { value };
    return this.action("selectOption", actionArgs, args);
  }

  toJSON() {
    return {
      type: "Locator",
      sessionId: this.tab.sessionId,
      tabId: this.tab.tabId,
      locator: this.plan
    };
  }

  private async query(kind: string, args: JsonObject = {}) {
    return this.transport.result<{ value?: unknown; count?: number }>(
      "browser_locator_query",
      this.targetArgs({
        ...stripClientOptions(args),
        kind
      })
    );
  }

  private async action(kind: string, actionArgs: JsonObject, args: JsonObject = {}) {
    await this.assertStrictIfNeeded(args);
    return this.transport.result(
      "browser_locator_action",
      this.targetArgs({
        kind,
        waitMs: args.waitMs,
        args: {
          ...actionArgs,
          ...objectArg(args.actionArgs)
        }
      })
    );
  }

  private async assertStrictIfNeeded(args: JsonObject) {
    if (args.strict !== true && this.strict !== true) {
      return;
    }

    const count = await this.count();
    if (count !== 1) {
      throw new Error(`Strict locator expected exactly one match for ${this.selector}, found ${count}.`);
    }
  }

  private targetArgs(args: JsonObject = {}) {
    return {
      ...args,
      sessionId: this.tab.sessionId,
      tabId: this.tab.tabId,
      locator: this.plan
    };
  }
}

class UnsupportedFrameLocator implements FrameLocatorHandle {
  readonly selector: string;

  constructor(selector: string) {
    this.selector = selector;
  }

  toJSON() {
    return {
      type: "FrameLocator",
      selector: this.selector,
      supported: false
    };
  }
}

function createTabsFacade(
  getBrowser: () => BrowserClient,
  transport: BrowserTransport
): BrowserTabsFacade {
  return {
    new: async (urlOrArgs, args = {}) => {
      const url = typeof urlOrArgs === "string" ? urlOrArgs : null;
      const options = typeof urlOrArgs === "string" ? args : objectArg(urlOrArgs);
      const created = await transport.result<{ session?: any; tab?: any }>(
        "browser_create_tab",
        withoutKeys(options, ["timeoutMs", "waitUntil"])
      );
      const tab = tabFromCreated(getBrowser(), transport, created);

      if (url) {
        await tab.goto(url, pickKeys(options, ["active", "timeoutMs"]));
      }

      return tab;
    },
    claim: async (args = {}) => {
      const session = await transport.result<any>("browser_claim_tab", args);
      return tabFromSession(getBrowser(), transport, session);
    },
    current: async () => {
      const { sessionId, tabId } = requireCurrentTarget(transport.state);
      const result = await transport.result<{ tab: any }>("browser_get_tab", { sessionId, tabId });
      return tabFromSummary(getBrowser(), transport, result.tab, sessionId);
    },
    get: async (tabId, args = {}) => {
      const targetTabId = tabId ?? transport.state.tabId;
      if (typeof targetTabId !== "number") {
        throw new Error("No current tab. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
      }

      const result = await transport.result<{ tab: any }>("browser_get_tab", {
        ...args,
        tabId: targetTabId,
        sessionId: args.sessionId ?? transport.state.sessionId ?? undefined
      });
      return tabFromSummary(getBrowser(), transport, result.tab, result.tab?.sessionId ?? transport.state.sessionId);
    },
    list: async (args = {}) => {
      const params = { ...args };
      if (params.sessionId == null && params.all !== true && transport.state.sessionId) {
        params.sessionId = transport.state.sessionId;
      }
      delete params.all;
      const result = await transport.result<{ tabs: unknown[] }>("browser_list_tabs", params);
      return result.tabs;
    },
    switch: async (tabOrId) => {
      const tabId = tabIdFrom(tabOrId);
      const sessionId = sessionIdFrom(tabOrId) ?? transport.state.sessionId;
      if (!sessionId) {
        throw new Error("No active browser session. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
      }
      const result = await transport.result<{ session?: any; tab: any }>("browser_switch_tab", {
        sessionId,
        tabId
      });
      return tabFromSummary(getBrowser(), transport, result.tab, sessionId);
    },
    close: async (tabOrId) => {
      const tabId = tabOrId == null ? transport.state.tabId : tabIdFrom(tabOrId);
      const sessionId = tabOrId == null
        ? transport.state.sessionId
        : sessionIdFrom(tabOrId) ?? transport.state.sessionId;

      if (typeof tabId !== "number") {
        throw new Error("No current tab to close.");
      }

      return transport.result("browser_close_tab", {
        sessionId: sessionId ?? undefined,
        tabId
      });
    }
  };
}

function createUserFacade(
  getBrowser: () => BrowserClient,
  transport: BrowserTransport,
  tabs: BrowserTabsFacade
): BrowserUserFacade {
  return {
    claimTab: (args = {}) => tabs.claim(args),
    nameSession: (name, args = {}) =>
      transport.result("browser_name_session", withCurrentSession(transport.state, { ...args, name })),
    handoff: (args = {}) => transport.result("browser_finalize_session", finalizeArgs(transport.state, args)),
    finalize: (args = {}) => transport.result("browser_finalize_session", finalizeArgs(transport.state, args)),
    stop: (args = {}) => stopCurrentSession(transport, transport.state, args)
  };
}

function createEventsFacade(transport: BrowserTransport): BrowserEventsFacade {
  return {
    get: (args = {}) => transport.result("browser_get_events", args),
    clear: (args = {}) => transport.result("browser_clear_events", args),
    wait: (args = {}) => transport.result("browser_wait_for_event", args),
    mark: async (args = {}) => {
      const result = await transport.result<{ events?: any[] }>("browser_get_events", {
        ...args,
        limit: 1
      });
      const event = result.events?.at(-1) ?? null;
      return {
        sequence: typeof event?.sequence === "number" ? event.sequence : null,
        event
      };
    }
  };
}

function createDownloadsFacade(transport: BrowserTransport): BrowserDownloadsFacade {
  return {
    list: (args = {}) => transport.result("browser_list_downloads", args),
    wait: (args = {}) => transport.result("browser_wait_for_download", args),
    waitFor: (args = {}) => transport.result("browser_wait_for_download", args)
  };
}

function createCapabilitiesFacade(transport: BrowserTransport): BrowserCapabilitiesFacade {
  return {
    list: async (args = {}) => {
      const result = await transport.result<{ capabilities?: unknown[] }>("browser_get_capabilities", args);
      return result.capabilities ?? [];
    },
    has: async (id, args = {}) => {
      const capabilities = await createCapabilitiesFacade(transport).list(args);
      return capabilities.some((capability: any) => capability?.id === id && capability.available === true);
    },
    require: async (id, args = {}) => {
      const capabilities = await createCapabilitiesFacade(transport).list(args);
      const capability = capabilities.find((item: any) => item?.id === id) as any;
      if (!capability?.available) {
        throw new Error(
          capability
            ? `Browser capability ${id} is unavailable: ${capability.reason || "not available"}`
            : `Browser capability ${id} is unavailable.`
        );
      }
      return capability;
    }
  };
}

function withDefaults(
  name: BrowserToolName,
  args: JsonObject,
  state: BrowserState
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
  state: BrowserState
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
    session?: { sessionId?: unknown; activeTabId?: unknown };
    tab?: { id?: unknown; sessionId?: unknown };
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

  if (typeof result?.session?.sessionId === "string") {
    state.sessionId = result.session.sessionId;
  }

  if (typeof result?.session?.activeTabId === "number") {
    state.tabId = result.session.activeTabId;
  }

  if (typeof result?.tab?.id === "number") {
    state.tabId = result.tab.id;
  }

  if (typeof result?.tab?.sessionId === "string") {
    state.sessionId = result.tab.sessionId;
  }
}

function tabFromCreated(browser: BrowserClient, transport: BrowserTransport, result: any) {
  const sessionId = requireNonEmptyString(result?.session?.sessionId, "createTab.result.session.sessionId");
  const tabId = requireNumber(result?.tab?.id, "createTab.result.tab.id");
  return new TabHandleImpl(browser, transport, sessionId, tabId);
}

function tabFromSession(browser: BrowserClient, transport: BrowserTransport, session: any) {
  const sessionId = requireNonEmptyString(session?.sessionId, "session.sessionId");
  const tabId = requireNumber(session?.activeTabId, "session.activeTabId");
  return new TabHandleImpl(browser, transport, sessionId, tabId);
}

function tabFromSummary(
  browser: BrowserClient,
  transport: BrowserTransport,
  tab: any,
  fallbackSessionId?: string | null
) {
  const tabId = requireNumber(tab?.id, "tab.id");
  const sessionId = requireNonEmptyString(tab?.sessionId ?? fallbackSessionId, "tab.sessionId");
  return new TabHandleImpl(browser, transport, sessionId, tabId);
}

function requireCurrentTarget(state: BrowserState) {
  if (!state.sessionId || typeof state.tabId !== "number") {
    throw new Error("No current browser tab. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
  }

  return {
    sessionId: state.sessionId,
    tabId: state.tabId
  };
}

function withCurrentSession(state: BrowserState, args: JsonObject) {
  if (!state.sessionId && args.sessionId == null) {
    throw new Error("No active browser session. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
  }

  return {
    ...args,
    sessionId: args.sessionId ?? state.sessionId
  };
}

function finalizeArgs(state: BrowserState, args: JsonObject & { keep?: Array<TabHandle | number> }) {
  return withCurrentSession(state, {
    ...withoutKeys(args, ["keep"]),
    keepTabIds: args.keepTabIds ?? args.keep?.map(tabIdFrom)
  });
}

async function stopCurrentSession(transport: BrowserTransport, state: BrowserState, args: JsonObject) {
  const result = await transport.result("browser_stop_session", withCurrentSession(state, args));
  state.sessionId = null;
  state.tabId = null;
  return result;
}

function assertWaitResult<T extends WaitResult>(result: T, label: string, soft: boolean) {
  const failed =
    result?.timedOut === true ||
    result?.matched === false ||
    result?.reason === "timeout";

  if (failed && !soft) {
    throw new Error(`${label} timed out.`);
  }

  return result;
}

function normalizeUrlMatcher(matchOrArgs: string | RegExp | JsonObject, args: JsonObject) {
  if (typeof matchOrArgs === "string") {
    return {
      ...args,
      urlContains: matchOrArgs
    };
  }

  if (matchOrArgs instanceof RegExp) {
    return {
      ...args,
      urlRegex: matchOrArgs.source
    };
  }

  return matchOrArgs;
}

function stripClientOptions(args: JsonObject) {
  return withoutKeys(args, ["soft", "strict", "actionArgs"]);
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

function tabIdFrom(tabOrId: TabHandle | number) {
  if (typeof tabOrId === "number") {
    return tabOrId;
  }

  return tabOrId.tabId;
}

function sessionIdFrom(tabOrId: TabHandle | number) {
  if (typeof tabOrId === "number") {
    return null;
  }

  return tabOrId.sessionId;
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function requireNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function objectArg(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function pickKeys(source: JsonObject, keys: string[]) {
  const result: JsonObject = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

function withoutKeys(source: JsonObject, keys: string[]) {
  const result = { ...source };
  for (const key of keys) {
    delete result[key];
  }
  return result;
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
