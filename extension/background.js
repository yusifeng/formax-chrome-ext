/// <reference path="./debugger-manager.ts" />
/// <reference path="./event-buffer.ts" />
/// <reference path="./session-manager.ts" />
importScripts("debugger-manager.js", "event-buffer.js", "session-manager.js");
const HOST_NAME = "com.example.agentbrowser";
const CDP_VERSION = "1.3";
const HEARTBEAT_ALARM = "agentbrowser-native-reconnect";
const DEFAULT_CDP_TIMEOUT_MS = 10000;
let nativePort = null;
let lastNativeError = null;
const debuggerManager = new DebuggerManager({
    cdpVersion: CDP_VERSION,
    defaultTimeoutMs: DEFAULT_CDP_TIMEOUT_MS
});
const eventBuffer = new EventBuffer({
    maxEvents: 500
});
const sessionManager = new SessionManager();
registerTopLevelListeners();
connectNativeHost();
ensureReconnectAlarm();
function registerTopLevelListeners() {
    chrome.runtime.onInstalled.addListener(() => {
        connectNativeHost();
        ensureReconnectAlarm();
    });
    chrome.runtime.onStartup.addListener(() => {
        connectNativeHost();
        ensureReconnectAlarm();
    });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === HEARTBEAT_ALARM) {
            connectNativeHost();
        }
    });
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === "POPUP_HEALTH") {
            sendResponse({
                ok: nativePort != null,
                health: health()
            });
            return true;
        }
        return false;
    });
    chrome.debugger.onDetach.addListener((source, reason) => {
        debuggerManager.markDetached(source);
        safePostEvent({
            name: "debuggerDetached",
            sessionId: sessionIdForTab(source.tabId),
            tabId: source.tabId ?? null,
            source,
            reason
        });
    });
    chrome.debugger.onEvent.addListener((source, method, params) => {
        if (!shouldBufferDebuggerEvent(method)) {
            return;
        }
        safePostEvent({
            name: "cdpEvent",
            sessionId: sessionIdForTab(source.tabId),
            tabId: source.tabId ?? null,
            source,
            method,
            params: summarizeDebuggerEvent(method, params)
        });
    });
    chrome.tabs.onRemoved.addListener((tabId) => {
        safePostEvent({
            name: "tabRemoved",
            sessionId: sessionIdForTab(tabId),
            tabId
        });
        debuggerManager.markTabRemoved(tabId);
        sessionManager.onTabRemoved(tabId);
    });
    chrome.downloads.onCreated.addListener((downloadItem) => {
        if (!sessionManager.hasActiveSessions()) {
            return;
        }
        safePostEvent({
            name: "downloadCreated",
            sessionId: null,
            tabId: null,
            download: summarizeDownload(downloadItem)
        });
    });
    chrome.downloads.onChanged.addListener((downloadDelta) => {
        if (!sessionManager.hasActiveSessions()) {
            return;
        }
        safePostEvent({
            name: "downloadChanged",
            sessionId: null,
            tabId: null,
            download: summarizeDownloadDelta(downloadDelta)
        });
    });
}
async function ensureReconnectAlarm() {
    try {
        await chrome.alarms.create(HEARTBEAT_ALARM, {
            periodInMinutes: 1
        });
    }
    catch (error) {
        console.warn("Failed to create reconnect alarm", error);
    }
}
function connectNativeHost() {
    if (nativePort) {
        return;
    }
    try {
        const port = chrome.runtime.connectNative(HOST_NAME);
        nativePort = port;
        lastNativeError = null;
        port.onMessage.addListener((message) => {
            handleNativeMessage(message).catch((error) => {
                safePostResponse({
                    id: message?.id,
                    ok: false,
                    error: {
                        message: stringifyError(error)
                    }
                });
            });
        });
        port.onDisconnect.addListener(() => {
            const lastError = chrome.runtime.lastError;
            lastNativeError = lastError?.message || "Native host disconnected";
            console.warn("Native host disconnected", lastNativeError);
            nativePort = null;
        });
        port.postMessage({
            type: "hello",
            extensionId: chrome.runtime.id,
            version: chrome.runtime.getManifest().version,
            time: Date.now()
        });
    }
    catch (error) {
        lastNativeError = stringifyError(error);
        console.warn("connectNativeHost failed", error);
        nativePort = null;
    }
}
async function handleNativeMessage(message) {
    if (!message || message.type !== "request") {
        return;
    }
    const { id, action, params = {} } = message;
    try {
        const result = await dispatchAction(action, params, id || crypto.randomUUID());
        safePostResponse({
            id,
            ok: true,
            result
        });
    }
    catch (error) {
        safePostResponse({
            id,
            ok: false,
            error: {
                message: stringifyError(error)
            }
        });
    }
}
async function dispatchAction(action, params, actionId) {
    const startedAt = Date.now();
    const result = await dispatchActionRaw(action, params);
    const endedAt = Date.now();
    const meta = extractResultMetadata(result);
    return {
        actionId,
        action,
        ok: true,
        sessionId: meta.sessionId,
        tabId: meta.tabId,
        timing: {
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt
        },
        result
    };
}
async function dispatchActionRaw(action, params) {
    switch (action) {
        case "health":
            return health();
        case "getEvents":
            return getEvents(params);
        case "clearEvents":
            return clearEvents(params);
        case "startSession":
            return startSession(params);
        case "claimTab":
            return claimTab(params);
        case "createTab":
            return createTab(params);
        case "switchTab":
            return switchTab(params);
        case "openUrl":
            return openUrl(params);
        case "goBack":
            return goBack(params);
        case "goForward":
            return goForward(params);
        case "reload":
            return reloadPage(params);
        case "waitForLoadState":
            return waitForLoadState(params);
        case "waitForUrl":
            return waitForUrl(params);
        case "waitForSelector":
            return waitForSelector(params);
        case "waitForText":
            return waitForText(params);
        case "observe":
            return observe(params);
        case "click":
            return click(params);
        case "moveMouse":
            return moveMouse(params);
        case "scroll":
            return scroll(params);
        case "typeText":
            return typeText(params);
        case "evaluate":
            return evaluate(params);
        case "pressKey":
            return pressKey(params);
        case "handleDialog":
            return handleDialog(params);
        case "screenshot":
            return screenshot(params);
        case "uploadFile":
            return uploadFile(params);
        case "cdp":
            return rawCdp(params);
        case "listTabs":
            return listTabs();
        case "listDownloads":
            return listDownloads(params);
        case "waitForDownload":
            return waitForDownload(params);
        case "closeTab":
            return closeTab(params);
        case "finalizeSession":
            return finalizeSession(params);
        case "stopSession":
            return stopSession(params);
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}
function extractResultMetadata(result) {
    if (!result || typeof result !== "object") {
        return {
            sessionId: null,
            tabId: null
        };
    }
    return {
        sessionId: typeof result.sessionId === "string"
            ? result.sessionId
            : typeof result.session?.sessionId === "string"
                ? result.session.sessionId
                : null,
        tabId: typeof result.tabId === "number"
            ? result.tabId
            : typeof result.tab?.id === "number"
                ? result.tab.id
                : typeof result.activeTabId === "number"
                    ? result.activeTabId
                    : null
    };
}
function safePostResponse(payload) {
    try {
        nativePort?.postMessage({
            type: "response",
            ...payload
        });
    }
    catch (error) {
        console.warn("Failed to post response to native host", error);
    }
}
function safePostEvent(payload) {
    const event = eventBuffer.push(payload);
    try {
        nativePort?.postMessage(event);
    }
    catch {
        // Event reporting should never interrupt browser control.
    }
}
function health() {
    return {
        ok: true,
        extensionId: chrome.runtime.id,
        version: chrome.runtime.getManifest().version,
        nativeConnected: nativePort != null,
        lastNativeError,
        sessions: sessionManager.serializeAll(),
        attachedTabs: debuggerManager.listAttachedTabs()
    };
}
function getEvents(params = {}) {
    return {
        events: eventBuffer.list(params)
    };
}
function clearEvents(params = {}) {
    return {
        cleared: eventBuffer.clear(params)
    };
}
async function startSession(params = {}) {
    const session = await sessionManager.startSession(params);
    if (typeof session.activeTabId === "number") {
        await debuggerManager.attachTab(session.activeTabId);
    }
    return sessionManager.serializeSession(session);
}
async function claimTab(params = {}) {
    const { session, tab } = await sessionManager.claimTab(params);
    await debuggerManager.attachTab(tab.id);
    return sessionManager.serializeSession(session);
}
async function createTab(params = {}) {
    const { session, tab } = await sessionManager.createTab(params);
    await debuggerManager.attachTab(tab.id);
    return {
        session: sessionManager.serializeSession(session),
        tab: summarizeTab(tab)
    };
}
async function switchTab(params = {}) {
    const { tabId } = sessionManager.resolveSessionAndTab(params);
    const session = await sessionManager.switchTab(params);
    await debuggerManager.attachTab(tabId);
    const tab = await chrome.tabs.get(tabId);
    return {
        session: sessionManager.serializeSession(session),
        tab: summarizeTab(tab)
    };
}
async function openUrl(params = {}) {
    const url = requireString(params.url, "openUrl.params.url");
    assertAllowedNavigationUrl(url);
    let session = sessionManager.resolveOptionalSession(params);
    if (!session) {
        session = await sessionManager.startSession({
            active: params.active === true
        });
    }
    let tabId = params.tabId;
    if (typeof tabId !== "number") {
        tabId = session.activeTabId;
    }
    if (typeof tabId !== "number") {
        throw new Error("No active tab in session");
    }
    await debuggerManager.attachTab(tabId);
    const loadPromise = waitForPageLoad(tabId, numberOrDefault(params.timeoutMs, 15000));
    await cdp(tabId, "Page.navigate", { url });
    await loadPromise;
    session.activeTabId = tabId;
    sessionManager.touchSession(session.sessionId);
    return observe({
        sessionId: session.sessionId,
        tabId
    });
}
async function goBack(params = {}) {
    return navigateHistory(params, -1);
}
async function goForward(params = {}) {
    return navigateHistory(params, 1);
}
async function reloadPage(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
    await debuggerManager.attachTab(tabId);
    const navigationPromise = params.waitForLoad === false
        ? Promise.resolve({ reason: "not_waited" })
        : waitForNavigationSettled(tabId, timeoutMs);
    await cdp(tabId, "Page.reload", {
        ignoreCache: params.ignoreCache === true
    });
    const navigation = await navigationPromise;
    sessionManager.touchSession(session?.sessionId);
    return {
        ...(await observe({
            sessionId: session?.sessionId,
            tabId
        })),
        navigated: true,
        reason: navigation.reason
    };
}
async function navigateHistory(params = {}, delta) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
    await debuggerManager.attachTab(tabId);
    const history = await cdp(tabId, "Page.getNavigationHistory");
    const entries = Array.isArray(history.entries) ? history.entries : [];
    const currentIndex = typeof history.currentIndex === "number"
        ? history.currentIndex
        : -1;
    const targetIndex = currentIndex + delta;
    const target = entries[targetIndex];
    if (!target || typeof target.id !== "number") {
        return {
            ...(await observe({
                sessionId: session?.sessionId,
                tabId
            })),
            navigated: false,
            reason: delta < 0 ? "no_back_entry" : "no_forward_entry",
            historyIndex: currentIndex
        };
    }
    const navigationPromise = params.waitForLoad === false
        ? Promise.resolve({ reason: "not_waited" })
        : waitForNavigationSettled(tabId, timeoutMs);
    await cdp(tabId, "Page.navigateToHistoryEntry", {
        entryId: target.id
    });
    const navigation = await navigationPromise;
    sessionManager.touchSession(session?.sessionId);
    return {
        ...(await observe({
            sessionId: session?.sessionId,
            tabId
        })),
        navigated: true,
        reason: navigation.reason,
        historyIndex: targetIndex
    };
}
async function waitForUrl(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const matcher = normalizeUrlMatcher(params);
    const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
    const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
    const startedAt = Date.now();
    let lastPage = null;
    await debuggerManager.attachTab(tabId);
    while (Date.now() - startedAt <= timeoutMs) {
        const page = await currentPageLocation(tabId);
        lastPage = page;
        if (urlMatches(page.url, matcher)) {
            sessionManager.touchSession(session?.sessionId);
            return {
                sessionId: session?.sessionId ?? null,
                tabId,
                matched: true,
                timedOut: false,
                elapsedMs: Date.now() - startedAt,
                url: page.url,
                title: page.title
            };
        }
        await sleep(pollMs);
    }
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        matched: false,
        timedOut: true,
        elapsedMs: Date.now() - startedAt,
        url: lastPage?.url,
        title: lastPage?.title
    };
}
async function waitForLoadState(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const state = normalizeLoadState(params.state);
    const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
    await debuggerManager.attachTab(tabId);
    if (await loadStateIsSatisfied(tabId, state)) {
        sessionManager.touchSession(session?.sessionId);
        return {
            sessionId: session?.sessionId ?? null,
            tabId,
            state,
            reason: "already_satisfied"
        };
    }
    const event = state === "domcontentloaded" ? "Page.domContentEventFired" : "Page.loadEventFired";
    const result = await waitForDebuggerEvent(tabId, event, timeoutMs);
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        state,
        ...result
    };
}
async function waitForSelector(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const selector = requireString(params.selector, "waitForSelector.params.selector");
    const state = normalizeSelectorWaitState(params.state);
    const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
    const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
    const startedAt = Date.now();
    let lastMatch = null;
    await debuggerManager.attachTab(tabId);
    while (Date.now() - startedAt <= timeoutMs) {
        const match = await selectorState(tabId, selector);
        lastMatch = match;
        if (selectorStateIsSatisfied(match, state)) {
            sessionManager.touchSession(session?.sessionId);
            return {
                sessionId: session?.sessionId ?? null,
                tabId,
                selector,
                state,
                matched: true,
                timedOut: false,
                elapsedMs: Date.now() - startedAt,
                element: match.element
            };
        }
        await sleep(pollMs);
    }
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        selector,
        state,
        matched: false,
        timedOut: true,
        elapsedMs: Date.now() - startedAt,
        element: lastMatch?.element
    };
}
async function waitForText(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const text = requireString(params.text, "waitForText.params.text");
    const state = normalizeTextWaitState(params.state);
    const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
    const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
    const startedAt = Date.now();
    let lastMatch = null;
    await debuggerManager.attachTab(tabId);
    while (Date.now() - startedAt <= timeoutMs) {
        const match = await textState(tabId, {
            text,
            exact: params.exact === true,
            caseSensitive: params.caseSensitive === true
        });
        lastMatch = match;
        if (textStateIsSatisfied(match, state)) {
            sessionManager.touchSession(session?.sessionId);
            return {
                sessionId: session?.sessionId ?? null,
                tabId,
                text,
                state,
                matched: true,
                timedOut: false,
                elapsedMs: Date.now() - startedAt,
                found: match.found,
                title: match.title,
                url: match.url
            };
        }
        await sleep(pollMs);
    }
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        text,
        state,
        matched: false,
        timedOut: true,
        elapsedMs: Date.now() - startedAt,
        found: lastMatch?.found ?? false,
        title: lastMatch?.title,
        url: lastMatch?.url
    };
}
async function observe(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    await debuggerManager.attachTab(tabId);
    const expression = `(() => {
  const MAX_TEXT_LENGTH = 5000;
  const MAX_ELEMENTS = 120;

  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const isElement = (value) => value instanceof Element;

  const isVisible = (el) => {
    if (!isElement(el)) return false;

    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    if (style.visibility === "hidden") return false;
    if (style.display === "none") return false;
    if (style.opacity === "0") return false;
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.right < 0) return false;
    if (rect.top > window.innerHeight || rect.left > window.innerWidth) return false;

    return true;
  };

  const isSensitive = (el) => {
    return el.tagName.toLowerCase() === "input" &&
      (el.getAttribute("type") || "").toLowerCase() === "password";
  };

  const isFileInput = (el) => {
    return el.tagName.toLowerCase() === "input" &&
      (el.getAttribute("type") || "").toLowerCase() === "file";
  };

  const labelOf = (el) => {
    if (isSensitive(el)) return "[password field]";

    const attrs = ["aria-label", "placeholder", "title", "alt", "name", "id"];

    for (const attr of attrs) {
      const value = normalizeText(el.getAttribute(attr));
      if (value) return value.slice(0, 160);
    }

    if ("value" in el && typeof el.value === "string") {
      const value = normalizeText(el.value);
      if (value) return value.slice(0, 160);
    }

    return normalizeText(el.innerText || el.textContent || "").slice(0, 160);
  };

  const roleOf = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();

    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "input") return type ? "input:" + type : "input";
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    if (el.isContentEditable) return "contenteditable";

    return tag;
  };

  const selector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "[role='button']",
    "[role='link']",
    "[contenteditable='true']",
    "[tabindex]"
  ].join(",");

  window.__agentBrowserController = window.__agentBrowserController || {};
  window.__agentBrowserController.elements = {};

  const candidates = Array.from(document.querySelectorAll(selector))
    .filter((el) => isFileInput(el) || isVisible(el))
    .slice(0, MAX_ELEMENTS);

  const elements = candidates.map((el, index) => {
    const ref = "e" + index;
    const rect = el.getBoundingClientRect();
    const sensitive = isSensitive(el);

    window.__agentBrowserController.elements[ref] = el;
    el.setAttribute("data-agent-browser-ref", ref);

    return {
      ref,
      role: roleOf(el),
      label: labelOf(el),
      sensitive,
      tagName: el.tagName.toLowerCase(),
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  });

  return {
    source: "chrome_page",
    trust: "untrusted",
    url: location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    text: normalizeText(document.body?.innerText || "").slice(0, MAX_TEXT_LENGTH),
    elements
  };
})()`;
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    const observation = {
        sessionId: session?.sessionId ?? null,
        tabId,
        ...value
    };
    if (params.includeAccessibility === true) {
        observation.accessibilityTree = await getAccessibilityTree(tabId, numberOrDefault(params.maxAccessibilityNodes, 200));
    }
    if (params.includeDomSnapshot === true) {
        observation.domSnapshot = await getDomSnapshot(tabId);
    }
    sessionManager.touchSession(session?.sessionId);
    return observation;
}
async function click(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    await debuggerManager.attachTab(tabId);
    const target = await resolvePointerTarget(tabId, params, "click");
    await showCursor(tabId, target.x, target.y);
    await showHighlight(tabId, target.rect);
    await dispatchMouseClick(tabId, target.x, target.y, params);
    await sleep(numberOrDefault(params.waitMs, 500));
    return observe({
        sessionId: session?.sessionId,
        tabId
    });
}
async function moveMouse(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const x = requireFiniteNumber(params.x, "moveMouse.params.x");
    const y = requireFiniteNumber(params.y, "moveMouse.params.y");
    await debuggerManager.attachTab(tabId);
    await showCursor(tabId, x, y);
    await cdp(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "none"
    });
    await sleep(numberOrDefault(params.waitMs, 100));
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        x,
        y
    };
}
async function scroll(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const deltaX = numberOrDefault(params.deltaX, 0);
    const deltaY = numberOrDefault(params.deltaY, 0);
    const point = typeof params.x === "number" && typeof params.y === "number"
        ? {
            x: params.x,
            y: params.y
        }
        : await viewportCenter(tabId);
    await debuggerManager.attachTab(tabId);
    await showCursor(tabId, point.x, point.y);
    await cdp(tabId, "Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: point.x,
        y: point.y,
        deltaX,
        deltaY
    });
    await sleep(numberOrDefault(params.waitMs, 300));
    return observe({
        sessionId: session?.sessionId,
        tabId
    });
}
async function typeText(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const text = requireString(params.text, "typeText.params.text");
    const ref = typeof params.ref === "string" ? params.ref : null;
    const selector = typeof params.selector === "string" ? params.selector : null;
    const hasCoordinates = typeof params.x === "number" && typeof params.y === "number";
    await debuggerManager.attachTab(tabId);
    if (ref || selector) {
        if (params.clear === true) {
            const target = await focusAndMaybeClearElement(tabId, params, true);
            await showCursor(tabId, target.x, target.y);
            await showHighlight(tabId, target.rect);
        }
        else {
            const target = await focusAndMaybeClearElement(tabId, params, false);
            await showCursor(tabId, target.x, target.y);
            await showHighlight(tabId, target.rect);
        }
    }
    else if (hasCoordinates) {
        const target = await resolvePointerTarget(tabId, params, "typeText");
        await showCursor(tabId, target.x, target.y);
        await dispatchMouseClick(tabId, target.x, target.y, {
            ...params,
            waitMs: 0
        });
    }
    await cdp(tabId, "Input.insertText", { text });
    await sleep(numberOrDefault(params.waitMs, 300));
    return observe({
        sessionId: session?.sessionId,
        tabId
    });
}
async function evaluate(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const script = requireString(params.script, "evaluate.params.script");
    const timeoutMs = numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS);
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: script,
        returnByValue: true,
        awaitPromise: params.awaitPromise !== false
    }, {
        timeoutMs
    });
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        value: readRuntimeValue(evaluated)
    };
}
async function pressKey(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const normalized = normalizeKey(requireString(params.key, "pressKey.params.key"));
    await debuggerManager.attachTab(tabId);
    await cdp(tabId, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: normalized.key,
        code: normalized.code,
        windowsVirtualKeyCode: normalized.keyCode,
        nativeVirtualKeyCode: normalized.keyCode
    });
    await cdp(tabId, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: normalized.key,
        code: normalized.code,
        windowsVirtualKeyCode: normalized.keyCode,
        nativeVirtualKeyCode: normalized.keyCode
    });
    await sleep(numberOrDefault(params.waitMs, 300));
    return observe({
        sessionId: session?.sessionId,
        tabId
    });
}
async function handleDialog(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const accept = params.accept !== false;
    const promptText = typeof params.promptText === "string" ? params.promptText : undefined;
    await debuggerManager.attachTab(tabId);
    await cdp(tabId, "Page.handleJavaScriptDialog", {
        accept,
        promptText
    });
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        accepted: accept
    };
}
async function screenshot(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    await debuggerManager.attachTab(tabId);
    const format = params.format === "jpeg" ? "jpeg" : "png";
    const result = await cdp(tabId, "Page.captureScreenshot", {
        format,
        fromSurface: true
    });
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        format,
        dataBase64: result.data
    };
}
async function uploadFile(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const ref = requireString(params.ref, "uploadFile.params.ref");
    const filePath = requireString(params.filePath, "uploadFile.params.filePath");
    await debuggerManager.attachTab(tabId);
    const marker = `agent-upload-${crypto.randomUUID()}`;
    const checked = await cdp(tabId, "Runtime.evaluate", {
        expression: `(() => {
  const ref = ${JSON.stringify(ref)};
  const marker = ${JSON.stringify(marker)};
  const store = window.__agentBrowserController?.elements || {};
  const el = store[ref] || document.querySelector("[data-agent-browser-ref='" + CSS.escape(ref) + "']");

  if (!el) {
    return {
      ok: false,
      error: "Element ref not found: " + ref
    };
  }

  if (el.tagName.toLowerCase() !== "input" || (el.getAttribute("type") || "").toLowerCase() !== "file") {
    return {
      ok: false,
      error: "Element is not input[type=file]"
    };
  }

  el.setAttribute("data-agent-upload-marker", marker);
  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });

  const rect = el.getBoundingClientRect();

  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
})()`,
        returnByValue: true,
        awaitPromise: true
    });
    const target = readRuntimeValue(checked);
    if (!target || target.ok !== true) {
        throw new Error(target?.error || `Unable to locate file input ref: ${ref}`);
    }
    await showCursor(tabId, target.x, target.y);
    await showHighlight(tabId, target.rect);
    const doc = await cdp(tabId, "DOM.getDocument", {
        depth: -1,
        pierce: true
    });
    const node = await cdp(tabId, "DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector: `[data-agent-upload-marker="${cssStringEscape(marker)}"]`
    });
    if (!node.nodeId) {
        throw new Error(`Could not resolve file input node for ref: ${ref}`);
    }
    await cdp(tabId, "DOM.setFileInputFiles", {
        nodeId: node.nodeId,
        files: [filePath]
    });
    await sleep(numberOrDefault(params.waitMs, 1000));
    sessionManager.touchSession(session?.sessionId);
    return observe({
        sessionId: session?.sessionId,
        tabId
    });
}
async function listTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.map(summarizeTab);
}
async function listDownloads(params = {}) {
    const downloads = await findDownloads(params);
    return {
        downloads: downloads.map(summarizeDownload)
    };
}
async function waitForDownload(params = {}) {
    const state = normalizeDownloadWaitState(params.state);
    const timeoutMs = numberOrDefault(params.timeoutMs, 30000);
    const pollMs = Math.max(100, numberOrDefault(params.pollMs, 250));
    const startedAt = Date.now();
    let lastDownload = null;
    while (Date.now() - startedAt <= timeoutMs) {
        const [download] = await findDownloads({
            ...params,
            limit: numberOrDefault(params.limit, 25)
        });
        if (download) {
            lastDownload = download;
            if (state === "any" || download.state === state) {
                return {
                    matched: true,
                    timedOut: false,
                    state,
                    elapsedMs: Date.now() - startedAt,
                    download: summarizeDownload(download)
                };
            }
        }
        await sleep(pollMs);
    }
    return {
        matched: false,
        timedOut: true,
        state,
        elapsedMs: Date.now() - startedAt,
        download: lastDownload ? summarizeDownload(lastDownload) : null
    };
}
async function rawCdp(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const method = requireString(params.method, "cdp.params.method");
    const commandParams = params.params && typeof params.params === "object" && !Array.isArray(params.params)
        ? params.params
        : {};
    const timeoutMs = numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS);
    const result = await cdp(tabId, method, commandParams, {
        timeoutMs
    });
    sessionManager.touchSession(session?.sessionId);
    return {
        sessionId: session?.sessionId ?? null,
        tabId,
        method,
        result
    };
}
async function closeTab(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    await debuggerManager.detachTab(tabId);
    const changedSessions = sessionManager.removeTab(tabId);
    let closed = false;
    try {
        await chrome.tabs.remove(tabId);
        closed = true;
    }
    catch {
        // The tab may have already been closed.
    }
    return {
        closed,
        sessionId: session?.sessionId ?? null,
        tabId,
        remainingSessions: changedSessions.map((changedSession) => sessionManager.serializeSession(changedSession))
    };
}
async function finalizeSession(params = {}) {
    const sessionId = requireString(params.sessionId, "finalizeSession.params.sessionId");
    const session = await sessionManager.markSessionStopped(sessionId);
    if (!session) {
        return {
            finalized: false,
            reason: "session_not_found",
            closedTabs: [],
            keptTabs: []
        };
    }
    const keepTabIds = Array.isArray(params.keepTabIds)
        ? params.keepTabIds.filter((tabId) => Number.isInteger(tabId))
        : [];
    const keep = new Set(keepTabIds);
    const closeRest = params.closeRest !== false;
    const tabIds = [...session.tabIds];
    const closedTabs = [];
    const keptTabs = [];
    for (const tabId of tabIds) {
        await debuggerManager.detachTab(tabId);
        if (keep.has(tabId) || !closeRest) {
            keptTabs.push(tabId);
            continue;
        }
        try {
            await chrome.tabs.remove(tabId);
            closedTabs.push(tabId);
        }
        catch {
            // The tab may have already been closed.
        }
    }
    sessionManager.deleteSession(sessionId);
    return {
        finalized: true,
        sessionId,
        closedTabs,
        keptTabs
    };
}
async function stopSession(params = {}) {
    const sessionId = requireString(params.sessionId, "stopSession.params.sessionId");
    const session = await sessionManager.markSessionStopped(sessionId);
    if (!session) {
        return {
            stopped: false,
            reason: "session_not_found",
            closedTabs: []
        };
    }
    const closedTabs = [];
    const tabIds = [...session.tabIds];
    for (const tabId of tabIds) {
        await debuggerManager.detachTab(tabId);
        if (params.closeTabs === true) {
            try {
                await chrome.tabs.remove(tabId);
                closedTabs.push(tabId);
            }
            catch {
                // The tab may have already been closed.
            }
        }
    }
    sessionManager.deleteSession(sessionId);
    return {
        stopped: true,
        sessionId,
        closedTabs
    };
}
async function resolvePointerTarget(tabId, params, actionName) {
    if (typeof params.x === "number" || typeof params.y === "number") {
        const x = requireFiniteNumber(params.x, `${actionName}.params.x`);
        const y = requireFiniteNumber(params.y, `${actionName}.params.y`);
        return {
            ok: true,
            x,
            y,
            rect: {
                x: x - 2,
                y: y - 2,
                width: 4,
                height: 4
            }
        };
    }
    return locateElementTarget(tabId, params, actionName);
}
async function locateElementTarget(tabId, params, actionName) {
    const ref = typeof params.ref === "string" && params.ref.trim()
        ? params.ref.trim()
        : null;
    const selector = typeof params.selector === "string" && params.selector.trim()
        ? params.selector.trim()
        : null;
    if (!ref && !selector) {
        throw new Error(`${actionName}.params requires ref, selector, or x/y`);
    }
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: elementTargetExpression(ref, selector, false),
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value || value.ok !== true) {
        throw new Error(value?.error ||
            `Unable to locate element for ${actionName}: ${ref || selector}`);
    }
    return value;
}
async function focusAndMaybeClearElement(tabId, params, clear) {
    const ref = typeof params.ref === "string" && params.ref.trim()
        ? params.ref.trim()
        : null;
    const selector = typeof params.selector === "string" && params.selector.trim()
        ? params.selector.trim()
        : null;
    if (!ref && !selector) {
        throw new Error("typeText.params requires ref or selector when clearing/focusing");
    }
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: elementTargetExpression(ref, selector, clear),
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value || value.ok !== true) {
        throw new Error(value?.error || `Unable to focus element: ${ref || selector}`);
    }
    return value;
}
function elementTargetExpression(ref, selector, clear) {
    return `(() => {
  const ref = ${JSON.stringify(ref)};
  const selector = ${JSON.stringify(selector)};
  const store = window.__agentBrowserController?.elements || {};
  let el = null;

  if (ref) {
    el = store[ref] || document.querySelector("[data-agent-browser-ref='" + CSS.escape(ref) + "']");
  }

  if (!el && selector) {
    el = document.querySelector(selector);
  }

  if (!el) {
    return {
      ok: false,
      error: "Element target not found"
    };
  }

  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });

  if (${clear ? "true" : "false"}) {
    el.focus();

    if ("value" in el) {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = "";
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContent"
      }));
    }
  } else if (${clear ? "false" : "true"}) {
    el.focus();
  }

  const rect = el.getBoundingClientRect();

  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
})()`;
}
async function dispatchMouseClick(tabId, x, y, params = {}) {
    const button = normalizeMouseButton(params.button);
    const clickCount = Math.max(1, Math.floor(numberOrDefault(params.clickCount, 1)));
    const buttons = buttonToButtons(button);
    await cdp(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "none"
    });
    await cdp(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button,
        buttons,
        clickCount
    });
    await cdp(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button,
        buttons: 0,
        clickCount
    });
}
async function locateElementByRef(tabId, ref) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: `(() => {
  const ref = ${JSON.stringify(ref)};
  const store = window.__agentBrowserController?.elements || {};
  const el = store[ref] || document.querySelector("[data-agent-browser-ref='" + CSS.escape(ref) + "']");

  if (!el) {
    return {
      ok: false,
      error: "Element ref not found: " + ref
    };
  }

  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });

  const rect = el.getBoundingClientRect();

  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
})()`,
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value || value.ok !== true) {
        throw new Error(value?.error || `Unable to locate element ref: ${ref}`);
    }
    return value;
}
async function focusAndClearElement(tabId, ref) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: `(() => {
  const ref = ${JSON.stringify(ref)};
  const store = window.__agentBrowserController?.elements || {};
  const el = store[ref] || document.querySelector("[data-agent-browser-ref='" + CSS.escape(ref) + "']");

  if (!el) {
    return {
      ok: false,
      error: "Element ref not found: " + ref
    };
  }

  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });
  el.focus();

  if ("value" in el) {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.isContentEditable) {
    el.textContent = "";
    el.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContent"
    }));
  }

  const rect = el.getBoundingClientRect();

  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
})()`,
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value || value.ok !== true) {
        throw new Error(value?.error || `Unable to clear element ref: ${ref}`);
    }
    return value;
}
async function getAccessibilityTree(tabId, maxNodes) {
    const result = await cdp(tabId, "Accessibility.getFullAXTree");
    const nodes = Array.isArray(result.nodes) ? result.nodes : [];
    const limit = Math.max(1, Math.min(Math.floor(maxNodes), 1000));
    return nodes.slice(0, limit).map((node) => ({
        nodeId: node.nodeId,
        ignored: node.ignored === true,
        role: readAxValue(node.role),
        name: readAxValue(node.name),
        value: readAxValue(node.value),
        description: readAxValue(node.description),
        childIds: Array.isArray(node.childIds) ? node.childIds : undefined,
        backendDOMNodeId: node.backendDOMNodeId
    }));
}
async function getDomSnapshot(tabId) {
    return cdp(tabId, "DOMSnapshot.captureSnapshot", {
        computedStyles: []
    });
}
async function viewportCenter(tabId) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: `(() => ({
      x: Math.round((window.visualViewport?.width ?? window.innerWidth) / 2),
      y: Math.round((window.visualViewport?.height ?? window.innerHeight) / 2)
    }))()`,
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value ||
        typeof value.x !== "number" ||
        typeof value.y !== "number" ||
        !Number.isFinite(value.x) ||
        !Number.isFinite(value.y)) {
        return {
            x: 0,
            y: 0
        };
    }
    return value;
}
async function showCursor(tabId, x, y) {
    try {
        if (!(await prepareContentScript(tabId))) {
            return;
        }
        await chrome.tabs.sendMessage(tabId, {
            type: "AGENT_CURSOR",
            x,
            y
        });
    }
    catch {
        // Some pages cannot receive content scripts.
    }
}
async function showHighlight(tabId, rect) {
    try {
        if (!(await prepareContentScript(tabId))) {
            return;
        }
        await chrome.tabs.sendMessage(tabId, {
            type: "AGENT_HIGHLIGHT",
            rect
        });
    }
    catch {
        // Visual feedback is best effort.
    }
}
async function prepareContentScript(tabId) {
    if (await pingContentScript(tabId)) {
        return true;
    }
    try {
        await chrome.scripting.executeScript({
            files: ["content.js"],
            injectImmediately: true,
            target: {
                tabId
            }
        });
    }
    catch {
        return false;
    }
    return pingContentScript(tabId);
}
async function pingContentScript(tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: "CONTENT_PING"
        });
        return response?.ok === true;
    }
    catch {
        return false;
    }
}
async function cdp(tabId, method, params = {}, options = {}) {
    return debuggerManager.send(tabId, method, params, options);
}
function waitForPageLoad(tabId, timeoutMs) {
    return waitForDebuggerEvent(tabId, "Page.loadEventFired", timeoutMs);
}
function waitForNavigationSettled(tabId, timeoutMs) {
    return waitForDebuggerEvents(tabId, ["Page.loadEventFired", "Page.navigatedWithinDocument"], timeoutMs);
}
function waitForDebuggerEvent(tabId, eventName, timeoutMs) {
    return waitForDebuggerEvents(tabId, [eventName], timeoutMs);
}
function waitForDebuggerEvents(tabId, eventNames, timeoutMs) {
    return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => finish("timeout"), timeoutMs);
        const listener = (source, method) => {
            if (source.tabId === tabId && eventNames.includes(method)) {
                finish(method);
            }
        };
        function finish(reason) {
            if (done) {
                return;
            }
            done = true;
            clearTimeout(timer);
            chrome.debugger.onEvent.removeListener(listener);
            resolve({ reason });
        }
        chrome.debugger.onEvent.addListener(listener);
    });
}
async function currentPageLocation(tabId) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: `(() => ({
      url: location.href,
      title: document.title
    }))()`,
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value || typeof value.url !== "string") {
        return {
            url: "",
            title: ""
        };
    }
    return value;
}
async function loadStateIsSatisfied(tabId, state) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true
    });
    const readyState = readRuntimeValue(evaluated);
    if (state === "domcontentloaded") {
        return readyState === "interactive" || readyState === "complete";
    }
    return readyState === "complete";
}
async function selectorState(tabId, selector) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: `(() => {
  const selector = ${JSON.stringify(selector)};
  let el = null;

  try {
    el = document.querySelector(selector);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  if (!el) {
    return {
      ok: true,
      attached: false,
      visible: false,
      element: null
    };
  }

  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const visible =
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    style.opacity !== "0" &&
    rect.width > 0 &&
    rect.height > 0;

  return {
    ok: true,
    attached: true,
    visible,
    element: {
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: typeof el.className === "string" ? el.className : undefined,
      text: String(el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 300),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    }
  };
})()`,
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value || value.ok !== true) {
        throw new Error(value?.error || `Invalid selector: ${selector}`);
    }
    return value;
}
async function textState(tabId, options) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: `(() => {
  const needle = ${JSON.stringify(options.text)};
  const exact = ${options.exact ? "true" : "false"};
  const caseSensitive = ${options.caseSensitive ? "true" : "false"};
  const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const pageText = normalize(document.body?.innerText || "");
  const title = document.title;
  const haystack = caseSensitive ? pageText : pageText.toLowerCase();
  const target = caseSensitive ? normalize(needle) : normalize(needle).toLowerCase();

  return {
    found: exact ? haystack === target : haystack.includes(target),
    title,
    url: location.href
  };
})()`,
        returnByValue: true,
        awaitPromise: true
    });
    return readRuntimeValue(evaluated);
}
function selectorStateIsSatisfied(match, state) {
    if (state === "attached") {
        return match.attached === true;
    }
    if (state === "visible") {
        return match.visible === true;
    }
    if (state === "hidden") {
        return match.attached !== true || match.visible !== true;
    }
    return match.attached !== true;
}
function textStateIsSatisfied(match, state) {
    const found = match?.found === true;
    return state === "hidden" ? !found : found;
}
function summarizeTab(tab) {
    return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title,
        url: tab.url,
        active: tab.active,
        groupId: tab.groupId
    };
}
function summarizeDownload(download) {
    return {
        id: download.id,
        url: download.url,
        finalUrl: download.finalUrl,
        filename: download.filename,
        mime: download.mime,
        state: download.state,
        danger: download.danger,
        totalBytes: download.totalBytes,
        bytesReceived: download.bytesReceived,
        startTime: download.startTime,
        endTime: download.endTime,
        error: download.error
    };
}
function summarizeDownloadDelta(delta) {
    return {
        id: delta.id,
        url: delta.url?.current,
        finalUrl: delta.finalUrl?.current,
        filename: delta.filename?.current,
        mime: delta.mime?.current,
        state: delta.state?.current,
        danger: delta.danger?.current,
        totalBytes: delta.totalBytes?.current,
        endTime: delta.endTime?.current,
        error: delta.error?.current
    };
}
async function findDownloads(params = {}) {
    const limit = Math.max(1, Math.min(Math.floor(numberOrDefault(params.limit, 50)), 500));
    const query = {
        limit,
        orderBy: ["-startTime"]
    };
    if (typeof params.id === "number") {
        query.id = params.id;
    }
    if (isDownloadState(params.state)) {
        query.state = params.state;
    }
    const downloads = await chrome.downloads.search(query);
    return downloads.filter((download) => downloadMatches(download, params));
}
function downloadMatches(download, params = {}) {
    if (typeof params.id === "number" && download.id !== params.id) {
        return false;
    }
    if (isDownloadState(params.state) && download.state !== params.state) {
        return false;
    }
    if (typeof params.urlContains === "string" &&
        params.urlContains &&
        !String(download.finalUrl || download.url || "").includes(params.urlContains)) {
        return false;
    }
    if (typeof params.filenameContains === "string" &&
        params.filenameContains &&
        !String(download.filename || "").includes(params.filenameContains)) {
        return false;
    }
    if (typeof params.mimeContains === "string" &&
        params.mimeContains &&
        !String(download.mime || "").includes(params.mimeContains)) {
        return false;
    }
    if (typeof params.startedAfter === "number") {
        const startTime = Date.parse(download.startTime || "");
        if (!Number.isFinite(startTime) || startTime < params.startedAfter) {
            return false;
        }
    }
    return true;
}
function isDownloadState(state) {
    return state === "in_progress" || state === "interrupted" || state === "complete";
}
function normalizeDownloadWaitState(state) {
    if (state == null) {
        return "complete";
    }
    if (state === "any" || isDownloadState(state)) {
        return state;
    }
    throw new Error(`Unsupported download wait state: ${state}`);
}
function shouldBufferDebuggerEvent(method) {
    return [
        "Page.frameNavigated",
        "Page.navigatedWithinDocument",
        "Page.domContentEventFired",
        "Page.loadEventFired",
        "Page.javascriptDialogOpening",
        "Page.javascriptDialogClosed",
        "Runtime.exceptionThrown"
    ].includes(method);
}
function summarizeDebuggerEvent(method, params) {
    if (!params || typeof params !== "object") {
        return {};
    }
    if (method === "Page.frameNavigated") {
        return {
            frame: summarizeFrame(params.frame)
        };
    }
    if (method === "Page.navigatedWithinDocument") {
        return {
            frameId: params.frameId,
            url: params.url,
            navigationType: params.navigationType
        };
    }
    if (method === "Page.domContentEventFired" ||
        method === "Page.loadEventFired") {
        return {
            timestamp: params.timestamp
        };
    }
    if (method === "Page.javascriptDialogOpening") {
        return {
            url: params.url,
            message: truncateString(params.message, 500),
            type: params.type,
            hasBrowserHandler: params.hasBrowserHandler,
            defaultPrompt: truncateString(params.defaultPrompt, 500)
        };
    }
    if (method === "Page.javascriptDialogClosed") {
        return {
            result: params.result,
            userInput: truncateString(params.userInput, 500)
        };
    }
    if (method === "Runtime.exceptionThrown") {
        const details = params.exceptionDetails || {};
        return {
            timestamp: params.timestamp,
            text: truncateString(details.text, 500),
            url: details.url,
            lineNumber: details.lineNumber,
            columnNumber: details.columnNumber,
            exception: details.exception && typeof details.exception === "object"
                ? {
                    description: truncateString(details.exception.description, 1000),
                    className: details.exception.className
                }
                : undefined
        };
    }
    return {};
}
function summarizeFrame(frame) {
    if (!frame || typeof frame !== "object") {
        return undefined;
    }
    return {
        id: frame.id,
        parentId: frame.parentId,
        loaderId: frame.loaderId,
        url: frame.url,
        domainAndRegistry: frame.domainAndRegistry,
        securityOrigin: frame.securityOrigin,
        mimeType: frame.mimeType,
        unreachableUrl: frame.unreachableUrl
    };
}
function sessionIdForTab(tabId) {
    if (typeof tabId !== "number") {
        return null;
    }
    return sessionManager.findSessionByTabId(tabId)?.sessionId ?? null;
}
function readRuntimeValue(evaluated) {
    if (evaluated.exceptionDetails) {
        throw new Error(JSON.stringify(evaluated.exceptionDetails));
    }
    return evaluated.result?.value;
}
function readAxValue(payload) {
    if (!payload || typeof payload !== "object" || !("value" in payload)) {
        return undefined;
    }
    return payload.value;
}
function normalizeKey(key) {
    const map = {
        Enter: { key: "Enter", code: "Enter", keyCode: 13 },
        Tab: { key: "Tab", code: "Tab", keyCode: 9 },
        Escape: { key: "Escape", code: "Escape", keyCode: 27 },
        Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
        ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
        ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
        ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
        ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 }
    };
    const normalized = map[key];
    if (!normalized) {
        throw new Error(`Unsupported key: ${key}`);
    }
    return normalized;
}
function normalizeMouseButton(button) {
    if (button == null) {
        return "left";
    }
    if (button === "left" || button === "middle" || button === "right") {
        return button;
    }
    throw new Error(`Unsupported mouse button: ${button}`);
}
function buttonToButtons(button) {
    if (button === "right") {
        return 2;
    }
    if (button === "middle") {
        return 4;
    }
    return 1;
}
function normalizeLoadState(state) {
    if (state == null) {
        return "load";
    }
    if (state === "load" || state === "domcontentloaded") {
        return state;
    }
    throw new Error(`Unsupported load state: ${state}`);
}
function normalizeSelectorWaitState(state) {
    if (state == null) {
        return "visible";
    }
    if (state === "attached" ||
        state === "visible" ||
        state === "hidden" ||
        state === "detached") {
        return state;
    }
    throw new Error(`Unsupported selector wait state: ${state}`);
}
function normalizeTextWaitState(state) {
    if (state == null) {
        return "present";
    }
    if (state === "present" || state === "hidden") {
        return state;
    }
    throw new Error(`Unsupported text wait state: ${state}`);
}
function normalizeUrlMatcher(params = {}) {
    const exact = typeof params.url === "string" && params.url.trim()
        ? params.url.trim()
        : null;
    const contains = typeof params.urlContains === "string" && params.urlContains.trim()
        ? params.urlContains.trim()
        : null;
    const regex = typeof params.urlRegex === "string" && params.urlRegex.trim()
        ? params.urlRegex.trim()
        : null;
    if (!exact && !contains && !regex) {
        throw new Error("waitForUrl.params requires url, urlContains, or urlRegex");
    }
    if (regex) {
        try {
            new RegExp(regex);
        }
        catch {
            throw new Error(`Invalid waitForUrl.params.urlRegex: ${regex}`);
        }
    }
    return {
        exact,
        contains,
        regex
    };
}
function urlMatches(url, matcher) {
    if (matcher.exact && url !== matcher.exact) {
        return false;
    }
    if (matcher.contains && !url.includes(matcher.contains)) {
        return false;
    }
    if (matcher.regex && !new RegExp(matcher.regex).test(url)) {
        return false;
    }
    return true;
}
function assertAllowedNavigationUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new Error(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Only http/https URLs are allowed in MVP: ${url}`);
    }
}
function requireString(value, name) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${name} must be a non-empty string`);
    }
    return value.trim();
}
function cssStringEscape(value) {
    return String(value).replace(/["\\]/g, "\\$&");
}
function truncateString(value, maxLength) {
    if (typeof value !== "string") {
        return value;
    }
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
function numberOrDefault(value, defaultValue) {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : defaultValue;
}
function requireFiniteNumber(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number`);
    }
    return value;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function stringifyError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
