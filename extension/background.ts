/// <reference path="./debugger-manager.ts" />
/// <reference path="./event-buffer.ts" />
/// <reference path="./session-manager.ts" />

declare function importScripts(...urls: string[]): void;

importScripts("debugger-manager.js", "event-buffer.js", "session-manager.js");

const HOST_NAME = "com.example.agentbrowser";
const CDP_VERSION = "1.3";
const HEARTBEAT_ALARM = "agentbrowser-native-reconnect";
const DEFAULT_CDP_TIMEOUT_MS = 10000;
const BACKEND_REVISION = 4;
const SUPPORTED_ACTIONS = [
  "health",
  "reloadExtension",
  "getEvents",
  "clearEvents",
  "waitForEvent",
  "startSession",
  "nameSession",
  "claimTab",
  "createTab",
  "switchTab",
  "openUrl",
  "goBack",
  "goForward",
  "reload",
  "waitForLoadState",
  "waitForUrl",
  "waitForSelector",
  "waitForText",
  "observe",
  "locatorQuery",
  "locatorAction",
  "locatorWait",
  "click",
  "moveMouse",
  "scroll",
  "typeText",
  "evaluate",
  "pressKey",
  "handleDialog",
  "screenshot",
  "uploadFile",
  "cdp",
  "listTabs",
  "getTab",
  "listDownloads",
  "waitForDownload",
  "getDevLogs",
  "getCapabilities",
  "closeTab",
  "finalizeSession",
  "stopSession"
];

let nativePort = null;
let lastNativeError: string | null = null;

type ActionParams = Record<string, any>;
type CursorPhase = "idle" | "active" | "thinking";
type CursorOverlayState = {
  arrivedMoveSequence?: number;
  moveSequence: number;
  phase: CursorPhase;
  sessionId: string | null;
  turnId: string | null;
  updatedAt: number;
  visible: boolean;
  x: number;
  y: number;
};
type ActionContext = {
  action: string;
  actionId: string;
};

const debuggerManager = new DebuggerManager({
  cdpVersion: CDP_VERSION,
  defaultTimeoutMs: DEFAULT_CDP_TIMEOUT_MS
});
const eventBuffer = new EventBuffer({
  maxEvents: 500
});
const sessionManager = new SessionManager();
const cursorOverlayStateByTab = new Map<number, CursorOverlayState>();
let activeActionContext: ActionContext | null = null;
let nextCursorMoveSequence = 0;

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

    if (message?.type === "GET_AGENT_CURSOR_STATE") {
      const tabId = sender.tab?.id;
      sendResponse({
        ok: true,
        state:
          typeof tabId === "number"
            ? cursorOverlayStateByTab.get(tabId) ?? null
            : null
      });
      return true;
    }

    if (message?.type === "AGENT_CURSOR_ARRIVED") {
      const tabId = sender.tab?.id;
      const moveSequence = Number(message.moveSequence);
      const sessionId =
        typeof message.sessionId === "string" ? message.sessionId : null;
      const turnId = typeof message.turnId === "string" ? message.turnId : null;
      const state =
        typeof tabId === "number" ? cursorOverlayStateByTab.get(tabId) : null;

      if (
        state &&
        Number.isFinite(moveSequence) &&
        state.moveSequence === moveSequence &&
        state.sessionId === sessionId &&
        state.turnId === turnId
      ) {
        state.arrivedMoveSequence = moveSequence;
        state.updatedAt = Date.now();
        safePostEvent({
          name: "cursorArrived",
          sessionId: state.sessionId,
          tabId,
          moveSequence,
          turnId: state.turnId
        });
      }

      sendResponse({ ok: true });
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
    cursorOverlayStateByTab.delete(tabId);
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
  } catch (error) {
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
  } catch (error) {
    lastNativeError = stringifyError(error);
    console.warn("connectNativeHost failed", error);
    nativePort = null;
  }
}

async function handleNativeMessage(message: any) {
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
  } catch (error) {
    safePostResponse({
      id,
      ok: false,
      error: {
        message: stringifyError(error)
      }
    });
  }
}

async function dispatchAction(
  action: string,
  params: ActionParams,
  actionId: string
) {
  const startedAt = Date.now();
  const previousContext = activeActionContext;
  activeActionContext = { action, actionId };

  try {
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
  } finally {
    activeActionContext = previousContext;
  }
}

