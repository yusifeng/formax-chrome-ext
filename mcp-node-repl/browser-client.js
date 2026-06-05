import { browserToolSchemas, callBrowserTool } from "../agent/browserTools.js";
const noDefaultActions = new Set([
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
export async function setupBrowserRuntime(options = {}) {
    const globals = options.globals || globalThis;
    const browser = createBrowserClient();
    const existingAgent = globals.agent;
    const agent = {
        ...(existingAgent && typeof existingAgent === "object" ? existingAgent : {}),
        browsers: {
            get: async (name) => {
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
export function createBrowserClient(options = {}) {
    const state = {
        sessionId: null,
        tabId: null
    };
    const caller = options.callTool || callBrowserTool;
    let browser;
    const transport = {
        state,
        run: async (name, args = {}) => {
            const params = withDefaults(name, args, state);
            const envelope = await caller(name, params);
            rememberBrowserTarget(envelope, state);
            return envelope;
        },
        result: async (name, args = {}) => {
            const envelope = await transport.run(name, args);
            return envelope.result;
        }
    };
    function result(name, args = {}) {
        return transport.result(name, args);
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
        nameSession: (nameOrArgs, args = {}) => result("browser_name_session", stringArg("name", nameOrArgs, args)),
        claimTab: (args = {}) => result("browser_claim_tab", args),
        createTab: (args = {}) => result("browser_create_tab", args),
        switchTab: (args) => result("browser_switch_tab", args),
        listTabs: (args = {}) => result("browser_list_tabs", args),
        getTab: (args = {}) => result("browser_get_tab", args),
        openUrl: (urlOrArgs, args = {}) => result("browser_open_url", stringArg("url", urlOrArgs, args)),
        goBack: (args = {}) => result("browser_go_back", args),
        goForward: (args = {}) => result("browser_go_forward", args),
        reload: (args = {}) => result("browser_reload", args),
        waitForLoadState: (stateOrArgs = "load", args = {}) => result("browser_wait_for_load_state", stringArg("state", stateOrArgs, args)),
        waitForUrl: (args) => result("browser_wait_for_url", args),
        waitForSelector: (selectorOrArgs, args = {}) => result("browser_wait_for_selector", stringArg("selector", selectorOrArgs, args)),
        waitForText: (textOrArgs, args = {}) => result("browser_wait_for_text", stringArg("text", textOrArgs, args)),
        observe: (args = {}) => result("browser_observe", args),
        locatorQuery: (args) => result("browser_locator_query", args),
        locatorAction: (args) => result("browser_locator_action", args),
        locatorWait: (args) => result("browser_locator_wait", args),
        click: (targetOrArgs = {}, args = {}) => result("browser_click", targetArg(targetOrArgs, args)),
        moveMouse: (xOrArgs, y, args = {}) => result("browser_move_mouse", pointArg(xOrArgs, y, args)),
        scroll: (deltaYOrArgs = {}, args = {}) => result("browser_scroll", scrollArg(deltaYOrArgs, args)),
        type: (textOrArgs, maybeTextOrArgs, args = {}) => result("browser_type_text", typeArg(textOrArgs, maybeTextOrArgs, args)),
        typeText: (args) => result("browser_type_text", args),
        evaluate: (scriptOrArgs, args = {}) => result("browser_evaluate", stringArg("script", scriptOrArgs, args)),
        pressKey: (keyOrArgs, args = {}) => result("browser_press_key", stringArg("key", keyOrArgs, args)),
        handleDialog: (args = {}) => result("browser_handle_dialog", args),
        screenshot: (args = {}) => result("browser_screenshot", args),
        uploadFile: (args) => result("browser_upload_file", args),
        cdp: (methodOrArgs, params = {}, args = {}) => result("browser_cdp", cdpArg(methodOrArgs, params, args)),
        rawCdp: (methodOrArgs, params = {}, args = {}) => result("browser_cdp", cdpArg(methodOrArgs, params, args)),
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
class TabHandleImpl {
    browser;
    sessionId;
    tabId;
    id;
    closed = false;
    transport;
    constructor(browser, transport, sessionId, tabId) {
        this.browser = browser;
        this.transport = transport;
        this.sessionId = sessionId;
        this.tabId = tabId;
        this.id = tabId;
    }
    async info() {
        this.assertOpen();
        const result = await this.transport.result("browser_get_tab", this.targetArgs());
        return result.tab;
    }
    async bringToFront() {
        this.assertOpen();
        await this.transport.result("browser_switch_tab", this.targetArgs());
        return this;
    }
    goto(url, args = {}) {
        this.assertOpen();
        return this.transport.result("browser_open_url", this.targetArgs({ ...args, url }));
    }
    openUrl(url, args = {}) {
        return this.goto(url, args);
    }
    reload(args = {}) {
        this.assertOpen();
        return this.transport.result("browser_reload", this.targetArgs(args));
    }
    goBack(args = {}) {
        this.assertOpen();
        return this.transport.result("browser_go_back", this.targetArgs(args));
    }
    goForward(args = {}) {
        this.assertOpen();
        return this.transport.result("browser_go_forward", this.targetArgs(args));
    }
    async waitForLoadState(stateOrArgs = "load", args = {}) {
        this.assertOpen();
        const params = stringArg("state", stateOrArgs, args);
        const result = await this.transport.result("browser_wait_for_load_state", this.targetArgs(stripClientOptions(params)));
        return assertWaitResult(result, "waitForLoadState", params.soft === true);
    }
    async waitForUrl(matchOrArgs, args = {}) {
        this.assertOpen();
        const params = normalizeUrlMatcher(matchOrArgs, args);
        const result = await this.transport.result("browser_wait_for_url", this.targetArgs(stripClientOptions(params)));
        return assertWaitResult(result, "waitForUrl", params.soft === true);
    }
    async waitForSelector(selectorOrArgs, args = {}) {
        this.assertOpen();
        const params = stringArg("selector", selectorOrArgs, args);
        const result = await this.transport.result("browser_wait_for_selector", this.targetArgs(stripClientOptions(params)));
        return assertWaitResult(result, "waitForSelector", params.soft === true);
    }
    async waitForText(textOrArgs, args = {}) {
        this.assertOpen();
        const params = stringArg("text", textOrArgs, args);
        const result = await this.transport.result("browser_wait_for_text", this.targetArgs(stripClientOptions(params)));
        return assertWaitResult(result, "waitForText", params.soft === true);
    }
    observe(args = {}) {
        this.assertOpen();
        return this.transport.result("browser_observe", this.targetArgs(args));
    }
    locator(selector, args = {}) {
        this.assertOpen();
        return new LocatorHandleImpl(this.transport, this, requireNonEmptyString(selector, "locator.selector"), args);
    }
    getByText(text, args = {}) {
        this.assertOpen();
        return new LocatorHandleImpl(this.transport, this, requireNonEmptyString(text, "getByText.text"), {
            ...args,
            plan: { kind: "text", text, exact: args.exact === true }
        });
    }
    getByRole(role, args = {}) {
        this.assertOpen();
        return new LocatorHandleImpl(this.transport, this, requireNonEmptyString(role, "getByRole.role"), {
            ...args,
            plan: {
                kind: "role",
                role,
                name: typeof args.name === "string" ? args.name : undefined,
                exact: args.exact === true
            }
        });
    }
    getByLabel(text, args = {}) {
        this.assertOpen();
        return new LocatorHandleImpl(this.transport, this, requireNonEmptyString(text, "getByLabel.text"), {
            ...args,
            plan: { kind: "label", text, exact: args.exact === true }
        });
    }
    getByPlaceholder(text, args = {}) {
        this.assertOpen();
        return new LocatorHandleImpl(this.transport, this, requireNonEmptyString(text, "getByPlaceholder.text"), {
            ...args,
            plan: { kind: "placeholder", text, exact: args.exact === true }
        });
    }
    getByTestId(testId, args = {}) {
        this.assertOpen();
        return new LocatorHandleImpl(this.transport, this, requireNonEmptyString(testId, "getByTestId.testId"), {
            ...args,
            plan: { kind: "testId", testId, exact: args.exact === true }
        });
    }
    frameLocator(selector) {
        this.assertOpen();
        return new UnsupportedFrameLocator(requireNonEmptyString(selector, "frameLocator.selector"));
    }
    click(targetOrArgs = {}, args = {}) {
        this.assertOpen();
        const params = typeof targetOrArgs === "string"
            ? { ...args, selector: targetOrArgs }
            : targetOrArgs;
        return this.transport.result("browser_click", this.targetArgs(params));
    }
    moveMouse(xOrArgs, y, args = {}) {
        this.assertOpen();
        return this.transport.result("browser_move_mouse", this.targetArgs(pointArg(xOrArgs, y, args)));
    }
    scroll(deltaYOrArgs = {}, args = {}) {
        this.assertOpen();
        return this.transport.result("browser_scroll", this.targetArgs(scrollArg(deltaYOrArgs, args)));
    }
    type(textOrArgs, maybeTextOrArgs, args = {}) {
        this.assertOpen();
        return this.transport.result("browser_type_text", this.targetArgs(typeArg(textOrArgs, maybeTextOrArgs, args)));
    }
    pressKey(keyOrArgs, args = {}) {
        this.assertOpen();
        return this.transport.result("browser_press_key", this.targetArgs(stringArg("key", keyOrArgs, args)));
    }
    async evaluate(scriptOrArgs, args = {}) {
        this.assertOpen();
        const evaluated = await this.transport.result("browser_evaluate", this.targetArgs(stringArg("script", scriptOrArgs, args)));
        return evaluated?.value;
    }
    cdp(methodOrArgs, params = {}, args = {}) {
        this.assertOpen();
        return this.transport.result("browser_cdp", this.targetArgs(cdpArg(methodOrArgs, params, args)));
    }
    rawCdp(methodOrArgs, params = {}, args = {}) {
        return this.cdp(methodOrArgs, params, args);
    }
    getDevLogs(args = {}) {
        this.assertOpen();
        return this.transport.result("browser_get_dev_logs", this.targetArgs(args));
    }
    handleDialog(args = {}) {
        this.assertOpen();
        return this.transport.result("browser_handle_dialog", this.targetArgs(args));
    }
    screenshot(args = {}) {
        this.assertOpen();
        return this.transport.result("browser_screenshot", this.targetArgs(args));
    }
    uploadFile(refOrArgs, filePath, args = {}) {
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
    targetArgs(args = {}) {
        return {
            ...args,
            sessionId: this.sessionId,
            tabId: this.tabId
        };
    }
    assertOpen() {
        if (this.closed) {
            throw new Error(`Tab ${this.tabId} is closed; create or claim another tab before using it.`);
        }
    }
}
class LocatorHandleImpl {
    tab;
    selector;
    plan;
    strict;
    index;
    transport;
    constructor(transport, tab, selector, args = {}) {
        this.transport = transport;
        this.tab = tab;
        const plan = objectArg(args.plan);
        this.selector = selector;
        this.strict = args.strict === true || plan.strict === true;
        this.index = Math.max(0, Math.floor(Number(args.index ?? plan.index ?? 0)));
        this.plan = plan.kind
            ? cleanObject({
                ...plan,
                index: this.index,
                strict: this.strict
            })
            : {
                kind: "css",
                selector,
                index: this.index,
                strict: this.strict
            };
    }
    locator(childSelector, args = {}) {
        if (this.plan.kind !== "css") {
            throw new Error("Locator chaining is currently only supported for CSS locators.");
        }
        const child = requireNonEmptyString(childSelector, "locator.childSelector");
        return new LocatorHandleImpl(this.transport, this.tab, `${this.selector} ${child}`, {
            strict: args.strict ?? this.strict
        });
    }
    nth(index) {
        return new LocatorHandleImpl(this.transport, this.tab, this.selector, {
            strict: this.strict,
            index,
            plan: {
                ...this.plan,
                index
            }
        });
    }
    first() {
        return this.nth(0);
    }
    async last() {
        const count = await this.count();
        return this.nth(Math.max(0, count - 1));
    }
    async waitFor(args = {}) {
        const result = await this.transport.result("browser_locator_wait", this.targetArgs(stripClientOptions(args)));
        return assertWaitResult(result, "locator.waitFor", args.soft === true);
    }
    async count(args = {}) {
        return Number((await this.query("count", args)).value ?? 0);
    }
    async allTextContents(args = {}) {
        const value = (await this.query("allTextContents", args)).value;
        return Array.isArray(value) ? value.map((item) => String(item)) : [];
    }
    async textContent(args = {}) {
        const value = (await this.query("textContent", args)).value;
        return value == null ? null : String(value);
    }
    async innerText(args = {}) {
        const value = (await this.query("innerText", args)).value;
        return value == null ? "" : String(value);
    }
    async getAttribute(name, args = {}) {
        const value = (await this.query("getAttribute", {
            ...args,
            args: {
                ...(objectArg(args.args)),
                name: requireNonEmptyString(name, "locator.getAttribute.name")
            }
        })).value;
        return value == null ? null : String(value);
    }
    async isVisible(args = {}) {
        return (await this.query("isVisible", args)).value === true;
    }
    async isEnabled(args = {}) {
        return (await this.query("isEnabled", args)).value === true;
    }
    async boundingBox(args = {}) {
        return (await this.query("boundingBox", args)).value ?? null;
    }
    click(args = {}) {
        return this.action("click", {}, args);
    }
    dblclick(args = {}) {
        return this.action("dblclick", {}, args);
    }
    hover(args = {}) {
        return this.action("hover", {}, args);
    }
    focus(args = {}) {
        return this.action("focus", {}, args);
    }
    clear(args = {}) {
        return this.action("clear", {}, args);
    }
    fill(value, args = {}) {
        return this.action("fill", {
            value,
            ...(args.clear !== undefined ? { clear: args.clear } : {})
        }, args);
    }
    type(value, args = {}) {
        return this.action("type", {
            value,
            ...(args.clear !== undefined ? { clear: args.clear } : {})
        }, args);
    }
    press(key, args = {}) {
        return this.action("press", { key }, args);
    }
    setChecked(checked = true, args = {}) {
        return this.action("setChecked", { checked }, args);
    }
    selectOption(value, args = {}) {
        const actionArgs = Array.isArray(value) ? { values: value } : { value };
        return this.action("selectOption", actionArgs, args);
    }
    setInputFiles(filePath, args = {}) {
        return this.transport.result("browser_upload_file", {
            ...args,
            sessionId: this.tab.sessionId,
            tabId: this.tab.tabId,
            locator: this.plan,
            filePath
        });
    }
    toJSON() {
        return {
            type: "Locator",
            sessionId: this.tab.sessionId,
            tabId: this.tab.tabId,
            locator: this.plan
        };
    }
    async query(kind, args = {}) {
        return this.transport.result("browser_locator_query", this.targetArgs({
            ...stripClientOptions(args),
            kind
        }));
    }
    async action(kind, actionArgs, args = {}) {
        await this.assertStrictIfNeeded(args);
        return this.transport.result("browser_locator_action", this.targetArgs({
            kind,
            waitMs: args.waitMs,
            args: {
                ...actionArgs,
                ...objectArg(args.actionArgs)
            }
        }));
    }
    async assertStrictIfNeeded(args) {
        if (args.strict !== true && this.strict !== true) {
            return;
        }
        const count = await this.count();
        if (count !== 1) {
            throw new Error(`Strict locator expected exactly one match for ${this.selector}, found ${count}.`);
        }
    }
    targetArgs(args = {}) {
        return {
            ...args,
            sessionId: this.tab.sessionId,
            tabId: this.tab.tabId,
            locator: this.plan
        };
    }
}
class UnsupportedFrameLocator {
    selector;
    constructor(selector) {
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
function createTabsFacade(getBrowser, transport) {
    return {
        new: async (urlOrArgs, args = {}) => {
            const url = typeof urlOrArgs === "string" ? urlOrArgs : null;
            const options = typeof urlOrArgs === "string" ? args : objectArg(urlOrArgs);
            const created = await transport.result("browser_create_tab", withoutKeys(options, ["timeoutMs", "waitUntil"]));
            const tab = tabFromCreated(getBrowser(), transport, created);
            if (url) {
                await tab.goto(url, pickKeys(options, ["active", "timeoutMs"]));
            }
            return tab;
        },
        claim: async (args = {}) => {
            const session = await transport.result("browser_claim_tab", args);
            return tabFromSession(getBrowser(), transport, session);
        },
        current: async () => {
            const { sessionId, tabId } = requireCurrentTarget(transport.state);
            const result = await transport.result("browser_get_tab", { sessionId, tabId });
            return tabFromSummary(getBrowser(), transport, result.tab, sessionId);
        },
        get: async (tabId, args = {}) => {
            const targetTabId = tabId ?? transport.state.tabId;
            if (typeof targetTabId !== "number") {
                throw new Error("No current tab. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
            }
            const result = await transport.result("browser_get_tab", {
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
            const result = await transport.result("browser_list_tabs", params);
            return result.tabs;
        },
        switch: async (tabOrId) => {
            const tabId = tabIdFrom(tabOrId);
            const sessionId = sessionIdFrom(tabOrId) ?? transport.state.sessionId;
            if (!sessionId) {
                throw new Error("No active browser session. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
            }
            const result = await transport.result("browser_switch_tab", {
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
function createUserFacade(getBrowser, transport, tabs) {
    return {
        claimTab: (args = {}) => tabs.claim(args),
        nameSession: (name, args = {}) => transport.result("browser_name_session", withCurrentSession(transport.state, { ...args, name })),
        handoff: (args = {}) => transport.result("browser_finalize_session", finalizeArgs(transport.state, args)),
        finalize: (args = {}) => transport.result("browser_finalize_session", finalizeArgs(transport.state, args)),
        stop: (args = {}) => stopCurrentSession(transport, transport.state, args)
    };
}
function createEventsFacade(transport) {
    return {
        get: (args = {}) => transport.result("browser_get_events", args),
        clear: (args = {}) => transport.result("browser_clear_events", args),
        wait: (args = {}) => transport.result("browser_wait_for_event", args),
        mark: async (args = {}) => {
            const result = await transport.result("browser_get_events", {
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
function createDownloadsFacade(transport) {
    return {
        list: (args = {}) => transport.result("browser_list_downloads", args),
        wait: (args = {}) => transport.result("browser_wait_for_download", args),
        waitFor: (args = {}) => transport.result("browser_wait_for_download", args)
    };
}
function createCapabilitiesFacade(transport) {
    return {
        list: async (args = {}) => {
            const result = await transport.result("browser_get_capabilities", args);
            return result.capabilities ?? [];
        },
        has: async (id, args = {}) => {
            const capabilities = await createCapabilitiesFacade(transport).list(args);
            return capabilities.some((capability) => capability?.id === id && capability.available === true);
        },
        require: async (id, args = {}) => {
            const capabilities = await createCapabilitiesFacade(transport).list(args);
            const capability = capabilities.find((item) => item?.id === id);
            if (!capability?.available) {
                throw new Error(capability
                    ? `Browser capability ${id} is unavailable: ${capability.reason || "not available"}`
                    : `Browser capability ${id} is unavailable.`);
            }
            return capability;
        }
    };
}
function withDefaults(name, args, state) {
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
function rememberBrowserTarget(envelope, state) {
    if (typeof envelope.sessionId === "string") {
        state.sessionId = envelope.sessionId;
    }
    if (typeof envelope.tabId === "number") {
        state.tabId = envelope.tabId;
    }
    const result = envelope.result;
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
function tabFromCreated(browser, transport, result) {
    const sessionId = requireNonEmptyString(result?.session?.sessionId, "createTab.result.session.sessionId");
    const tabId = requireNumber(result?.tab?.id, "createTab.result.tab.id");
    return new TabHandleImpl(browser, transport, sessionId, tabId);
}
function tabFromSession(browser, transport, session) {
    const sessionId = requireNonEmptyString(session?.sessionId, "session.sessionId");
    const tabId = requireNumber(session?.activeTabId, "session.activeTabId");
    return new TabHandleImpl(browser, transport, sessionId, tabId);
}
function tabFromSummary(browser, transport, tab, fallbackSessionId) {
    const tabId = requireNumber(tab?.id, "tab.id");
    const sessionId = requireNonEmptyString(tab?.sessionId ?? fallbackSessionId, "tab.sessionId");
    return new TabHandleImpl(browser, transport, sessionId, tabId);
}
function requireCurrentTarget(state) {
    if (!state.sessionId || typeof state.tabId !== "number") {
        throw new Error("No current browser tab. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
    }
    return {
        sessionId: state.sessionId,
        tabId: state.tabId
    };
}
function withCurrentSession(state, args) {
    if (!state.sessionId && args.sessionId == null) {
        throw new Error("No active browser session. Use `browser.tabs.new(url)` or `browser.tabs.claim()` first.");
    }
    return {
        ...args,
        sessionId: args.sessionId ?? state.sessionId
    };
}
function finalizeArgs(state, args) {
    return withCurrentSession(state, {
        ...withoutKeys(args, ["keep"]),
        keepTabIds: args.keepTabIds ?? args.keep?.map(tabIdFrom)
    });
}
async function stopCurrentSession(transport, state, args) {
    const result = await transport.result("browser_stop_session", withCurrentSession(state, args));
    state.sessionId = null;
    state.tabId = null;
    return result;
}
function assertWaitResult(result, label, soft) {
    const failed = result?.timedOut === true ||
        result?.matched === false ||
        result?.reason === "timeout";
    if (failed && !soft) {
        throw new Error(`${label} timed out.`);
    }
    return result;
}
function normalizeUrlMatcher(matchOrArgs, args) {
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
function stripClientOptions(args) {
    return withoutKeys(args, ["soft", "strict", "actionArgs"]);
}
function stringArg(key, valueOrArgs, args) {
    if (typeof valueOrArgs === "string") {
        return {
            ...args,
            [key]: valueOrArgs
        };
    }
    return valueOrArgs;
}
function targetArg(targetOrArgs, args) {
    if (typeof targetOrArgs !== "string") {
        return targetOrArgs;
    }
    const key = looksLikeSelector(targetOrArgs) ? "selector" : "ref";
    return {
        ...args,
        [key]: targetOrArgs
    };
}
function pointArg(xOrArgs, y, args = {}) {
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
function scrollArg(deltaYOrArgs, args) {
    if (typeof deltaYOrArgs !== "number") {
        return deltaYOrArgs;
    }
    return {
        ...args,
        deltaY: deltaYOrArgs
    };
}
function typeArg(textOrArgs, maybeTextOrArgs, args = {}) {
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
function cdpArg(methodOrArgs, params, args) {
    if (typeof methodOrArgs !== "string") {
        return methodOrArgs;
    }
    return {
        ...args,
        method: methodOrArgs,
        params
    };
}
function tabIdFrom(tabOrId) {
    if (typeof tabOrId === "number") {
        return tabOrId;
    }
    return tabOrId.tabId;
}
function sessionIdFrom(tabOrId) {
    if (typeof tabOrId === "number") {
        return null;
    }
    return tabOrId.sessionId;
}
function requireNonEmptyString(value, label) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value.trim();
}
function requireNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${label} must be a finite number.`);
    }
    return value;
}
function objectArg(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function pickKeys(source, keys) {
    const result = {};
    for (const key of keys) {
        if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}
function withoutKeys(source, keys) {
    const result = { ...source };
    for (const key of keys) {
        delete result[key];
    }
    return result;
}
function cleanObject(source) {
    const result = {};
    for (const [key, value] of Object.entries(source)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}
function looksLikeSelector(value) {
    return (value.startsWith("#") ||
        value.startsWith(".") ||
        value.startsWith("[") ||
        value.startsWith("/") ||
        value.includes(" ") ||
        value.includes(">") ||
        value.includes("[") ||
        value.includes("=") ||
        /^[a-z][a-z0-9-]*(?:[.#[:]|$)/i.test(value));
}