async function dispatchActionRaw(action: string, params: ActionParams) {
  switch (action) {
    case "health":
      return health();

    case "reloadExtension":
      return reloadExtension();

    case "getEvents":
      return getEvents(params);

    case "clearEvents":
      return clearEvents(params);

    case "waitForEvent":
      return waitForEvent(params);

    case "startSession":
      return startSession(params);

    case "nameSession":
      return nameSession(params);

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

    case "locatorQuery":
      return locatorQuery(params);

    case "locatorAction":
      return locatorAction(params);

    case "locatorWait":
      return locatorWait(params);

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
      return listTabs(params);

    case "getTab":
      return getTab(params);

    case "listDownloads":
      return listDownloads(params);

    case "waitForDownload":
      return waitForDownload(params);

    case "getDevLogs":
      return getDevLogs(params);

    case "getCapabilities":
      return getCapabilities(params);

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

function extractResultMetadata(result: any) {
  if (!result || typeof result !== "object") {
    return {
      sessionId: null,
      tabId: null
    };
  }

  return {
    sessionId:
      typeof result.sessionId === "string"
        ? result.sessionId
        : typeof result.session?.sessionId === "string"
          ? result.session.sessionId
          : null,
    tabId:
      typeof result.tabId === "number"
        ? result.tabId
        : typeof result.tab?.id === "number"
          ? result.tab.id
        : typeof result.activeTabId === "number"
          ? result.activeTabId
          : null
  };
}

function safePostResponse(payload: ActionParams) {
  try {
    nativePort?.postMessage({
      type: "response",
      ...payload
    });
  } catch (error) {
    console.warn("Failed to post response to native host", error);
  }
}

function safePostEvent(payload: ActionParams) {
  const event = eventBuffer.push(payload);

  try {
    nativePort?.postMessage(event);
  } catch {
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
    attachedTabs: debuggerManager.listAttachedTabs(),
    supportedActions: SUPPORTED_ACTIONS,
    backendRevision: BACKEND_REVISION
  };
}

function reloadExtension() {
  setTimeout(() => {
    chrome.runtime.reload();
  }, 50);

  return {
    reloading: true,
    backendRevision: BACKEND_REVISION
  };
}

function getEvents(params: ActionParams = {}) {
  return {
    events: eventBuffer.list(params)
  };
}

function clearEvents(params: ActionParams = {}) {
  return {
    cleared: eventBuffer.clear(params)
  };
}

async function waitForEvent(params: ActionParams = {}) {
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
  const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const events = eventBuffer.list({
      sessionId: params.sessionId,
      tabId: params.tabId,
      name: params.name,
      sinceSequence: params.sinceSequence,
      limit: 1
    });

    if (events.length > 0) {
      return {
        matched: true,
        timedOut: false,
        elapsedMs: Date.now() - startedAt,
        event: events[0]
      };
    }

    await sleep(pollMs);
  }

  return {
    matched: false,
    timedOut: true,
    elapsedMs: Date.now() - startedAt,
    event: null
  };
}

async function startSession(params: ActionParams = {}) {
  const session = await sessionManager.startSession(params);

  if (typeof session.activeTabId === "number") {
    await debuggerManager.attachTab(session.activeTabId);
  }

  return sessionManager.serializeSession(session);
}

async function nameSession(params: ActionParams = {}) {
  const sessionId = requireString(params.sessionId, "nameSession.params.sessionId");
  const name = requireString(params.name, "nameSession.params.name");
  const session = await sessionManager.nameSession(sessionId, name);

  return {
    session: sessionManager.serializeSession(session)
  };
}

async function claimTab(params: ActionParams = {}) {
  const { session, tab } = await sessionManager.claimTab(params);
  await debuggerManager.attachTab(tab.id);

  return sessionManager.serializeSession(session);
}

async function createTab(params: ActionParams = {}) {
  const { session, tab } = await sessionManager.createTab(params);
  await debuggerManager.attachTab(tab.id);

  return {
    session: sessionManager.serializeSession(session),
    tab: summarizeTab(tab)
  };
}

async function switchTab(params: ActionParams = {}) {
  const { tabId } = sessionManager.resolveSessionAndTab(params);
  const session = await sessionManager.switchTab(params);
  await debuggerManager.attachTab(tabId);
  const tab = await chrome.tabs.get(tabId);

  return {
    session: sessionManager.serializeSession(session),
    tab: summarizeTab(tab)
  };
}

async function openUrl(params: ActionParams = {}) {
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

  const loadPromise = waitForPageLoad(
    tabId,
    numberOrDefault(params.timeoutMs, 15000)
  );

  await cdp(tabId, "Page.navigate", { url });
  await loadPromise;
  session.activeTabId = tabId;
  sessionManager.touchSession(session.sessionId);

  return observe({
    sessionId: session.sessionId,
    tabId
  });
}

async function goBack(params: ActionParams = {}) {
  return navigateHistory(params, -1);
}

async function goForward(params: ActionParams = {}) {
  return navigateHistory(params, 1);
}

async function reloadPage(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);

  await debuggerManager.attachTab(tabId);

  const navigationPromise =
    params.waitForLoad === false
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

async function navigateHistory(params: ActionParams = {}, delta: -1 | 1) {
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

  const navigationPromise =
    params.waitForLoad === false
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

async function waitForUrl(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const matcher = normalizeUrlMatcher(params);
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
  const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
  const startedAt = Date.now();
  let lastPage = null;

  await debuggerManager.attachTab(tabId);
  await showCursorActivity(tabId, "thinking");

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

async function waitForLoadState(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const state = normalizeLoadState(params.state);
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);

  await debuggerManager.attachTab(tabId);
  await showCursorActivity(tabId, "thinking");

  if (await loadStateIsSatisfied(tabId, state)) {
    sessionManager.touchSession(session?.sessionId);

    return {
      sessionId: session?.sessionId ?? null,
      tabId,
      state,
      reason: "already_satisfied"
    };
  }

  const event =
    state === "domcontentloaded" ? "Page.domContentEventFired" : "Page.loadEventFired";
  const result = await waitForDebuggerEvent(tabId, event, timeoutMs);
  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    state,
    ...result
  };
}

async function waitForSelector(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const selector = requireString(params.selector, "waitForSelector.params.selector");
  const state = normalizeSelectorWaitState(params.state);
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
  const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
  const startedAt = Date.now();
  let lastMatch = null;

  await debuggerManager.attachTab(tabId);
  await showCursorActivity(tabId, "thinking");

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

async function waitForText(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const text = requireString(params.text, "waitForText.params.text");
  const state = normalizeTextWaitState(params.state);
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
  const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
  const startedAt = Date.now();
  let lastMatch = null;

  await debuggerManager.attachTab(tabId);
  await showCursorActivity(tabId, "thinking");

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

async function observe(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  await debuggerManager.attachTab(tabId);
  await showCursorActivity(tabId, "thinking");

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
  const observation: ActionParams = {
    sessionId: session?.sessionId ?? null,
    tabId,
    ...value
  };

  const maxAccessibilityNodes = numberOrDefault(params.maxAccessibilityNodes, 200);
  let accessibilityTree: ActionParams[] = [];
  let accessibilityError: string | undefined;

  if (params.includeAccessibility !== false) {
    try {
      accessibilityTree = await getAccessibilityTree(tabId, maxAccessibilityNodes);
    } catch (error) {
      accessibilityError = stringifyError(error);
    }
  }
  const semanticNodes = summarizeAccessibilityNodes(accessibilityTree, 80);

  observation.semanticTree = {
    source: "accessibility",
    nodeCount: accessibilityTree.length,
    nodes: semanticNodes,
    error: accessibilityError
  };

  if (params.includeAccessibility === true) {
    observation.accessibilityTree = accessibilityTree;
  }

  if (params.includeDomSnapshot === true) {
    const domSnapshot = await getDomSnapshot(tabId);
    observation.domSnapshot = domSnapshot;
    observation.domSnapshotSummary = summarizeDomSnapshot(domSnapshot);
  }

  sessionManager.touchSession(session?.sessionId);

  return observation;
}

async function locatorQuery(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const locator = normalizeLocatorPlan(params.locator);
  const kind = normalizeLocatorQueryKind(params.kind);
  await debuggerManager.attachTab(tabId);

  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression: locatorQueryExpression(locator, kind, params.args),
    returnByValue: true,
    awaitPromise: true
  });
  const value = readRuntimeValue(evaluated);

  if (!value || value.ok !== true) {
    throw new Error(value?.error || `Locator query failed: ${locator.selector}`);
  }

  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    kind,
    value: value.value,
    count: value.count
  };
}

async function locatorAction(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const locator = normalizeLocatorPlan(params.locator);
  const kind = normalizeLocatorActionKind(params.kind);
  const args = params.args && typeof params.args === "object" ? params.args : {};
  const waitMs = numberOrDefault(params.waitMs, 300);

  await debuggerManager.attachTab(tabId);

  if (kind === "click" || kind === "dblclick") {
    const target = await resolveLocatorRef(tabId, locator, `locatorAction.${kind}`);
    return click({
      sessionId: session?.sessionId,
      tabId,
      ref: target.ref,
      clickCount: kind === "dblclick" ? 2 : numberOrDefault(args.clickCount, 1),
      button: args.button,
      waitMs
    });
  }

  if (kind === "fill" || kind === "type") {
    const text = requireString(args.value ?? args.text, `locatorAction.${kind}.text`);
    const target = await resolveLocatorRef(tabId, locator, `locatorAction.${kind}`);

    return typeText({
      sessionId: session?.sessionId,
      tabId,
      ref: target.ref,
      text,
      clear: kind === "fill" ? args.clear !== false : args.clear === true,
      waitMs
    });
  }

  if (kind === "press") {
    const key = requireString(args.key, "locatorAction.press.key");
    await focusLocator(tabId, locator);

    return pressKey({
      sessionId: session?.sessionId,
      tabId,
      key,
      waitMs
    });
  }

  if (kind === "clear" || kind === "focus" || kind === "hover") {
    const target = await resolveLocatorRef(tabId, locator, `locatorAction.${kind}`);

    if (kind === "focus" || kind === "clear") {
      await focusAndMaybeClearElement(tabId, { ref: target.ref }, kind === "clear");
    }

    if (kind === "hover") {
      await showCursor(tabId, target.x, target.y);
      await cdp(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: target.x,
        y: target.y,
        button: "none"
      });
    }

    await sleep(waitMs);

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  if (kind === "setChecked" || kind === "selectOption") {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
      expression: locatorMutationExpression(locator, kind, args),
      returnByValue: true,
      awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);

    if (!value || value.ok !== true) {
      throw new Error(value?.error || `Locator action failed: ${locator.selector}`);
    }

    await sleep(waitMs);

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  throw new Error(`Unsupported locator action: ${kind}`);
}

async function locatorWait(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const locator = normalizeLocatorPlan(params.locator);
  const state = normalizeSelectorWaitState(params.state);
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
  const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
  const startedAt = Date.now();
  let lastMatch = null;

  await debuggerManager.attachTab(tabId);

  while (Date.now() - startedAt <= timeoutMs) {
    const match = await locatorState(tabId, locator);
    lastMatch = match;

    if (selectorStateIsSatisfied(match, state)) {
      sessionManager.touchSession(session?.sessionId);

      return {
        sessionId: session?.sessionId ?? null,
        tabId,
        state,
        matched: true,
        timedOut: false,
        elapsedMs: Date.now() - startedAt,
        count: match.attached ? 1 : 0
      };
    }

    await sleep(pollMs);
  }

  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    state,
    matched: false,
    timedOut: true,
    elapsedMs: Date.now() - startedAt,
    count: lastMatch?.attached ? 1 : 0
  };
}

async function click(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);

  await debuggerManager.attachTab(tabId);

  const target = await resolvePointerTarget(tabId, params, "click");
  await showCursor(tabId, target.x, target.y);
  await showHighlight(tabId, target.rect);
  await dispatchMouseClick(tabId, target.x, target.y, params);
  await showCursorClick(tabId, target.x, target.y);

  await sleep(numberOrDefault(params.waitMs, 500));

  return observe({
    sessionId: session?.sessionId,
    tabId
  });
}

async function moveMouse(params: ActionParams = {}) {
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

async function scroll(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const deltaX = numberOrDefault(params.deltaX, 0);
  const deltaY = numberOrDefault(params.deltaY, 0);
  const point =
    typeof params.x === "number" && typeof params.y === "number"
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

async function typeText(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const text = requireString(params.text, "typeText.params.text");
  const ref = typeof params.ref === "string" ? params.ref : null;
  const selector = typeof params.selector === "string" ? params.selector : null;
  const hasCoordinates =
    typeof params.x === "number" && typeof params.y === "number";

  await debuggerManager.attachTab(tabId);

  if (ref || selector) {
    if (params.clear === true) {
      const target = await focusAndMaybeClearElement(tabId, params, true);
      await showCursor(tabId, target.x, target.y);
      await showHighlight(tabId, target.rect);
    } else {
      const target = await focusAndMaybeClearElement(tabId, params, false);
      await showCursor(tabId, target.x, target.y);
      await showHighlight(tabId, target.rect);
    }
  } else if (hasCoordinates) {
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

async function evaluate(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const script = requireString(params.script, "evaluate.params.script");
  const timeoutMs = numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS);

  await showCursorActivity(tabId, "thinking");

  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: script,
      returnByValue: true,
      awaitPromise: params.awaitPromise !== false
    },
    {
      timeoutMs
    }
  );
  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    value: readRuntimeValue(evaluated)
  };
}

async function pressKey(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const normalized = normalizeKey(requireString(params.key, "pressKey.params.key"));

  await debuggerManager.attachTab(tabId);

  const keyText =
    normalized.key === "Enter"
      ? {
          text: "\r",
          unmodifiedText: "\r"
        }
      : {};

  await cdp(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: normalized.key,
    code: normalized.code,
    ...keyText,
    windowsVirtualKeyCode: normalized.keyCode,
    nativeVirtualKeyCode: normalized.keyCode
  });

  if (normalized.key === "Enter") {
    await cdp(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      key: normalized.key,
      code: normalized.code,
      text: "\r",
      unmodifiedText: "\r",
      windowsVirtualKeyCode: normalized.keyCode,
      nativeVirtualKeyCode: normalized.keyCode
    });
  }

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

async function handleDialog(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const accept = params.accept !== false;
  const promptText =
    typeof params.promptText === "string" ? params.promptText : undefined;

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

async function screenshot(params: ActionParams = {}) {
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

async function uploadFile(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const filePath = requireString(params.filePath, "uploadFile.params.filePath");
  const ref = typeof params.ref === "string" && params.ref.trim()
    ? params.ref.trim()
    : null;
  const locator = params.locator
    ? normalizeLocatorPlan(params.locator)
    : typeof params.selector === "string" && params.selector.trim()
      ? normalizeLocatorPlan({ kind: "css", selector: params.selector })
      : null;

  if (!ref && !locator) {
    throw new Error("uploadFile.params requires ref, selector, or locator");
  }

  await debuggerManager.attachTab(tabId);

  const marker = `agent-upload-${crypto.randomUUID()}`;
  const checked = await cdp(tabId, "Runtime.evaluate", {
    expression: uploadTargetExpression({ ref, locator, marker }),
    returnByValue: true,
    awaitPromise: true
  });
  const target = readRuntimeValue(checked);

  if (!target || target.ok !== true) {
    throw new Error(target?.error || "Unable to locate file input");
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

async function listTabs(params: ActionParams = {}) {
  const query: chrome.tabs.QueryInfo = {};
  const session =
    typeof params.sessionId === "string" && params.sessionId.trim()
      ? sessionManager.getExistingSession(params.sessionId.trim())
      : null;

  if (params.currentWindow === true) {
    query.currentWindow = true;
  }

  let tabs = await chrome.tabs.query(query);

  if (session) {
    const tabIds = new Set(session.tabIds);
    tabs = tabs.filter((tab) => typeof tab.id === "number" && tabIds.has(tab.id));
  }

  if (params.controlledOnly === true) {
    tabs = tabs.filter(
      (tab) =>
        typeof tab.id === "number" &&
        sessionManager.findSessionByTabId(tab.id) != null
    );
  }

  return {
    tabs: tabs.map(summarizeTab)
  };
}

async function getTab(params: ActionParams = {}) {
  const { tabId } = sessionManager.resolveSessionAndTab(params);
  const tab = await chrome.tabs.get(tabId);

  return {
    tab: summarizeTab(tab)
  };
}

function getCapabilities(params: ActionParams = {}) {
  const scope = params.scope === "tab" ? "tab" : params.scope === "browser" ? "browser" : null;
  const capabilities = listCapabilities().filter(
    (capability) => !scope || capability.scope === scope
  );

  return {
    capabilities
  };
}

function getDevLogs(params: ActionParams = {}) {
  const limit = Math.max(1, Math.min(Math.floor(numberOrDefault(params.limit, 100)), 500));
  const level = typeof params.level === "string" && params.level.trim()
    ? params.level.trim()
    : null;
  const events = eventBuffer.list({
    sessionId: params.sessionId,
    tabId: params.tabId,
    sinceSequence: params.sinceSequence,
    limit: 500
  });
  let logs = events.map(devLogFromEvent).filter((log) => log != null);

  if (level) {
    logs = logs.filter((log) => log.level === level);
  }

  return {
    logs: logs.slice(-limit)
  };
}

async function listDownloads(params: ActionParams = {}) {
  const downloads = await findDownloads(params);

  return {
    downloads: downloads.map(summarizeDownload)
  };
}

async function waitForDownload(params: ActionParams = {}) {
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

async function rawCdp(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const method = requireString(params.method, "cdp.params.method");
  const commandParams =
    params.params && typeof params.params === "object" && !Array.isArray(params.params)
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

async function closeTab(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  await debuggerManager.detachTab(tabId);
  const changedSessions = sessionManager.removeTab(tabId);

  let closed = false;

  try {
    await chrome.tabs.remove(tabId);
    closed = true;
  } catch {
    // The tab may have already been closed.
  }

  return {
    closed,
    sessionId: session?.sessionId ?? null,
    tabId,
    remainingSessions: changedSessions.map((changedSession) =>
      sessionManager.serializeSession(changedSession)
    )
  };
}

async function finalizeSession(params: ActionParams = {}) {
  const sessionId = requireString(
    params.sessionId,
    "finalizeSession.params.sessionId"
  );
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
    cursorOverlayStateByTab.delete(tabId);

    if (keep.has(tabId) || !closeRest) {
      keptTabs.push(tabId);
      continue;
    }

    try {
      await chrome.tabs.remove(tabId);
      closedTabs.push(tabId);
    } catch {
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

async function stopSession(params: ActionParams = {}) {
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
    cursorOverlayStateByTab.delete(tabId);

    if (params.closeTabs === true) {
      try {
        await chrome.tabs.remove(tabId);
        closedTabs.push(tabId);
      } catch {
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

async function resolvePointerTarget(
  tabId: number,
  params: ActionParams,
  actionName: string
) {
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

async function locateElementTarget(
  tabId: number,
  params: ActionParams,
  actionName: string
) {
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
    throw new Error(
      value?.error ||
        `Unable to locate element for ${actionName}: ${ref || selector}`
    );
  }

  return value;
}

async function focusAndMaybeClearElement(
  tabId: number,
  params: ActionParams,
  clear: boolean
) {
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
    throw new Error(
      value?.error || `Unable to focus element: ${ref || selector}`
    );
  }

  return value;
}

function elementTargetExpression(
  ref: string | null,
  selector: string | null,
  clear: boolean
) {
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

function normalizeLocatorPlan(locator: any) {
  if (!locator || typeof locator !== "object") {
    throw new Error("locator params require a locator object");
  }

  const kind = requireString(locator.kind, "locator.kind");
  const allowed = ["css", "text", "role", "label", "placeholder", "testId"];

  if (!allowed.includes(kind)) {
    throw new Error(`Unsupported locator kind: ${String(locator.kind)}`);
  }

  const selector = kind === "css" ? requireString(locator.selector, "locator.selector") : undefined;
  const text = kind === "text" || kind === "label" || kind === "placeholder"
    ? requireString(locator.text ?? locator.name, `locator.${kind}.text`)
    : typeof locator.text === "string"
      ? locator.text
      : undefined;
  const role = kind === "role" ? requireString(locator.role, "locator.role") : undefined;
  const name = kind === "role" && typeof locator.name === "string" ? locator.name : undefined;
  const testId = kind === "testId" ? requireString(locator.testId ?? locator.text, "locator.testId") : undefined;
  const index = locator.index == null ? 0 : Math.max(0, Math.floor(numberOrDefault(locator.index, 0)));

  return {
    kind,
    selector,
    text,
    role,
    name,
    testId,
    exact: locator.exact === true,
    index,
    strict: locator.strict === true
  };
}

function normalizeLocatorQueryKind(kind: any) {
  const value = requireString(kind, "locatorQuery.kind");
  const allowed = [
    "count",
    "allTextContents",
    "textContent",
    "innerText",
    "getAttribute",
    "isVisible",
    "isEnabled",
    "boundingBox"
  ];

  if (!allowed.includes(value)) {
    throw new Error(`Unsupported locator query kind: ${value}`);
  }

  return value;
}

function normalizeLocatorActionKind(kind: any) {
  const value = requireString(kind, "locatorAction.kind");
  const allowed = [
    "click",
    "dblclick",
    "fill",
    "type",
    "press",
    "clear",
    "focus",
    "hover",
    "setChecked",
    "selectOption"
  ];

  if (!allowed.includes(value)) {
    throw new Error(`Unsupported locator action kind: ${value}`);
  }

  return value;
}

async function resolveLocatorRef(tabId: number, locator: any, actionName: string) {
  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression: locatorTargetExpression(locator, `agent-locator-${crypto.randomUUID()}`),
    returnByValue: true,
    awaitPromise: true
  });
  const value = readRuntimeValue(evaluated);

  if (!value || value.ok !== true) {
    throw new Error(value?.error || `Unable to resolve locator for ${actionName}: ${locator.selector}`);
  }

  return value;
}

async function focusLocator(tabId: number, locator: any) {
  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression: `(() => {
  ${locatorResolverSource(locator)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  if (!el) {
    return {
      ok: false,
      error: "Element target not found",
      count: resolved.count
    };
  }

  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });
  el.focus();

  return { ok: true };
})()`,
    returnByValue: true,
    awaitPromise: true
  });
  const value = readRuntimeValue(evaluated);

  if (!value || value.ok !== true) {
    throw new Error(value?.error || `Unable to focus locator: ${locator.selector}`);
  }
}

function locatorTargetExpression(locator: any, ref: string) {
  return `(() => {
  ${locatorResolverSource(locator)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  if (!el) {
    return {
      ok: false,
      error: "Element target not found",
      count: resolved.count
    };
  }

  const ref = ${JSON.stringify(ref)};

  window.__agentBrowserController = window.__agentBrowserController || {};
  window.__agentBrowserController.elements = window.__agentBrowserController.elements || {};
  window.__agentBrowserController.elements[ref] = el;
  el.setAttribute("data-agent-browser-ref", ref);
  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });

  const rect = el.getBoundingClientRect();

  return {
    ok: true,
    ref,
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

function uploadTargetExpression(options: { ref: string | null; locator: any; marker: string }) {
  const { ref, locator, marker } = options;
  const locatorSource = locator ? locatorResolverSource(locator) : "";

  return `(() => {
  const ref = ${JSON.stringify(ref)};
  const marker = ${JSON.stringify(marker)};
  let el = null;

  if (ref) {
    const store = window.__agentBrowserController?.elements || {};
    el = store[ref] || document.querySelector("[data-agent-browser-ref='" + CSS.escape(ref) + "']");
  }

  if (!el) {
    ${locatorSource}
    ${locator ? `
    const resolved = resolveLocator();
    if (!resolved.ok) return resolved;
    el = resolved.element;
    ` : ""}
  }

  if (!el) {
    return {
      ok: false,
      error: "Element target not found"
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
})()`;
}

function locatorResolverSource(locator: any) {
  return `
  const locator = ${JSON.stringify(locator)};
  const locatorKind = locator.kind;
  const selector = ${JSON.stringify(locator.selector)};
  const locatorText = ${JSON.stringify(locator.text ?? "")};
  const locatorRole = ${JSON.stringify(locator.role ?? "")};
  const locatorName = ${JSON.stringify(locator.name ?? "")};
  const locatorTestId = ${JSON.stringify(locator.testId ?? "")};
  const exact = ${locator.exact === true ? "true" : "false"};
  const index = ${JSON.stringify(locator.index ?? 0)};
  const strict = ${locator.strict === true ? "true" : "false"};
  const locatorNormalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const locatorTextMatches = (actual, expected) => {
    const a = locatorNormalizeText(actual);
    const e = locatorNormalizeText(expected);
    if (!e) return false;
    return exact ? a === e : a.toLowerCase().includes(e.toLowerCase());
  };
  const locatorImplicitRole = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      if (["button", "submit", "reset"].includes(type)) return "button";
      if (["checkbox"].includes(type)) return "checkbox";
      if (["radio"].includes(type)) return "radio";
      return "textbox";
    }
    return tag;
  };
  const locatorAccessibleName = (el) => {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\\s+/)
        .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "")
        .join(" ");
      if (locatorNormalizeText(text)) return text;
    }
    const attrs = ["aria-label", "placeholder", "title", "alt", "value", "name", "id"];
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (locatorNormalizeText(value)) return value;
    }
    return el.innerText || el.textContent || "";
  };
  const locatorElementsForKind = () => {
    if (locatorKind === "css") {
      return Array.from(document.querySelectorAll(selector));
    }

    if (locatorKind === "testId") {
      return Array.from(document.querySelectorAll("[data-testid]"))
        .filter((el) => locatorTextMatches(el.getAttribute("data-testid"), locatorTestId));
    }

    if (locatorKind === "placeholder") {
      return Array.from(document.querySelectorAll("input[placeholder], textarea[placeholder]"))
        .filter((el) => locatorTextMatches(el.getAttribute("placeholder"), locatorText));
    }

    if (locatorKind === "label") {
      const matches = [];
      for (const label of Array.from(document.querySelectorAll("label"))) {
        if (!locatorTextMatches(label.innerText || label.textContent || "", locatorText)) continue;
        const control = label.control || (label.getAttribute("for") ? document.getElementById(label.getAttribute("for")) : null);
        if (control) matches.push(control);
      }
      for (const el of Array.from(document.querySelectorAll("[aria-label], [aria-labelledby]"))) {
        if (locatorTextMatches(locatorAccessibleName(el), locatorText)) matches.push(el);
      }
      return Array.from(new Set(matches));
    }

    if (locatorKind === "role") {
      return Array.from(document.querySelectorAll("*"))
        .filter((el) => locatorImplicitRole(el) === locatorRole)
        .filter((el) => !locatorName || locatorTextMatches(locatorAccessibleName(el), locatorName));
    }

    if (locatorKind === "text") {
      const candidates = Array.from(document.querySelectorAll("body *"))
        .filter((el) => locatorTextMatches(el.innerText || el.textContent || "", locatorText));
      return candidates.filter((el) => {
        return !Array.from(el.children).some((child) => locatorTextMatches(child.innerText || child.textContent || "", locatorText));
      });
    }

    return [];
  };

  const resolveLocator = () => {
    let elements;

    try {
      elements = locatorElementsForKind();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    if (strict && elements.length !== 1) {
      return {
        ok: false,
        error: "Strict locator expected exactly one match, found " + elements.length,
        count: elements.length,
        elements
      };
    }

    const safeIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
    const element = elements[safeIndex] || null;

    return {
      ok: true,
      element,
      elements,
      count: elements.length,
      index: safeIndex
    };
  };
`;
}

function locatorQueryExpression(locator: any, kind: string, args: any) {
  return `(() => {
  const kind = ${JSON.stringify(kind)};
  const args = ${JSON.stringify(args && typeof args === "object" ? args : {})};
  ${locatorResolverSource(locator)}
  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const isVisible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;
  };
  const isEnabled = (el) => {
    if (!el) return false;
    return !el.disabled && el.getAttribute("aria-disabled") !== "true";
  };

  const resolved = resolveLocator();
  if (!resolved.ok) return resolved;
  const elements = resolved.elements;
  const first = resolved.element;
  let value = null;

  if (kind === "count") {
    value = elements.length;
  } else if (kind === "allTextContents") {
    value = elements.map((el) => el.textContent || "");
  } else if (kind === "textContent") {
    value = first ? first.textContent : null;
  } else if (kind === "innerText") {
    value = first ? normalizeText(first.innerText || first.textContent || "") : "";
  } else if (kind === "getAttribute") {
    const name = typeof args.name === "string" ? args.name : "";
    value = first && name ? first.getAttribute(name) : null;
  } else if (kind === "isVisible") {
    value = isVisible(first);
  } else if (kind === "isEnabled") {
    value = isEnabled(first);
  } else if (kind === "boundingBox") {
    if (first) {
      const rect = first.getBoundingClientRect();
      value = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    }
  }

  return {
    ok: true,
    value,
    count: elements.length
  };
})()`;
}

function locatorMutationExpression(locator: any, kind: string, args: any) {
  return `(() => {
  const kind = ${JSON.stringify(kind)};
  const args = ${JSON.stringify(args && typeof args === "object" ? args : {})};
  ${locatorResolverSource(locator)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  if (!el) {
    return {
      ok: false,
      error: "Element target not found",
      count: resolved.count
    };
  }

  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });
  el.focus();

  if (kind === "setChecked") {
    if (!("checked" in el)) {
      return {
        ok: false,
        error: "Element is not checkable"
      };
    }

    el.checked = args.checked === true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  if (kind === "selectOption") {
    if (el.tagName.toLowerCase() !== "select") {
      return {
        ok: false,
        error: "Element is not a select"
      };
    }

    const rawValues = Array.isArray(args.values)
      ? args.values
      : Array.isArray(args.value)
        ? args.value
        : [args.value ?? args.values].filter((value) => value != null);
    const values = new Set(rawValues.map((value) => String(value)));

    for (const option of Array.from(el.options)) {
      option.selected = values.has(option.value) || values.has(option.label);
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  return {
    ok: false,
    error: "Unsupported locator mutation"
  };
})()`;
}

async function dispatchMouseClick(
  tabId: number,
  x: number,
  y: number,
  params: ActionParams = {}
) {
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

async function locateElementByRef(tabId: number, ref: string) {
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

async function focusAndClearElement(tabId: number, ref: string) {
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

async function getAccessibilityTree(tabId: number, maxNodes: number) {
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

async function getDomSnapshot(tabId: number) {
  return cdp(tabId, "DOMSnapshot.captureSnapshot", {
    computedStyles: []
  });
}

function summarizeAccessibilityNodes(nodes: ActionParams[], maxNodes: number) {
  return nodes
    .filter((node) => node && node.ignored !== true)
    .map((node) => ({
      role: primitiveOrUndefined(node.role),
      name: primitiveOrUndefined(node.name),
      value: primitiveOrUndefined(node.value),
      description: primitiveOrUndefined(node.description),
      backendDOMNodeId:
        typeof node.backendDOMNodeId === "number"
          ? node.backendDOMNodeId
          : undefined
    }))
    .filter((node) => node.role || node.name || node.value || node.description)
    .slice(0, Math.max(1, Math.min(maxNodes, 200)));
}

function summarizeDomSnapshot(snapshot: any) {
  const documents = Array.isArray(snapshot?.documents) ? snapshot.documents : [];
  const strings = Array.isArray(snapshot?.strings) ? snapshot.strings : [];
  const documentSummaries = documents.slice(0, 5).map((document) => {
    const nodes = document?.nodes && typeof document.nodes === "object"
      ? document.nodes
      : {};
    const layout = document?.layout && typeof document.layout === "object"
      ? document.layout
      : {};

    return {
      nodeCount: arrayLength(nodes.nodeName),
      layoutNodeCount: arrayLength(layout.nodeIndex),
      textValueCount: arrayLength(nodes.nodeValue),
      attributeNameCount: arrayLength(nodes.attributes)
    };
  });

  return {
    documentCount: documents.length,
    stringCount: strings.length,
    documents: documentSummaries
  };
}

function primitiveOrUndefined(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

async function viewportCenter(tabId: number) {
  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression: `(() => ({
      x: Math.round((window.visualViewport?.width ?? window.innerWidth) / 2),
      y: Math.round((window.visualViewport?.height ?? window.innerHeight) / 2)
    }))()`,
    returnByValue: true,
    awaitPromise: true
  });
  const value = readRuntimeValue(evaluated);

  if (
    !value ||
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y)
  ) {
    return {
      x: 0,
      y: 0
    };
  }

  return value;
}

async function showCursor(
  tabId: number,
  x: number,
  y: number,
  options: {
    animate?: boolean;
    phase?: CursorPhase;
    visible?: boolean;
  } = {}
) {
  const sessionId = sessionIdForTab(tabId);
  const turnId = activeActionContext?.actionId ?? null;
  const moveSequence = ++nextCursorMoveSequence;
  const state: CursorOverlayState = {
    moveSequence,
    phase: options.phase ?? "active",
    sessionId,
    turnId,
    updatedAt: Date.now(),
    visible: options.visible !== false,
    x,
    y
  };
  cursorOverlayStateByTab.set(tabId, state);

  safePostEvent({
    name: "cursorMove",
    sessionId,
    tabId,
    moveSequence,
    phase: state.phase,
    turnId,
    x,
    y
  });

  try {
    if (!(await prepareContentScript(tabId))) {
      return;
    }

    await chrome.tabs.sendMessage(tabId, {
      type: "AGENT_CURSOR",
      animate: options.animate !== false,
      moveSequence,
      phase: state.phase,
      sessionId,
      turnId,
      visible: state.visible,
      x,
      y
    });
  } catch {
    // Some pages cannot receive content scripts.
  }
}

async function showCursorActivity(tabId: number, phase: CursorPhase = "thinking") {
  const previous = cursorOverlayStateByTab.get(tabId);
  const point = previous
    ? { x: previous.x, y: previous.y }
    : await viewportCenter(tabId);

  await showCursor(tabId, point.x, point.y, {
    animate: false,
    phase,
    visible: true
  });
}

async function showHighlight(tabId: number, rect: ActionParams) {
  try {
    if (!(await prepareContentScript(tabId))) {
      return;
    }

    await chrome.tabs.sendMessage(tabId, {
      type: "AGENT_HIGHLIGHT",
      rect
    });
  } catch {
    // Visual feedback is best effort.
  }
}

async function showCursorClick(tabId: number, x: number, y: number) {
  try {
    if (!(await prepareContentScript(tabId))) {
      return;
    }

    await chrome.tabs.sendMessage(tabId, {
      type: "AGENT_CURSOR_CLICK",
      x,
      y
    });
  } catch {
    // Visual feedback is best effort.
  }
}

async function prepareContentScript(tabId: number): Promise<boolean> {
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
  } catch {
    return false;
  }

  return pingContentScript(tabId);
}

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "CONTENT_PING"
    });

    return response?.ok === true;
  } catch {
    return false;
  }
}

async function cdp(
  tabId: number,
  method: string,
  params: ActionParams = {},
  options: { timeoutMs?: number } = {}
): Promise<any> {
  return debuggerManager.send(tabId, method, params, options);
}

function waitForPageLoad(tabId: number, timeoutMs: number) {
  return waitForDebuggerEvent(tabId, "Page.loadEventFired", timeoutMs);
}

function waitForNavigationSettled(tabId: number, timeoutMs: number) {
  return waitForDebuggerEvents(
    tabId,
    ["Page.loadEventFired", "Page.navigatedWithinDocument"],
    timeoutMs
  );
}

function waitForDebuggerEvent(
  tabId: number,
  eventName: string,
  timeoutMs: number
): Promise<{ reason: string }> {
  return waitForDebuggerEvents(tabId, [eventName], timeoutMs);
}

function waitForDebuggerEvents(
  tabId: number,
  eventNames: string[],
  timeoutMs: number
): Promise<{ reason: string }> {
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

async function currentPageLocation(tabId: number) {
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

async function loadStateIsSatisfied(tabId: number, state: string) {
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

async function selectorState(tabId: number, selector: string) {
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

async function locatorState(tabId: number, locator: any) {
  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression: `(() => {
  ${locatorResolverSource(locator)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;

  if (!el) {
    return {
      ok: true,
      attached: false,
      visible: false,
      count: resolved.count,
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
    count: resolved.count,
    index: resolved.index,
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
    throw new Error(value?.error || `Invalid locator: ${locator.selector}`);
  }

  return value;
}

async function textState(
  tabId: number,
  options: { text: string; exact: boolean; caseSensitive: boolean }
) {
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

function selectorStateIsSatisfied(match: any, state: string) {
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

function textStateIsSatisfied(match: any, state: string) {
  const found = match?.found === true;
  return state === "hidden" ? !found : found;
}

function summarizeTab(tab: chrome.tabs.Tab) {
  const sessionId =
    typeof tab.id === "number" ? sessionIdForTab(tab.id) : null;

  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title,
    url: tab.url,
    active: tab.active,
    groupId: tab.groupId,
    sessionId,
    controlled: sessionId != null
  };
}

function listCapabilities() {
  const nativeAvailable = nativePort != null;

  return [
    browserCapability("browser.tabs", "List, create, select, and finalize controlled tabs.", true),
    browserCapability("browser.user.claimTab", "Claim the current or specified user tab.", true),
    browserCapability("browser.session.name", "Name the current browser automation session.", true),
    browserCapability("events.wait", "Wait for buffered browser events.", true),
    browserCapability("downloads", "List and wait for Chrome downloads.", true),
    browserCapability("dev.logs", "Read buffered console/log/runtime exception entries.", true),
    browserCapability("rawCdp", "Send raw Chrome DevTools Protocol commands.", true),
    browserCapability("clipboard", "Read and write browser clipboard content.", false, "not_implemented"),
    browserCapability("history", "Read user browsing history.", false, "not_implemented"),
    tabCapability("tab.navigation", "Navigate, reload, and read URL/title for tabs.", true),
    tabCapability("tab.cua", "Coordinate mouse, keyboard, and scroll interactions.", true),
    tabCapability("tab.domSnapshot", "Capture DOMSnapshot output through CDP.", true),
    tabCapability("tab.accessibility", "Read accessibility tree data through CDP.", true),
    tabCapability("tab.locator.css", "Use CSS selector based waits/actions.", true),
    tabCapability("tab.locator.semantic", "Use role/label/text/test-id locator engine.", true),
    tabCapability("tab.upload.locator", "Upload files through selector or locator targets.", true),
    tabCapability("tab.frameLocator", "Target nested frames with locator chains.", false, "not_implemented"),
    tabCapability("native.connected", "Native host connection is available.", nativeAvailable, nativeAvailable ? undefined : "native_disconnected")
  ];
}

function browserCapability(
  id: string,
  description: string,
  available: boolean,
  reason?: string
) {
  return {
    id,
    scope: "browser",
    description,
    available,
    reason
  };
}

function tabCapability(
  id: string,
  description: string,
  available: boolean,
  reason?: string
) {
  return {
    id,
    scope: "tab",
    description,
    available,
    reason
  };
}

function summarizeDownload(download: chrome.downloads.DownloadItem) {
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

function summarizeDownloadDelta(delta: chrome.downloads.DownloadDelta) {
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

async function findDownloads(params: ActionParams = {}) {
  const limit = Math.max(1, Math.min(Math.floor(numberOrDefault(params.limit, 50)), 500));
  const query: chrome.downloads.DownloadQuery = {
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

function downloadMatches(
  download: chrome.downloads.DownloadItem,
  params: ActionParams = {}
) {
  if (typeof params.id === "number" && download.id !== params.id) {
    return false;
  }

  if (isDownloadState(params.state) && download.state !== params.state) {
    return false;
  }

  if (
    typeof params.urlContains === "string" &&
    params.urlContains &&
    !String(download.finalUrl || download.url || "").includes(params.urlContains)
  ) {
    return false;
  }

  if (
    typeof params.filenameContains === "string" &&
    params.filenameContains &&
    !String(download.filename || "").includes(params.filenameContains)
  ) {
    return false;
  }

  if (
    typeof params.mimeContains === "string" &&
    params.mimeContains &&
    !String(download.mime || "").includes(params.mimeContains)
  ) {
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

function isDownloadState(state: any) {
  return state === "in_progress" || state === "interrupted" || state === "complete";
}

function normalizeDownloadWaitState(state: any) {
  if (state == null) {
    return "complete";
  }

  if (state === "any" || isDownloadState(state)) {
    return state;
  }

  throw new Error(`Unsupported download wait state: ${state}`);
}

function shouldBufferDebuggerEvent(method: string) {
  return [
    "Page.frameNavigated",
    "Page.navigatedWithinDocument",
    "Page.domContentEventFired",
    "Page.loadEventFired",
    "Page.javascriptDialogOpening",
    "Page.javascriptDialogClosed",
    "Runtime.consoleAPICalled",
    "Runtime.exceptionThrown",
    "Log.entryAdded"
  ].includes(method);
}

function summarizeDebuggerEvent(method: string, params: any) {
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

  if (
    method === "Page.domContentEventFired" ||
    method === "Page.loadEventFired"
  ) {
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
      exception:
        details.exception && typeof details.exception === "object"
          ? {
              description: truncateString(details.exception.description, 1000),
              className: details.exception.className
            }
          : undefined
    };
  }

  if (method === "Runtime.consoleAPICalled") {
    return {
      type: params.type,
      timestamp: params.timestamp,
      args: Array.isArray(params.args)
        ? params.args.map((arg) => summarizeRemoteObject(arg))
        : [],
      stackTrace: summarizeStackTrace(params.stackTrace)
    };
  }

  if (method === "Log.entryAdded") {
    const entry = params.entry || {};

    return {
      source: entry.source,
      level: entry.level,
      text: truncateString(entry.text, 1000),
      url: entry.url,
      lineNumber: entry.lineNumber,
      columnNumber: entry.columnNumber
    };
  }

  return {};
}

function summarizeRemoteObject(value: any) {
  if (!value || typeof value !== "object") {
    return value;
  }

  return {
    type: value.type,
    subtype: value.subtype,
    value:
      typeof value.value === "string"
        ? truncateString(value.value, 1000)
        : value.value,
    description: truncateString(value.description, 1000)
  };
}

function summarizeStackTrace(stackTrace: any) {
  if (!stackTrace || typeof stackTrace !== "object") {
    return undefined;
  }

  const callFrames = Array.isArray(stackTrace.callFrames)
    ? stackTrace.callFrames.slice(0, 5)
    : [];

  return {
    description: stackTrace.description,
    callFrames: callFrames.map((frame) => ({
      functionName: frame.functionName,
      url: frame.url,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber
    }))
  };
}

function summarizeFrame(frame: any) {
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

function sessionIdForTab(tabId: number | undefined) {
  if (typeof tabId !== "number") {
    return null;
  }

  return sessionManager.findSessionByTabId(tabId)?.sessionId ?? null;
}

function devLogFromEvent(event: ActionParams) {
  if (!event || event.name !== "cdpEvent") {
    return null;
  }

  const method = event.method;
  const params = event.params && typeof event.params === "object"
    ? event.params
    : {};

  if (method === "Runtime.consoleAPICalled") {
    const args = Array.isArray(params.args)
      ? params.args
          .map((arg) => {
            if (!arg || typeof arg !== "object") {
              return String(arg);
            }

            if ("value" in arg) {
              return String(arg.value);
            }

            return String(arg.description ?? arg.type ?? "");
          })
          .filter(Boolean)
      : [];

    return {
      sequence: event.sequence,
      time: event.time,
      sessionId: event.sessionId ?? null,
      tabId: event.tabId ?? null,
      source: "console",
      level: normalizeDevLogLevel(params.type),
      text: truncateString(args.join(" "), 1000),
      url: firstStackFrameUrl(params.stackTrace),
      lineNumber: firstStackFrameNumber(params.stackTrace, "lineNumber"),
      columnNumber: firstStackFrameNumber(params.stackTrace, "columnNumber")
    };
  }

  if (method === "Log.entryAdded") {
    return {
      sequence: event.sequence,
      time: event.time,
      sessionId: event.sessionId ?? null,
      tabId: event.tabId ?? null,
      source: "log",
      level: normalizeDevLogLevel(params.level),
      text: truncateString(params.text, 1000),
      url: params.url,
      lineNumber: params.lineNumber,
      columnNumber: params.columnNumber
    };
  }

  if (method === "Runtime.exceptionThrown") {
    return {
      sequence: event.sequence,
      time: event.time,
      sessionId: event.sessionId ?? null,
      tabId: event.tabId ?? null,
      source: "exception",
      level: "error",
      text: truncateString(
        params.text ||
          (params.exception && typeof params.exception === "object"
            ? params.exception.description
            : undefined),
        1000
      ),
      url: params.url,
      lineNumber: params.lineNumber,
      columnNumber: params.columnNumber
    };
  }

  return null;
}

function normalizeDevLogLevel(level: any) {
  if (level === "warning") {
    return "warning";
  }

  if (level === "warn") {
    return "warning";
  }

  if (level === "error" || level === "assert") {
    return "error";
  }

  if (level === "debug") {
    return "debug";
  }

  if (level === "info") {
    return "info";
  }

  return "log";
}

function firstStackFrameUrl(stackTrace: any) {
  const frame = Array.isArray(stackTrace?.callFrames)
    ? stackTrace.callFrames[0]
    : null;

  return typeof frame?.url === "string" ? frame.url : undefined;
}

function firstStackFrameNumber(stackTrace: any, key: string) {
  const frame = Array.isArray(stackTrace?.callFrames)
    ? stackTrace.callFrames[0]
    : null;
  const value = frame?.[key];

  return typeof value === "number" ? value : undefined;
}

function readRuntimeValue(evaluated: any) {
  if (evaluated.exceptionDetails) {
    throw new Error(JSON.stringify(evaluated.exceptionDetails));
  }

  return evaluated.result?.value;
}

function readAxValue(payload: any) {
  if (!payload || typeof payload !== "object" || !("value" in payload)) {
    return undefined;
  }

  return payload.value;
}

function normalizeKey(key: string) {
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

function normalizeMouseButton(button: any) {
  if (button == null) {
    return "left";
  }

  if (button === "left" || button === "middle" || button === "right") {
    return button;
  }

  throw new Error(`Unsupported mouse button: ${button}`);
}

function buttonToButtons(button: string) {
  if (button === "right") {
    return 2;
  }

  if (button === "middle") {
    return 4;
  }

  return 1;
}

function normalizeLoadState(state: any) {
  if (state == null) {
    return "load";
  }

  if (state === "load" || state === "domcontentloaded") {
    return state;
  }

  throw new Error(`Unsupported load state: ${state}`);
}

function normalizeSelectorWaitState(state: any) {
  if (state == null) {
    return "visible";
  }

  if (
    state === "attached" ||
    state === "visible" ||
    state === "hidden" ||
    state === "detached"
  ) {
    return state;
  }

  throw new Error(`Unsupported selector wait state: ${state}`);
}

function normalizeTextWaitState(state: any) {
  if (state == null) {
    return "present";
  }

  if (state === "present" || state === "hidden") {
    return state;
  }

  throw new Error(`Unsupported text wait state: ${state}`);
}

function normalizeUrlMatcher(params: ActionParams = {}) {
  const exact = typeof params.url === "string" && params.url.trim()
    ? params.url.trim()
    : null;
  const contains =
    typeof params.urlContains === "string" && params.urlContains.trim()
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
    } catch {
      throw new Error(`Invalid waitForUrl.params.urlRegex: ${regex}`);
    }
  }

  return {
    exact,
    contains,
    regex
  };
}

function urlMatches(url: string, matcher: ActionParams) {
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

function assertAllowedNavigationUrl(url: string) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only http/https URLs are allowed in MVP: ${url}`);
  }
}

function requireString(value: any, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function cssStringEscape(value: string) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function truncateString(value: any, maxLength: number) {
  if (typeof value !== "string") {
    return value;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function numberOrDefault(value: any, defaultValue: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : defaultValue;
}

function requireFiniteNumber(value: any, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }

  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
