/// <reference path="./action-validator.ts" />
/// <reference path="./debugger-manager.ts" />
/// <reference path="./event-buffer.ts" />
/// <reference path="./session-manager.ts" />

declare function importScripts(...urls: string[]): void;

importScripts(
  "action-validator.js",
  "debugger-manager.js",
  "event-buffer.js",
  "session-manager.js"
);

const HOST_NAME = "com.formax.browserhost";
const CDP_VERSION = "1.3";
const HEARTBEAT_ALARM = "formax-native-reconnect";
const CLIPBOARD_OFFSCREEN_URL = "clipboard-offscreen.html";
const EVENT_SNAPSHOT_STORAGE_KEY = "formax.agentBrowser.eventSnapshots.v1";
const FINALIZED_BADGE_STORAGE_KEY = "TAB_FAVICON_BADGES";
const PENDING_UPDATE_STORAGE_KEY = "formax.pendingUpdateVersion.v1";
const POLICY_STORAGE_KEY = "formax.browserPolicy.v1";
const DEFAULT_CDP_TIMEOUT_MS = 10000;
const MAX_EVENT_SNAPSHOTS = 50;
const MAX_EVENTS_PER_SESSION_SNAPSHOT = 200;
const FILE_CHOOSER_TTL_MS = 5 * 60 * 1000;
const MAX_FILE_CHOOSERS = 100;
const APPROVAL_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_APPROVALS = 100;
const BACKEND_REVISION = 5;
const MAX_PROFILE_HINT_LENGTH = 80;
const DESTRUCTIVE_BROWSER_ACTION_PATTERN = /\b(delete|remove|destroy|cancel|close\s+account|deactivate|terminate|drop)\b/i;
const EXTERNAL_SIDE_EFFECT_PATTERN = /\b(send|submit|post|publish|comment|reply|create|book|schedule|invite|save|update|confirm|pay|purchase|subscribe|unsubscribe)\b/i;
const PERMISSION_GRANT_PATTERN = /\b(allow|enable|grant|authorize|request|share|use|start|turn\s+on|access)\b/i;
const BROWSER_PERMISSION_TARGET_PATTERN = /\b(camera|webcam|microphone|\bmic\b|location|geolocation|notification|notify|screen|display|clipboard|account\s+access|login\s+access|extension\s+install|install\s+extension)\b/i;
const CAPTCHA_HANDOFF_PATTERN = /\b(captcha|re\s*captcha|hcaptcha|turnstile|i'?m not a robot|verify (that )?you are human|human verification)\b/i;
const SECURITY_INTERSTITIAL_PATTERN = /\b(your connection is not private|deceptive site ahead|malware|phishing|security warning|certificate error|err_cert_|unsafe site|dangerous site)\b/i;
const SECURITY_INTERSTITIAL_ACTION_PATTERN = /\b(advanced|proceed|continue|visit|ignore|accept|unsafe)\b/i;
const PAYWALL_BYPASS_PATTERN = /\b(bypass paywall|remove paywall|disable paywall|unlock (article|content) without (paying|subscription)|read without (paying|subscription)|continue without subscribing)\b/i;
const PASSWORD_CHANGE_ACTION_PATTERN = /\b(change|update|reset|save|submit|confirm)\b.{0,40}\b(password|passcode)\b|\b(password|passcode)\b.{0,40}\b(change|update|reset|save|submit|confirm)\b/i;
const PASSWORD_FINAL_BUTTON_PATTERN = /\b(change|update|reset|save|submit|confirm|continue)\b/i;
const SUPPORTED_ACTIONS = [
  "health",
  "reloadExtension",
  "getEvents",
  "clearEvents",
  "waitForEvent",
  "getDiagnostics",
  "getPolicy",
  "updatePolicy",
  "getPendingApprovals",
  "resolveApproval",
  "startSession",
  "nameSession",
  "openTabs",
  "claimTab",
  "getHistory",
  "clipboardReadText",
  "clipboardWriteText",
  "clipboardRead",
  "clipboardWrite",
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
  "elementInfo",
  "locatorQuery",
  "locatorAction",
  "locatorWait",
  "resolveFrame",
  "click",
  "drag",
  "moveMouse",
  "scroll",
  "typeText",
  "evaluate",
  "pressKey",
  "handleDialog",
  "screenshot",
  "waitForFileChooser",
  "setFileChooserFiles",
  "uploadFile",
  "downloadMedia",
  "attachTarget",
  "detachTarget",
  "cdp",
  "listTabs",
  "getTab",
  "listDownloads",
  "waitForDownload",
  "getDevLogs",
  "getCapabilities",
  "closeTab",
  "finalizeSession",
  "endTurn",
  "stopSession"
];

let nativePort = null;
let lastNativeError: string | null = null;

type ActionParams = Record<string, any>;
type CursorPhase =
  | "idle"
  | "active"
  | "thinking"
  | "handoff"
  | "deliverable"
  | "stopped"
  | "taken_over";
type FinalizedBadgePhase = "handoff" | "deliverable";
type EffectiveBadgePhase = "active" | FinalizedBadgePhase;
type BrowserPolicyAction =
  | "navigate"
  | "click"
  | "type"
  | "upload"
  | "download"
  | "evaluate"
  | "history"
  | "clipboard"
  | "rawCdp"
  | "permission"
  | "other";
type BrowserPolicyState = {
  sessionAllowedHosts: Record<string, string[]>;
  persistentAllowedHosts: string[];
  blockedHosts: string[];
};
type HostAccessVerdict = {
  allowed: boolean;
  requiresApproval: boolean;
  code: "allowed" | "requires_host_approval" | "host_blocked" | "invalid_url";
  host: string | null;
  scope: "session" | "persistent" | "blocked" | null;
  message: string;
};
type HostApprovalPromptDetails = {
  action: BrowserPolicyAction;
  approvalId: string;
  host: string;
  message: string;
  sessionId: string | null;
  tabId: number | null;
  suggestedDecisions: {
    allowForSession: {
      decision: "allow";
      host: string;
      sessionId: string;
    } | null;
    alwaysAllow: {
      decision: "always_allow";
      host: string;
    };
    deny: {
      decision: "deny";
      host: string;
    };
  };
};
type BrowserActionConfirmationDetails = {
  action: BrowserPolicyAction;
  confirmationId: string;
  host: string | null;
  message: string;
  reasons: string[];
  sessionId: string | null;
  tabId: number | null;
  target?: {
    label: string;
    text: string;
    tagName: string | null;
  };
  requiredParams: {
    confirmed: true;
    confirmationId: string;
  };
};
type BrowserOriginApprovalDetails = {
  action: BrowserPolicyAction;
  approvalId: string;
  host: string | null;
  message: string;
  reasons: string[];
  sessionId: string | null;
  tabId: number | null;
  subject?: ActionParams;
  requiredParams: {
    originApproved: true;
  };
};
type PendingApprovalRecord = {
  approvalId: string;
  kind: "host" | "confirmation" | "origin";
  status: "pending" | "approved" | "denied" | "expired";
  action: BrowserPolicyAction;
  host: string | null;
  sessionId: string | null;
  tabId: number | null;
  message: string;
  createdAt: number;
  expiresAt: number;
  reasons?: string[];
  subject?: ActionParams;
  target?: {
    label: string;
    text: string;
    tagName: string | null;
  };
  requiredParams?: ActionParams;
  suggestedDecisions?: ActionParams;
};
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
  turnId: string | null;
};
type ClaimTokenRecord = {
  expiresAt: number;
  tabId: number;
};
type FileChooserRecord = {
  id: string;
  createdAt: number;
  sessionId: string | null;
  tabId: number;
  fileChooser: ActionParams;
};
type CursorArrivalWaiter = {
  resolve: () => void;
  timeoutId: number;
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
const claimTokens = new Map<string, ClaimTokenRecord>();
const tabOpenedAt = new Map<number, number>();
const networkRequestsByTab = new Map<number, Set<string>>();
const cursorArrivalWaiters = new Map<string, CursorArrivalWaiter>();
const expectedDebuggerDetachTabs = new Set<number>();
const fileChoosers = new Map<string, FileChooserRecord>();
const pendingApprovals = new Map<string, PendingApprovalRecord>();
const approvalExpiryTimers = new Map<string, number>();
const finalizedBadgesByTab = new Map<number, FinalizedBadgePhase>();
const faviconDataUrlsByTab = new Map<number, { dataUrl: string; pageUrl: string }>();
let activeActionContext: ActionContext | null = null;
let nextCursorMoveSequence = 0;
let browserPolicyState = createDefaultBrowserPolicyState();
let browserPolicyLoaded = false;
let browserPolicyLoadPromise: Promise<void> | null = null;
let finalizedBadgesLoaded = false;
let finalizedBadgesLoadPromise: Promise<void> | null = null;
let finalizedBadgeStateQueue: Promise<void> = Promise.resolve();
let finalizedBadgePublicationQueue: Promise<void> = Promise.resolve();
let nativeDisconnectCleanup: Promise<void> | null = null;
let pendingUpdateVersion: string | null = null;
let pendingUpdateReloadInProgress = false;

registerTopLevelListeners();
connectNativeHost();
ensureReconnectAlarm();
void ensureBrowserPolicyLoaded();
void ensureFinalizedBadgesLoaded();
void restoreSessionFaviconBadges();
void maybeReloadForPendingUpdate("startup");

function registerTopLevelListeners() {
  chrome.runtime.onInstalled.addListener(() => {
    connectNativeHost();
    ensureReconnectAlarm();
    void maybeReloadForPendingUpdate("installed");
  });

  chrome.runtime.onStartup.addListener(() => {
    connectNativeHost();
    ensureReconnectAlarm();
    void maybeReloadForPendingUpdate("startup");
  });

  chrome.runtime.onUpdateAvailable.addListener((details) => {
    void handleExtensionUpdateAvailable(details);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) {
      connectNativeHost();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "POPUP_HEALTH") {
      void ensureBrowserPolicyLoaded().then(() => {
        void health().then((healthResult) => {
          sendResponse({
            ok: nativePort != null,
            health: healthResult
          });
        });
      });
      return true;
    }

    if (message?.type === "POPUP_PENDING_APPROVALS") {
      void getPendingApprovals({
        includeResolved: false,
        limit: approvalLimit(message.limit)
      }).then((result) => {
        sendResponse({
          ok: true,
          ...result
        });
      }).catch((error) => {
        sendResponse({
          ok: false,
          error: structuredError(error)
        });
      });
      return true;
    }

    if (message?.type === "POPUP_RESOLVE_APPROVAL") {
      void resolveApproval({
        approvalId: message.approvalId,
        decision: message.decision,
        policyDecision: message.policyDecision
      }).then((result) => {
        sendResponse({
          ok: true,
          ...result
        });
      }).catch((error) => {
        sendResponse({
          ok: false,
          error: structuredError(error)
        });
      });
      return true;
    }

    if (message?.type === "CONTENT_RESOLVE_APPROVAL") {
      void resolveApproval({
        approvalId: message.approvalId,
        decision: message.decision,
        policyDecision: message.policyDecision
      }).then((result) => {
        sendResponse({
          ok: true,
          ...result
        });
      }).catch((error) => {
        sendResponse({
          ok: false,
          error: structuredError(error)
        });
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
        resolveCursorArrivalWaiter(tabId, moveSequence);
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
    if (typeof source.tabId === "number") {
      networkRequestsByTab.delete(source.tabId);
      const wasExpected = expectedDebuggerDetachTabs.delete(source.tabId);
      if (!wasExpected && reason !== "target_closed") {
        void setPageVisualStatus(source.tabId, "taken_over", {
          reason,
          sessionId: sessionIdForTab(source.tabId)
        });
        safePostEvent({
          name: "userTakeover",
          sessionId: sessionIdForTab(source.tabId),
          tabId: source.tabId,
          reason
        });
      }
    }

    safePostEvent({
      name: "debuggerDetached",
      sessionId: sessionIdForTab(source.tabId),
      tabId: source.tabId ?? null,
      source,
      reason
    });
  });

  chrome.debugger.onEvent.addListener((source, method, params) => {
    trackNetworkDebuggerEvent(source, method, params);

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
    faviconDataUrlsByTab.delete(tabId);
    void forgetFinalizedBadge(tabId);
    debuggerManager.markTabRemoved(tabId);
    sessionManager.onTabRemoved(tabId);
    cursorOverlayStateByTab.delete(tabId);
    tabOpenedAt.delete(tabId);
    networkRequestsByTab.delete(tabId);
    clearCursorArrivalWaitersForTab(tabId);
  });

  chrome.tabs.onCreated.addListener((tab) => {
    if (typeof tab.id === "number") {
      tabOpenedAt.set(tab.id, Date.now());
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    void clearFinalizedBadge(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (
      changeInfo.url != null ||
      (typeof changeInfo.favIconUrl === "string" && !isFormaxFaviconBadgeUrl(changeInfo.favIconUrl))
    ) {
      faviconDataUrlsByTab.delete(tabId);
    }

    if (changeInfo.url != null || changeInfo.favIconUrl != null || changeInfo.status === "complete") {
      void republishFinalizedBadge(tabId);
    }
  });

  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    faviconDataUrlsByTab.delete(addedTabId);
    faviconDataUrlsByTab.delete(removedTabId);
    void replaceFinalizedBadge(addedTabId, removedTabId);
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      void clearFocusedWindowFinalizedBadge(windowId);
    }
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
          error: structuredError(error)
        });
      });
    });

    port.onDisconnect.addListener(() => {
      const lastError = chrome.runtime.lastError;
      lastNativeError = lastError?.message || "Native host disconnected";
      console.warn("Native host disconnected", lastNativeError);
      nativePort = null;
      safePostEvent({
        name: "nativeDisconnected",
        sessionId: null,
        tabId: null,
        reason: lastNativeError
      });
      void cleanupAfterNativeDisconnect(lastNativeError);
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
      error: structuredError(error)
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
  activeActionContext = {
    action,
    actionId,
    turnId: typeof params.turnId === "string" ? params.turnId : null
  };

  try {
    await sessionManager.initialize();
    await ensureBrowserPolicyLoaded();
    validateExtensionActionParams(action, params);
    const result = await dispatchActionRaw(action, params);
    const endedAt = Date.now();
    const meta = extractResultMetadata(result);
    await postBrowserActionAudit({
      action,
      actionId,
      params,
      result,
      status: "ok",
      startedAt,
      endedAt,
      resultCode: "ok"
    });

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
  } catch (error) {
    const endedAt = Date.now();
    const errorDetails = structuredError(error);
    await postBrowserActionAudit({
      action,
      actionId,
      params,
      status: "error",
      startedAt,
      endedAt,
      errorCode: errorDetails.code ?? "internal_error"
    });
    throw error;
  } finally {
    activeActionContext = previousContext;
  }
}

async function dispatchActionRaw(action: string, params: ActionParams) {
  switch (action) {
    case "health":
      return health(params);

    case "reloadExtension":
      return reloadExtension();

    case "getEvents":
      return getEvents(params);

    case "clearEvents":
      return clearEvents(params);

    case "waitForEvent":
      return waitForEvent(params);

    case "getDiagnostics":
      return getDiagnostics(params);

    case "getPolicy":
      return getPolicy(params);

    case "updatePolicy":
      return updatePolicy(params);

    case "getPendingApprovals":
      return getPendingApprovals(params);

    case "resolveApproval":
      return resolveApproval(params);

    case "startSession":
      return startSession(params);

    case "nameSession":
      return nameSession(params);

    case "openTabs":
      return openTabs(params);

    case "claimTab":
      return claimTab(params);

    case "getHistory":
      return getHistory(params);

    case "clipboardReadText":
      return clipboardReadText(params);

    case "clipboardWriteText":
      return clipboardWriteText(params);

    case "clipboardRead":
      return clipboardRead(params);

    case "clipboardWrite":
      return clipboardWrite(params);

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

    case "elementInfo":
      return elementInfo(params);

    case "locatorQuery":
      return locatorQuery(params);

    case "locatorAction":
      return locatorAction(params);

    case "locatorWait":
      return locatorWait(params);

    case "resolveFrame":
      return resolveFrame(params);

    case "click":
      return click(params);

    case "drag":
      return drag(params);

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

    case "waitForFileChooser":
      return waitForFileChooser(params);

    case "setFileChooserFiles":
      return setFileChooserFiles(params);

    case "uploadFile":
      return uploadFile(params);

    case "downloadMedia":
      return downloadMedia(params);

    case "attachTarget":
      return attachTarget(params);

    case "detachTarget":
      return detachTarget(params);

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

    case "endTurn":
      return endTurn(params);

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

function extractParamsMetadata(params: ActionParams = {}) {
  return {
    sessionId: typeof params.sessionId === "string" ? params.sessionId : null,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    turnId: typeof params.turnId === "string" ? params.turnId : null,
    url: typeof params.url === "string" ? params.url : null,
    confirmed: params.confirmed === true,
    originApproved: params.originApproved === true,
    confirmationId:
      typeof params.confirmationId === "string" && params.confirmationId.trim()
        ? truncateAndRedactString(params.confirmationId.trim(), 120)
        : null
  };
}

async function postBrowserActionAudit(args: {
  action: string;
  actionId: string;
  params: ActionParams;
  result?: unknown;
  status: "ok" | "error";
  startedAt: number;
  endedAt: number;
  resultCode?: string;
  errorCode?: string;
}) {
  try {
    const paramsMeta = extractParamsMetadata(args.params);
    const resultMeta = extractResultMetadata(args.result);
    const sessionId = resultMeta.sessionId ?? paramsMeta.sessionId;
    const tabId = resultMeta.tabId ?? paramsMeta.tabId;
    const origin = await originForActionAudit(paramsMeta.url, tabId);

    safePostEvent({
      name: "browserActionAudit",
      auditKind: "action",
      category: actionAuditCategory(args.action),
      action: args.action,
      actionId: args.actionId,
      sessionId,
      turnId: paramsMeta.turnId,
      tabId,
      origin,
      status: args.status,
      resultCode: args.resultCode ?? null,
      errorCode: args.errorCode ?? null,
      confirmed: paramsMeta.confirmed,
      originApproved: paramsMeta.originApproved,
      confirmationId: paramsMeta.confirmationId,
      timing: {
        startedAt: args.startedAt,
        endedAt: args.endedAt,
        durationMs: args.endedAt - args.startedAt
      }
    });
  } catch (error) {
    console.warn("Failed to post browser action audit", error);
  }
}

async function originForActionAudit(url: string | null, tabId: number | null) {
  if (url) {
    return originForAudit(url);
  }

  if (typeof tabId !== "number") {
    return null;
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return originForAudit(tab?.url ?? null);
}

function actionAuditCategory(action: string) {
  if (["health", "getCapabilities", "reloadExtension"].includes(action)) return "runtime";
  if (["startSession", "nameSession", "createTab", "switchTab", "claimTab", "openTabs", "closeTab", "finalizeSession", "endTurn", "stopSession", "listTabs", "getTab"].includes(action)) return "session";
  if (["getEvents", "clearEvents", "waitForEvent", "getDevLogs"].includes(action)) return "diagnostic";
  if (["getPolicy", "updatePolicy"].includes(action)) return "policy";
  if (["openUrl", "goBack", "goForward", "reload", "waitForLoadState", "waitForUrl"].includes(action)) return "navigation";
  if (["waitForSelector", "waitForText", "observe", "elementInfo", "locatorQuery", "locatorWait", "resolveFrame", "screenshot"].includes(action)) return "inspection";
  if (["locatorAction", "click", "drag", "moveMouse", "scroll", "typeText", "pressKey", "handleDialog"].includes(action)) return "interaction";
  if (["evaluate", "cdp"].includes(action)) return "diagnostic";
  if (["waitForFileChooser", "setFileChooserFiles", "uploadFile"].includes(action)) return "file";
  if (["downloadMedia", "listDownloads", "waitForDownload"].includes(action)) return "download";
  if (["getHistory"].includes(action)) return "history";
  if (["clipboardReadText", "clipboardWriteText", "clipboardRead", "clipboardWrite"].includes(action)) return "clipboard";
  return "unknown";
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

function structuredError(error: any) {
  const internalMessage = redactSecretPatterns(stringifyError(error));
  const explicitCode =
    error &&
    typeof error === "object" &&
    typeof error.code === "string" &&
    /^[a-z][a-z0-9_]+$/.test(error.code)
      ? error.code
      : null;
  const code = explicitCode ?? errorCodeForMessage(internalMessage);
  const details =
    error && typeof error === "object"
      ? sanitizeStructuredErrorDetails(error.details)
      : {};

  return {
    code,
    message: userFacingErrorMessage(code, internalMessage),
    details: {
      ...details,
      internalMessage
    }
  };
}

function sanitizeStructuredErrorDetails(value: unknown, depth = 0): ActionParams {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) {
    return {};
  }

  const result: ActionParams = {};
  for (const [key, item] of Object.entries(value as ActionParams)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || key === "internalMessage") {
      continue;
    }

    if (item == null || typeof item === "boolean" || typeof item === "number") {
      result[key] = item;
    } else if (typeof item === "string") {
      result[key] = truncateAndRedactString(item, 240);
    } else if (Array.isArray(item)) {
      result[key] = item.slice(0, 20).map((entry) =>
        typeof entry === "string" ? truncateAndRedactString(entry, 160) : entry
      );
    } else if (typeof item === "object") {
      result[key] = sanitizeStructuredErrorDetails(item, depth + 1);
    }
  }

  return result;
}

function errorCodeForMessage(message: string) {
  const explicitCode = message.match(/^([a-z][a-z0-9_]+):\s+/)?.[1];
  if (explicitCode) {
    return explicitCode;
  }

  if (message.includes("Unknown action")) {
    return "unknown_action";
  }

  if (message.includes("requires approval")) {
    return "requires_host_approval";
  }

  if (message.includes("blocked by policy")) {
    return "host_blocked";
  }

  if (message.includes("confirmation_required")) {
    return "confirmation_required";
  }

  if (message.includes("origin_approval_required")) {
    return "origin_approval_required";
  }

  if (message.includes("user_handoff_required")) {
    return "user_handoff_required";
  }

  if (message.includes("must be") || message.includes("requires")) {
    return "invalid_params";
  }

  return "internal_error";
}

function userFacingErrorMessage(code: string, message: string) {
  switch (code) {
    case "unknown_action":
      return "The requested browser action is not supported by this extension runtime.";
    case "requires_host_approval":
      return "This website requires approval before the browser action can continue.";
    case "host_blocked":
      return "This website is blocked by the current browser policy.";
    case "confirmation_required":
      return "This browser action requires explicit user confirmation.";
    case "origin_approval_required":
      return "Raw browser diagnostics require origin approval before continuing.";
    case "user_handoff_required":
      return "This browser action must be handed off to the user.";
    case "strict_mode_violation":
      return "The locator matched an unexpected number of elements.";
    case "locator_not_found":
      return "The locator did not match an element.";
    case "locator_actionability":
      return "The locator matched an element, but it was not ready for the requested action.";
    case "invalid_params":
      return message.length <= 180 ? message : "The browser action parameters are invalid.";
    case "internal_error":
    default:
      return "The browser action failed. Check structured error details or diagnostics for more information.";
  }
}

async function health(params: ActionParams = {}) {
  const permissionStatus = await chromePermissionStatus();
  const fileUrlAccess = await chromeFileUrlAccessStatus();
  const nativeManifest = nativeManifestHealth(params.nativeDiagnostics);
  const profile = browserProfileMetadata(params.nativeDiagnostics);

  return {
    ok: true,
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    nativeConnected: nativePort != null,
    lastNativeError,
    sessions: sessionManager.serializeAll(),
    policy: cloneBrowserPolicyState(browserPolicyState),
    extensionInstanceId: sessionManager.getExtensionInstanceId(),
    attachedTabs: debuggerManager.listAttachedTabs(),
    attachedTargets: debuggerManager.listAttachedTargets(),
    supportedActions: SUPPORTED_ACTIONS,
    backendRevision: BACKEND_REVISION,
    profile,
    permissions: permissionStatus,
    fileUrlAccess,
    nativeManifest
  };
}

function nativeManifestHealth(value: unknown) {
  const manifest = normalizeNativeManifestDiagnostics(value);
  const extensionOrigin = `chrome-extension://${chrome.runtime.id}/`;
  const expectedOrigin = manifest.expectedOrigin;

  return {
    ...manifest,
    extensionOrigin,
    originMatchesExtensionId:
      typeof expectedOrigin === "string" && expectedOrigin === extensionOrigin
  };
}

function browserProfileMetadata(value: unknown) {
  const diagnostics = value && typeof value === "object" && !Array.isArray(value)
    ? value as ActionParams
    : {};
  const activeProfileName = firstSafeProfileHint(
    diagnostics.activeProfileName,
    diagnostics.profileName,
    diagnostics.profile
  );
  const activeProfileId = firstSafeProfileHint(
    diagnostics.activeProfileId,
    diagnostics.profileId,
    diagnostics.profileDirectory
  );
  const lastUsedProfileHint = firstSafeProfileHint(
    diagnostics.lastUsedProfileHint,
    diagnostics.lastUsedProfileName,
    diagnostics.lastUsedProfile
  );

  return {
    activeProfileName,
    activeProfileId,
    activeProfileSource:
      activeProfileName || activeProfileId ? "native_diagnostics" : "unavailable",
    lastUsedProfileHint,
    lastUsedProfileSource: lastUsedProfileHint ? "native_diagnostics" : "unavailable",
    incognito: (chrome.extension as any)?.inIncognitoContext === true,
    extensionInstanceId: sessionManager.getExtensionInstanceId(),
    readsProfileFiles: false
  };
}

function firstSafeProfileHint(...values: unknown[]) {
  for (const value of values) {
    const safe = safeProfileHint(value);
    if (safe) return safe;
  }

  return null;
}

function safeProfileHint(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PROFILE_HINT_LENGTH) return null;
  if (/[\\/]/.test(trimmed)) return null;

  return trimmed;
}

async function chromePermissionStatus() {
  const manifest = chrome.runtime.getManifest();
  const required = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission): permission is string => typeof permission === "string")
    : [];
  const hostPermissions = Array.isArray(manifest.host_permissions)
    ? manifest.host_permissions.filter((permission): permission is string => typeof permission === "string")
    : [];

  try {
    const granted = required.length === 0
      ? true
      : await chrome.permissions.contains({ permissions: required as chrome.runtime.ManifestPermissions[] });
    const hostsGranted = hostPermissions.length === 0
      ? true
      : await chrome.permissions.contains({ origins: hostPermissions });

    return {
      required,
      granted,
      missing: granted ? [] : required,
      hostPermissions,
      hostPermissionsGranted: hostsGranted,
      missingHostPermissions: hostsGranted ? [] : hostPermissions
    };
  } catch (error) {
    return {
      required,
      granted: false,
      missing: required,
      hostPermissions,
      hostPermissionsGranted: false,
      missingHostPermissions: hostPermissions,
      error: stringifyError(error)
    };
  }
}

async function chromeFileUrlAccessStatus() {
  const extensionApi = chrome.extension as any;

  if (!extensionApi || typeof extensionApi.isAllowedFileSchemeAccess !== "function") {
    return {
      detectable: false,
      allowed: null,
      error: "chrome.extension.isAllowedFileSchemeAccess is unavailable"
    };
  }

  try {
    const allowed = await new Promise<boolean>((resolve) => {
      extensionApi.isAllowedFileSchemeAccess((value: boolean) => resolve(Boolean(value)));
    });

    return {
      detectable: true,
      allowed
    };
  } catch (error) {
    return {
      detectable: true,
      allowed: null,
      error: stringifyError(error)
    };
  }
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

async function handleExtensionUpdateAvailable(details: { version?: string }) {
  pendingUpdateVersion =
    typeof details.version === "string" && details.version.trim()
      ? details.version.trim()
      : "unknown";
  await storageSessionSet(PENDING_UPDATE_STORAGE_KEY, pendingUpdateVersion);
  safePostEvent({
    name: "extensionUpdateAvailable",
    sessionId: null,
    tabId: null,
    version: pendingUpdateVersion
  });
  await maybeReloadForPendingUpdate("updateAvailable");
}

async function maybeReloadForPendingUpdate(reason: string) {
  if (pendingUpdateReloadInProgress) {
    return;
  }

  await sessionManager.initialize();

  if (pendingUpdateVersion == null) {
    const stored = await storageSessionGet(PENDING_UPDATE_STORAGE_KEY);
    pendingUpdateVersion =
      typeof stored === "string" && stored.trim() ? stored.trim() : null;
  }

  if (pendingUpdateVersion == null) {
    return;
  }

  const currentVersion = chrome.runtime.getManifest().version;

  if (pendingUpdateVersion === currentVersion) {
    pendingUpdateVersion = null;
    await storageSessionRemove(PENDING_UPDATE_STORAGE_KEY);
    return;
  }

  if (browserControlIsInUseForUpdate()) {
    safePostEvent({
      name: "extensionUpdateDeferred",
      sessionId: null,
      tabId: null,
      reason,
      version: pendingUpdateVersion,
      activeLeaseCount: activeControlledLeaseCount(),
      attachedTabCount: debuggerManager.listAttachedTabs().length,
      attachedTargetCount: debuggerManager.listAttachedTargets().length,
      cursorWaiterCount: cursorArrivalWaiters.size
    });
    return;
  }

  pendingUpdateReloadInProgress = true;
  const version = pendingUpdateVersion;
  pendingUpdateVersion = null;
  await storageSessionRemove(PENDING_UPDATE_STORAGE_KEY);
  safePostEvent({
    name: "extensionUpdateReloading",
    sessionId: null,
    tabId: null,
    reason,
    version
  });
  setTimeout(() => {
    chrome.runtime.reload();
  }, 50);
}

function browserControlIsInUseForUpdate() {
  return (
    activeControlledLeaseCount() > 0 ||
    debuggerManager.listAttachedTabs().length > 0 ||
    debuggerManager.listAttachedTargets().length > 0 ||
    cursorArrivalWaiters.size > 0 ||
    nativeDisconnectCleanup != null
  );
}

function activeControlledLeaseCount() {
  let count = 0;

  for (const session of sessionManager.listSessions()) {
    if (session.status !== "active") {
      continue;
    }

    count += sessionManager.getSessionLeases(session.sessionId)
      .filter((lease) => lease.state === "active").length;
  }

  return count;
}

async function getEvents(params: ActionParams = {}) {
  const result: ActionParams = {
    events: eventBuffer.list(params)
  };

  if (params.includeSnapshots === true) {
    result.snapshots = await listEventSnapshots(params);
  }

  return result;
}

async function clearEvents(params: ActionParams = {}) {
  const cleared = eventBuffer.clear(params);
  const clearedSnapshots = params.includeSnapshots === true
    ? await clearEventSnapshots(params)
    : 0;

  return {
    cleared,
    clearedSnapshots
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

async function getDiagnostics(params: ActionParams = {}) {
  const eventLimit = normalizeDiagnosticsLimit(params.eventLimit, 100, 500);
  const devLogLimit = normalizeDiagnosticsLimit(params.devLogLimit, 100, 500);
  const healthSnapshot = await health(params);
  const eventResult = await getEvents({
    sessionId: params.sessionId,
    tabId: params.tabId,
    limit: eventLimit,
    includeSnapshots: params.includeSnapshots === true,
    snapshotLimit: params.includeSnapshots === true ? 10 : undefined
  });
  const devLogs = getDevLogs({
    sessionId: params.sessionId,
    tabId: params.tabId,
    limit: devLogLimit
  });

  return {
    health: healthSnapshot,
    events: eventResult.events,
    eventSnapshots: eventResult.snapshots,
    devLogs: devLogs.logs,
    activeSessions: healthSnapshot.sessions,
    attachedTabs: healthSnapshot.attachedTabs,
    attachedTargets: healthSnapshot.attachedTargets,
    nativeManifest: healthSnapshot.nativeManifest ?? normalizeNativeManifestDiagnostics(params.nativeDiagnostics),
    extension: {
      id: healthSnapshot.extensionId,
      version: healthSnapshot.version,
      backendRevision: healthSnapshot.backendRevision
    }
  };
}

function normalizeDiagnosticsLimit(value: unknown, fallback: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(value), max));
}

function normalizeNativeManifestDiagnostics(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as ActionParams
    : {};
  return {
    path: typeof source.manifestPath === "string" ? source.manifestPath : null,
    expectedOrigin: typeof source.expectedOrigin === "string" ? source.expectedOrigin : null,
    hostName: typeof source.hostName === "string" ? source.hostName : null,
    extensionId: typeof source.extensionId === "string" ? source.extensionId : null
  };
}

async function persistSessionEventSnapshot(
  sessionId: string,
  reason: string
) {
  const events = eventBuffer.list({
    sessionId,
    limit: MAX_EVENTS_PER_SESSION_SNAPSHOT
  });

  if (events.length === 0) {
    return null;
  }

  const snapshot = {
    version: 1,
    sessionId,
    reason,
    createdAt: Date.now(),
    eventCount: events.length,
    firstSequence: events[0]?.sequence ?? null,
    lastSequence: events.at(-1)?.sequence ?? null,
    events
  };
  const snapshots = await loadEventSnapshots();
  snapshots.push(snapshot);
  await saveEventSnapshots(snapshots.slice(-MAX_EVENT_SNAPSHOTS));
  return snapshot;
}

async function listEventSnapshots(params: ActionParams = {}) {
  const limit = normalizeEventSnapshotLimit(params.snapshotLimit);
  let snapshots = await loadEventSnapshots();

  if (typeof params.sessionId === "string" && params.sessionId.trim()) {
    const sessionId = params.sessionId.trim();
    snapshots = snapshots.filter((snapshot) => snapshot.sessionId === sessionId);
  }

  if (typeof params.sinceSequence === "number") {
    snapshots = snapshots.filter((snapshot) =>
      typeof snapshot.lastSequence === "number" &&
      snapshot.lastSequence > params.sinceSequence
    );
  }

  if (typeof params.name === "string" && params.name.trim()) {
    const name = params.name.trim();
    snapshots = snapshots
      .map((snapshot) => ({
        ...snapshot,
        events: snapshot.events.filter((event: ActionParams) => event.name === name)
      }))
      .filter((snapshot) => snapshot.events.length > 0)
      .map((snapshot) => ({
        ...snapshot,
        eventCount: snapshot.events.length,
        firstSequence: snapshot.events[0]?.sequence ?? null,
        lastSequence: snapshot.events.at(-1)?.sequence ?? null
      }));
  }

  return snapshots.slice(-limit);
}

async function clearEventSnapshots(params: ActionParams = {}) {
  const snapshots = await loadEventSnapshots();
  const kept = snapshots.filter((snapshot) => !eventSnapshotMatches(snapshot, params));
  const cleared = snapshots.length - kept.length;

  if (cleared > 0) {
    await saveEventSnapshots(kept);
  }

  return cleared;
}

function eventSnapshotMatches(snapshot: ActionParams, params: ActionParams = {}) {
  if (typeof params.sessionId === "string" && params.sessionId.trim() && snapshot.sessionId !== params.sessionId.trim()) {
    return false;
  }

  if (
    typeof params.sinceSequence === "number" &&
    (
      typeof snapshot.lastSequence !== "number" ||
      snapshot.lastSequence <= params.sinceSequence
    )
  ) {
    return false;
  }

  if (typeof params.name === "string" && params.name.trim()) {
    const name = params.name.trim();
    return Array.isArray(snapshot.events) && snapshot.events.some((event: ActionParams) => event.name === name);
  }

  return true;
}

async function loadEventSnapshots() {
  const stored = await storageSessionGet(EVENT_SNAPSHOT_STORAGE_KEY);
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored
    .filter((snapshot) => snapshot && typeof snapshot === "object" && !Array.isArray(snapshot))
    .map((snapshot) => snapshot as ActionParams)
    .filter((snapshot) => typeof snapshot.sessionId === "string" && Array.isArray(snapshot.events))
    .slice(-MAX_EVENT_SNAPSHOTS);
}

async function saveEventSnapshots(snapshots: ActionParams[]) {
  await storageSessionSet(EVENT_SNAPSHOT_STORAGE_KEY, snapshots.slice(-MAX_EVENT_SNAPSHOTS));
}

function normalizeEventSnapshotLimit(limit: unknown) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return MAX_EVENT_SNAPSHOTS;
  }

  return Math.max(1, Math.min(Math.floor(limit), MAX_EVENT_SNAPSHOTS));
}

function summarizeEventSnapshot(snapshot: ActionParams | null) {
  if (!snapshot) {
    return null;
  }

  return {
    version: snapshot.version,
    sessionId: snapshot.sessionId,
    reason: snapshot.reason,
    createdAt: snapshot.createdAt,
    eventCount: snapshot.eventCount,
    firstSequence: snapshot.firstSequence,
    lastSequence: snapshot.lastSequence
  };
}

async function getPolicy(params: ActionParams = {}) {
  await ensureBrowserPolicyLoaded();

  return {
    policy: cloneBrowserPolicyState(browserPolicyState, params.sessionId)
  };
}

async function updatePolicy(params: ActionParams = {}) {
  await ensureBrowserPolicyLoaded();

  if (params.reset === true) {
    browserPolicyState = createDefaultBrowserPolicyState();
    await persistBrowserPolicyState();
    return {
      policy: cloneBrowserPolicyState(browserPolicyState, params.sessionId)
    };
  }

  const decision = normalizePolicyDecision(params.decision);
  const host = normalizePolicyHost(params.host ?? params.url);

  if (!host) {
    throw new Error("updatePolicy.params requires a valid http/https host or URL");
  }

  applyHostAccessDecision(browserPolicyState, {
    decision,
    host,
    sessionId: params.sessionId
  });
  await persistBrowserPolicyState();

  safePostEvent({
    name: "policyUpdated",
    sessionId: typeof params.sessionId === "string" ? params.sessionId : null,
    host,
    decision
  });

  return {
    policy: cloneBrowserPolicyState(browserPolicyState, params.sessionId)
  };
}

function approvalLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return MAX_PENDING_APPROVALS;
  }

  return Math.max(1, Math.min(Math.floor(value), MAX_PENDING_APPROVALS));
}

function prunePendingApprovals() {
  const now = Date.now();

  for (const approval of pendingApprovals.values()) {
    if (approval.status === "pending" && approval.expiresAt <= now) {
      expirePendingApproval(approval.approvalId);
    }
  }

  while (pendingApprovals.size > MAX_PENDING_APPROVALS) {
    const oldest = Array.from(pendingApprovals.values())
      .sort((left, right) => left.createdAt - right.createdAt)[0];
    if (!oldest) break;
    deletePendingApproval(oldest);
  }
}

function scheduleApprovalExpiry(approval: PendingApprovalRecord) {
  clearApprovalExpiryTimer(approval.approvalId);
  if (approval.status !== "pending") {
    return;
  }

  const timeoutId = self.setTimeout(() => {
    expirePendingApproval(approval.approvalId);
  }, Math.max(0, approval.expiresAt - Date.now()));
  approvalExpiryTimers.set(approval.approvalId, timeoutId);
}

function clearApprovalExpiryTimer(approvalId: string) {
  const timeoutId = approvalExpiryTimers.get(approvalId);
  if (timeoutId == null) {
    return;
  }

  self.clearTimeout(timeoutId);
  approvalExpiryTimers.delete(approvalId);
}

function expirePendingApproval(approvalId: string) {
  const approval = pendingApprovals.get(approvalId);
  if (!approval || approval.status !== "pending") {
    clearApprovalExpiryTimer(approvalId);
    return;
  }

  if (approval.expiresAt > Date.now()) {
    scheduleApprovalExpiry(approval);
    return;
  }

  approval.status = "expired";
  clearApprovalExpiryTimer(approval.approvalId);
  void clearPendingApprovalFromTab(approval);
}

function deletePendingApproval(approval: PendingApprovalRecord) {
  clearApprovalExpiryTimer(approval.approvalId);
  pendingApprovals.delete(approval.approvalId);
  void clearPendingApprovalFromTab(approval);
}

function sanitizePendingApproval(approval: PendingApprovalRecord): ActionParams {
  return {
    approvalId: approval.approvalId,
    kind: approval.kind,
    status: approval.status,
    action: approval.action,
    host: approval.host,
    sessionId: approval.sessionId,
    tabId: approval.tabId,
    message: approval.message,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
    ...(approval.reasons ? { reasons: approval.reasons } : {}),
    ...(approval.subject ? { subject: approval.subject } : {}),
    ...(approval.target ? { target: approval.target } : {}),
    ...(approval.requiredParams ? { requiredParams: approval.requiredParams } : {}),
    ...(approval.suggestedDecisions ? { suggestedDecisions: approval.suggestedDecisions } : {})
  };
}

function registerPendingApproval(approval: Omit<PendingApprovalRecord, "status" | "createdAt" | "expiresAt">) {
  prunePendingApprovals();
  const now = Date.now();
  const existing = pendingApprovals.get(approval.approvalId);
  const record: PendingApprovalRecord = {
    ...approval,
    status: "pending",
    createdAt: existing?.createdAt ?? now,
    expiresAt: now + APPROVAL_TTL_MS
  };
  pendingApprovals.set(record.approvalId, record);
  scheduleApprovalExpiry(record);
  void publishPendingApprovalToTab(record);
  return record;
}

async function publishPendingApprovalToTab(approval: PendingApprovalRecord) {
  if (approval.status !== "pending" || typeof approval.tabId !== "number") {
    return;
  }

  try {
    if (!(await prepareContentScript(approval.tabId))) {
      return;
    }

    await withChromeMessageTimeout(
      chrome.tabs.sendMessage(approval.tabId, {
        type: "AGENT_APPROVAL_REQUEST",
        approval: sanitizePendingApproval(approval)
      }),
      250
    );
  } catch {
    // Approval remains available through the SDK and popup when the page cannot host UI.
  }
}

async function clearPendingApprovalFromTab(approval: PendingApprovalRecord) {
  if (typeof approval.tabId !== "number") {
    return;
  }

  try {
    if (!(await prepareContentScript(approval.tabId))) {
      return;
    }

    await withChromeMessageTimeout(
      chrome.tabs.sendMessage(approval.tabId, {
        type: "AGENT_APPROVAL_RESOLVED",
        approvalId: approval.approvalId,
        status: approval.status
      }),
      250
    );
  } catch {
    // Best-effort cleanup; stale in-page UI cannot affect the approval registry.
  }
}

async function getPendingApprovals(params: ActionParams = {}) {
  prunePendingApprovals();
  const sessionId = typeof params.sessionId === "string" && params.sessionId.trim()
    ? params.sessionId.trim()
    : null;
  const kind = ["host", "confirmation", "origin"].includes(params.kind)
    ? params.kind
    : null;
  const includeResolved = params.includeResolved === true;
  const approvals = Array.from(pendingApprovals.values())
    .filter((approval) => includeResolved || approval.status === "pending")
    .filter((approval) => !sessionId || approval.sessionId === sessionId)
    .filter((approval) => !kind || approval.kind === kind)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, approvalLimit(params.limit))
    .map(sanitizePendingApproval);

  return { approvals };
}

async function resolveApproval(params: ActionParams = {}) {
  prunePendingApprovals();
  const approvalId = requireString(params.approvalId, "resolveApproval.params.approvalId");
  const decision = requireString(params.decision, "resolveApproval.params.decision");
  if (decision !== "approve" && decision !== "deny") {
    throw new Error("resolveApproval.params.decision must be approve or deny");
  }

  const approval = pendingApprovals.get(approvalId);
  if (!approval) {
    throw new Error(`resolveApproval.params.approvalId not found: ${approvalId}`);
  }

  if (approval.status !== "pending") {
    return {
      approval: sanitizePendingApproval(approval),
      ...(approval.requiredParams ? { requiredParams: approval.requiredParams } : {})
    };
  }

  approval.status = decision === "approve" ? "approved" : "denied";
  clearApprovalExpiryTimer(approval.approvalId);
  let policy: BrowserPolicyState | undefined;
  let requiredParams = approval.requiredParams;

  if (approval.kind === "host") {
    await ensureBrowserPolicyLoaded();
    const policyDecision = decision === "deny"
      ? "deny"
      : normalizePolicyDecision(params.policyDecision ?? (approval.sessionId ? "allow" : "always_allow"));
    if (approval.host) {
      applyHostAccessDecision(browserPolicyState, {
        decision: policyDecision,
        host: approval.host,
        sessionId: typeof params.sessionId === "string" && params.sessionId.trim()
          ? params.sessionId.trim()
          : approval.sessionId ?? undefined
      });
      await persistBrowserPolicyState();
      policy = cloneBrowserPolicyState(browserPolicyState, approval.sessionId ?? params.sessionId);
    }
    requiredParams = {};
  }

  safePostEvent({
    name: "approvalResolved",
    approvalId: approval.approvalId,
    kind: approval.kind,
    status: approval.status,
    action: approval.action,
    host: approval.host,
    sessionId: approval.sessionId,
    tabId: approval.tabId,
    decision
  });
  void clearPendingApprovalFromTab(approval);

  return {
    approval: sanitizePendingApproval(approval),
    ...(requiredParams ? { requiredParams } : {}),
    ...(policy ? { policy } : {})
  };
}

async function startSession(params: ActionParams = {}) {
  if (typeof params.initialUrl === "string" && params.initialUrl.trim()) {
    await assertBrowserPolicyForUrl("navigate", params.initialUrl, params.sessionId, params);
  }

  const session = await sessionManager.startSession(params);

  if (typeof session.activeTabId === "number") {
    await debuggerManager.attachTab(session.activeTabId);
  }
  scheduleSessionFaviconBadges(session.sessionId);

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
  const claimParams = {
    ...params,
    tabId: resolveClaimedTabId(params)
  };
  const { session, tab } = await sessionManager.claimTab(claimParams);
  await debuggerManager.attachTab(tab.id);
  scheduleSessionFaviconBadges(session.sessionId);

  return sessionManager.serializeSession(session);
}

async function createTab(params: ActionParams = {}) {
  if (typeof params.url === "string" && params.url.trim()) {
    await assertBrowserPolicyForUrl("navigate", params.url, params.sessionId, params);
  }

  const { session, tab } = await sessionManager.createTab(params);
  await debuggerManager.attachTab(tab.id);
  scheduleSessionFaviconBadges(session.sessionId);

  return {
    session: sessionManager.serializeSession(session),
    tab: await summarizeTab(tab)
  };
}

async function switchTab(params: ActionParams = {}) {
  const { tabId } = sessionManager.resolveSessionAndTab(params);
  const session = await sessionManager.switchTab(params);
  await debuggerManager.attachTab(tabId);
  if (session) {
    scheduleSessionFaviconBadges(session.sessionId);
  } else {
    schedulePublishFinalizedBadge(tabId);
  }
  const tab = await chrome.tabs.get(tabId);

  return {
    session: sessionManager.serializeSession(session),
    tab: await summarizeTab(tab)
  };
}

async function openUrl(params: ActionParams = {}) {
  const url = requireString(params.url, "openUrl.params.url");
  assertAllowedNavigationUrl(url);

  let session = sessionManager.findOptionalSession(params);
  await assertBrowserPolicyForUrl("navigate", url, session?.sessionId ?? params.sessionId, params);

  if (!session) {
    if (typeof params.tabId === "number") {
      throw new Error(
        "Cannot open URL in an unclaimed tab. Use openTabs and claimTab before controlling an existing user tab."
      );
    }

    session = await sessionManager.startSession({
      sessionId: params.sessionId,
      turnId: params.turnId,
      name: params.name,
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
  scheduleSessionFaviconBadges(session.sessionId);

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
  const waitUntil = params.waitUntil == null ? null : normalizeLoadState(params.waitUntil);
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
  const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
  const idleMs = numberOrDefault(params.idleMs, 500);
  const startedAt = Date.now();
  let lastPage = null;

  await debuggerManager.attachTab(tabId);
  await showCursorActivity(tabId, "thinking");

  while (Date.now() - startedAt <= timeoutMs) {
    const page = await currentPageLocation(tabId);
    lastPage = page;

    if (urlMatches(page.url, matcher)) {
      const elapsedMs = Date.now() - startedAt;
      let loadResult: { reason: string } | null = null;

      if (waitUntil) {
        loadResult = await waitForLoadStateInTab(
          tabId,
          waitUntil,
          Math.max(0, timeoutMs - elapsedMs),
          idleMs,
          { commitAlreadySatisfied: true }
        );
      }

      sessionManager.touchSession(session?.sessionId);

      return {
        sessionId: session?.sessionId ?? null,
        tabId,
        matched: true,
        timedOut: loadResult?.reason === "timeout",
        elapsedMs: Date.now() - startedAt,
        url: page.url,
        title: page.title,
        ...(waitUntil && loadResult
          ? {
              waitUntil,
              loadReason: loadResult.reason
            }
          : {})
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
  const idleMs = numberOrDefault(params.idleMs, 500);

  await debuggerManager.attachTab(tabId);
  await showCursorActivity(tabId, "thinking");

  const result = await waitForLoadStateInTab(tabId, state, timeoutMs, idleMs);
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
  const MAX_BODY_TEXT_INLINE = 1200;
  const MAX_TEXT_SUMMARY_LENGTH = 2200;
  const MAX_TEXT_SEGMENTS = 32;
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

    const rootFor = (node) => {
      const root = node.getRootNode?.();
      return root && typeof root.querySelectorAll === "function" ? root : document;
    };
    const getElementById = (root, id) => {
      if (!id) return null;
      if (typeof root.getElementById === "function") return root.getElementById(id);
      try {
        return root.querySelector("#" + CSS.escape(id));
      } catch {
        return null;
      }
    };
    const isHiddenForName = (node) => {
      if (!(node instanceof Element)) return false;
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return true;
      const style = getComputedStyle(node);
      return style.display === "none" || style.visibility === "hidden";
    };
    const textForName = (node) => {
      if (!node) return "";
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
      if (!(node instanceof Element) || isHiddenForName(node)) return "";
      const tag = node.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return "";
      return Array.from(node.childNodes).map((child) => textForName(child)).join(" ");
    };
    const nativeLabelText = (node) => {
      const labels = Array.from(node.labels || []);
      const text = labels.map((label) => textForName(label)).join(" ");
      if (normalizeText(text)) return text;
      return "";
    };
    const svgTitle = (node) => {
      if (node.tagName.toLowerCase() !== "svg") return "";
      return textForName(node.querySelector("title"));
    };
    const controlValueText = (node) => {
      const tag = node.tagName.toLowerCase();
      const type = (node.getAttribute("type") || "").toLowerCase();
      if (tag === "input" && ["button", "submit", "reset", "image"].includes(type)) {
        return node.getAttribute("value") || node.value || (type === "submit" ? "Submit" : type === "reset" ? "Reset" : "");
      }
      return "";
    };

    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const root = rootFor(el);
      const text = labelledBy
        .split(/\\s+/)
        .map((id) => textForName(getElementById(root, id) || document.getElementById(id)))
        .join(" ");
      if (normalizeText(text)) return normalizeText(text).slice(0, 160);
    }

    for (const candidate of [
      el.getAttribute("aria-label"),
      nativeLabelText(el),
      el.getAttribute("alt"),
      svgTitle(el),
      controlValueText(el),
      el.getAttribute("placeholder"),
      el.getAttribute("title"),
      textForName(el),
      el.getAttribute("name"),
      el.getAttribute("id")
    ]) {
      const value = normalizeText(candidate);
      if (value) return value.slice(0, 160);
    }

    return "";
  };

  const roleOf = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();

    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "img") return "img";
    if (tag === "svg") return "img";
    if (tag === "input") {
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      return "textbox";
    }
    if (tag === "textarea") return "textbox";
    if (tag === "select") return el.multiple ? "listbox" : "combobox";
    if (el.isContentEditable) return "contenteditable";

    return tag;
  };

  const cssString = (value) => {
    try {
      return CSS.escape(String(value));
    } catch {
      return String(value).replace(/["\\\\]/g, "\\\\$&");
    }
  };

  const queryAllPiercingOpenShadow = (query, root = document) => {
    const out = [];
    const seen = new Set();
    const visit = (scope) => {
      let matches = [];
      try {
        matches = Array.from(scope.querySelectorAll(query));
      } catch {
        matches = [];
      }

      for (const el of matches) {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      }

      let descendants = [];
      try {
        descendants = Array.from(scope.querySelectorAll("*"));
      } catch {
        descendants = [];
      }

      for (const el of descendants) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };

    visit(root);
    return out;
  };

  const selectorCandidatesFor = (el) => {
    const candidates = [];
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("id");
    const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa");
    const ariaLabel = el.getAttribute("aria-label");
    const placeholder = el.getAttribute("placeholder");
    const name = el.getAttribute("name");

    if (id) candidates.push({ kind: "id", selector: "#" + cssString(id) });
    if (testId) candidates.push({ kind: "testId", selector: "[data-testid=\\"" + cssString(testId) + "\\"]" });
    if (ariaLabel) candidates.push({ kind: "aria-label", selector: tag + "[aria-label=\\"" + cssString(ariaLabel) + "\\"]" });
    if (placeholder) candidates.push({ kind: "placeholder", selector: tag + "[placeholder=\\"" + cssString(placeholder) + "\\"]" });
    if (name) candidates.push({ kind: "name", selector: tag + "[name=\\"" + cssString(name) + "\\"]" });

    if (tag === "a" && el.getAttribute("href")) {
      candidates.push({ kind: "href", selector: "a[href=\\"" + cssString(el.getAttribute("href")) + "\\"]" });
    }

    candidates.push({ kind: "ref", selector: "[data-agent-browser-ref=\\"" + cssString(el.getAttribute("data-agent-browser-ref") || "") + "\\"]" });
    return candidates.filter((candidate) => candidate.selector && !candidate.selector.includes("\\"\\"")).slice(0, 6);
  };

  const selectorForHost = (el) => {
    if (!isElement(el)) return null;
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("id");
    if (id) return tag + "#" + cssString(id);
    const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa");
    if (testId) return tag + "[data-testid=\\"" + cssString(testId) + "\\"]";
    return tag;
  };

  const selectorForFrame = (el) => {
    if (!isElement(el)) return null;
    const tag = el.tagName.toLowerCase();
    if (tag !== "iframe" && tag !== "frame") return null;
    return selectorForHost(el);
  };

  const shadowMetadataFor = (el) => {
    const root = el.getRootNode?.();
    if (!(root instanceof ShadowRoot)) {
      if (isUnsupportedClosedShadowHost(el)) {
        return {
          shadowRoot: "closed_unsupported",
          shadowHostSelector: selectorForHost(el),
          shadowUnsupportedReason: "custom_element_shadow_root_not_accessible"
        };
      }

      return {
        shadowRoot: null,
        shadowHostSelector: null,
        shadowUnsupportedReason: null
      };
    }

    return {
      shadowRoot: "open",
      shadowHostSelector: selectorForHost(root.host),
      shadowUnsupportedReason: null
    };
  };
  const isUnsupportedClosedShadowHost = (el) => {
    if (!isElement(el) || el.shadowRoot) return false;
    const tag = el.tagName.toLowerCase();
    if (!tag.includes("-")) return false;
    try {
      return typeof customElements.get(tag) === "function";
    } catch {
      return false;
    }
  };

  const elementState = (el) => {
    return {
      disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
      readOnly: Boolean(el.readOnly),
      checked: Boolean(el.checked) || el.getAttribute("aria-checked") === "true",
      selected: Boolean(el.selected) || el.getAttribute("aria-selected") === "true",
      href: el.getAttribute("href") || null,
      placeholder: el.getAttribute("placeholder") || null,
      testId: el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa") || null
    };
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
  const refScope = (() => {
    try {
      return "r" + crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, "");
    } catch {
      return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
  })();
  const stableNodeHash = (value) => {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const stableNodeBaseFor = (el, frameSelectors) => {
    const state = elementState(el);
    const shadow = shadowMetadataFor(el);
    const selectors = selectorCandidatesFor(el)
      .slice(0, 3)
      .map((candidate) => candidate.kind + ":" + candidate.selector)
      .join("|");
    const text = [
      frameSelectors.join(">"),
      shadow.shadowRoot || "",
      shadow.shadowHostSelector || "",
      el.tagName.toLowerCase(),
      roleOf(el),
      labelOf(el),
      normalizeText(el.innerText || el.textContent || "").slice(0, 80),
      state.testId || "",
      state.href || "",
      state.placeholder || "",
      selectors
    ].join("\\n");
    return "n" + stableNodeHash(text);
  };

  const iframeSelector = "iframe,frame";
  const frameOffsetFor = (frameEl, parentOffset) => {
    const rect = frameEl.getBoundingClientRect();
    return {
      x: parentOffset.x + rect.left,
      y: parentOffset.y + rect.top
    };
  };
  const collectCandidates = (root, frameSelectors = [], offset = { x: 0, y: 0 }, depth = 0) => {
    const records = queryAllPiercingOpenShadow(selector, root)
      .filter((el) => isFileInput(el) || isVisible(el))
      .map((el) => ({
        el,
        frameSelectors,
        offset
      }));

    if (depth >= 4) {
      return records;
    }

    for (const frameEl of queryAllPiercingOpenShadow(iframeSelector, root)) {
      const frameSelector = selectorForFrame(frameEl);
      if (!frameSelector) continue;

      let frameDocument = null;
      try {
        frameDocument = frameEl.contentDocument;
      } catch {
        frameDocument = null;
      }

      if (!frameDocument) continue;

      records.push(
        ...collectCandidates(
          frameDocument,
          frameSelectors.concat(frameSelector),
          frameOffsetFor(frameEl, offset),
          depth + 1
        )
      );
    }

    return records;
  };

  const allCandidates = collectCandidates(document);
  const candidates = allCandidates.slice(0, MAX_ELEMENTS);
  const allCandidateCount = allCandidates.length;
  const stableNodeCounts = new Map();

  const elements = candidates.map((record, index) => {
    const { el, frameSelectors, offset } = record;
    const ref = refScope + "-e" + index;
    const stableNodeBase = stableNodeBaseFor(el, frameSelectors);
    const stableNodeCount = stableNodeCounts.get(stableNodeBase) || 0;
    stableNodeCounts.set(stableNodeBase, stableNodeCount + 1);
    const stableNodeId = stableNodeCount === 0 ? stableNodeBase : stableNodeBase + "-" + stableNodeCount;
    const rect = el.getBoundingClientRect();
    const sensitive = isSensitive(el);
    const visibleText = normalizeText(el.innerText || el.textContent || "").slice(0, 160);

    window.__agentBrowserController.elements[ref] = el;
    el.setAttribute("data-agent-browser-ref", ref);

    return {
      ref,
      nodeId: stableNodeId,
      stableNodeId,
      role: roleOf(el),
      label: labelOf(el),
      visibleText,
      sensitive,
      tagName: el.tagName.toLowerCase(),
      ...shadowMetadataFor(el),
      ...(frameSelectors.length ? { frameSelectors } : {}),
      selectorCandidates: selectorCandidatesFor(el),
      ...elementState(el),
      x: Math.round(offset.x + rect.left + rect.width / 2),
      y: Math.round(offset.y + rect.top + rect.height / 2),
      rect: {
        x: Math.round(offset.x + rect.left),
        y: Math.round(offset.y + rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  });
  const bodyText = normalizeText(document.body?.innerText || "");
  const buildTextSummary = () => {
    if (bodyText.length <= MAX_BODY_TEXT_INLINE) {
      return {
        text: bodyText,
        source: "body",
        summarized: false
      };
    }

    const segments = [];
    const seen = new Set();
    const pushSegment = (value, maxLength = 240) => {
      const text = normalizeText(value).slice(0, maxLength);
      if (!text || seen.has(text.toLowerCase())) return;
      seen.add(text.toLowerCase());
      segments.push(text);
    };

    pushSegment(document.title, 160);

    const contentSelector = [
      "main",
      "article",
      "[role='main']",
      "h1",
      "h2",
      "h3",
      "[role='heading']",
      "p",
      "li",
      "summary",
      "figcaption"
    ].join(",");

    for (const el of queryAllPiercingOpenShadow(contentSelector)) {
      if (segments.length >= MAX_TEXT_SEGMENTS) break;
      if (!isVisible(el) || isSensitive(el)) continue;
      const text = normalizeText(el.innerText || el.textContent || "");
      if (!text) continue;
      pushSegment(text, text.length > 500 ? 240 : 320);
    }

    for (const element of elements) {
      if (segments.length >= MAX_TEXT_SEGMENTS) break;
      pushSegment([element.role, element.label, element.visibleText].filter(Boolean).join(": "), 220);
    }

    return {
      text: segments.join("\\n").slice(0, MAX_TEXT_SUMMARY_LENGTH),
      source: "summary",
      summarized: true
    };
  };
  const pageTextSummary = buildTextSummary();
  const active = isElement(document.activeElement) ? document.activeElement : null;
  const activeRect = active?.getBoundingClientRect();
  const selectedText = normalizeText(window.getSelection?.().toString() || "");
  const dialogs = Array.from(document.querySelectorAll("dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true']"))
    .filter((el) => isVisible(el))
    .slice(0, 5)
    .map((el) => ({
      role: el.getAttribute("role") || (el.tagName.toLowerCase() === "dialog" ? "dialog" : null),
      label: labelOf(el),
      text: normalizeText(el.innerText || el.textContent || "").slice(0, 240),
      rect: (() => {
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      })()
    }));

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
    scroll: {
      x: Math.round(window.scrollX),
      y: Math.round(window.scrollY),
      maxX: Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth)),
      maxY: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight))
    },
    focusedElement: active ? {
      role: roleOf(active),
      label: labelOf(active),
      tagName: active.tagName.toLowerCase(),
      rect: activeRect ? {
        x: Math.round(activeRect.left),
        y: Math.round(activeRect.top),
        width: Math.round(activeRect.width),
        height: Math.round(activeRect.height)
      } : null
    } : null,
    selectedText: selectedText.slice(0, 1000),
    modalState: {
      hasModal: dialogs.length > 0,
      dialogs
    },
    truncation: {
      text: pageTextSummary.text.length >= MAX_TEXT_SUMMARY_LENGTH || bodyText.length > MAX_BODY_TEXT_INLINE,
      textMaxLength: MAX_TEXT_LENGTH,
      textSource: pageTextSummary.source,
      textSummarized: pageTextSummary.summarized,
      bodyTextLength: bodyText.length,
      elements: allCandidateCount > MAX_ELEMENTS,
      elementCount: allCandidateCount,
      elementMaxCount: MAX_ELEMENTS
    },
    text: pageTextSummary.text,
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

  observation.frameTree = await getPageFrameTree(tabId);

  if (params.includeDomSnapshot === true) {
    const domSnapshot = await getDomSnapshot(tabId);
    observation.domSnapshot = sanitizeDomSnapshot(domSnapshot);
    observation.domSnapshotSummary = summarizeDomSnapshot(domSnapshot);
  }

  sessionManager.touchSession(session?.sessionId);

  redactObservation(observation);
  return observation;
}

async function elementInfo(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const x = requireFiniteNumber(params.x, "elementInfo.params.x");
  const y = requireFiniteNumber(params.y, "elementInfo.params.y");
  await debuggerManager.attachTab(tabId);

  const expression = `((x, y, includeNonInteractable) => {
  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const isElement = (value) => value instanceof Element;
  const rectOf = (el) => {
    if (!isElement(el)) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  };
  const isSensitive = (el) => {
    if (!isElement(el)) return false;
    return el.tagName.toLowerCase() === "input" &&
      ["password", "hidden"].includes((el.getAttribute("type") || "").toLowerCase());
  };
  const labelOf = (el) => {
    if (!isElement(el)) return null;
    if (isSensitive(el)) return "[password field]";

    const rootFor = (node) => {
      const root = node.getRootNode?.();
      return root && typeof root.querySelectorAll === "function" ? root : document;
    };
    const getElementById = (root, id) => {
      if (!id) return null;
      if (typeof root.getElementById === "function") return root.getElementById(id);
      try {
        return root.querySelector("#" + CSS.escape(id));
      } catch {
        return null;
      }
    };
    const isHiddenForName = (node) => {
      if (!(node instanceof Element)) return false;
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return true;
      const style = getComputedStyle(node);
      return style.display === "none" || style.visibility === "hidden";
    };
    const textForName = (node) => {
      if (!node) return "";
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
      if (!(node instanceof Element) || isHiddenForName(node)) return "";
      const tag = node.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return "";
      return Array.from(node.childNodes).map((child) => textForName(child)).join(" ");
    };
    const nativeLabelText = (node) => {
      const labels = Array.from(node.labels || []);
      const text = labels.map((label) => textForName(label)).join(" ");
      if (normalizeText(text)) return text;
      return "";
    };
    const svgTitle = (node) => {
      if (node.tagName.toLowerCase() !== "svg") return "";
      return textForName(node.querySelector("title"));
    };
    const controlValueText = (node) => {
      const tag = node.tagName.toLowerCase();
      const type = (node.getAttribute("type") || "").toLowerCase();
      if (tag === "input" && ["button", "submit", "reset", "image"].includes(type)) {
        return node.getAttribute("value") || node.value || (type === "submit" ? "Submit" : type === "reset" ? "Reset" : "");
      }
      return "";
    };

    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const root = rootFor(el);
      const text = labelledBy
        .split(/\\s+/)
        .map((id) => textForName(getElementById(root, id) || document.getElementById(id)))
        .join(" ");
      if (normalizeText(text)) return normalizeText(text).slice(0, 160);
    }

    for (const candidate of [
      el.getAttribute("aria-label"),
      nativeLabelText(el),
      el.getAttribute("alt"),
      svgTitle(el),
      controlValueText(el),
      el.getAttribute("placeholder"),
      el.getAttribute("title"),
      textForName(el),
      el.getAttribute("name"),
      el.getAttribute("id")
    ]) {
      const value = normalizeText(candidate);
      if (value) return value.slice(0, 160);
    }

    return "";
  };
  const roleOf = (el) => {
    if (!isElement(el)) return null;
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();

    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "img") return "img";
    if (tag === "svg") return "img";
    if (tag === "input") {
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      return "textbox";
    }
    if (tag === "textarea") return "textbox";
    if (tag === "select") return el.multiple ? "listbox" : "combobox";
    if (el.isContentEditable) return "contenteditable";

    return tag;
  };
  const cssString = (value) => {
    try {
      return CSS.escape(String(value));
    } catch {
      return String(value).replace(/["\\\\]/g, "\\\\$&");
    }
  };
  const selectorPath = (el) => {
    const parts = [];
    let node = el;

    while (isElement(node) && node !== document.documentElement && parts.length < 4) {
      const tag = node.tagName.toLowerCase();
      const id = node.getAttribute("id");
      if (id) {
        parts.unshift(tag + "#" + cssString(id));
        break;
      }

      const parent = node.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }

      const index = Array.from(parent.children)
        .filter((child) => child.tagName === node.tagName)
        .indexOf(node) + 1;
      parts.unshift(tag + ":nth-of-type(" + index + ")");
      node = parent;
    }

    return parts.join(" > ");
  };
  const selectorForHost = (el) => {
    if (!isElement(el)) return null;
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("id");
    if (id) return tag + "#" + cssString(id);
    const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa");
    if (testId) return tag + "[data-testid=\\"" + cssString(testId) + "\\"]";
    return tag;
  };
  const shadowMetadataFor = (el) => {
    const root = el.getRootNode?.();
    if (!(root instanceof ShadowRoot)) {
      if (isUnsupportedClosedShadowHost(el)) {
        return {
          shadowRoot: "closed_unsupported",
          shadowHostSelector: selectorForHost(el),
          shadowUnsupportedReason: "custom_element_shadow_root_not_accessible"
        };
      }

      return {
        shadowRoot: null,
        shadowHostSelector: null,
        shadowUnsupportedReason: null
      };
    }

    return {
      shadowRoot: "open",
      shadowHostSelector: selectorForHost(root.host),
      shadowUnsupportedReason: null
    };
  };
  const isUnsupportedClosedShadowHost = (el) => {
    if (!isElement(el) || el.shadowRoot) return false;
    const tag = el.tagName.toLowerCase();
    if (!tag.includes("-")) return false;
    try {
      return typeof customElements.get(tag) === "function";
    } catch {
      return false;
    }
  };
  const selectorCandidatesFor = (el) => {
    if (!isElement(el)) return [];
    const candidates = [];
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("id");
    const ref = el.getAttribute("data-agent-browser-ref");
    const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa");
    const ariaLabel = el.getAttribute("aria-label");
    const placeholder = el.getAttribute("placeholder");
    const name = el.getAttribute("name");
    const path = selectorPath(el);

    if (ref) candidates.push({ kind: "ref", selector: "[data-agent-browser-ref=\\"" + cssString(ref) + "\\"]" });
    if (id) candidates.push({ kind: "id", selector: "#" + cssString(id) });
    if (testId) candidates.push({ kind: "testId", selector: "[data-testid=\\"" + cssString(testId) + "\\"]" });
    if (ariaLabel) candidates.push({ kind: "aria-label", selector: tag + "[aria-label=\\"" + cssString(ariaLabel) + "\\"]" });
    if (placeholder) candidates.push({ kind: "placeholder", selector: tag + "[placeholder=\\"" + cssString(placeholder) + "\\"]" });
    if (name) candidates.push({ kind: "name", selector: tag + "[name=\\"" + cssString(name) + "\\"]" });
    if (tag === "a" && el.getAttribute("href")) {
      candidates.push({ kind: "href", selector: "a[href=\\"" + cssString(el.getAttribute("href")) + "\\"]" });
    }
    if (path) candidates.push({ kind: "css", selector: path });

    return candidates.filter((candidate) => candidate.selector && !candidate.selector.includes('""')).slice(0, 8);
  };
  const elementState = (el) => ({
    disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
    readOnly: Boolean(el.readOnly) || el.getAttribute("aria-readonly") === "true",
    checked: Boolean(el.checked) || el.getAttribute("aria-checked") === "true",
    selected: Boolean(el.selected) || el.getAttribute("aria-selected") === "true",
    href: el.getAttribute("href") || null,
    placeholder: el.getAttribute("placeholder") || null,
    testId: el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa") || null
  });
  const describe = (el) => {
    if (!isElement(el)) return null;
    const rect = rectOf(el);
    const sensitive = isSensitive(el);
    const visibleText = sensitive ? "" : normalizeText(el.innerText || el.textContent || "").slice(0, 240);

    return {
      nodeId: el.getAttribute("data-agent-browser-ref") || null,
      role: roleOf(el),
      name: labelOf(el),
      visibleText,
      tagName: el.tagName.toLowerCase(),
      sensitive,
      ...shadowMetadataFor(el),
      selectorCandidates: selectorCandidatesFor(el),
      rect,
      center: rect ? {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2)
      } : null,
      state: elementState(el)
    };
  };
  const interactableSelector = [
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
  const deepElementFromPoint = (pointX, pointY) => {
    let current = document.elementFromPoint(pointX, pointY);

    while (current?.shadowRoot) {
      const nested = current.shadowRoot.elementFromPoint?.(pointX, pointY);
      if (!nested || nested === current) break;
      current = nested;
    }

    return current;
  };
  const raw = deepElementFromPoint(x, y);
  const target = isElement(raw)
    ? (includeNonInteractable ? raw : raw.closest(interactableSelector))
    : null;
  const rawDescription = isElement(raw)
    ? {
        tagName: raw.tagName.toLowerCase(),
        role: roleOf(raw),
        name: labelOf(raw),
        rect: rectOf(raw)
      }
    : null;
  const targetDescription = describe(target);

  return {
    found: Boolean(targetDescription),
    x,
    y,
    element: targetDescription,
    rawHit: rawDescription
  };
})(${JSON.stringify(x)}, ${JSON.stringify(y)}, ${params.includeNonInteractable === true})`;

  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  const value = readRuntimeValue(evaluated) ?? {};
  const backendNode = await backendNodeForPoint(tabId, x, y, params.includeNonInteractable === true);
  const element = value.element && typeof value.element === "object" ? value.element : null;

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    source: "chrome_page",
    trust: "untrusted",
    x,
    y,
    found: value.found === true,
    ...(element ?? {}),
    backendNodeId: backendNode.backendNodeId ?? null,
    rawHit: value.rawHit ?? null
  };
}

async function locatorQuery(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const locator = normalizeLocatorPlan(params.locator);
  const kind = normalizeLocatorQueryKind(params.kind);
  await debuggerManager.attachTab(tabId);

  const useFrameScopedContext = kind !== "boundingBox";
  const target = useFrameScopedContext
    ? await locatorExecutionTarget(tabId, locator, {
        sessionId: session?.sessionId,
        timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
      })
    : {
        locator,
        frameId: null,
        targetId: null,
        executionContextId: null
      };
  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: locatorQueryExpression(target.locator, kind, params.args),
      ...(target.executionContextId != null ? { contextId: target.executionContextId } : {}),
      returnByValue: true,
      awaitPromise: true
    },
    {
      targetId: target.targetId,
      timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
    }
  );
  const value = readRuntimeValue(evaluated);

  if (!value || value.ok !== true) {
    throwLocatorRuntimeError(value, `Locator query failed: ${locator.selector}`, {
      operation: "locatorQuery",
      queryKind: kind,
      selector: typeof locator.selector === "string" ? locator.selector : locator.kind
    });
  }

  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    kind,
    frameId: target.frameId,
    targetId: target.targetId,
    value: value.value,
    count: value.count
  };
}

async function locatorAction(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const locator = normalizeLocatorPlan(params.locator);
  const kind = normalizeLocatorActionKind(params.kind);
  const args = params.args && typeof params.args === "object" ? params.args : {};
  const trial = args.trial === true;
  const waitMs = numberOrDefault(params.waitMs, 300);

  await debuggerManager.attachTab(tabId);
  const target = await locatorExecutionTarget(tabId, locator, {
    sessionId: session?.sessionId,
    timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
  });

  if (kind === "click" || kind === "dblclick") {
    const pointerTarget = await resolveLocatorRef(tabId, target.locator, `locatorAction.${kind}`, kind, args, target);
    await assertBrowserPolicyForTab("click", tabId, session?.sessionId, {
      ...params,
      ...args,
      confirmed: args.confirmed ?? params.confirmed,
      confirmationId: args.confirmationId ?? params.confirmationId,
      label: typeof pointerTarget.label === "string" ? pointerTarget.label : undefined,
      text: typeof pointerTarget.text === "string" ? pointerTarget.text : undefined,
      tagName: typeof pointerTarget.tagName === "string" ? pointerTarget.tagName : undefined
    });
    await assertUserHandoffNotRequired(tabId, session?.sessionId ?? null, pointerTarget);

    if (trial) {
      return locatorTrialResult(session?.sessionId ?? null, tabId, kind, target, pointerTarget);
    }

    await showCursor(tabId, pointerTarget.x, pointerTarget.y);

    if (pointerTarget.fileChooser) {
      await showCursorClick(tabId, pointerTarget.x, pointerTarget.y);
      const fileChooser = registerFileChooser({
        sessionId: session?.sessionId ?? null,
        tabId,
        fileChooser: {
          ...pointerTarget.fileChooser,
          locator
        }
      });
      safePostEvent({
        name: "fileChooserOpened",
        sessionId: session?.sessionId ?? null,
        tabId,
        fileChooserId: fileChooser.fileChooserId,
        file_chooser_id: fileChooser.file_chooser_id,
        isMultiple: fileChooser.isMultiple,
        is_multiple: fileChooser.is_multiple,
        fileChooser
      });
    } else {
      await dispatchMouseClick(tabId, pointerTarget.x, pointerTarget.y, {
        ...args,
        clickCount: kind === "dblclick" ? 2 : numberOrDefault(args.clickCount, 1)
      });
      await showCursorClick(tabId, pointerTarget.x, pointerTarget.y);
    }
    await sleep(waitMs);

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  if (kind === "dragTo") {
    const targetLocator = normalizeLocatorPlan(args.targetLocator);
    const sourcePoint = await resolveLocatorRef(tabId, target.locator, "locatorAction.dragTo.source", kind, args, target);
    const targetExecution = await locatorExecutionTarget(tabId, targetLocator, {
      sessionId: session?.sessionId,
      timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
    });
    const targetPoint = await resolveLocatorRef(tabId, targetExecution.locator, "locatorAction.dragTo.target", kind, args, targetExecution);

    await assertBrowserPolicyForTab("click", tabId, session?.sessionId, {
      ...params,
      ...args,
      confirmed: args.confirmed ?? params.confirmed,
      confirmationId: args.confirmationId ?? params.confirmationId,
      label: typeof sourcePoint.label === "string" ? sourcePoint.label : undefined,
      text: typeof sourcePoint.text === "string" ? sourcePoint.text : undefined,
      tagName: typeof sourcePoint.tagName === "string" ? sourcePoint.tagName : undefined
    });
    await assertUserHandoffNotRequired(tabId, session?.sessionId ?? null, sourcePoint);
    await assertUserHandoffNotRequired(tabId, session?.sessionId ?? null, targetPoint);

    if (trial) {
      return {
        ...locatorTrialResult(session?.sessionId ?? null, tabId, kind, target, sourcePoint),
        target: locatorTrialTarget(targetPoint)
      };
    }

    await showCursor(tabId, sourcePoint.x, sourcePoint.y);
    await dispatchMouseDrag(tabId, [
      { x: sourcePoint.x, y: sourcePoint.y },
      { x: targetPoint.x, y: targetPoint.y }
    ], args);
    await sleep(waitMs);

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  if (kind === "fill" || kind === "type") {
    const text = requireString(args.value ?? args.text, `locatorAction.${kind}.text`);
    await assertBrowserPolicyForTab("type", tabId, session?.sessionId, {
      ...params,
      ...args,
      text
    });
    const pointerTarget = await resolveLocatorRef(tabId, target.locator, `locatorAction.${kind}`, kind, args, target);

    if (trial) {
      return locatorTrialResult(session?.sessionId ?? null, tabId, kind, target, pointerTarget);
    }

    await focusLocator(tabId, target.locator, args, target, kind === "fill" ? args.clear !== false : args.clear === true);
    await showCursor(tabId, pointerTarget.x, pointerTarget.y);

    await cdp(tabId, "Input.insertText", { text });
    await sleep(waitMs);

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  if (kind === "press") {
    const key = requireString(args.key, "locatorAction.press.key");
    if (trial) {
      const pointerTarget = await resolveLocatorRef(tabId, target.locator, "locatorAction.press", kind, args, target);
      return locatorTrialResult(session?.sessionId ?? null, tabId, kind, target, pointerTarget);
    }

    await focusLocator(tabId, target.locator, args, target);

    return pressKey({
      sessionId: session?.sessionId,
      tabId,
      key,
      waitMs
    });
  }

  if (kind === "clear" || kind === "focus" || kind === "hover" || kind === "highlight") {
    const pointerTarget = await resolveLocatorRef(tabId, target.locator, `locatorAction.${kind}`, kind, args, target);

    if (trial) {
      return locatorTrialResult(session?.sessionId ?? null, tabId, kind, target, pointerTarget);
    }

    if (kind === "focus" || kind === "clear") {
      await focusLocator(tabId, target.locator, args, target, kind === "clear");
    }

    if (kind === "hover") {
      await showCursor(tabId, pointerTarget.x, pointerTarget.y);
      await cdp(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: pointerTarget.x,
        y: pointerTarget.y,
        button: "none"
      });
    }

    if (kind === "highlight") {
      const rect = pointerTarget.rect && typeof pointerTarget.rect === "object"
        ? pointerTarget.rect
        : {
            x: pointerTarget.x,
            y: pointerTarget.y,
            width: pointerTarget.width,
            height: pointerTarget.height
          };
      await showHighlightRect(tabId, normalizeScreenshotHighlightClip(rect), {
        color: typeof args.color === "string" ? args.color : undefined,
        durationMs: numberOrDefault(args.durationMs, numberOrDefault(args.highlightDurationMs, 2000))
      });
    }

    await sleep(waitMs);

    if (kind === "highlight") {
      sessionManager.touchSession(session?.sessionId);

      return {
        sessionId: session?.sessionId ?? null,
        tabId,
        kind,
        frameId: target.frameId,
        targetId: target.targetId,
        rect: pointerTarget.rect ?? null
      };
    }

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  if (kind === "blur" || kind === "scrollIntoViewIfNeeded" || kind === "selectText") {
    if (trial) {
      const pointerTarget = await resolveLocatorRef(tabId, target.locator, `locatorAction.${kind}`, kind, args, target);
      return locatorTrialResult(session?.sessionId ?? null, tabId, kind, target, pointerTarget);
    }

    const evaluated = await cdp(
      tabId,
      "Runtime.evaluate",
      {
        expression: locatorDomUtilityExpression(target.locator, kind, args),
        ...(target.executionContextId != null ? { contextId: target.executionContextId } : {}),
        returnByValue: true,
        awaitPromise: true
      },
      {
        targetId: target.targetId,
        timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
      }
    );
    const value = readRuntimeValue(evaluated);

    if (!value || value.ok !== true) {
      throwLocatorRuntimeError(value, `Locator action failed: ${locator.selector}`, {
        operation: "locatorAction",
        actionKind: kind,
        selector: typeof target.locator.selector === "string" ? target.locator.selector : target.locator.kind
      });
    }

    await sleep(waitMs);

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  if (kind === "setChecked" || kind === "selectOption") {
    if (trial) {
      const pointerTarget = await resolveLocatorRef(tabId, target.locator, `locatorAction.${kind}`, kind, args, target);
      return locatorTrialResult(session?.sessionId ?? null, tabId, kind, target, pointerTarget);
    }

    const evaluated = await cdp(
      tabId,
      "Runtime.evaluate",
      {
        expression: locatorMutationExpression(target.locator, kind, args),
        ...(target.executionContextId != null ? { contextId: target.executionContextId } : {}),
        returnByValue: true,
        awaitPromise: true
      },
      {
        targetId: target.targetId,
        timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
      }
    );
    const value = readRuntimeValue(evaluated);

    if (!value || value.ok !== true) {
      throwLocatorRuntimeError(value, `Locator action failed: ${locator.selector}`, {
        operation: "locatorAction",
        actionKind: kind,
        selector: typeof target.locator.selector === "string" ? target.locator.selector : target.locator.kind
      });
    }

    await sleep(waitMs);

    return observe({
      sessionId: session?.sessionId,
      tabId
    });
  }

  if (kind === "evaluate" || kind === "evaluateAll" || kind === "dispatchEvent") {
    if (kind === "evaluate" || kind === "evaluateAll") {
      const script = requireString(args.script, `locatorAction.${kind}.script`);
      assertReadOnlyEvaluateAllowed(script, args, `locator.${kind}`);
      await assertBrowserPolicyForTab("evaluate", tabId, session?.sessionId, {
        ...params,
        ...args,
        script,
        mode: args.mode === "read" ? "read" : "write",
        confirmed: args.confirmed ?? params.confirmed,
        confirmationId: args.confirmationId ?? params.confirmationId
      });
      await postDiagnosticActionAudit({
        action: "evaluate",
        tabId,
        sessionId: session?.sessionId ?? null,
        method: `locator.${kind}`,
        reason: auditReason(args.reason ?? params.reason, `locator_${kind}`),
        mode: args.mode === "read" ? "read" : "write",
        readOnly: args.mode === "read"
      });
    } else {
      const eventType = requireString(args.type, "locatorAction.dispatchEvent.type");
      await assertBrowserPolicyForTab("click", tabId, session?.sessionId, {
        ...params,
        ...args,
        label: `dispatchEvent:${eventType}`,
        text: eventType,
        confirmed: args.confirmed ?? params.confirmed,
        confirmationId: args.confirmationId ?? params.confirmationId
      });
    }

    const evaluated = await cdp(
      tabId,
      "Runtime.evaluate",
      {
        expression: locatorScriptActionExpression(target.locator, kind, args),
        ...(target.executionContextId != null ? { contextId: target.executionContextId } : {}),
        returnByValue: true,
        awaitPromise: true
      },
      {
        targetId: target.targetId,
        timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
      }
    );
    const value = readRuntimeValue(evaluated);

    if (!value || value.ok !== true) {
      throwLocatorRuntimeError(value, `Locator action failed: ${locator.selector}`, {
        operation: "locatorAction",
        actionKind: kind,
        selector: typeof target.locator.selector === "string" ? target.locator.selector : target.locator.kind
      });
    }

    await sleep(waitMs);

    return {
      sessionId: session?.sessionId ?? null,
      tabId,
      kind,
      frameId: target.frameId,
      targetId: target.targetId,
      value: value.value ?? null,
      count: value.count ?? 0
    };
  }

  throw new Error(`Unsupported locator action: ${kind}`);
}

function locatorTrialTarget(target: any) {
  const rect = target?.rect && typeof target.rect === "object"
    ? target.rect
    : {
        x: Number.isFinite(Number(target?.x)) ? Number(target.x) : null,
        y: Number.isFinite(Number(target?.y)) ? Number(target.y) : null,
        width: Number.isFinite(Number(target?.width)) ? Number(target.width) : null,
        height: Number.isFinite(Number(target?.height)) ? Number(target.height) : null
      };

  return {
    x: Number.isFinite(Number(target?.x)) ? Number(target.x) : null,
    y: Number.isFinite(Number(target?.y)) ? Number(target.y) : null,
    rect
  };
}

function locatorTrialResult(
  sessionId: string | null,
  tabId: number,
  kind: string,
  executionTarget: any,
  target: any
) {
  return {
    sessionId,
    tabId,
    kind,
    trial: true,
    frameId: executionTarget.frameId,
    targetId: executionTarget.targetId,
    ...locatorTrialTarget(target)
  };
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
  const target = await locatorExecutionTarget(tabId, locator, {
    sessionId: session?.sessionId,
    timeoutMs
  });

  while (Date.now() - startedAt <= timeoutMs) {
    const match = await locatorState(tabId, target.locator, {
      executionContextId: target.executionContextId,
      targetId: target.targetId,
      timeoutMs
    });
    lastMatch = match;

    if (selectorStateIsSatisfied(match, state)) {
      sessionManager.touchSession(session?.sessionId);

      return {
        sessionId: session?.sessionId ?? null,
        tabId,
        state,
        frameId: target.frameId,
        targetId: target.targetId,
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
    frameId: target.frameId,
    targetId: target.targetId,
    matched: false,
    timedOut: true,
    elapsedMs: Date.now() - startedAt,
    count: lastMatch?.attached ? 1 : 0
  };
}

async function resolveFrame(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const frameSelectors = Array.isArray(params.frameSelectors)
    ? params.frameSelectors.map((selector: any, selectorIndex: number) =>
        requireString(selector, `resolveFrame.params.frameSelectors[${selectorIndex}]`)
      )
    : [];
  const targetId =
    typeof params.targetId === "string" && params.targetId.trim()
      ? params.targetId.trim()
      : null;
  const timeoutMs = numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS);

  if (frameSelectors.length === 0) {
    throw new Error("resolveFrame.params.frameSelectors must contain at least one selector");
  }

  await debuggerManager.attachTab(tabId);
  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: resolveFrameSelectorPathExpression(frameSelectors),
      returnByValue: true,
      awaitPromise: true
    },
    {
      targetId,
      timeoutMs
    }
  );
  const resolved = readRuntimeValue(evaluated);

  let effectiveResolved = resolved;
  let resolvedTargetId = targetId;
  let matchPathOffset = 0;
  let precomputedMatch: { node: ActionParams | null; frame: ActionParams | null; path: ActionParams[] } | null = null;

  if (!effectiveResolved || effectiveResolved.ok !== true) {
    const continued = !targetId
      ? await continueResolveFramePathInTarget(tabId, frameSelectors, effectiveResolved, timeoutMs)
      : null;

    if (continued) {
      effectiveResolved = continued.resolved;
      resolvedTargetId = continued.targetId;
      matchPathOffset = continued.matchPathOffset;
      precomputedMatch = continued.match;
    }
  }

  if (!effectiveResolved || effectiveResolved.ok !== true) {
    throw new Error(resolved?.error || "Unable to resolve frame selector path");
  }

  const frameTree = precomputedMatch
    ? null
    : await cdp(tabId, "Page.getFrameTree", {}, { targetId: resolvedTargetId, timeoutMs });
  let match = precomputedMatch ?? matchResolvedFramePathToFrameTree(effectiveResolved.path, frameTree?.frameTree);

  const effectivePath = Array.isArray(effectiveResolved.path) ? effectiveResolved.path : [];
  const finalResolvedStep = effectivePath.length ? effectivePath[effectivePath.length - 1] : null;

  if (!resolvedTargetId && (!match.frame || finalResolvedStep?.accessible !== true)) {
    const targetMatch = await resolveFramePathTarget(tabId, effectiveResolved.path, timeoutMs);
    if (targetMatch) {
      resolvedTargetId = targetMatch.targetId;
      match = targetMatch.match;
      matchPathOffset = targetMatch.matchPathOffset;
      effectiveResolved = {
        ...effectiveResolved,
        targetViewportOffset: targetMatch.targetViewportOffset
      };
    }
  }

  sessionManager.touchSession(session?.sessionId);
  const path = effectivePath;
  const lastPathViewportOffset = path.length ? path[path.length - 1]?.viewportOffset : null;
  const targetViewportOffset = resolvedTargetId
    ? coerceViewportOffset(effectiveResolved.targetViewportOffset ?? lastPathViewportOffset)
    : { x: 0, y: 0 };

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    targetId: resolvedTargetId,
    frameSelectors,
    matched: match.frame != null,
    accessible: effectiveResolved.accessible === true,
    frameId: match.frame?.id ?? null,
    frame: match.node ? summarizePageFrameTreeNode(match.node) : null,
    path: path.map((step: ActionParams, index: number) => ({
      selector: typeof step.selector === "string" ? step.selector : frameSelectors[index] ?? "",
      index,
      accessible: step.accessible === true,
      id: typeof step.id === "string" ? step.id : null,
      name: typeof step.name === "string" ? step.name : null,
      title: typeof step.title === "string" ? step.title : null,
      src: typeof step.src === "string" ? sanitizeDebugUrl(step.src) : null,
      url: typeof step.url === "string" ? sanitizeDebugUrl(step.url) : null,
      viewportOffset: coerceViewportOffset(step.viewportOffset),
      frameId: match.path[index - matchPathOffset]?.frame?.id ?? null
    })),
    targetViewportOffset,
    viewportOffset: coerceViewportOffset(lastPathViewportOffset)
  };
}

async function locatorExecutionTarget(
  tabId: number,
  locator: ActionParams,
  options: { sessionId?: string | null; timeoutMs?: number } = {}
) {
  const frameSelectors = Array.isArray(locator.frameSelectors)
    ? locator.frameSelectors.filter((selector: unknown): selector is string => typeof selector === "string" && selector.trim().length > 0)
    : [];

  if (frameSelectors.length === 0) {
    return {
      locator,
      frameId: null,
      targetId: null,
      executionContextId: null,
      viewportOffset: { x: 0, y: 0 }
    };
  }

  const resolved = await resolveFrame({
    sessionId: options.sessionId,
    tabId,
    frameSelectors,
    timeoutMs: options.timeoutMs
  });
  const frameId = typeof resolved.frameId === "string" && resolved.frameId.trim()
    ? resolved.frameId.trim()
    : null;
  const targetId = typeof resolved.targetId === "string" && resolved.targetId.trim()
    ? resolved.targetId.trim()
    : null;

  if (!frameId && resolved.accessible === true) {
    return {
      locator,
      frameId: null,
      targetId: null,
      executionContextId: null,
      viewportOffset: { x: 0, y: 0 }
    };
  }

  if (!frameId) {
    throw new Error(`Unable to resolve frame context for locator frameSelectors: ${frameSelectors.join(" -> ")}`);
  }

  const path = Array.isArray(resolved.path) ? resolved.path : [];
  const viewportOffset = targetId
    ? coerceViewportOffset(resolved.targetViewportOffset)
    : coerceViewportOffset(path.length ? path[path.length - 1]?.viewportOffset : resolved.viewportOffset);

  return {
    locator: stripLocatorFrameSelectors(locator),
    frameId,
    targetId,
    executionContextId: await createEvaluationContextForFrame(tabId, frameId, {
      targetId,
      timeoutMs: options.timeoutMs
    }),
    viewportOffset
  };
}

function coerceViewportOffset(value: unknown) {
  if (!value || typeof value !== "object") {
    return { x: 0, y: 0 };
  }

  const record = value as ActionParams;
  return {
    x: typeof record.x === "number" && Number.isFinite(record.x) ? record.x : 0,
    y: typeof record.y === "number" && Number.isFinite(record.y) ? record.y : 0
  };
}

function applyViewportOffsetToLocatorTarget(value: any, viewportOffset: { x: number; y: number }) {
  const offsetX = typeof viewportOffset?.x === "number" && Number.isFinite(viewportOffset.x) ? viewportOffset.x : 0;
  const offsetY = typeof viewportOffset?.y === "number" && Number.isFinite(viewportOffset.y) ? viewportOffset.y : 0;

  if (!value || typeof value !== "object" || (offsetX === 0 && offsetY === 0)) {
    return value;
  }

  return {
    ...value,
    ...(typeof value.x === "number" ? { x: value.x + offsetX } : {}),
    ...(typeof value.y === "number" ? { y: value.y + offsetY } : {}),
    ...(value.rect && typeof value.rect === "object"
      ? {
          rect: {
            ...value.rect,
            ...(typeof value.rect.x === "number" ? { x: value.rect.x + offsetX } : {}),
            ...(typeof value.rect.y === "number" ? { y: value.rect.y + offsetY } : {}),
            ...(typeof value.rect.left === "number" ? { left: value.rect.left + offsetX } : {}),
            ...(typeof value.rect.top === "number" ? { top: value.rect.top + offsetY } : {}),
            ...(typeof value.rect.right === "number" ? { right: value.rect.right + offsetX } : {}),
            ...(typeof value.rect.bottom === "number" ? { bottom: value.rect.bottom + offsetY } : {})
          }
        }
      : {})
  };
}

function throwLocatorRuntimeError(value: any, fallback: string, details: ActionParams = {}): never {
  const message = typeof value?.error === "string" && value.error.trim()
    ? value.error
    : fallback;
  const runtimeCode = typeof value?.code === "string" && /^[a-z][a-z0-9_]+$/.test(value.code)
    ? value.code
    : null;
  const actionabilityCodes = new Set([
    "detached",
    "not_stable",
    "outside_viewport",
    "occluded",
    "not_visible",
    "pointer_events_none",
    "inert",
    "disabled",
    "not_editable"
  ]);
  const code =
    runtimeCode === "strict_mode_violation" ||
    runtimeCode === "locator_not_found" ||
    runtimeCode === "locator_resolution_failed"
      ? runtimeCode
      : runtimeCode && actionabilityCodes.has(runtimeCode)
        ? "locator_actionability"
        : "internal_error";
  const error = new Error(message) as Error & { code?: string; details?: ActionParams };
  error.code = code;
  error.details = {
    ...details,
    ...(runtimeCode && code === "locator_actionability" ? { actionabilityCode: runtimeCode } : {}),
    ...(typeof value?.count === "number" ? { count: value.count } : {}),
    ...(typeof value?.index === "number" ? { index: value.index } : {}),
    ...(typeof value?.kind === "string" ? { kind: value.kind } : {}),
    ...(typeof value?.selector === "string" ? { selector: value.selector } : {})
  };
  throw error;
}

function stripLocatorFrameSelectors(locator: any): any {
  if (!locator || typeof locator !== "object") {
    return locator;
  }

  const {
    frameSelectors: _frameSelectors,
    within,
    and,
    or,
    has,
    hasNot,
    ...rest
  } = locator;

  return {
    ...rest,
    ...(within ? { within: stripLocatorFrameSelectors(within) } : {}),
    ...(and ? { and: stripLocatorFrameSelectors(and) } : {}),
    ...(or ? { or: stripLocatorFrameSelectors(or) } : {}),
    ...(has ? { has: stripLocatorFrameSelectors(has) } : {}),
    ...(hasNot ? { hasNot: stripLocatorFrameSelectors(hasNot) } : {})
  };
}

async function click(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);

  await debuggerManager.attachTab(tabId);

  const target = await resolvePointerTarget(tabId, params, "click");
  await assertBrowserPolicyForTab("click", tabId, session?.sessionId, {
    ...params,
    label: typeof target.label === "string" ? target.label : undefined,
    text: typeof target.text === "string" ? target.text : undefined,
    tagName: typeof target.tagName === "string" ? target.tagName : undefined
  });
  await assertUserHandoffNotRequired(tabId, session?.sessionId ?? null, target);
  await showCursor(tabId, target.x, target.y);
  if (target.fileChooser) {
    await showCursorClick(tabId, target.x, target.y);
    const fileChooser = registerFileChooser({
      sessionId: session?.sessionId ?? null,
      tabId,
      fileChooser: target.fileChooser
    });
    safePostEvent({
      name: "fileChooserOpened",
      sessionId: session?.sessionId ?? null,
      tabId,
      fileChooserId: fileChooser.fileChooserId,
      file_chooser_id: fileChooser.file_chooser_id,
      isMultiple: fileChooser.isMultiple,
      is_multiple: fileChooser.is_multiple,
      fileChooser
    });
  } else {
    await dispatchMouseClick(tabId, target.x, target.y, params);
    await showCursorClick(tabId, target.x, target.y);
  }

  await sleep(numberOrDefault(params.waitMs, 500));

  return observe({
    sessionId: session?.sessionId,
    tabId
  });
}

async function drag(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const path = normalizeDragPath(params.path);

  await debuggerManager.attachTab(tabId);
  await assertBrowserPolicyForTab("click", tabId, session?.sessionId, params);
  await showCursor(tabId, path[0].x, path[0].y);
  await dispatchMouseDrag(tabId, path, params);
  const lastPoint = path[path.length - 1];
  await showCursor(tabId, lastPoint.x, lastPoint.y, {
    waitForArrival: false
  });

  await sleep(numberOrDefault(params.waitMs, 300));

  return observe({
    sessionId: session?.sessionId,
    tabId
  });
}

async function moveMouse(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const x = requireFiniteNumber(params.x, "moveMouse.params.x");
  const y = requireFiniteNumber(params.y, "moveMouse.params.y");
  const modifiers = normalizePointerModifiers(params.modifiers);

  await debuggerManager.attachTab(tabId);
  await showCursor(tabId, x, y, {
    waitForArrival: params.waitForArrival !== false
  });
  await cdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
    modifiers
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
  const modifiers = normalizePointerModifiers(params.modifiers);
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
    deltaY,
    modifiers
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
  await assertBrowserPolicyForTab("type", tabId, session?.sessionId, {
    ...params,
    text
  });
  const ref = typeof params.ref === "string" ? params.ref : null;
  const selector = typeof params.selector === "string" ? params.selector : null;
  const hasCoordinates =
    typeof params.x === "number" && typeof params.y === "number";

  await debuggerManager.attachTab(tabId);

  if (ref || selector) {
    if (params.clear === true) {
      const target = await focusAndMaybeClearElement(tabId, params, true);
      await showCursor(tabId, target.x, target.y);
    } else {
      const target = await focusAndMaybeClearElement(tabId, params, false);
      await showCursor(tabId, target.x, target.y);
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
  assertReadOnlyEvaluateAllowed(script, params, "evaluate");
  const targetId =
    typeof params.targetId === "string" && params.targetId.trim()
      ? params.targetId.trim()
      : null;
  const frameId =
    typeof params.frameId === "string" && params.frameId.trim()
      ? params.frameId.trim()
      : null;
  const timeoutMs = numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS);
  await assertBrowserPolicyForTab("evaluate", tabId, session?.sessionId, {
    ...params,
    script
  });
  await postDiagnosticActionAudit({
    action: "evaluate",
    tabId,
    sessionId: session?.sessionId ?? null,
    method: "Runtime.evaluate",
    reason: auditReason(params.reason, evaluateAuditReason(script, params)),
    mode: params.mode === "write" ? "write" : "read",
    readOnly: params.mode !== "write"
  });

  await showCursorActivity(tabId, "thinking");

  const executionContextId = frameId
    ? await createEvaluationContextForFrame(tabId, frameId, {
        targetId,
        timeoutMs
      })
    : null;
  const readOnly = params.mode !== "write";
  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: readOnly ? readOnlyEvaluateExpression(script) : script,
      ...(executionContextId != null ? { contextId: executionContextId } : {}),
      returnByValue: true,
      awaitPromise: readOnly ? true : params.awaitPromise !== false
    },
    {
      timeoutMs,
      targetId
    }
  );
  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    targetId,
    frameId,
    executionContextId,
    value: readRuntimeValue(evaluated)
  };
}

function readOnlyEvaluateExpression(script: string) {
  return `(() => {
  const __formaxReadOnlyScript = ${JSON.stringify(script)};
  ${readOnlyMutationGuardSource()}

  try {
    const __formaxValue = (0, eval)(__formaxReadOnlyScript);
    if (__formaxValue && typeof __formaxValue.then === "function") {
      return Promise.resolve(__formaxValue).finally(__formaxRestoreAll);
    }
    __formaxRestoreAll();
    return __formaxValue;
  } catch (error) {
    __formaxRestoreAll();
    throw error;
  }
})()`;
}

function readOnlyMutationGuardSource(options: { restoreAllDeclaration?: string } = {}) {
  const restoreAllDeclaration = options.restoreAllDeclaration ?? "const";
  return `const __formaxRestore = [];
  const __formaxViolation = (api) => {
    throw new Error("read_only_evaluate_violation: " + api);
  };
  const __formaxPatchMethod = (owner, name, api) => {
    if (!owner) return;
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (!descriptor || typeof descriptor.value !== "function" || descriptor.configurable === false) return;
    __formaxRestore.push(() => Object.defineProperty(owner, name, descriptor));
    Object.defineProperty(owner, name, {
      ...descriptor,
      value: function guardedReadOnlyMutation() {
        return __formaxViolation(api);
      }
    });
  };
  const __formaxPatchSetter = (owner, name, api) => {
    let target = owner;
    while (target && !Object.prototype.hasOwnProperty.call(target, name)) {
      target = Object.getPrototypeOf(target);
    }
    if (!target) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (!descriptor || typeof descriptor.set !== "function" || descriptor.configurable === false) return;
    __formaxRestore.push(() => Object.defineProperty(target, name, descriptor));
    Object.defineProperty(target, name, {
      ...descriptor,
      set: function guardedReadOnlySetter() {
        return __formaxViolation(api);
      }
    });
  };
  ${restoreAllDeclaration} __formaxRestoreAll = () => {
    for (let index = __formaxRestore.length - 1; index >= 0; index -= 1) {
      try {
        __formaxRestore[index]();
      } catch {
        // Restoration is best-effort inside the temporary evaluation world.
      }
    }
  };

  __formaxPatchMethod(globalThis.HTMLElement && globalThis.HTMLElement.prototype, "click", "HTMLElement.click");
  __formaxPatchMethod(globalThis.HTMLFormElement && globalThis.HTMLFormElement.prototype, "submit", "HTMLFormElement.submit");
  __formaxPatchMethod(globalThis.HTMLFormElement && globalThis.HTMLFormElement.prototype, "requestSubmit", "HTMLFormElement.requestSubmit");
  __formaxPatchMethod(globalThis.EventTarget && globalThis.EventTarget.prototype, "dispatchEvent", "EventTarget.dispatchEvent");
  __formaxPatchMethod(globalThis.Node && globalThis.Node.prototype, "appendChild", "Node.appendChild");
  __formaxPatchMethod(globalThis.Node && globalThis.Node.prototype, "insertBefore", "Node.insertBefore");
  __formaxPatchMethod(globalThis.Node && globalThis.Node.prototype, "replaceChild", "Node.replaceChild");
  __formaxPatchMethod(globalThis.Node && globalThis.Node.prototype, "removeChild", "Node.removeChild");
  __formaxPatchMethod(globalThis.Element && globalThis.Element.prototype, "setAttribute", "Element.setAttribute");
  __formaxPatchMethod(globalThis.Element && globalThis.Element.prototype, "removeAttribute", "Element.removeAttribute");
  __formaxPatchMethod(globalThis.Document && globalThis.Document.prototype, "write", "Document.write");
  __formaxPatchMethod(globalThis.Document && globalThis.Document.prototype, "writeln", "Document.writeln");
  __formaxPatchMethod(globalThis.Storage && globalThis.Storage.prototype, "setItem", "Storage.setItem");
  __formaxPatchMethod(globalThis.Storage && globalThis.Storage.prototype, "removeItem", "Storage.removeItem");
  __formaxPatchMethod(globalThis.Storage && globalThis.Storage.prototype, "clear", "Storage.clear");
  __formaxPatchMethod(globalThis.IDBFactory && globalThis.IDBFactory.prototype, "deleteDatabase", "IDBFactory.deleteDatabase");
  __formaxPatchSetter(globalThis.Document && globalThis.Document.prototype, "cookie", "Document.cookie");
  __formaxPatchSetter(globalThis.Element && globalThis.Element.prototype, "innerHTML", "Element.innerHTML");
  __formaxPatchSetter(globalThis.Node && globalThis.Node.prototype, "textContent", "Node.textContent");
  __formaxPatchSetter(globalThis.HTMLInputElement && globalThis.HTMLInputElement.prototype, "value", "HTMLInputElement.value");
  __formaxPatchSetter(globalThis.HTMLInputElement && globalThis.HTMLInputElement.prototype, "checked", "HTMLInputElement.checked");
  __formaxPatchSetter(globalThis.HTMLTextAreaElement && globalThis.HTMLTextAreaElement.prototype, "value", "HTMLTextAreaElement.value");
  __formaxPatchSetter(globalThis.HTMLSelectElement && globalThis.HTMLSelectElement.prototype, "value", "HTMLSelectElement.value");`;
}

async function createEvaluationContextForFrame(
  tabId: number,
  frameId: string,
  options: { targetId?: string | null; timeoutMs?: number } = {}
) {
  const result = await cdp(
    tabId,
    "Page.createIsolatedWorld",
    {
      frameId,
      worldName: "formax-evaluate",
      grantUniveralAccess: false
    },
    options
  );
  const executionContextId = result?.executionContextId;

  if (typeof executionContextId !== "number" || !Number.isInteger(executionContextId)) {
    throw new Error(`Could not create an evaluation execution context for frame ${frameId}`);
  }

  return executionContextId;
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
    modifiers: normalized.modifiers,
    windowsVirtualKeyCode: normalized.keyCode,
    nativeVirtualKeyCode: normalized.keyCode
  });

  if (normalized.key === "Enter" || normalized.key === " ") {
    await cdp(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      key: normalized.key,
      code: normalized.code,
      text: normalized.key === "Enter" ? "\r" : " ",
      unmodifiedText: normalized.key === "Enter" ? "\r" : " ",
      modifiers: normalized.modifiers,
      windowsVirtualKeyCode: normalized.keyCode,
      nativeVirtualKeyCode: normalized.keyCode
    });
  }

  await cdp(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: normalized.key,
    code: normalized.code,
    modifiers: normalized.modifiers,
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
  const captureParams: ActionParams = {
    format,
    fromSurface: true
  };
  const clip = normalizeScreenshotClip(params.clip);

  if (clip) {
    captureParams.clip = clip;
  } else if (params.fullPage === true) {
    const metrics = await cdp(tabId, "Page.getLayoutMetrics", {});
    const contentSize = metrics.cssContentSize || metrics.contentSize || {};
    const width = Math.max(1, numberOrDefault(contentSize.width, 1));
    const height = Math.max(1, numberOrDefault(contentSize.height, 1));
    captureParams.captureBeyondViewport = true;
    captureParams.clip = {
      x: 0,
      y: 0,
      width,
      height,
      scale: 1
    };
  }

  if (params.highlight === true || params.highlightClip) {
    await showHighlightRect(tabId, normalizeScreenshotHighlightClip(params.highlightClip ?? params.clip), {
      color: typeof params.highlightColor === "string" ? params.highlightColor : undefined,
      durationMs: numberOrDefault(params.highlightDurationMs, 900)
    });
    await sleep(80);
  }

  const result = await cdp(tabId, "Page.captureScreenshot", captureParams);
  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    format,
    fullPage: params.fullPage === true,
    clip: captureParams.clip ?? null,
    dataBase64: result.data
  };
}

function normalizeScreenshotClip(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as ActionParams;
  const x = requireFiniteNumber(source.x, "screenshot.params.clip.x");
  const y = requireFiniteNumber(source.y, "screenshot.params.clip.y");
  const width = requireFiniteNumber(source.width, "screenshot.params.clip.width");
  const height = requireFiniteNumber(source.height, "screenshot.params.clip.height");

  if (width <= 0 || height <= 0) {
    throw new Error("screenshot.params.clip width and height must be positive");
  }

  return {
    x,
    y,
    width,
    height,
    scale: 1
  };
}

function normalizeScreenshotHighlightClip(value: unknown) {
  const clip = normalizeScreenshotClip(value);

  if (!clip) {
    throw new Error("screenshot.params.highlightClip or clip is required when highlight is enabled");
  }

  return {
    x: clip.x,
    y: clip.y,
    width: clip.width,
    height: clip.height
  };
}

function registerFileChooser(options: {
  sessionId: string | null;
  tabId: number;
  fileChooser: ActionParams;
}) {
  pruneFileChoosers();
  const id = `fc-${crypto.randomUUID()}`;
  const multiple = options.fileChooser.multiple === true || options.fileChooser.isMultiple === true;
  const fileChooser = {
    ...options.fileChooser,
    fileChooserId: id,
    file_chooser_id: id,
    multiple,
    isMultiple: multiple,
    is_multiple: multiple
  };

  fileChoosers.set(id, {
    id,
    createdAt: Date.now(),
    sessionId: options.sessionId,
    tabId: options.tabId,
    fileChooser
  });

  return fileChooser;
}

function pruneFileChoosers() {
  const now = Date.now();

  for (const [id, record] of fileChoosers.entries()) {
    if (now - record.createdAt > FILE_CHOOSER_TTL_MS) {
      fileChoosers.delete(id);
    }
  }

  while (fileChoosers.size > MAX_FILE_CHOOSERS) {
    const oldest = fileChoosers.keys().next().value;
    if (!oldest) break;
    fileChoosers.delete(oldest);
  }
}

function normalizeFileChooserId(params: ActionParams, action = "setFileChooserFiles") {
  const value = typeof params.fileChooserId === "string" && params.fileChooserId.trim()
    ? params.fileChooserId.trim()
    : typeof params.file_chooser_id === "string" && params.file_chooser_id.trim()
      ? params.file_chooser_id.trim()
      : "";

  if (!value) {
    throw new Error(`${action}.params requires fileChooserId or file_chooser_id`);
  }

  return value;
}

function fileChooserResultFromEvent(event: ActionParams | null, elapsedMs: number) {
  if (!event) {
    return {
      sessionId: null,
      tabId: null,
      matched: false,
      timedOut: true,
      elapsedMs,
      fileChooserId: null,
      file_chooser_id: null,
      isMultiple: null,
      is_multiple: null,
      fileChooser: null,
      event: null
    };
  }

  const fileChooser = event.fileChooser && typeof event.fileChooser === "object"
    ? event.fileChooser
    : {};
  const fileChooserId = typeof event.fileChooserId === "string" && event.fileChooserId.trim()
    ? event.fileChooserId.trim()
    : typeof event.file_chooser_id === "string" && event.file_chooser_id.trim()
      ? event.file_chooser_id.trim()
      : typeof fileChooser.fileChooserId === "string" && fileChooser.fileChooserId.trim()
        ? fileChooser.fileChooserId.trim()
        : typeof fileChooser.file_chooser_id === "string" && fileChooser.file_chooser_id.trim()
          ? fileChooser.file_chooser_id.trim()
          : null;
  const isMultiple = event.isMultiple === true ||
    event.is_multiple === true ||
    fileChooser.multiple === true ||
    fileChooser.isMultiple === true ||
    fileChooser.is_multiple === true;

  return {
    sessionId: typeof event.sessionId === "string" ? event.sessionId : null,
    tabId: typeof event.tabId === "number" ? event.tabId : null,
    matched: true,
    timedOut: false,
    elapsedMs,
    fileChooserId,
    file_chooser_id: fileChooserId,
    isMultiple,
    is_multiple: isMultiple,
    fileChooser: {
      ...fileChooser,
      ...(fileChooserId ? { fileChooserId, file_chooser_id: fileChooserId } : {}),
      multiple: isMultiple,
      isMultiple,
      is_multiple: isMultiple
    },
    event
  };
}

async function waitForFileChooser(params: ActionParams = {}) {
  const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
  const pollMs = Math.max(50, numberOrDefault(params.pollMs, 100));
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const events = eventBuffer.list({
      sessionId: params.sessionId,
      tabId: params.tabId,
      name: "fileChooserOpened",
      sinceSequence: params.sinceSequence,
      limit: 1
    });

    if (events.length > 0) {
      const result = fileChooserResultFromEvent(events[0], Date.now() - startedAt);
      if (result.sessionId) {
        sessionManager.touchSession(result.sessionId);
      }
      return result;
    }

    await sleep(pollMs);
  }

  return fileChooserResultFromEvent(null, Date.now() - startedAt);
}

async function setFileChooserFiles(params: ActionParams = {}) {
  pruneFileChoosers();
  const fileChooserId = normalizeFileChooserId(params);
  const record = fileChoosers.get(fileChooserId);

  if (!record) {
    throw new Error(`setFileChooserFiles.params.fileChooserId not found or expired: ${fileChooserId}`);
  }

  if (record.sessionId && typeof params.sessionId === "string" && params.sessionId.trim() && record.sessionId !== params.sessionId.trim()) {
    throw new Error("setFileChooserFiles.params.sessionId does not match file chooser session");
  }

  if (typeof params.tabId === "number" && record.tabId !== params.tabId) {
    throw new Error("setFileChooserFiles.params.tabId does not match file chooser tab");
  }

  const filePaths = normalizeUploadFilePaths(params, "setFileChooserFiles");

  return uploadFile({
    ...params,
    sessionId: record.sessionId ?? params.sessionId,
    tabId: record.tabId,
    locator: record.fileChooser.locator,
    ref: record.fileChooser.ref,
    selector: record.fileChooser.selector,
    filePath: undefined,
    files: undefined,
    filePaths
  });
}

async function uploadFile(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const filePaths = normalizeUploadFilePaths(params);
  await assertBrowserPolicyForTab("upload", tabId, session?.sessionId, {
    ...params,
    filePath: filePaths[0],
    filePaths
  });
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
  const locatorTarget = locator
    ? await locatorExecutionTarget(tabId, locator, {
        sessionId: session?.sessionId,
        timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
      })
    : {
        locator: null,
        frameId: null,
        targetId: null,
        executionContextId: null,
        viewportOffset: { x: 0, y: 0 }
      };
  const checked = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: uploadTargetExpression({ ref, locator: locatorTarget.locator, marker }),
      ...(locatorTarget.executionContextId != null ? { contextId: locatorTarget.executionContextId } : {}),
      returnByValue: true,
      awaitPromise: true
    },
    {
      targetId: locatorTarget.targetId,
      timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
    }
  );
  const target = applyViewportOffsetToLocatorTarget(
    readRuntimeValue(checked),
    locatorTarget.viewportOffset
  );

  if (!target || target.ok !== true) {
    throw new Error(target?.error || "Unable to locate file input");
  }

  await showCursor(tabId, target.x, target.y);

  const object = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: `document.querySelector(${JSON.stringify(`[data-agent-upload-marker="${cssStringEscape(marker)}"]`)})`,
      ...(locatorTarget.executionContextId != null ? { contextId: locatorTarget.executionContextId } : {}),
      returnByValue: false,
      awaitPromise: false
    },
    {
      targetId: locatorTarget.targetId,
      timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
    }
  );
  const objectId = typeof object?.result?.objectId === "string" ? object.result.objectId : null;

  if (!objectId) {
    throw new Error(`Could not resolve file input node for ref: ${ref}`);
  }

  await cdp(
    tabId,
    "DOM.setFileInputFiles",
    {
      objectId,
      files: filePaths
    },
    {
      targetId: locatorTarget.targetId,
      timeoutMs: numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS)
    }
  );

  await sleep(numberOrDefault(params.waitMs, 1000));
  sessionManager.touchSession(session?.sessionId);

  return observe({
    sessionId: session?.sessionId,
    tabId
  });
}

function normalizeUploadFilePaths(params: ActionParams, action = "uploadFile") {
  const filePaths = Array.isArray(params.files)
    ? params.files.map((item, index) => requireString(item, `${action}.params.files[${index}]`))
    : [];

  if (Array.isArray(params.filePaths)) {
    filePaths.push(...params.filePaths.map((item, index) => requireString(item, `${action}.params.filePaths[${index}]`)));
  }

  if (typeof params.filePath === "string" && params.filePath.trim()) {
    filePaths.unshift(params.filePath.trim());
  }

  if (filePaths.length === 0) {
    throw new Error(`${action}.params requires files, filePath, or filePaths`);
  }

  return filePaths;
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
    tabs: await Promise.all(tabs.map((tab) => summarizeTab(tab)))
  };
}

async function openTabs(params: ActionParams = {}) {
  const query: chrome.tabs.QueryInfo = {};

  if (params.currentWindow === true) {
    query.currentWindow = true;
  }

  let tabs = await chrome.tabs.query(query);

  if (params.includeControlled !== true) {
    tabs = tabs.filter(
      (tab) =>
        typeof tab.id !== "number" ||
        sessionManager.findSessionByTabId(tab.id) == null
    );
  }

  const claimableTabs = tabs.filter((tab) => typeof tab.id === "number" && isClaimableTab(tab));
  const summaries = await Promise.all(claimableTabs.map((tab) => summarizeTab(tab)));

  return {
    tabs: claimableTabs.map((tab, index) => {
      const token = createClaimToken(tab.id as number);

      return {
        ...summaries[index],
        claimToken: token,
        claimTokenExpiresAt: claimTokens.get(token)?.expiresAt ?? Date.now()
      };
    })
  };
}

async function getHistory(params: ActionParams = {}) {
  if (params.confirmed !== true) {
    throw new Error(
      "confirmation_required: Browser history access requires confirmed=true for this request."
    );
  }

  const limit = Math.max(1, Math.min(Math.floor(numberOrDefault(params.limit, 50)), 100));
  const search: chrome.history.HistoryQuery = {
    text: typeof params.query === "string" ? params.query : "",
    maxResults: limit
  };

  if (typeof params.from === "number") {
    search.startTime = params.from;
  }

  if (typeof params.to === "number") {
    search.endTime = params.to;
  }

  const entries = await chrome.history.search(search);

  return {
    entries: entries.map(redactHistoryEntry),
    sensitive: true
  };
}

async function clipboardReadText(params: ActionParams = {}) {
  if (params.confirmed !== true) {
    throw new Error(
      "confirmation_required: Clipboard read requires confirmed=true for this request."
    );
  }

  const result = await sendClipboardOffscreenMessage({
    action: "readText"
  });
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  sessionManager.touchSession(sessionId);

  return {
    sessionId,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    text: typeof result.text === "string" ? result.text : "",
    sensitive: true
  };
}

async function clipboardWriteText(params: ActionParams = {}) {
  if (params.confirmed !== true) {
    throw new Error(
      "confirmation_required: Clipboard write requires confirmed=true for this request."
    );
  }

  const text = requireString(params.text, "clipboardWriteText.params.text");
  await sendClipboardOffscreenMessage({
    action: "writeText",
    text
  });
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  sessionManager.touchSession(sessionId);

  return {
    sessionId,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    written: true,
    textLength: text.length
  };
}

async function clipboardRead(params: ActionParams = {}) {
  if (params.confirmed !== true) {
    throw new Error(
      "confirmation_required: Clipboard read requires confirmed=true for this request."
    );
  }

  const result = await sendClipboardOffscreenMessage({
    action: "readItems"
  });
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  sessionManager.touchSession(sessionId);

  return {
    sessionId,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    items: Array.isArray(result.items) ? result.items : [],
    sensitive: true
  };
}

async function clipboardWrite(params: ActionParams = {}) {
  if (params.confirmed !== true) {
    throw new Error(
      "confirmation_required: Clipboard write requires confirmed=true for this request."
    );
  }

  const items = normalizeClipboardItems(params.items);
  await sendClipboardOffscreenMessage({
    action: "writeItems",
    items
  });
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
  sessionManager.touchSession(sessionId);

  return {
    sessionId,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    written: true,
    itemCount: items.length
  };
}

function normalizeClipboardItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("clipboardWrite.params.items must be a non-empty array");
  }

  return value.map((item, itemIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`clipboardWrite.params.items[${itemIndex}] must be an object`);
    }

    const source = item as ActionParams;
    if (!Array.isArray(source.types) || source.types.length === 0) {
      throw new Error(`clipboardWrite.params.items[${itemIndex}].types must be a non-empty array`);
    }

    return {
      types: source.types.map((payload: unknown, typeIndex: number) => {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error(`clipboardWrite.params.items[${itemIndex}].types[${typeIndex}] must be an object`);
        }

        const candidate = payload as ActionParams;
        const mimeType = requireString(candidate.mimeType, `clipboardWrite.params.items[${itemIndex}].types[${typeIndex}].mimeType`);
        const text = typeof candidate.text === "string" ? candidate.text : undefined;
        const dataBase64 = typeof candidate.dataBase64 === "string" ? candidate.dataBase64 : undefined;

        if (text == null && dataBase64 == null) {
          throw new Error(`clipboardWrite.params.items[${itemIndex}].types[${typeIndex}] requires text or dataBase64`);
        }

        const normalized: ActionParams = {
          mimeType
        };

        if (text != null) {
          normalized.text = text;
        }

        if (dataBase64 != null) {
          normalized.dataBase64 = dataBase64;
        }

        return normalized;
      })
    };
  });
}

async function sendClipboardOffscreenMessage(message: ActionParams) {
  await ensureClipboardOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: "FORMAX_CLIPBOARD_OFFSCREEN",
    ...message
  });

  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Clipboard offscreen request failed");
  }

  return response.result && typeof response.result === "object"
    ? response.result as ActionParams
    : {};
}

async function ensureClipboardOffscreenDocument() {
  const offscreen = (chrome as any).offscreen;
  if (!offscreen?.createDocument) {
    throw new Error("Clipboard backend requires chrome.offscreen support.");
  }

  const runtime = chrome.runtime as any;
  const documentUrl = chrome.runtime.getURL(CLIPBOARD_OFFSCREEN_URL);

  if (typeof runtime.getContexts === "function") {
    const contexts = await runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl]
    });

    if (Array.isArray(contexts) && contexts.length > 0) {
      return;
    }
  }

  try {
    await offscreen.createDocument({
      url: CLIPBOARD_OFFSCREEN_URL,
      reasons: ["CLIPBOARD"],
      justification: "Read and write clipboard text for confirmed Formax browser requests."
    });
  } catch (error) {
    const message = stringifyError(error);
    if (!message.includes("Only a single offscreen document")) {
      throw error;
    }
  }
}

async function getTab(params: ActionParams = {}) {
  const { tabId } = sessionManager.resolveSessionAndTab(params);
  const tab = await chrome.tabs.get(tabId);

  return {
    tab: await summarizeTab(tab)
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
  const levels = Array.isArray(params.levels)
    ? Array.from(new Set(params.levels.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())))
    : [];
  const filter = typeof params.filter === "string" && params.filter.trim()
    ? params.filter.trim().toLowerCase()
    : null;
  const events = eventBuffer.list({
    sessionId: params.sessionId,
    tabId: params.tabId,
    sinceSequence: params.sinceSequence,
    limit: 500
  });
  let logs = events.map(devLogFromEvent).filter((log) => log != null);

  const levelFilter = levels.length > 0 ? levels : level ? [level] : [];
  if (levelFilter.length > 0) {
    logs = logs.filter((log) => typeof log.level === "string" && levelFilter.includes(log.level));
  }

  if (filter) {
    logs = logs.filter((log) => String(log.text || "").toLowerCase().includes(filter));
  }

  return {
    logs: logs.slice(-limit)
  };
}

async function listDownloads(params: ActionParams = {}) {
  const downloads = await findDownloads(params);
  await assertBrowserBlocklistForDownloads(downloads, params.sessionId);

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
      await assertBrowserBlocklistForDownloads([download], params.sessionId);
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

async function downloadMedia(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const locator = normalizeLocatorPlan(params.locator);
  const attribute = normalizeMediaDownloadAttribute(params.attribute);
  const fallbackFetch = params.fallbackFetch === true;
  const fallbackMaxBytes = normalizeDownloadFallbackMaxBytes(params.fallbackMaxBytes);

  await debuggerManager.attachTab(tabId);

  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression: mediaDownloadTargetExpression(locator, attribute),
    returnByValue: true,
    awaitPromise: true
  });
  const media = readRuntimeValue(evaluated);

  if (!media || media.ok !== true || typeof media.url !== "string") {
    throw new Error(media?.error || `Unable to resolve downloadable media for locator: ${locator.selector}`);
  }

  const filename = normalizeDownloadFilename(params.filename);
  await assertBrowserPolicyForUrl("download", media.url, session?.sessionId, {
    ...params,
    filename,
    label: media.label,
    text: media.text
  });

  const downloadOptions = mediaDownloadOptions({
    url: media.url,
    filename,
    saveAs: params.saveAs,
    conflictAction: params.conflictAction
  });

  const { downloadId, method, finalUrl, filename: actualFilename } = await startMediaDownload({
    mediaUrl: media.url,
    downloadOptions,
    fallbackFetch,
    fallbackMaxBytes,
    sessionId: session?.sessionId,
    params,
    label: media.label,
    text: media.text
  });

  const started = await chrome.downloads.search({ id: downloadId }).then((items) => items[0] ?? null);
  const baseResult = {
    sessionId: session?.sessionId ?? null,
    tabId,
    media: {
      url: finalUrl,
      originalUrl: media.url,
      kind: media.kind,
      tagName: media.tagName,
      attribute: media.attribute,
      filename: actualFilename,
      method
    },
    download: started ? summarizeDownload(started) : null
  };

  if (params.waitForCompletion !== true) {
    sessionManager.touchSession(session?.sessionId);
    return baseResult;
  }

  const waitResult = await waitForDownload({
    sessionId: session?.sessionId,
    tabId,
    id: downloadId,
    state: "complete",
    timeoutMs: params.timeoutMs,
    pollMs: params.pollMs
  });

  sessionManager.touchSession(session?.sessionId);

  return {
    ...baseResult,
    matched: waitResult.matched,
    timedOut: waitResult.timedOut,
    elapsedMs: waitResult.elapsedMs,
    download: waitResult.download
  };
}

function mediaDownloadOptions(options: {
  url: string;
  filename: string | null;
  saveAs: unknown;
  conflictAction: unknown;
}): chrome.downloads.DownloadOptions {
  const downloadOptions: chrome.downloads.DownloadOptions = {
    url: options.url,
    saveAs: options.saveAs === true
  };
  const conflictAction = normalizeDownloadConflictAction(options.conflictAction);

  if (options.filename) {
    downloadOptions.filename = options.filename;
  }

  if (conflictAction) {
    downloadOptions.conflictAction = conflictAction;
  }

  return downloadOptions;
}

async function startMediaDownload(options: {
  mediaUrl: string;
  downloadOptions: chrome.downloads.DownloadOptions;
  fallbackFetch: boolean;
  fallbackMaxBytes: number;
  sessionId: string | null | undefined;
  params: ActionParams;
  label: string | undefined;
  text: string | undefined;
}) {
  try {
    return {
      downloadId: await chrome.downloads.download(options.downloadOptions),
      method: "chrome_downloads",
      finalUrl: options.mediaUrl,
      filename: typeof options.downloadOptions.filename === "string" ? options.downloadOptions.filename : null
    };
  } catch (error) {
    if (!options.fallbackFetch) {
      throw error;
    }
  }

  const fetched = await fetchMediaAsDataUrl(options.mediaUrl, options.fallbackMaxBytes);
  if (fetched.finalUrl !== options.mediaUrl) {
    await assertBrowserPolicyForUrl("download", fetched.finalUrl, options.sessionId, {
      ...options.params,
      filename: options.downloadOptions.filename,
      label: options.label,
      text: options.text
    });
  }

  const fallbackFilename =
    typeof options.downloadOptions.filename === "string" && options.downloadOptions.filename.trim()
      ? options.downloadOptions.filename
      : filenameFromMediaUrl(fetched.finalUrl, fetched.contentType);
  const fallbackOptions: chrome.downloads.DownloadOptions = {
    ...options.downloadOptions,
    url: fetched.dataUrl,
    filename: fallbackFilename
  };

  return {
    downloadId: await chrome.downloads.download(fallbackOptions),
    method: "fetch_blob",
    finalUrl: fetched.finalUrl,
    filename: fallbackFilename
  };
}

async function rawCdp(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const method = requireString(params.method, "cdp.params.method");
  const targetId =
    typeof params.targetId === "string" && params.targetId.trim()
      ? params.targetId.trim()
      : null;
  const commandParams =
    params.params && typeof params.params === "object" && !Array.isArray(params.params)
      ? params.params
      : {};
  const timeoutMs = numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS);
  await assertBrowserPolicyForTab("rawCdp", tabId, session?.sessionId, {
    ...params,
    method,
    params: commandParams
  });
  await postDiagnosticActionAudit({
    action: "rawCdp",
    tabId,
    sessionId: session?.sessionId ?? null,
    method,
    reason: auditReason(params.reason, "raw_cdp")
  });

  const result = await cdp(tabId, method, commandParams, {
    timeoutMs,
    targetId
  });
  sessionManager.touchSession(session?.sessionId);

  return {
    sessionId: session?.sessionId ?? null,
    tabId,
    targetId,
    method,
    result
  };
}

async function attachTarget(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const targetId = requireString(params.targetId, "attachTarget.params.targetId").trim();
  if (!targetId) {
    throw new Error("attachTarget.params.targetId must be a non-empty string");
  }

  await assertBrowserPolicyForTab("rawCdp", tabId, session?.sessionId, {
    ...params,
    method: "Target.attachToTarget"
  });
  await postDiagnosticActionAudit({
    action: "rawCdp",
    tabId,
    sessionId: session?.sessionId ?? null,
    method: "Target.attachToTarget",
    reason: auditReason(params.reason, "attach_target")
  });
  await debuggerManager.attachTarget(targetId);
  sessionManager.touchSession(session?.sessionId);

  return {
    attached: true,
    sessionId: session?.sessionId ?? null,
    tabId,
    targetId
  };
}

async function detachTarget(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  const targetId = requireString(params.targetId, "detachTarget.params.targetId").trim();
  if (!targetId) {
    throw new Error("detachTarget.params.targetId must be a non-empty string");
  }

  await postDiagnosticActionAudit({
    action: "rawCdp",
    tabId,
    sessionId: session?.sessionId ?? null,
    method: "Target.detachFromTarget",
    reason: auditReason(params.reason, "detach_target")
  });
  await debuggerManager.detachTarget(targetId);
  sessionManager.touchSession(session?.sessionId);

  return {
    attached: false,
    sessionId: session?.sessionId ?? null,
    tabId,
    targetId
  };
}

async function backendNodeForPoint(
  tabId: number,
  x: number,
  y: number,
  includeNonInteractable: boolean
) {
  const interactableSelector = [
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
  const expression = `((x, y, includeNonInteractable) => {
  const raw = document.elementFromPoint(x, y);
  if (!(raw instanceof Element)) return null;
  return includeNonInteractable ? raw : raw.closest(${JSON.stringify(interactableSelector)});
})(${JSON.stringify(x)}, ${JSON.stringify(y)}, ${includeNonInteractable})`;

  try {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
      expression,
      returnByValue: false,
      awaitPromise: true,
      objectGroup: "formaxElementInfo"
    });
    const objectId = evaluated?.result?.objectId;

    if (typeof objectId !== "string") {
      return {
        backendNodeId: null,
        nodeId: null,
        frameId: null
      };
    }

    const requested = await cdp(tabId, "DOM.requestNode", { objectId });
    const nodeId = typeof requested?.nodeId === "number" ? requested.nodeId : null;
    const described = nodeId != null
      ? await cdp(tabId, "DOM.describeNode", { nodeId })
      : null;
    const node = described?.node && typeof described.node === "object" ? described.node : null;

    return {
      backendNodeId: typeof node?.backendNodeId === "number" ? node.backendNodeId : null,
      nodeId,
      frameId: typeof node?.frameId === "string" ? node.frameId : null
    };
  } catch {
    return {
      backendNodeId: null,
      nodeId: null,
      frameId: null
    };
  } finally {
    try {
      await cdp(tabId, "Runtime.releaseObjectGroup", {
        objectGroup: "formaxElementInfo"
      });
    } catch {
      // Releasing debug handles is best-effort and should not affect inspection.
    }
  }
}

async function postDiagnosticActionAudit(args: {
  action: "evaluate" | "rawCdp";
  tabId: number;
  sessionId: string | null;
  method: string;
  reason: string;
  mode?: string;
  readOnly?: boolean;
}) {
  const tab = await chrome.tabs.get(args.tabId).catch(() => null);
  const origin = originForAudit(tab?.url ?? null);

  safePostEvent({
    name: "browserActionAudit",
    auditKind: "diagnostic",
    category: "diagnostic",
    action: args.action,
    actionId: activeActionContext?.actionId ?? null,
    sessionId: args.sessionId,
    turnId: activeActionContext?.turnId ?? null,
    tabId: args.tabId,
    origin,
    method: args.method,
    reason: args.reason,
    mode: args.mode,
    readOnly: args.readOnly
  });
}

function auditReason(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? truncateAndRedactString(value.trim(), 160)
    : fallback;
}

function evaluateAuditReason(script: string, params: ActionParams) {
  if (params.mode === "write" || looksLikeMutatingScript(script)) {
    return "mutating_evaluate";
  }

  return "read_only_evaluate";
}

function originForAudit(url: unknown) {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function closeTab(params: ActionParams = {}) {
  const { session, tabId } = sessionManager.resolveSessionAndTab(params);
  await detachTabForLifecycle(tabId);
  const changedSessions = sessionManager.removeTab(tabId);
  schedulePublishFinalizedBadge(tabId);

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
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return {
      finalized: false,
      reason: "session_not_found",
      closedTabs: [],
      keptTabs: []
    };
  }

  const handoffTabIds = Array.isArray(params.handoffTabIds)
    ? params.handoffTabIds.filter((tabId) => Number.isInteger(tabId))
    : Array.isArray(params.keepTabIds)
      ? params.keepTabIds.filter((tabId) => Number.isInteger(tabId))
      : [];
  const deliverableTabIds = Array.isArray(params.deliverableTabIds)
    ? params.deliverableTabIds.filter((tabId) => Number.isInteger(tabId))
    : [];
  const handoff = new Set(handoffTabIds);
  const deliverable = new Set(deliverableTabIds);
  const closeRest = params.closeRest !== false;
  const tabIds = [...session.tabIds];
  const closedTabs = [];
  const keptTabs = [];
  const releasedTabs = [];

  for (const tabId of tabIds) {
    const lease = sessionManager.getTabLease(tabId);

    if (handoff.has(tabId)) {
      await setPageVisualStatus(tabId, "handoff", { sessionId, reason: "finalizeSession" });
    } else if (deliverable.has(tabId)) {
      await setPageVisualStatus(tabId, "deliverable", { sessionId, reason: "finalizeSession" });
    } else if (!closeRest || lease?.origin === "user") {
      await setPageVisualStatus(tabId, "stopped", { sessionId, reason: "finalizeSession" });
    }

    await detachTabForLifecycle(tabId);
    cursorOverlayStateByTab.delete(tabId);

    if (handoff.has(tabId)) {
      keptTabs.push(tabId);
      continue;
    }

    if (deliverable.has(tabId) || !closeRest || lease?.origin === "user") {
      try {
        await chrome.tabs.ungroup(tabId);
      } catch {
        // The tab may not be grouped anymore.
      }

      releasedTabs.push(...sessionManager.releaseTabs(sessionId, [tabId]));
      keptTabs.push(tabId);
      continue;
    }

    releasedTabs.push(...sessionManager.releaseTabs(sessionId, [tabId]));

    if (lease?.origin === "agent" || !lease) {
      try {
        await chrome.tabs.remove(tabId);
        closedTabs.push(tabId);
      } catch {
        // The tab may have already been closed.
      }
    }
  }

  const handedOffTabs = await sessionManager.handoffTabs(sessionId, handoffTabIds, {
    activeTabId:
      typeof params.activeTabId === "number" ? params.activeTabId : session.activeTabId,
    turnId: params.turnId
  });
  for (const tabId of [...releasedTabs, ...handedOffTabs]) {
    schedulePublishFinalizedBadge(tabId);
  }

  if (handedOffTabs.length === 0) {
    await sessionManager.markSessionStopped(sessionId);
    sessionManager.deleteSession(sessionId);
  }

  const eventSnapshot = await persistSessionEventSnapshot(sessionId, "finalizeSession");
  const clearedEvents = eventBuffer.clear({ sessionId });
  await maybeReloadForPendingUpdate("finalizeSession");

  return {
    finalized: true,
    sessionId,
    closedTabs,
    keptTabs,
    handoffTabs: handedOffTabs,
    deliverableTabs: deliverableTabIds,
    releasedTabs,
    eventSnapshot: summarizeEventSnapshot(eventSnapshot),
    clearedEvents
  };
}

async function endTurn(params: ActionParams = {}) {
  const sessionId = requireString(params.sessionId, "endTurn.params.sessionId");
  const turnId = requireString(params.turnId, "endTurn.params.turnId");
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    return {
      ended: false,
      reason: "session_not_found",
      releasedTabs: []
    };
  }

  const releasedTabs = sessionManager.releaseActiveTurn(sessionId, turnId);

  for (const tabId of releasedTabs) {
    await setPageVisualStatus(tabId, "stopped", { sessionId, turnId, reason: "endTurn" });
    await detachTabForLifecycle(tabId);
    cursorOverlayStateByTab.delete(tabId);
    schedulePublishFinalizedBadge(tabId);
  }

  if (session.tabIds.length === 0) {
    await sessionManager.markSessionStopped(sessionId);
    sessionManager.deleteSession(sessionId);
  }
  await maybeReloadForPendingUpdate("endTurn");

  return {
    ended: true,
    sessionId,
    turnId,
    releasedTabs
  };
}

async function stopSession(params: ActionParams = {}) {
  const sessionId = requireString(params.sessionId, "stopSession.params.sessionId");
  return stopSessionInternal(sessionId, {
    closeTabs: params.closeTabs === true,
    reason: "stopSession"
  });
}

async function stopSessionInternal(
  sessionId: string,
  options: {
    closeTabs: boolean;
    reason: string;
  }
) {
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
    if (options.closeTabs !== true) {
      await setPageVisualStatus(tabId, "stopped", { sessionId, reason: options.reason });
    }
    await detachTabForLifecycle(tabId);
    cursorOverlayStateByTab.delete(tabId);

    if (options.closeTabs === true) {
      try {
        await chrome.tabs.remove(tabId);
        closedTabs.push(tabId);
      } catch {
        // The tab may have already been closed.
      }
    }
  }

  sessionManager.deleteSession(sessionId);
  for (const tabId of tabIds) {
    schedulePublishFinalizedBadge(tabId);
  }
  const eventSnapshot = await persistSessionEventSnapshot(sessionId, options.reason);
  const clearedEvents = eventBuffer.clear({ sessionId });
  await maybeReloadForPendingUpdate(options.reason);

  return {
    stopped: true,
    sessionId,
    closedTabs,
    eventSnapshot: summarizeEventSnapshot(eventSnapshot),
    clearedEvents
  };
}

async function cleanupAfterNativeDisconnect(reason: string) {
  if (nativeDisconnectCleanup) {
    return nativeDisconnectCleanup;
  }

  nativeDisconnectCleanup = cleanupAfterNativeDisconnectUnlocked(reason).finally(() => {
    nativeDisconnectCleanup = null;
  });

  return nativeDisconnectCleanup;
}

async function cleanupAfterNativeDisconnectUnlocked(reason: string) {
  try {
    await sessionManager.initialize();
  } catch {
    // Keep debugger cleanup running even if transient session restore failed.
  }

  const activeSessions = sessionManager.listSessions()
    .filter((session) => session.status === "active")
    .map((session) => ({
      sessionId: session.sessionId,
      tabIds: [...session.tabIds]
    }));
  const stoppedSessions = [];

  for (const session of activeSessions) {
    const result = await stopSessionInternal(session.sessionId, {
      closeTabs: false,
      reason: "nativeDisconnect"
    });
    stoppedSessions.push({
      sessionId: session.sessionId,
      tabIds: session.tabIds,
      stopped: result.stopped === true
    });
  }

  const detachedDebugger = await detachAllDebuggersBestEffort("nativeDisconnect");
  await maybeReloadForPendingUpdate("nativeDisconnect");

  safePostEvent({
    name: "nativeDisconnectCleanup",
    sessionId: null,
    tabId: null,
    reason,
    stoppedSessions,
    detachedTabs: detachedDebugger.tabIds,
    detachedTargets: detachedDebugger.targetIds
  });
}

async function detachAllDebuggersBestEffort(reason: string): Promise<{ tabIds: number[]; targetIds: string[] }> {
  const tabIds = new Set<number>(debuggerManager.listAttachedTabs());
  const targetIds = new Set<string>(debuggerManager.listAttachedTargets());

  try {
    const targets = await chrome.debugger.getTargets();

    for (const target of targets) {
      const targetInfo = target as unknown as Record<string, unknown>;
      if (typeof target.tabId === "number" && Number.isInteger(target.tabId)) {
        tabIds.add(target.tabId);
      }

      if (
        typeof targetInfo.targetId === "string" &&
        targetInfo.targetId.trim() &&
        targetInfo.attached === true
      ) {
        targetIds.add(targetInfo.targetId.trim());
      }
    }
  } catch {
    // `listAttachedTabs()` still gives us the extension's own bookkeeping.
  }

  const detachedTabs = [];

  for (const tabId of tabIds) {
    expectedDebuggerDetachTabs.add(tabId);
    try {
      await chrome.debugger.detach({ tabId });
      detachedTabs.push(tabId);
    } catch {
      // Another debugger, a closed tab, or an already-detached tab should not
      // block cleanup for the rest of the browser.
    } finally {
      debuggerManager.markDetached({ tabId });
      self.setTimeout(() => {
        expectedDebuggerDetachTabs.delete(tabId);
      }, 1000);
    }
  }

  const detachedTargets = [];

  for (const targetId of targetIds) {
    try {
      await chrome.debugger.detach({ targetId });
      detachedTargets.push(targetId);
    } catch {
      // Same best-effort policy as tab-level cleanup. Target may have vanished
      // or may not be attached by this extension anymore.
    } finally {
      debuggerManager.markDetached({ targetId });
    }
  }

  safePostEvent({
    name: "debuggerCleanup",
    sessionId: null,
    tabId: null,
    reason,
    tabIds: detachedTabs,
    targetIds: detachedTargets
  });

  return {
    tabIds: detachedTabs,
    targetIds: detachedTargets
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
    const context = await pointerTargetContext(tabId, x, y);

    return {
      ok: true,
      x,
      y,
      ...context,
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

async function pointerTargetContext(tabId: number, x: number, y: number) {
  try {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
      expression: pointerTargetContextExpression(x, y),
      returnByValue: true,
      awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);

    if (value && value.ok === true) {
      return {
        label: typeof value.label === "string" ? value.label : undefined,
        text: typeof value.text === "string" ? value.text : undefined,
        tagName: typeof value.tagName === "string" ? value.tagName : undefined,
        riskContext: value.riskContext && typeof value.riskContext === "object"
          ? value.riskContext
          : undefined
      };
    }
  } catch {
    // Coordinate clicks should still work on pages where context inspection fails.
  }

  return {};
}

function pointerTargetContextExpression(x: number, y: number) {
  return `(() => {
  const el = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
  if (!el) {
    return { ok: false };
  }

  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const textForName = (candidate) => {
    if (!candidate) return "";
    if (candidate.nodeType === Node.TEXT_NODE) return candidate.nodeValue || "";
    if (!(candidate instanceof Element)) return "";
    if (candidate.hidden || candidate.getAttribute("aria-hidden") === "true") return "";
    const style = getComputedStyle(candidate);
    if (style.display === "none" || style.visibility === "hidden") return "";
    const tag = candidate.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return "";
    return Array.from(candidate.childNodes).map((child) => textForName(child)).join(" ");
  };
  const labelledBy = el.getAttribute?.("aria-labelledby");
  const labelledText = labelledBy
    ? labelledBy
        .split(/\\s+/)
        .map((id) => textForName(document.getElementById(id)))
        .join(" ")
    : "";
  const labelText = normalizeText(
    labelledText ||
    el.getAttribute?.("aria-label") ||
    Array.from(el.labels || []).map((label) => textForName(label)).join(" ") ||
    el.getAttribute?.("alt") ||
    el.getAttribute?.("title") ||
    el.getAttribute?.("placeholder") ||
    textForName(el) ||
    el.getAttribute?.("name") ||
    el.getAttribute?.("id")
  );
  const visibleText = normalizeText(el.innerText || el.textContent || "");
  const nearestForm = el.closest?.("form, [role='form']");
  const formText = normalizeText(nearestForm?.innerText || nearestForm?.textContent || "");
  const pageText = normalizeText(document.body?.innerText || "");
  const passwordFieldCount = nearestForm
    ? nearestForm.querySelectorAll?.("input[type=password]").length || 0
    : document.querySelectorAll("input[type=password]").length;

  return {
    ok: true,
    tagName: el.tagName,
    label: labelText.slice(0, 160),
    text: visibleText.slice(0, 160),
    riskContext: {
      pageTitle: document.title.slice(0, 160),
      formText: formText.slice(0, 500),
      pageText: pageText.slice(0, 1000),
      passwordFieldCount
    }
  };
})()`;
}

async function assertUserHandoffNotRequired(
  tabId: number,
  sessionId: string | null,
  target: ActionParams
) {
  const risk = userHandoffRiskForTarget(target);

  if (!risk) {
    return;
  }

  await setPageVisualStatus(tabId, "handoff", {
    sessionId,
    reason: risk.category
  });
  safePostEvent({
    name: "userHandoffRequired",
    sessionId,
    tabId,
    action: "click",
    category: risk.category,
    reason: risk.reason,
    target: {
      label: truncateAndRedactString(typeof target.label === "string" ? target.label : "", 120),
      text: truncateAndRedactString(typeof target.text === "string" ? target.text : "", 120),
      tagName: typeof target.tagName === "string" ? target.tagName.toLowerCase() : null
    }
  });

  throw new Error(`user_handoff_required: ${risk.reason}`);
}

function userHandoffRiskForTarget(target: ActionParams) {
  const riskContext = target.riskContext && typeof target.riskContext === "object"
    ? target.riskContext as ActionParams
    : {};
  const label = typeof target.label === "string" ? target.label : "";
  const text = typeof target.text === "string" ? target.text : "";
  const actionText = `${label} ${text}`.trim();
  const pageTitle = typeof riskContext.pageTitle === "string" ? riskContext.pageTitle : "";
  const formText = typeof riskContext.formText === "string" ? riskContext.formText : "";
  const pageText = typeof riskContext.pageText === "string" ? riskContext.pageText : "";
  const source = `${actionText} ${pageTitle} ${formText} ${pageText}`.trim();
  const passwordFieldCount =
    typeof riskContext.passwordFieldCount === "number" && Number.isFinite(riskContext.passwordFieldCount)
      ? riskContext.passwordFieldCount
      : 0;

  if (CAPTCHA_HANDOFF_PATTERN.test(source)) {
    return {
      category: "captcha",
      reason: "CAPTCHA or human-verification challenge requires user handoff."
    };
  }

  if (SECURITY_INTERSTITIAL_PATTERN.test(source) && SECURITY_INTERSTITIAL_ACTION_PATTERN.test(actionText)) {
    return {
      category: "browser_security_interstitial",
      reason: "Browser security interstitial bypass requires user handoff."
    };
  }

  if (PAYWALL_BYPASS_PATTERN.test(source)) {
    return {
      category: "paywall_bypass",
      reason: "Paywall bypass requires user handoff."
    };
  }

  if (
    passwordFieldCount > 0 &&
    PASSWORD_CHANGE_ACTION_PATTERN.test(source) &&
    PASSWORD_FINAL_BUTTON_PATTERN.test(actionText)
  ) {
    return {
      category: "password_change_final_submission",
      reason: "Password-change final submission requires user handoff."
    };
  }

  return null;
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

  if (!el.isConnected) {
    return {
      ok: false,
      error: "Element target is detached"
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

  const rect = locatorRectInTopViewport(el);
  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const labelOf = (node) => {
    const rootFor = (candidate) => {
      const root = candidate.getRootNode?.();
      return root && typeof root.querySelectorAll === "function" ? root : document;
    };
    const getElementById = (root, id) => {
      if (!id) return null;
      if (typeof root.getElementById === "function") return root.getElementById(id);
      try {
        return root.querySelector("#" + CSS.escape(id));
      } catch {
        return null;
      }
    };
    const isHiddenForName = (candidate) => {
      if (!(candidate instanceof Element)) return false;
      if (candidate.hidden || candidate.getAttribute("aria-hidden") === "true") return true;
      const style = getComputedStyle(candidate);
      return style.display === "none" || style.visibility === "hidden";
    };
    const textForName = (candidate) => {
      if (!candidate) return "";
      if (candidate.nodeType === Node.TEXT_NODE) return candidate.nodeValue || "";
      if (!(candidate instanceof Element) || isHiddenForName(candidate)) return "";
      const tag = candidate.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return "";
      return Array.from(candidate.childNodes).map((child) => textForName(child)).join(" ");
    };
    const nativeLabelText = (candidate) => {
      const labels = Array.from(candidate.labels || []);
      const text = labels.map((label) => textForName(label)).join(" ");
      return normalizeText(text) ? text : "";
    };
    const svgTitle = (candidate) => {
      if (candidate.tagName?.toLowerCase() !== "svg") return "";
      return textForName(candidate.querySelector("title"));
    };
    const controlValueText = (candidate) => {
      const tag = candidate.tagName?.toLowerCase();
      const type = (candidate.getAttribute?.("type") || "").toLowerCase();
      if (tag === "input" && ["button", "submit", "reset", "image"].includes(type)) {
        return candidate.getAttribute("value") || candidate.value || (type === "submit" ? "Submit" : type === "reset" ? "Reset" : "");
      }
      return "";
    };
    const labelledBy = node.getAttribute?.("aria-labelledby");
    if (labelledBy) {
      const root = rootFor(node);
      const labelledText = labelledBy
        .split(/\\s+/)
        .map((id) => textForName(getElementById(root, id) || document.getElementById(id)))
        .join(" ");
      if (normalizeText(labelledText)) return normalizeText(labelledText);
    }

    for (const candidate of [
      node.getAttribute?.("aria-label"),
      nativeLabelText(node),
      node.getAttribute?.("alt"),
      svgTitle(node),
      controlValueText(node),
      node.getAttribute?.("placeholder"),
      node.getAttribute?.("title"),
      textForName(node),
      node.getAttribute?.("name"),
      node.getAttribute?.("id")
    ]) {
      if (normalizeText(candidate)) return normalizeText(candidate);
    }

    return "";
  };
  const fileChooserFor = (node) => {
    const resolveFileInput = (candidate) => {
      if (!candidate || !(candidate instanceof Element)) return null;
      const tag = candidate.tagName.toLowerCase();
      const type = (candidate.getAttribute("type") || "").toLowerCase();

      if (tag === "input" && type === "file") {
        return candidate;
      }

      if (tag === "label") {
        if (candidate.control && candidate.control.matches?.("input[type=file]")) {
          return candidate.control;
        }

        const nested = candidate.querySelector?.("input[type=file]");
        if (nested) return nested;
      }

      if (candidate.hasAttribute?.("for")) {
        const control = document.getElementById(candidate.getAttribute("for") || "");
        if (control?.matches?.("input[type=file]")) return control;
      }

      const childInput = candidate.querySelector?.("input[type=file]");
      if (childInput) return childInput;

      return null;
    };
    const input = resolveFileInput(node);
    if (!input) return null;
    return {
      ref,
      selector,
      multiple: input.multiple === true,
      accept: input.getAttribute("accept") || "",
      name: input.getAttribute("name") || "",
      inputId: input.getAttribute("id") || ""
    };
  };
  const visibleText = normalizeText(el.innerText || el.textContent || "");
  const nearestForm = el.closest?.("form, [role='form']");
  const formText = normalizeText(nearestForm?.innerText || nearestForm?.textContent || "");
  const pageText = normalizeText(document.body?.innerText || "");
  const passwordFieldCount = nearestForm
    ? nearestForm.querySelectorAll?.("input[type=password]").length || 0
    : document.querySelectorAll("input[type=password]").length;

  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    label: labelOf(el).slice(0, 160),
    text: visibleText.slice(0, 160),
    tagName: el.tagName,
    riskContext: {
      pageTitle: document.title.slice(0, 160),
      formText: formText.slice(0, 500),
      pageText: pageText.slice(0, 1000),
      passwordFieldCount
    },
    fileChooser: fileChooserFor(el),
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
})()`;
}

function normalizeLocatorPlan(locator: any, depth = 0) {
  if (!locator || typeof locator !== "object") {
    throw new Error("locator params require a locator object");
  }

  if (depth > 4) {
    throw new Error("locator nested filters exceed the supported depth");
  }

  const kind = requireString(locator.kind, "locator.kind");
  const allowed = ["css", "text", "role", "label", "placeholder", "testId", "altText", "title", "displayValue"];

  if (!allowed.includes(kind)) {
    throw new Error(`Unsupported locator kind: ${String(locator.kind)}`);
  }

  const selector = kind === "css" ? requireString(locator.selector, "locator.selector") : undefined;
  const text = kind === "text" || kind === "label" || kind === "placeholder" || kind === "altText" || kind === "title" || kind === "displayValue"
    ? requireString(locator.text ?? locator.name, `locator.${kind}.text`)
    : typeof locator.text === "string"
      ? locator.text
      : undefined;
  const role = kind === "role" ? requireString(locator.role, "locator.role") : undefined;
  const name = kind === "role" && typeof locator.name === "string" ? locator.name : undefined;
  const testId = kind === "testId" ? requireString(locator.testId ?? locator.text, "locator.testId") : undefined;
  const index = locator.index == null ? 0 : Math.max(0, Math.floor(numberOrDefault(locator.index, 0)));
  const frameSelectors = Array.isArray(locator.frameSelectors)
    ? locator.frameSelectors.map((selector: any, selectorIndex: number) =>
        requireString(selector, `locator.frameSelectors[${selectorIndex}]`)
      )
    : undefined;
  const within = locator.within == null ? undefined : normalizeLocatorPlan(locator.within, depth + 1);
  const and = locator.and == null ? undefined : normalizeLocatorPlan(locator.and, depth + 1);
  const or = locator.or == null ? undefined : normalizeLocatorPlan(locator.or, depth + 1);
  const has = locator.has == null ? undefined : normalizeLocatorPlan(locator.has, depth + 1);
  const hasNot = locator.hasNot == null ? undefined : normalizeLocatorPlan(locator.hasNot, depth + 1);
  const hasText = typeof locator.hasText === "string" ? locator.hasText : undefined;
  const hasNotText = typeof locator.hasNotText === "string" ? locator.hasNotText : undefined;
  const visible = typeof locator.visible === "boolean" ? locator.visible : undefined;

  return {
    kind,
    selector,
    text,
    role,
    name,
    testId,
    frameSelectors,
    within,
    and,
    or,
    has,
    hasNot,
    hasText,
    hasNotText,
    visible,
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
    "allInnerTexts",
    "textContent",
    "innerText",
    "getAttribute",
    "isVisible",
    "isHidden",
    "isEnabled",
    "isDisabled",
    "isEditable",
    "inputValue",
    "isChecked",
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
    "dragTo",
    "fill",
    "type",
    "press",
    "clear",
    "focus",
    "blur",
    "scrollIntoViewIfNeeded",
    "selectText",
    "hover",
    "highlight",
    "setChecked",
    "selectOption",
    "evaluate",
    "evaluateAll",
    "dispatchEvent"
  ];

  if (!allowed.includes(value)) {
    throw new Error(`Unsupported locator action kind: ${value}`);
  }

  return value;
}

async function resolveLocatorRef(
  tabId: number,
  locator: any,
  actionName: string,
  actionKind = "click",
  actionArgs: any = {},
  options: { executionContextId?: number | null; targetId?: string | null; viewportOffset?: { x: number; y: number } | null; timeoutMs?: number } = {}
) {
  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: locatorTargetExpression(
        locator,
        `agent-locator-${crypto.randomUUID()}`,
        actionKind,
        actionArgs
      ),
      ...(options.executionContextId != null ? { contextId: options.executionContextId } : {}),
      returnByValue: true,
      awaitPromise: true
    },
    {
      targetId: options.targetId ?? null,
      timeoutMs: options.timeoutMs
    }
  );
  const value = readRuntimeValue(evaluated);

  if (!value || value.ok !== true) {
    throwLocatorRuntimeError(value, `Unable to resolve locator for ${actionName}: ${locator.selector}`, {
      operation: "locatorAction",
      actionKind,
      selector: typeof locator.selector === "string" ? locator.selector : locator.kind
    });
  }

  return applyViewportOffsetToLocatorTarget(value, options.viewportOffset ?? { x: 0, y: 0 });
}

async function focusLocator(
  tabId: number,
  locator: any,
  actionArgs: any = {},
  options: { executionContextId?: number | null; targetId?: string | null; timeoutMs?: number } = {},
  clear = false
) {
  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: `(async () => {
  ${locatorResolverSource(locator)}
  ${locatorActionabilitySource("press", actionArgs)}
  const shouldClear = ${clear ? "true" : "false"};
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  const actionability = await checkLocatorActionability(el);
  if (!actionability.ok) return actionability;
  el.focus();

  if (shouldClear) {
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
  }

  return { ok: true };
})()`,
      ...(options.executionContextId != null ? { contextId: options.executionContextId } : {}),
      returnByValue: true,
      awaitPromise: true
    },
    {
      targetId: options.targetId ?? null,
      timeoutMs: options.timeoutMs
    }
  );
  const value = readRuntimeValue(evaluated);

  if (!value || value.ok !== true) {
    throwLocatorRuntimeError(value, `Unable to focus locator: ${locator.selector}`, {
      operation: "locatorAction",
      actionKind: clear ? "clear" : "focus",
      selector: typeof locator.selector === "string" ? locator.selector : locator.kind
    });
  }
}

function locatorTargetExpression(
  locator: any,
  ref: string,
  actionKind = "click",
  actionArgs: any = {}
) {
  return `(async () => {
  ${locatorResolverSource(locator)}
  ${locatorActionabilitySource(actionKind, actionArgs)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  if (!el) {
    return {
      ok: false,
      code: "locator_not_found",
      error: "Element target not found",
      count: resolved.count,
      kind: locatorKind,
      selector: selector || locatorText || locatorRole || locatorTestId || ""
    };
  }

  const ref = ${JSON.stringify(ref)};
  const actionability = await checkLocatorActionability(el);
  if (!actionability.ok) return actionability;

  window.__agentBrowserController = window.__agentBrowserController || {};
  window.__agentBrowserController.elements = window.__agentBrowserController.elements || {};
  window.__agentBrowserController.elements[ref] = el;
  el.setAttribute("data-agent-browser-ref", ref);

  const rawRect = actionability.rect || el.getBoundingClientRect();
  const rect = {
    left: typeof rawRect.left === "number" ? rawRect.left : rawRect.x,
    top: typeof rawRect.top === "number" ? rawRect.top : rawRect.y,
    width: rawRect.width,
    height: rawRect.height
  };
  const hitPoint = actionability.hitPoint && typeof actionability.hitPoint === "object"
    ? actionability.hitPoint
    : null;
  const x = typeof hitPoint?.x === "number" ? hitPoint.x : rect.left + rect.width / 2;
  const y = typeof hitPoint?.y === "number" ? hitPoint.y : rect.top + rect.height / 2;
  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const textForName = (candidate) => {
    if (!candidate) return "";
    if (candidate.nodeType === Node.TEXT_NODE) return candidate.nodeValue || "";
    if (!(candidate instanceof Element)) return "";
    if (candidate.hidden || candidate.getAttribute("aria-hidden") === "true") return "";
    const style = getComputedStyle(candidate);
    if (style.display === "none" || style.visibility === "hidden") return "";
    const tag = candidate.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return "";
    return Array.from(candidate.childNodes).map((child) => textForName(child)).join(" ");
  };
  const labelledBy = el.getAttribute?.("aria-labelledby");
  const labelledText = labelledBy
    ? labelledBy
        .split(/\\s+/)
        .map((id) => textForName(document.getElementById(id)))
        .join(" ")
    : "";
  const labelText = normalizeText(
    labelledText ||
    el.getAttribute?.("aria-label") ||
    Array.from(el.labels || []).map((label) => textForName(label)).join(" ") ||
    el.getAttribute?.("alt") ||
    el.getAttribute?.("title") ||
    el.getAttribute?.("placeholder") ||
    textForName(el) ||
    el.getAttribute?.("name") ||
    el.getAttribute?.("id")
  );
  const visibleText = normalizeText(el.innerText || el.textContent || "");
  const nearestForm = el.closest?.("form, [role='form']");
  const formText = normalizeText(nearestForm?.innerText || nearestForm?.textContent || "");
  const pageText = normalizeText(document.body?.innerText || "");
  const passwordFieldCount = nearestForm
    ? nearestForm.querySelectorAll?.("input[type=password]").length || 0
    : document.querySelectorAll("input[type=password]").length;
  const fileChooserFor = (node) => {
    const resolveFileInput = (candidate) => {
      if (!candidate || !(candidate instanceof Element)) return null;
      const tag = candidate.tagName.toLowerCase();
      const type = (candidate.getAttribute("type") || "").toLowerCase();

      if (tag === "input" && type === "file") {
        return candidate;
      }

      if (tag === "label") {
        if (candidate.control && candidate.control.matches?.("input[type=file]")) {
          return candidate.control;
        }

        const nested = candidate.querySelector?.("input[type=file]");
        if (nested) return nested;
      }

      if (candidate.hasAttribute?.("for")) {
        const control = document.getElementById(candidate.getAttribute("for") || "");
        if (control?.matches?.("input[type=file]")) return control;
      }

      const childInput = candidate.querySelector?.("input[type=file]");
      if (childInput) return childInput;

      return null;
    };
    const input = resolveFileInput(node);
    if (!input) return null;
    return {
      ref,
      selector: locatorKind === "css" ? selector : null,
      multiple: input.multiple === true,
      accept: input.getAttribute("accept") || "",
      name: input.getAttribute("name") || "",
      inputId: input.getAttribute("id") || ""
    };
  };

  return {
    ok: true,
    ref,
    x,
    y,
    hitPoint: hitPoint
      ? {
          x,
          y,
          name: typeof hitPoint.name === "string" ? hitPoint.name : "candidate"
        }
      : null,
    label: labelText.slice(0, 160),
    text: visibleText.slice(0, 160),
    tagName: el.tagName,
    riskContext: {
      pageTitle: document.title.slice(0, 160),
      formText: formText.slice(0, 500),
      pageText: pageText.slice(0, 1000),
      passwordFieldCount
    },
    fileChooser: fileChooserFor(el),
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
})()`;
}

function resolveFrameSelectorPathExpression(frameSelectors: string[]) {
  return `(() => {
  const frameSelectors = ${JSON.stringify(frameSelectors)};
  const queryAllPiercingOpenShadow = (query, root = document) => {
    const out = [];
    const seen = new Set();
    const visit = (scope) => {
      let matches = [];
      try {
        matches = Array.from(scope.querySelectorAll(query));
      } catch {
        matches = [];
      }

      for (const el of matches) {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      }

      let descendants = [];
      try {
        descendants = Array.from(scope.querySelectorAll("*"));
      } catch {
        descendants = [];
      }

      for (const el of descendants) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };

    visit(root);
    return out;
  };
  const absoluteUrl = (value, base) => {
    if (!value) return null;
    try {
      return new URL(value, base || document.baseURI).href;
    } catch {
      return String(value);
    }
  };
  const rectInTopViewport = (node) => {
    const rect = node.getBoundingClientRect();
    let x = rect.left;
    let y = rect.top;
    let currentWindow = node.ownerDocument?.defaultView || null;

    while (currentWindow && currentWindow !== window) {
      const frame = currentWindow.frameElement;
      if (!frame) break;
      const frameRect = frame.getBoundingClientRect();
      x += frameRect.left;
      y += frameRect.top;
      currentWindow = currentWindow.parent;
    }

    return {
      x,
      y,
      left: x,
      top: y,
      right: x + rect.width,
      bottom: y + rect.height,
      width: rect.width,
      height: rect.height
    };
  };
  let currentRoot = document;
  const path = [];

  for (let index = 0; index < frameSelectors.length; index += 1) {
    const selector = frameSelectors[index];
    const frame = queryAllPiercingOpenShadow(selector, currentRoot)
      .find((candidate) => candidate instanceof HTMLIFrameElement || candidate instanceof HTMLFrameElement);

    if (!frame) {
      return {
        ok: false,
        error: "Frame locator could not find frame: " + selector,
        path
      };
    }

    let frameDocument = null;
    try {
      frameDocument = frame.contentDocument;
    } catch {
      frameDocument = null;
    }

    const src = frame.getAttribute("src") || frame.src || null;
    const url = frameDocument?.location?.href || absoluteUrl(src, currentRoot?.baseURI || document.baseURI);
    const rect = rectInTopViewport(frame);
    path.push({
      selector,
      id: frame.getAttribute("id") || null,
      name: frame.getAttribute("name") || frame.name || null,
      title: frame.getAttribute("title") || null,
      src: src ? absoluteUrl(src, currentRoot?.baseURI || document.baseURI) : null,
      url,
      accessible: frameDocument != null,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      viewportOffset: {
        x: rect.x,
        y: rect.y
      }
    });

    if (!frameDocument && index < frameSelectors.length - 1) {
      return {
        ok: false,
        error: "Frame locator cannot traverse cross-origin or unavailable frame: " + selector,
        path
      };
    }

    if (frameDocument) {
      currentRoot = frameDocument;
    }
  }

  return {
    ok: true,
    accessible: path.length > 0 ? path[path.length - 1].accessible === true : false,
    path
  };
})()`;
}

function matchResolvedFramePathToFrameTree(path: ActionParams[], frameTree: ActionParams | null | undefined) {
  let current = frameTree && typeof frameTree === "object" ? frameTree : null;
  const matchedPath: ActionParams[] = [];

  if (!current || !Array.isArray(path)) {
    return {
      node: null,
      frame: null,
      path: matchedPath
    };
  }

  for (const step of path) {
    const children = Array.isArray(current.childFrames) ? current.childFrames : [];
    const best = children
      .map((candidate: ActionParams) => ({
        candidate,
        score: scoreResolvedFrameCandidate(step, candidate?.frame)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.candidate ?? null;

    if (!best) {
      return {
        node: null,
        frame: null,
        path: matchedPath
      };
    }

    matchedPath.push(best);
    current = best;
  }

  return {
    node: current,
    frame: current?.frame ?? null,
    path: matchedPath
  };
}

async function resolveFramePathTarget(
  tabId: number,
  path: ActionParams[],
  timeoutMs: number
) {
  if (!Array.isArray(path) || path.length === 0) {
    return null;
  }

  const lastStep = path[path.length - 1];
  const targets = await cdp(tabId, "Target.getTargets", {}, { timeoutMs });
  const targetInfos = Array.isArray(targets?.targetInfos) ? targets.targetInfos : [];
  const candidates = targetInfos
    .map((targetInfo: ActionParams) => {
      const targetId = normalizeDebuggerTargetId(targetInfo);
      if (!targetId) {
        return null;
      }

      const targetTabId = typeof targetInfo.tabId === "number" ? targetInfo.tabId : null;
      if (targetTabId != null && targetTabId !== tabId) {
        return null;
      }

      const targetType = typeof targetInfo.type === "string" ? targetInfo.type : "";
      if (targetType && !["iframe", "page", "background_page", "webview"].includes(targetType)) {
        return null;
      }

      return {
        targetId,
        score: scoreResolvedFrameCandidate(lastStep, {
          id: targetId,
          name: targetInfo.title,
          url: targetInfo.url
        })
      };
    })
    .filter((entry: { targetId: string; score: number } | null): entry is { targetId: string; score: number } =>
      entry != null && entry.score > 0
    )
    .sort((left, right) => right.score - left.score);

  for (const candidate of candidates) {
    try {
      const frameTree = await cdp(tabId, "Page.getFrameTree", {}, {
        targetId: candidate.targetId,
        timeoutMs
      });
      const match = matchResolvedFramePathToFrameTree(path, frameTree?.frameTree);
      const rootMatch = match.frame
        ? match
        : matchResolvedFramePathToFrameTreeRoot(path, frameTree?.frameTree);

      if (rootMatch.frame) {
        return {
          targetId: candidate.targetId,
          match: rootMatch,
          matchPathOffset: Math.max(0, path.length - rootMatch.path.length),
          targetViewportOffset: { x: 0, y: 0 }
        };
      }
    } catch {
      // Some discovered targets disappear or reject debugger attachment. Try the
      // next candidate before reporting the frame as unresolved.
    }
  }

  return null;
}

async function continueResolveFramePathInTarget(
  tabId: number,
  frameSelectors: string[],
  resolved: ActionParams | null | undefined,
  timeoutMs: number
) {
  const partialPath = Array.isArray(resolved?.path) ? resolved.path : [];

  if (partialPath.length === 0 || partialPath.length >= frameSelectors.length) {
    return null;
  }

  const targetMatch = await resolveFramePathTarget(tabId, partialPath, timeoutMs);
  if (!targetMatch) {
    return null;
  }

  const remainingSelectors = frameSelectors.slice(partialPath.length);
  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
      expression: resolveFrameSelectorPathExpression(remainingSelectors),
      returnByValue: true,
      awaitPromise: true
    },
    {
      targetId: targetMatch.targetId,
      timeoutMs
    }
  );
  const continued = readRuntimeValue(evaluated);

  if (!continued || continued.ok !== true) {
    return null;
  }

  const targetPath = Array.isArray(continued.path) ? continued.path : [];
  if (targetPath.length === 0) {
    return null;
  }

  const frameTree = await cdp(tabId, "Page.getFrameTree", {}, {
    targetId: targetMatch.targetId,
    timeoutMs
  });
  const match = matchResolvedFramePathToFrameTree(targetPath, frameTree?.frameTree);

  if (!match.frame) {
    return null;
  }

  return {
    targetId: targetMatch.targetId,
    match,
    matchPathOffset: partialPath.length,
    resolved: {
      ok: true,
      accessible: continued.accessible === true,
      path: [...partialPath, ...targetPath],
      targetViewportOffset: coerceViewportOffset(
        targetPath.length ? targetPath[targetPath.length - 1]?.viewportOffset : null
      )
    }
  };
}

function matchResolvedFramePathToFrameTreeRoot(path: ActionParams[], frameTree: ActionParams | null | undefined) {
  const root = frameTree && typeof frameTree === "object" ? frameTree : null;
  const lastStep = Array.isArray(path) && path.length ? path[path.length - 1] : null;

  if (!root || !lastStep || scoreResolvedFrameCandidate(lastStep, root.frame) <= 0) {
    return {
      node: null,
      frame: null,
      path: []
    };
  }

  return {
    node: root,
    frame: root.frame ?? null,
    path: [root]
  };
}

function scoreResolvedFrameCandidate(step: ActionParams, frame: ActionParams | null | undefined) {
  if (!frame || typeof frame !== "object") {
    return 0;
  }

  let score = 0;
  const stepUrl = typeof step.url === "string" ? stripUrlHash(step.url) : null;
  const stepSrc = typeof step.src === "string" ? stripUrlHash(step.src) : null;
  const frameUrl = typeof frame.url === "string" ? stripUrlHash(frame.url) : null;
  const stepName = typeof step.name === "string" && step.name.trim() ? step.name.trim() : null;
  const frameName = typeof frame.name === "string" && frame.name.trim() ? frame.name.trim() : null;

  if (stepUrl && frameUrl && stepUrl === frameUrl) score += 8;
  if (stepSrc && frameUrl && stepSrc === frameUrl) score += 6;
  if (stepName && frameName && stepName === frameName) score += 4;
  if (typeof frame.id === "string" && frame.id) score += 1;

  return score;
}

function normalizeDebuggerTargetId(targetInfo: ActionParams) {
  const value =
    typeof targetInfo.targetId === "string" && targetInfo.targetId.trim()
      ? targetInfo.targetId
      : typeof targetInfo.id === "string" && targetInfo.id.trim()
        ? targetInfo.id
        : null;

  return value ? value.trim() : null;
}

function stripUrlHash(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return value.split("#", 1)[0];
  }
}

function locatorActionabilitySource(actionKind: string, actionArgs: any = {}) {
  const requiresEditable = ["fill", "type", "clear"].includes(actionKind);
  const requiresPointer = ["click", "dblclick", "dragTo", "hover"].includes(actionKind);
  const requiresEnabled = [
    "click",
    "dblclick",
    "dragTo",
    "fill",
    "type",
    "press",
    "clear",
    "setChecked",
    "selectOption"
  ].includes(actionKind);

  return `
  const locatorActionabilityKind = ${JSON.stringify(actionKind)};
  const locatorActionabilityForce = ${actionArgs?.force === true ? "true" : "false"};
  const locatorActionabilityRequiresVisible = true;
  const locatorActionabilityRequiresEnabled = ${requiresEnabled ? "true" : "false"};
  const locatorActionabilityRequiresEditable = ${requiresEditable ? "true" : "false"};
  const locatorActionabilityRequiresPointer = ${requiresPointer ? "true" : "false"};
  const locatorActionabilityRect = (node) => {
    const rect = (() => {
      const localRect = node.getBoundingClientRect();
      let x = localRect.left;
      let y = localRect.top;
      let currentWindow = node.ownerDocument?.defaultView || null;

      while (currentWindow && currentWindow !== window) {
        const frame = currentWindow.frameElement;
        if (!frame) break;
        const frameRect = frame.getBoundingClientRect();
        x += frameRect.left;
        y += frameRect.top;
        currentWindow = currentWindow.parent;
      }

      return {
        left: x,
        top: y,
        width: localRect.width,
        height: localRect.height
      };
    })();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };
  };
  const locatorActionabilityDelay = () => new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    } else {
      setTimeout(resolve, 32);
    }
  });
  const locatorActionabilityVisible = (node, rect) => {
    const style = getComputedStyle(node);
    return style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;
  };
  const locatorActionabilityInert = (node) => {
    return typeof node.closest === "function" && Boolean(node.closest("[inert]"));
  };
  const locatorActionabilityPointerEvents = (node) => {
    const style = getComputedStyle(node);
    if (style.pointerEvents === "none") {
      return false;
    }

    let current = node.parentElement;
    while (current) {
      const currentStyle = getComputedStyle(current);
      if (currentStyle.pointerEvents === "none") {
        return false;
      }
      current = current.parentElement;
    }

    return true;
  };
  const locatorActionabilityElementFromPoint = (x, y) => {
    let current = document.elementFromPoint(x, y);
    let localX = x;
    let localY = y;

    while (current) {
      if (current?.shadowRoot) {
        const nested = current.shadowRoot.elementFromPoint?.(localX, localY);
        if (nested && nested !== current) {
          current = nested;
          continue;
        }
      }

      if (current instanceof HTMLIFrameElement || current instanceof HTMLFrameElement) {
        let frameDocument = null;
        try {
          frameDocument = current.contentDocument;
        } catch {
          frameDocument = null;
        }

        if (!frameDocument) break;
        const frameRect = current.getBoundingClientRect();
        localX -= frameRect.left;
        localY -= frameRect.top;
        const nested = frameDocument.elementFromPoint(localX, localY);
        if (!nested || nested === current) break;
        current = nested;
        continue;
      }

      break;
    }

    return current;
  };
  const locatorActionabilityOwnsPointerTop = (node, top) => {
    if (!top) return false;
    if (top === node || node.contains(top)) return true;

    let current = top;
    while (current) {
      const root = current.getRootNode?.();
      const host = root?.host instanceof Element ? root.host : null;
      if (!host) return false;
      if (host === node || node.contains(host)) return true;
      current = host;
    }

    return false;
  };
  const locatorActionabilityCandidatePoints = (rect) => {
    const left = Math.max(0, rect.x);
    const right = Math.min(window.innerWidth, rect.x + rect.width);
    const top = Math.max(0, rect.y);
    const bottom = Math.min(window.innerHeight, rect.y + rect.height);

    if (right <= 0 || bottom <= 0 || left >= window.innerWidth || top >= window.innerHeight) {
      return [];
    }

    const inset = Math.min(8, Math.max(1, Math.min(right - left, bottom - top) / 4));
    const centerX = left + (right - left) / 2;
    const centerY = top + (bottom - top) / 2;
    const candidates = [
      { x: centerX, y: centerY, name: "center" },
      { x: left + inset, y: top + inset, name: "top-left" },
      { x: right - inset, y: top + inset, name: "top-right" },
      { x: left + inset, y: bottom - inset, name: "bottom-left" },
      { x: right - inset, y: bottom - inset, name: "bottom-right" },
      { x: centerX, y: top + inset, name: "top" },
      { x: centerX, y: bottom - inset, name: "bottom" },
      { x: left + inset, y: centerY, name: "left" },
      { x: right - inset, y: centerY, name: "right" }
    ];
    const seen = new Set();
    return candidates.filter((point) => {
      if (point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) {
        return false;
      }

      const key = Math.round(point.x * 100) + ":" + Math.round(point.y * 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const locatorActionabilityEnabled = (node) => {
    if (node.disabled || node.getAttribute("aria-disabled") === "true") {
      return false;
    }

    if (typeof node.closest === "function" && node.closest("[aria-disabled='true']")) {
      return false;
    }

    if (typeof node.closest === "function") {
      const fieldset = node.closest("fieldset[disabled]");
      if (fieldset) {
        const firstLegend = Array.from(fieldset.children).find((child) => child.tagName?.toLowerCase() === "legend");
        if (!firstLegend || (firstLegend !== node && !firstLegend.contains(node))) {
          return false;
        }
      }
    }

    return true;
  };
  const locatorActionabilityReadonly = (node) => {
    if (node.readOnly === true || node.getAttribute("aria-readonly") === "true") {
      return true;
    }

    return typeof node.closest === "function" && Boolean(node.closest("[aria-readonly='true']"));
  };
  const locatorActionabilityEditable = (node) => {
    if (!locatorActionabilityEnabled(node) || locatorActionabilityReadonly(node)) {
      return false;
    }

    const tag = node.tagName.toLowerCase();
    const type = (node.getAttribute("type") || "").toLowerCase();
    const isTextInput = tag === "textarea" ||
      (tag === "input" && !["button", "checkbox", "file", "hidden", "image", "radio", "reset", "submit"].includes(type));
    return node.isContentEditable || isTextInput;
  };
  const locatorActionabilityStable = async (node) => {
    const first = locatorActionabilityRect(node);
    await locatorActionabilityDelay();

    if (!node.isConnected) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element detached during actionability check",
        code: "detached"
      };
    }

    const second = locatorActionabilityRect(node);
    const stable =
      Math.abs(first.x - second.x) < 0.25 &&
      Math.abs(first.y - second.y) < 0.25 &&
      Math.abs(first.width - second.width) < 0.25 &&
      Math.abs(first.height - second.height) < 0.25;

    return stable
      ? { ok: true, rect: second }
      : {
          ok: false,
          error: "Locator actionability failed for " + locatorActionabilityKind + ": element bounding box is not stable",
          code: "not_stable"
        };
  };
  const locatorActionabilityReceivesPointer = (node, rect) => {
    const points = locatorActionabilityCandidatePoints(rect);

    if (!points.length) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element is outside the viewport",
        code: "outside_viewport"
      };
    }

    const blocked = [];
    for (const point of points) {
      const top = locatorActionabilityElementFromPoint(point.x, point.y);
      if (locatorActionabilityOwnsPointerTop(node, top)) {
        return {
          ok: true,
          hitPoint: {
            x: point.x,
            y: point.y,
            name: point.name
          }
        };
      }

      blocked.push(point.name);
    }

    return {
      ok: false,
      error: "Locator actionability failed for " + locatorActionabilityKind + ": element does not receive pointer events at candidate points (" + blocked.join(", ") + ")",
      code: "occluded",
      blockedPoints: blocked
    };
  };
  const checkLocatorActionability = async (node) => {
    if (!node || !node.isConnected) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element is detached",
        code: "detached"
      };
    }

    node.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant"
    });

    const stable = await locatorActionabilityStable(node);
    if (!stable.ok) return stable;

    const rect = stable.rect;
    if (locatorActionabilityForce) {
      return { ok: true, rect };
    }

    if (locatorActionabilityRequiresVisible && !locatorActionabilityVisible(node, rect)) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element is not visible",
        code: "not_visible"
      };
    }

    if (locatorActionabilityInert(node)) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element is inside an inert subtree",
        code: "inert"
      };
    }

    if (locatorActionabilityRequiresEnabled && !locatorActionabilityEnabled(node)) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element is disabled",
        code: "disabled"
      };
    }

    if (locatorActionabilityRequiresEditable && !locatorActionabilityEditable(node)) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element is not editable",
        code: "not_editable"
      };
    }

    if (locatorActionabilityRequiresPointer) {
      if (!locatorActionabilityPointerEvents(node)) {
        return {
          ok: false,
          error: "Locator actionability failed for " + locatorActionabilityKind + ": element or ancestor has pointer-events:none",
          code: "pointer_events_none"
        };
      }

      const receivesPointer = locatorActionabilityReceivesPointer(node, rect);
      if (!receivesPointer.ok) return receivesPointer;
      return { ok: true, rect, hitPoint: receivesPointer.hitPoint };
    }

    return { ok: true, rect };
  };
`;
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

  const resolveFileInput = (candidate) => {
    if (!candidate || !(candidate instanceof Element)) return null;
    const tag = candidate.tagName.toLowerCase();
    const type = (candidate.getAttribute("type") || "").toLowerCase();

    if (tag === "input" && type === "file") {
      return candidate;
    }

    if (tag === "label") {
      if (candidate.control && candidate.control.matches?.("input[type=file]")) {
        return candidate.control;
      }

      const nested = candidate.querySelector?.("input[type=file]");
      if (nested) return nested;
    }

    if (candidate.hasAttribute?.("for")) {
      const control = document.getElementById(candidate.getAttribute("for") || "");
      if (control?.matches?.("input[type=file]")) return control;
    }

    const childInput = candidate.querySelector?.("input[type=file]");
    if (childInput) return childInput;

    return null;
  };
  const fileInput = resolveFileInput(el);

  if (!fileInput) {
    return {
      ok: false,
      error: "Element does not resolve to input[type=file]"
    };
  }

  fileInput.setAttribute("data-agent-upload-marker", marker);
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
  const locatorFrameSelectors = ${JSON.stringify(locator.frameSelectors ?? [])};
  const locatorAnd = ${JSON.stringify(locator.and ?? null)};
  const locatorOr = ${JSON.stringify(locator.or ?? null)};
  const locatorHas = ${JSON.stringify(locator.has ?? null)};
  const locatorHasNot = ${JSON.stringify(locator.hasNot ?? null)};
  const locatorHasText = ${JSON.stringify(locator.hasText ?? "")};
  const locatorHasNotText = ${JSON.stringify(locator.hasNotText ?? "")};
  const locatorVisible = ${typeof locator.visible === "boolean" ? JSON.stringify(locator.visible) : "undefined"};
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
  const locatorTextMatchesForConfig = (actual, expected, config = locator) => {
    const a = locatorNormalizeText(actual);
    const e = locatorNormalizeText(expected);
    if (!e) return false;
    return config.exact === true ? a === e : a.toLowerCase().includes(e.toLowerCase());
  };
  const locatorQueryAllPiercingOpenShadow = (query, root = document) => {
    const out = [];
    const seen = new Set();
    const visit = (scope) => {
      let matches = [];
      try {
        matches = Array.from(scope.querySelectorAll(query));
      } catch {
        matches = [];
      }

      for (const el of matches) {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      }

      let descendants = [];
      try {
        descendants = Array.from(scope.querySelectorAll("*"));
      } catch {
        descendants = [];
      }

      for (const el of descendants) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };

    visit(root);
    return out;
  };
  const locatorResolveFrameRoot = (config, root = document) => {
    let currentRoot = root;
    const selectors = Array.isArray(config?.frameSelectors) ? config.frameSelectors : [];

    for (const frameSelector of selectors) {
      const frame = locatorQueryAllPiercingOpenShadow(frameSelector, currentRoot)
        .find((candidate) => candidate instanceof HTMLIFrameElement || candidate instanceof HTMLFrameElement);

      if (!frame) {
        throw new Error("Frame locator could not find frame: " + frameSelector);
      }

      let frameDocument = null;
      try {
        frameDocument = frame.contentDocument;
      } catch {
        frameDocument = null;
      }

      if (!frameDocument) {
        throw new Error("Frame locator cannot access cross-origin or unavailable frame: " + frameSelector);
      }

      currentRoot = frameDocument;
    }

    return currentRoot;
  };
  const locatorRectInTopViewport = (el) => {
    const rect = el.getBoundingClientRect();
    let x = rect.left;
    let y = rect.top;
    let currentWindow = el.ownerDocument?.defaultView || null;

    while (currentWindow && currentWindow !== window) {
      const frame = currentWindow.frameElement;
      if (!frame) break;
      const frameRect = frame.getBoundingClientRect();
      x += frameRect.left;
      y += frameRect.top;
      currentWindow = currentWindow.parent;
    }

    return {
      x,
      y,
      left: x,
      top: y,
      right: x + rect.width,
      bottom: y + rect.height,
      width: rect.width,
      height: rect.height
    };
  };
  const locatorElementFromPointDeep = (x, y) => {
    let current = document.elementFromPoint(x, y);
    let localX = x;
    let localY = y;

    while (current) {
      if (current?.shadowRoot) {
        const nested = current.shadowRoot.elementFromPoint?.(localX, localY);
        if (nested && nested !== current) {
          current = nested;
          continue;
        }
      }

      if (current instanceof HTMLIFrameElement || current instanceof HTMLFrameElement) {
        let frameDocument = null;
        try {
          frameDocument = current.contentDocument;
        } catch {
          frameDocument = null;
        }

        if (!frameDocument) break;
        const frameRect = current.getBoundingClientRect();
        localX -= frameRect.left;
        localY -= frameRect.top;
        const nested = frameDocument.elementFromPoint(localX, localY);
        if (!nested || nested === current) break;
        current = nested;
        continue;
      }

      break;
    }

    return current;
  };
  const locatorRootFor = (el) => {
    const root = el?.getRootNode?.();
    return root && typeof root.querySelectorAll === "function" ? root : document;
  };
  const locatorGetElementById = (root, id) => {
    if (!id) return null;
    if (typeof root.getElementById === "function") return root.getElementById(id);
    try {
      return root.querySelector("#" + CSS.escape(id));
    } catch {
      return null;
    }
  };
  const locatorIsHiddenForName = (node) => {
    if (!(node instanceof Element)) return false;
    if (node.hidden || node.getAttribute("aria-hidden") === "true") return true;
    const style = getComputedStyle(node);
    return style.display === "none" || style.visibility === "hidden";
  };
  const locatorTextForName = (node) => {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (!(node instanceof Element) || locatorIsHiddenForName(node)) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return "";
    return Array.from(node.childNodes).map((child) => locatorTextForName(child)).join(" ");
  };
  const locatorTextForFilter = (el) => String(el?.textContent || "");
  const locatorNativeLabelText = (el) => {
    const labels = Array.from(el.labels || []);
    const text = labels.map((label) => locatorTextForName(label)).join(" ");
    return locatorNormalizeText(text) ? text : "";
  };
  const locatorSvgTitle = (el) => {
    if (el.tagName.toLowerCase() !== "svg") return "";
    return locatorTextForName(el.querySelector("title"));
  };
  const locatorControlValueText = (el) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (tag === "input" && ["button", "submit", "reset", "image"].includes(type)) {
      return el.getAttribute("value") || el.value || (type === "submit" ? "Submit" : type === "reset" ? "Reset" : "");
    }
    return "";
  };
  const locatorDisplayValues = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return [el.value || ""];
    if (tag === "input") return [el.value || ""];
    if (tag === "select") {
      return Array.from(el.selectedOptions || []).flatMap((option) => [
        option.value || "",
        option.label || "",
        option.textContent || ""
      ]);
    }
    return [];
  };
  const locatorElementVisible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = locatorRectInTopViewport(el);
    return style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;
  };
  const locatorImplicitRole = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "img") return "img";
    if (tag === "svg") return "img";
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
      const root = locatorRootFor(el);
      const text = labelledBy
        .split(/\\s+/)
        .map((id) => {
          const label = locatorGetElementById(root, id) || document.getElementById(id);
          return locatorTextForName(label);
        })
        .join(" ");
      if (locatorNormalizeText(text)) return text;
    }

    for (const candidate of [
      el.getAttribute("aria-label"),
      locatorNativeLabelText(el),
      el.getAttribute("alt"),
      locatorSvgTitle(el),
      locatorControlValueText(el),
      el.getAttribute("placeholder"),
      el.getAttribute("title"),
      locatorTextForName(el),
      el.getAttribute("name"),
      el.getAttribute("id")
    ]) {
      if (locatorNormalizeText(candidate)) return candidate;
    }

    return "";
  };
  const locatorElementsForKind = () => {
    if (locatorKind === "css") {
      return locatorQueryAllPiercingOpenShadow(selector);
    }

    if (locatorKind === "testId") {
      return locatorQueryAllPiercingOpenShadow("[data-testid]")
        .filter((el) => locatorTextMatches(el.getAttribute("data-testid"), locatorTestId));
    }

    if (locatorKind === "placeholder") {
      return locatorQueryAllPiercingOpenShadow("input[placeholder], textarea[placeholder]")
        .filter((el) => locatorTextMatches(el.getAttribute("placeholder"), locatorText));
    }

    if (locatorKind === "altText") {
      return locatorQueryAllPiercingOpenShadow("img[alt], input[type=image][alt], area[alt]")
        .filter((el) => locatorTextMatches(el.getAttribute("alt"), locatorText));
    }

    if (locatorKind === "title") {
      const matches = locatorQueryAllPiercingOpenShadow("[title]")
        .filter((el) => locatorTextMatches(el.getAttribute("title"), locatorText));
      const svgMatches = locatorQueryAllPiercingOpenShadow("svg")
        .filter((el) => locatorTextMatches(locatorSvgTitle(el), locatorText));
      return Array.from(new Set([...matches, ...svgMatches]));
    }

    if (locatorKind === "displayValue") {
      return locatorQueryAllPiercingOpenShadow("input, textarea, select")
        .filter((el) => locatorDisplayValues(el).some((value) => locatorTextMatches(value, locatorText)));
    }

    if (locatorKind === "label") {
      const matches = [];
      for (const label of locatorQueryAllPiercingOpenShadow("label")) {
        if (!locatorTextMatches(locatorTextForName(label), locatorText)) continue;
        const root = locatorRootFor(label);
        const control = label.control || (label.getAttribute("for") ? locatorGetElementById(root, label.getAttribute("for")) : null);
        if (control) matches.push(control);
      }
      for (const el of locatorQueryAllPiercingOpenShadow("[aria-label], [aria-labelledby]")) {
        if (locatorTextMatches(locatorAccessibleName(el), locatorText)) matches.push(el);
      }
      return Array.from(new Set(matches));
    }

    if (locatorKind === "role") {
      return locatorQueryAllPiercingOpenShadow("*")
        .filter((el) => locatorImplicitRole(el) === locatorRole)
        .filter((el) => !locatorName || locatorTextMatches(locatorAccessibleName(el), locatorName));
    }

    if (locatorKind === "text") {
      const candidates = locatorQueryAllPiercingOpenShadow("*")
        .filter((el) => locatorTextMatches(locatorTextForName(el), locatorText));
      return candidates.filter((el) => {
        return !Array.from(el.children).some((child) => locatorTextMatches(locatorTextForName(child), locatorText));
      });
    }

    return [];
  };
  const locatorElementsForConfig = (config, root = document) => {
    const searchRoot = locatorResolveFrameRoot(config, root);
    const configKind = config?.kind;
    const configSelector = config?.selector || "";
    const configText = config?.text ?? config?.name ?? "";
    const configRole = config?.role || "";
    const configName = typeof config?.name === "string" ? config.name : "";
    const configTestId = config?.testId ?? config?.text ?? "";
    const textMatches = (actual, expected) => locatorTextMatchesForConfig(actual, expected, config);

    if (configKind === "css") {
      return locatorQueryAllPiercingOpenShadow(configSelector, searchRoot);
    }

    if (configKind === "testId") {
      return locatorQueryAllPiercingOpenShadow("[data-testid]", searchRoot)
        .filter((el) => textMatches(el.getAttribute("data-testid"), configTestId));
    }

    if (configKind === "placeholder") {
      return locatorQueryAllPiercingOpenShadow("input[placeholder], textarea[placeholder]", searchRoot)
        .filter((el) => textMatches(el.getAttribute("placeholder"), configText));
    }

    if (configKind === "altText") {
      return locatorQueryAllPiercingOpenShadow("img[alt], input[type=image][alt], area[alt]", searchRoot)
        .filter((el) => textMatches(el.getAttribute("alt"), configText));
    }

    if (configKind === "title") {
      const matches = locatorQueryAllPiercingOpenShadow("[title]", searchRoot)
        .filter((el) => textMatches(el.getAttribute("title"), configText));
      const svgMatches = locatorQueryAllPiercingOpenShadow("svg", searchRoot)
        .filter((el) => textMatches(locatorSvgTitle(el), configText));
      return Array.from(new Set([...matches, ...svgMatches]));
    }

    if (configKind === "displayValue") {
      return locatorQueryAllPiercingOpenShadow("input, textarea, select", searchRoot)
        .filter((el) => locatorDisplayValues(el).some((value) => textMatches(value, configText)));
    }

    if (configKind === "label") {
      const matches = [];
      for (const label of locatorQueryAllPiercingOpenShadow("label", searchRoot)) {
        if (!textMatches(locatorTextForName(label), configText)) continue;
        const labelRoot = locatorRootFor(label);
        const control = label.control || (label.getAttribute("for") ? locatorGetElementById(labelRoot, label.getAttribute("for")) : null);
        if (control) matches.push(control);
      }
      for (const el of locatorQueryAllPiercingOpenShadow("[aria-label], [aria-labelledby]", searchRoot)) {
        if (textMatches(locatorAccessibleName(el), configText)) matches.push(el);
      }
      return Array.from(new Set(matches));
    }

    if (configKind === "role") {
      return locatorQueryAllPiercingOpenShadow("*", searchRoot)
        .filter((el) => locatorImplicitRole(el) === configRole)
        .filter((el) => !configName || textMatches(locatorAccessibleName(el), configName));
    }

    if (configKind === "text") {
      const candidates = locatorQueryAllPiercingOpenShadow("*", searchRoot)
        .filter((el) => textMatches(locatorTextForName(el), configText));
      return candidates.filter((el) => {
        return !Array.from(el.children).some((child) => textMatches(locatorTextForName(child), configText));
      });
    }

    return [];
  };
  const locatorFilteredElementsForConfig = (config, root = document) => {
    if (config?.within) {
      const parentMatches = locatorFilteredElementsForConfig(config.within, root);
      const parentIndex = config.within?.index == null ? null : Math.max(0, Math.floor(Number(config.within.index) || 0));
      const parents = parentIndex == null
        ? parentMatches
        : parentMatches[parentIndex]
          ? [parentMatches[parentIndex]]
          : [];
      const childConfig = { ...config };
      delete childConfig.within;
      delete childConfig.frameSelectors;

      const scoped = [];
      const seenScoped = new Set();
      for (const parent of parents) {
        for (const el of locatorFilteredElementsForConfig(childConfig, parent)) {
          if (!seenScoped.has(el)) {
            seenScoped.add(el);
            scoped.push(el);
          }
        }
      }
      return scoped;
    }

    let elements = locatorElementsForConfig(config, root);

    if (config?.and) {
      const andElements = new Set(locatorFilteredElementsForConfig(config.and, root));
      elements = elements.filter((el) => andElements.has(el));
    }

    if (config?.hasText) {
      elements = elements.filter((el) => locatorTextMatchesForConfig(locatorTextForFilter(el), config.hasText, config));
    }

    if (config?.hasNotText) {
      elements = elements.filter((el) => !locatorTextMatchesForConfig(locatorTextForFilter(el), config.hasNotText, config));
    }

    if (typeof config?.visible === "boolean") {
      elements = elements.filter((el) => locatorElementVisible(el) === config.visible);
    }

    if (config?.has) {
      elements = elements.filter((el) => locatorFilteredElementsForConfig(config.has, el).length > 0);
    }

    if (config?.hasNot) {
      elements = elements.filter((el) => locatorFilteredElementsForConfig(config.hasNot, el).length === 0);
    }

    if (config?.or) {
      const seen = new Set(elements);
      for (const el of locatorFilteredElementsForConfig(config.or, root)) {
        if (!seen.has(el)) {
          seen.add(el);
          elements.push(el);
        }
      }
    }

    return elements;
  };
  const locatorFilteredElements = () => {
    let elements = locatorFilteredElementsForConfig(locator, document);

    if (locatorHasText) {
      elements = elements.filter((el) => locatorTextMatches(locatorTextForFilter(el), locatorHasText));
    }

    if (locatorHasNotText) {
      elements = elements.filter((el) => !locatorTextMatches(locatorTextForFilter(el), locatorHasNotText));
    }

    if (typeof locatorVisible === "boolean") {
      elements = elements.filter((el) => locatorElementVisible(el) === locatorVisible);
    }

    return elements;
  };

  const resolveLocator = () => {
    let elements;

    try {
      elements = locatorFilteredElements();
    } catch (error) {
      return {
        ok: false,
        code: "locator_resolution_failed",
        error: error instanceof Error ? error.message : String(error),
        kind: locatorKind,
        selector: selector || locatorText || locatorRole || locatorTestId || ""
      };
    }

    if (strict && elements.length !== 1) {
      return {
        ok: false,
        code: "strict_mode_violation",
        error: "Strict locator expected exactly one match, found " + elements.length,
        count: elements.length,
        kind: locatorKind,
        selector: selector || locatorText || locatorRole || locatorTestId || ""
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
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (typeof el.closest === "function" && el.closest("[aria-disabled='true']")) return false;
    if (typeof el.closest === "function") {
      const fieldset = el.closest("fieldset[disabled]");
      if (fieldset) {
        const firstLegend = Array.from(fieldset.children).find((child) => child.tagName?.toLowerCase() === "legend");
        if (!firstLegend || (firstLegend !== el && !firstLegend.contains(el))) {
          return false;
        }
      }
    }
    return true;
  };
  const isReadonly = (el) => {
    if (!el) return true;
    if (el.readOnly === true || el.getAttribute("aria-readonly") === "true") return true;
    return typeof el.closest === "function" && Boolean(el.closest("[aria-readonly='true']"));
  };
  const isEditable = (el) => {
    if (!el || !isEnabled(el) || isReadonly(el)) return false;
    const tag = el.tagName?.toLowerCase?.() || "";
    const type = (el.getAttribute?.("type") || "").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input") {
      if (["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type)) {
        return false;
      }
      return true;
    }
    return el.isContentEditable === true || el.getAttribute?.("contenteditable") === "true";
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
  } else if (kind === "allInnerTexts") {
    value = elements.map((el) => normalizeText(el.innerText || el.textContent || ""));
  } else if (kind === "textContent") {
    value = first ? first.textContent : null;
  } else if (kind === "innerText") {
    value = first ? normalizeText(first.innerText || first.textContent || "") : "";
  } else if (kind === "getAttribute") {
    const name = typeof args.name === "string" ? args.name : "";
    value = first && name ? first.getAttribute(name) : null;
  } else if (kind === "isVisible") {
    value = isVisible(first);
  } else if (kind === "isHidden") {
    value = !isVisible(first);
  } else if (kind === "isEnabled") {
    value = isEnabled(first);
  } else if (kind === "isDisabled") {
    value = Boolean(first) && !isEnabled(first);
  } else if (kind === "isEditable") {
    value = isEditable(first);
  } else if (kind === "inputValue") {
    value = first && "value" in first ? first.value : "";
  } else if (kind === "isChecked") {
    value = Boolean(first && ("checked" in first ? first.checked : first.getAttribute("aria-checked") === "true"));
  } else if (kind === "boundingBox") {
    if (first) {
      const rect = locatorRectInTopViewport(first);
      value = {
        x: rect.x,
        y: rect.y,
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

function mediaDownloadTargetExpression(locator: any, attribute: string) {
  return `(() => {
  const requestedAttribute = ${JSON.stringify(attribute)};
  ${locatorResolverSource(locator)}
  const resolved = resolveLocator();
  if (!resolved.ok) return resolved;

  const el = resolved.element;
  const tagName = el?.tagName?.toLowerCase?.() || "";
  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const absoluteUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const parsed = new URL(value.trim(), document.baseURI);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed.href;
    } catch {
      return null;
    }
  };
  const cssBackgroundUrl = (node) => {
    const value = getComputedStyle(node).backgroundImage || "";
    const match = value.match(/url\\((['"]?)(.*?)\\1\\)/);
    return match ? match[2] : null;
  };
  const fromAttribute = (name) => absoluteUrl(el?.getAttribute?.(name));
  const directCurrentSrc = () => absoluteUrl(el?.currentSrc) || absoluteUrl(el?.src);
  const candidates = [];

  if (requestedAttribute === "src") {
    candidates.push({ attribute: "src", url: directCurrentSrc() || fromAttribute("src") });
  } else if (requestedAttribute === "href") {
    candidates.push({ attribute: "href", url: fromAttribute("href") });
  } else if (requestedAttribute === "poster") {
    candidates.push({ attribute: "poster", url: fromAttribute("poster") });
  } else if (requestedAttribute === "backgroundImage") {
    candidates.push({ attribute: "backgroundImage", url: absoluteUrl(cssBackgroundUrl(el)) });
  } else {
    if (["img", "source", "video", "audio", "track", "embed", "iframe"].includes(tagName)) {
      candidates.push({ attribute: "src", url: directCurrentSrc() || fromAttribute("src") });
    }
    if (tagName === "input" && (el.getAttribute("type") || "").toLowerCase() === "image") {
      candidates.push({ attribute: "src", url: directCurrentSrc() || fromAttribute("src") });
    }
    if (["a", "area", "link"].includes(tagName)) {
      candidates.push({ attribute: "href", url: fromAttribute("href") });
    }
    if (["video", "audio"].includes(tagName)) {
      const source = Array.from(el.querySelectorAll?.("source[src]") || [])
        .map((sourceEl) => absoluteUrl(sourceEl.currentSrc || sourceEl.src || sourceEl.getAttribute("src")))
        .find(Boolean);
      candidates.push({ attribute: "source[src]", url: source || null });
    }
    if (tagName === "video") {
      candidates.push({ attribute: "poster", url: fromAttribute("poster") });
    }
    candidates.push({ attribute: "backgroundImage", url: absoluteUrl(cssBackgroundUrl(el)) });
  }

  const selected = candidates.find((candidate) => candidate.url);
  if (!selected) {
    return {
      ok: false,
      error: "Locator target does not expose an http/https media URL"
    };
  }

  return {
    ok: true,
    url: selected.url,
    kind: requestedAttribute === "auto" ? tagName || selected.attribute : requestedAttribute,
    tagName,
    attribute: selected.attribute,
    label: normalizeText(el?.getAttribute?.("aria-label") || el?.getAttribute?.("alt") || el?.getAttribute?.("title") || ""),
    text: normalizeText(el?.innerText || el?.textContent || "")
  };
})()`;
}

function locatorDomUtilityExpression(locator: any, kind: string, args: any) {
  return `(async () => {
  const kind = ${JSON.stringify(kind)};
  const args = ${JSON.stringify(args && typeof args === "object" ? args : {})};
  ${locatorResolverSource(locator)}
  ${locatorActionabilitySource(kind, args)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  const actionability = await checkLocatorActionability(el);
  if (!actionability.ok) return actionability;

  if (kind === "blur") {
    if (typeof el.blur === "function") {
      el.blur();
    }
    return { ok: true, count: resolved.count };
  }

  if (kind === "scrollIntoViewIfNeeded") {
    const block = typeof args.block === "string" ? args.block : "center";
    const inline = typeof args.inline === "string" ? args.inline : "center";
    el.scrollIntoView({
      block,
      inline,
      behavior: "instant"
    });
    const rect = locatorRectInTopViewport(el);
    return {
      ok: true,
      count: resolved.count,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  }

  if (kind === "selectText") {
    const tag = el.tagName.toLowerCase();
    const isTextControl = tag === "textarea" ||
      (tag === "input" && !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes((el.getAttribute("type") || "").toLowerCase()));

    el.focus();

    if (isTextControl && typeof el.select === "function") {
      el.select();
    } else {
      const selection = el.ownerDocument?.getSelection?.();
      if (!selection) {
        return {
          ok: false,
          code: "selection_unavailable",
          error: "Document selection API is unavailable",
          count: resolved.count
        };
      }
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const selectedText = el.ownerDocument?.getSelection?.()?.toString?.() || (isTextControl ? String(el.value || "") : "");
    return {
      ok: true,
      count: resolved.count,
      value: selectedText
    };
  }

  return {
    ok: false,
    code: "unsupported_locator_utility",
    error: "Unsupported locator utility action: " + kind,
    count: resolved.count
  };
})()`;
}

function locatorMutationExpression(locator: any, kind: string, args: any) {
  return `(async () => {
  const kind = ${JSON.stringify(kind)};
  const args = ${JSON.stringify(args && typeof args === "object" ? args : {})};
  ${locatorResolverSource(locator)}
  ${locatorActionabilitySource(kind, args)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  const actionability = await checkLocatorActionability(el);
  if (!actionability.ok) return actionability;
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

    const rawOptions = Array.isArray(args.options)
      ? args.options
      : Array.isArray(args.values)
        ? args.values
        : Array.isArray(args.value)
          ? args.value
          : [args.value ?? args.values].filter((value) => value != null);
    const optionSpecs = rawOptions.map((candidate) => {
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        return {
          value: typeof candidate.value === "string" ? candidate.value : null,
          label: typeof candidate.label === "string" ? candidate.label : null,
          index: Number.isFinite(candidate.index) ? Math.max(0, Math.floor(candidate.index)) : null
        };
      }

      const value = String(candidate);
      return { value, label: value, index: null };
    });

    for (const [optionIndex, option] of Array.from(el.options).entries()) {
      option.selected = optionSpecs.some((spec) =>
        spec.index === optionIndex ||
        (spec.value != null && spec.value === option.value) ||
        (spec.label != null && (spec.label === option.label || spec.label === option.textContent))
      );
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      ok: true,
      value: Array.from(el.selectedOptions || []).map((option) => option.value),
      count: Array.from(el.selectedOptions || []).length
    };
  }

  return {
    ok: false,
    error: "Unsupported locator mutation"
  };
})()`;
}

function locatorScriptActionExpression(locator: any, kind: string, args: any) {
  return `(async () => {
  const kind = ${JSON.stringify(kind)};
  const args = ${JSON.stringify(args && typeof args === "object" ? args : {})};
  ${locatorResolverSource(locator)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const selectedElement = resolved.element;
  const elements = resolved.elements;
  const eventInit = args.eventInit && typeof args.eventInit === "object" && !Array.isArray(args.eventInit)
    ? args.eventInit
    : {};

  if (kind !== "evaluateAll" && !selectedElement) {
    return {
      ok: false,
      code: "locator_not_found",
      error: "Element target not found",
      count: resolved.count,
      kind: locatorKind,
      selector: selector || locatorText || locatorRole || locatorTestId || ""
    };
  }

  if (kind === "dispatchEvent") {
    const eventType = typeof args.type === "string" ? args.type : "";

    if (!eventType) {
      return {
        ok: false,
        code: "invalid_params",
        error: "dispatchEvent requires a non-empty event type",
        count: resolved.count
      };
    }

    try {
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        ...eventInit
      };
      const lowerType = eventType.toLowerCase();
      let event;

      if ("detail" in eventInit && typeof CustomEvent === "function") {
        event = new CustomEvent(eventType, init);
      } else if (/^(click|dblclick|mouse|pointer|drag|drop)/.test(lowerType)) {
        event = new MouseEvent(eventType, init);
      } else if (/^key/.test(lowerType)) {
        event = new KeyboardEvent(eventType, init);
      } else if ((lowerType === "input" || lowerType === "beforeinput") && typeof InputEvent === "function") {
        event = new InputEvent(eventType, init);
      } else {
        event = new Event(eventType, init);
      }

      const dispatched = selectedElement.dispatchEvent(event);
      return {
        ok: true,
        value: {
          dispatched,
          defaultPrevented: event.defaultPrevented
        },
        count: resolved.count
      };
    } catch (error) {
      return {
        ok: false,
        code: "locator_dispatch_event_failed",
        error: error instanceof Error ? error.message : String(error),
        count: resolved.count
      };
    }
  }

  const script = typeof args.script === "string" ? args.script.trim() : "";
  let __formaxRestoreAll = () => {};

  if (!script) {
    return {
      ok: false,
      code: "invalid_params",
      error: kind + " requires a page function script",
      count: resolved.count
    };
  }

  if (args.mode === "read") {
    ${readOnlyMutationGuardSource({ restoreAllDeclaration: "" })}
  }

  let pageFunction;
  try {
    pageFunction = (0, eval)("(" + script + ")");
  } catch (error) {
    __formaxRestoreAll();
    return {
      ok: false,
      code: "locator_evaluate_compile_error",
      error: error instanceof Error ? error.message : String(error),
      count: resolved.count
    };
  }

  if (typeof pageFunction !== "function") {
    __formaxRestoreAll();
    return {
      ok: false,
      code: "locator_evaluate_compile_error",
      error: "locator evaluate script must compile to a function",
      count: resolved.count
    };
  }

  try {
    const target = kind === "evaluateAll" ? elements : selectedElement;
    const value = await pageFunction(target, args.argument);
    return {
      ok: true,
      value,
      count: resolved.count
    };
  } catch (error) {
    return {
      ok: false,
      code: "locator_evaluate_error",
      error: error instanceof Error ? error.message : String(error),
      count: resolved.count
    };
  } finally {
    __formaxRestoreAll();
  }
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
  const modifiers = normalizePointerModifiers(params.modifiers);

  await cdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
    modifiers
  });

  await cdp(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button,
    buttons,
    clickCount,
    modifiers
  });

  await cdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button,
    buttons: 0,
    clickCount,
    modifiers
  });
}

async function dispatchMouseDrag(
  tabId: number,
  path: Array<{ x: number; y: number }>,
  params: ActionParams = {}
) {
  const button = normalizeMouseButton(params.button);
  const buttons = buttonToButtons(button);
  const modifiers = normalizePointerModifiers(params.modifiers);
  const [start, ...rest] = path;

  await cdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: start.x,
    y: start.y,
    button: "none",
    modifiers
  });

  await cdp(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: start.x,
    y: start.y,
    button,
    buttons,
    clickCount: 1,
    modifiers
  });

  for (const point of rest) {
    await showCursor(tabId, point.x, point.y, {
      arrivalTimeoutMs: 250
    });
    await cdp(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
      button,
      buttons,
      modifiers
    });
  }

  const end = path[path.length - 1];
  await cdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: end.x,
    y: end.y,
    button,
    buttons: 0,
    clickCount: 1,
    modifiers
  });
}

async function locateElementByRef(tabId: number, ref: string) {
  const evaluated = await cdp(tabId, "Runtime.evaluate", {
    expression: `(() => {
  const ref = ${JSON.stringify(ref)};
  const queryOnePiercingOpenShadow = (query, root = document) => {
    try {
      const direct = root.querySelector(query);
      if (direct) return direct;
    } catch {
      return null;
    }

    let descendants = [];
    try {
      descendants = Array.from(root.querySelectorAll("*"));
    } catch {
      descendants = [];
    }

    for (const el of descendants) {
      if (!el.shadowRoot) continue;
      const found = queryOnePiercingOpenShadow(query, el.shadowRoot);
      if (found) return found;
    }

    return null;
  };
  const rectInTopViewport = (node) => {
    const rect = node.getBoundingClientRect();
    let x = rect.left;
    let y = rect.top;
    let currentWindow = node.ownerDocument?.defaultView || null;

    while (currentWindow && currentWindow !== window) {
      const frame = currentWindow.frameElement;
      if (!frame) break;
      const frameRect = frame.getBoundingClientRect();
      x += frameRect.left;
      y += frameRect.top;
      currentWindow = currentWindow.parent;
    }

    return {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
  };
  const store = window.__agentBrowserController?.elements || {};
  const refSelector = "[data-agent-browser-ref='" + CSS.escape(ref) + "']";
  const el = store[ref] || queryOnePiercingOpenShadow(refSelector);

  if (!el) {
    return {
      ok: false,
      error: "Element ref not found: " + ref
    };
  }

  if (!el.isConnected) {
    return {
      ok: false,
      error: "Element ref is detached: " + ref
    };
  }

  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant"
  });

  const rect = rectInTopViewport(el);

  return {
    ok: true,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    rect: {
      x: rect.x,
      y: rect.y,
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

  if (!el.isConnected) {
    return {
      ok: false,
      error: "Element ref is detached: " + ref
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

async function getPageFrameTree(tabId: number) {
  try {
    const result = await cdp(tabId, "Page.getFrameTree");
    const root = summarizePageFrameTreeNode(result?.frameTree);
    return {
      source: "cdp",
      frameCount: countFrameTreeNodes(root),
      root
    };
  } catch (error) {
    return {
      source: "cdp",
      frameCount: 0,
      root: null,
      error: stringifyError(error)
    };
  }
}

function summarizePageFrameTreeNode(value: any): ActionParams | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const frame = value.frame && typeof value.frame === "object" ? value.frame : {};
  const childFrames = Array.isArray(value.childFrames)
    ? value.childFrames
        .map((child: unknown) => summarizePageFrameTreeNode(child))
        .filter((child: ActionParams | null): child is ActionParams => child != null)
    : [];

  return {
    id: typeof frame.id === "string" ? frame.id : null,
    parentId: typeof frame.parentId === "string" ? frame.parentId : null,
    name: typeof frame.name === "string" ? truncateAndRedactString(frame.name, 160) : null,
    url: typeof frame.url === "string" ? sanitizeDebugUrl(frame.url) : null,
    securityOrigin:
      typeof frame.securityOrigin === "string"
        ? truncateAndRedactString(frame.securityOrigin, 240)
        : null,
    mimeType: typeof frame.mimeType === "string" ? frame.mimeType : null,
    unreachableUrl:
      typeof frame.unreachableUrl === "string"
        ? sanitizeDebugUrl(frame.unreachableUrl)
        : null,
    childFrames
  };
}

function countFrameTreeNodes(node: ActionParams | null): number {
  if (!node) {
    return 0;
  }

  const children = Array.isArray(node.childFrames) ? node.childFrames : [];
  return 1 + children.reduce((count, child) => count + countFrameTreeNodes(child as ActionParams), 0);
}

function sanitizeDomSnapshot(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }

  const clone = {
    ...snapshot
  };

  if (Array.isArray(snapshot.strings)) {
    clone.strings = snapshot.strings.map((value: unknown) =>
      typeof value === "string" ? sanitizeDomSnapshotString(value) : value
    );
  }

  return clone;
}

function sanitizeDomSnapshotString(value: string) {
  const redacted = redactSecretPatterns(value);

  if (
    redacted !== value ||
    /\b(password|passwd|pwd|token|secret|csrf|credential|session|api[_-]?key|access[_-]?token|refresh[_-]?token)\b/i.test(value)
  ) {
    return "[redacted]";
  }

  const trimmed = value.trim();

  if (
    value.length > 300 &&
    (/^[[{]/.test(trimmed) || /"(__NEXT_DATA__|props|pageProps|apolloState|redux|hydration|dehydratedState)"/i.test(trimmed))
  ) {
    return `[redacted-large-json length=${value.length}]`;
  }

  if (value.length > 1000) {
    return `${value.slice(0, 1000)}...[truncated length=${value.length}]`;
  }

  return value;
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
    arrivalTimeoutMs?: number;
    phase?: CursorPhase;
    visible?: boolean;
    waitForArrival?: boolean;
  } = {}
) {
  const sessionId = sessionIdForTab(tabId);
  const turnId = activeActionContext?.turnId ?? null;
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

    const shouldWaitForArrival =
      options.waitForArrival !== false &&
      options.animate !== false &&
      state.visible;
    const arrivalPromise = shouldWaitForArrival
      ? waitForCursorArrival(tabId, moveSequence, options.arrivalTimeoutMs)
      : null;

    await withChromeMessageTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: "AGENT_CURSOR",
        animate: options.animate !== false,
        moveSequence,
        phase: state.phase,
        sessionId,
        turnId,
        visible: state.visible,
        x,
        y
      }),
      250
    );
    await arrivalPromise;
  } catch {
    cancelCursorArrivalWaiter(tabId, moveSequence);
    // Some pages cannot receive content scripts.
  }
}

function cursorArrivalKey(tabId: number, moveSequence: number) {
  return `${tabId}:${moveSequence}`;
}

function waitForCursorArrival(
  tabId: number,
  moveSequence: number,
  timeoutMs = 900
) {
  return new Promise<void>((resolve) => {
    const key = cursorArrivalKey(tabId, moveSequence);
    const timeoutId = self.setTimeout(() => {
      cursorArrivalWaiters.delete(key);
      resolve();
    }, Math.max(50, timeoutMs));

    cursorArrivalWaiters.set(key, {
      resolve: () => {
        self.clearTimeout(timeoutId);
        resolve();
      },
      timeoutId
    });
  });
}

function resolveCursorArrivalWaiter(
  tabId: number | undefined,
  moveSequence: number
) {
  if (typeof tabId !== "number") {
    return;
  }

  const key = cursorArrivalKey(tabId, moveSequence);
  const waiter = cursorArrivalWaiters.get(key);

  if (!waiter) {
    return;
  }

  cursorArrivalWaiters.delete(key);
  waiter.resolve();
}

function cancelCursorArrivalWaiter(tabId: number, moveSequence: number) {
  const key = cursorArrivalKey(tabId, moveSequence);
  const waiter = cursorArrivalWaiters.get(key);

  if (!waiter) {
    return;
  }

  cursorArrivalWaiters.delete(key);
  self.clearTimeout(waiter.timeoutId);
  waiter.resolve();
}

function clearCursorArrivalWaitersForTab(tabId: number) {
  const prefix = `${tabId}:`;

  for (const [key, waiter] of cursorArrivalWaiters) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    cursorArrivalWaiters.delete(key);
    self.clearTimeout(waiter.timeoutId);
    waiter.resolve();
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

async function showHighlightRect(
  tabId: number,
  rect: { x: number; y: number; width: number; height: number },
  options: { color?: string; durationMs?: number } = {}
) {
  try {
    if (!(await prepareContentScript(tabId))) {
      return;
    }

    await withChromeMessageTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: "AGENT_HIGHLIGHT_RECT",
        color: options.color,
        durationMs: options.durationMs,
        rect
      }),
      250
    );
  } catch {
    // Highlight overlays are best-effort and should not block screenshots.
  }
}

async function markFinalizedBadge(tabId: number, phase: FinalizedBadgePhase) {
  await ensureFinalizedBadgesLoaded();
  const visible = await tabIsVisible(tabId);

  await runFinalizedBadgeStateOperation(async () => {
    if (visible) {
      finalizedBadgesByTab.delete(tabId);
    } else {
      finalizedBadgesByTab.set(tabId, phase);
    }

    await saveFinalizedBadges();
  });

  schedulePublishFinalizedBadge(tabId);
}

async function clearFinalizedBadge(tabId: number) {
  await ensureFinalizedBadgesLoaded();
  let changed = false;

  await runFinalizedBadgeStateOperation(async () => {
    changed = finalizedBadgesByTab.delete(tabId);
    if (changed) {
      await saveFinalizedBadges();
    }
  });

  if (changed) {
    schedulePublishFinalizedBadge(tabId);
  }
}

async function clearFocusedWindowFinalizedBadge(windowId: number) {
  await ensureFinalizedBadgesLoaded();

  if (finalizedBadgesByTab.size === 0) {
    return;
  }

  try {
    const tabs = await chrome.tabs.query({
      active: true,
      windowId
    });
    const tabId = tabs.find((tab) => typeof tab.id === "number")?.id;

    if (typeof tabId === "number") {
      await clearFinalizedBadge(tabId);
    }
  } catch {
    // Focus reconciliation is best-effort.
  }
}

async function forgetFinalizedBadge(tabId: number) {
  await ensureFinalizedBadgesLoaded();

  await runFinalizedBadgeStateOperation(async () => {
    if (finalizedBadgesByTab.delete(tabId)) {
      await saveFinalizedBadges();
    }
  });
}

async function replaceFinalizedBadge(addedTabId: number, removedTabId: number) {
  await ensureFinalizedBadgesLoaded();
  let moved: FinalizedBadgePhase | null = null;

  await runFinalizedBadgeStateOperation(async () => {
    const badge = finalizedBadgesByTab.get(removedTabId);

    if (!badge) {
      return;
    }

    finalizedBadgesByTab.delete(removedTabId);
    finalizedBadgesByTab.set(addedTabId, badge);
    moved = badge;
    await saveFinalizedBadges();
  });

  if (moved) {
    schedulePublishFinalizedBadge(addedTabId);
  }
}

async function republishFinalizedBadge(tabId: number) {
  await ensureFinalizedBadgesLoaded();

  schedulePublishFinalizedBadge(tabId);
}

async function ensureFinalizedBadgesLoaded() {
  if (finalizedBadgesLoaded) {
    return;
  }

  if (!finalizedBadgesLoadPromise) {
    finalizedBadgesLoadPromise = loadFinalizedBadges();
  }

  await finalizedBadgesLoadPromise;
}

async function loadFinalizedBadges() {
  const stored = await storageSessionGet(FINALIZED_BADGE_STORAGE_KEY);
  const source = stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored as ActionParams
    : {};
  const badges = source.badges && typeof source.badges === "object" && !Array.isArray(source.badges)
    ? source.badges as Record<string, unknown>
    : {};

  finalizedBadgesByTab.clear();

  for (const [tabIdText, phase] of Object.entries(badges)) {
    const tabId = Number(tabIdText);

    if (Number.isInteger(tabId) && isFinalizedBadgePhase(phase)) {
      finalizedBadgesByTab.set(tabId, phase);
      schedulePublishFinalizedBadge(tabId);
    }
  }

  finalizedBadgesLoaded = true;
}

async function saveFinalizedBadges() {
  await storageSessionSet(FINALIZED_BADGE_STORAGE_KEY, {
    badges: Object.fromEntries(finalizedBadgesByTab.entries())
  });
}

async function runFinalizedBadgeStateOperation(operation: () => Promise<void>) {
  const queued = finalizedBadgeStateQueue.then(operation, operation);
  finalizedBadgeStateQueue = queued.then(
    () => undefined,
    () => undefined
  );
  await queued;
}

function schedulePublishFinalizedBadge(tabId: number) {
  const queued = finalizedBadgePublicationQueue.then(
    () => publishFinalizedBadge(tabId),
    () => publishFinalizedBadge(tabId)
  );
  finalizedBadgePublicationQueue = queued.then(
    () => undefined,
    () => undefined
  );
  queued.catch(() => {
    // Favicon badge publication is best-effort.
  });
}

function scheduleSessionFaviconBadges(sessionId: string) {
  for (const lease of sessionManager.getSessionLeases(sessionId)) {
    schedulePublishFinalizedBadge(lease.tabId);
  }
}

async function restoreSessionFaviconBadges() {
  try {
    await sessionManager.initialize();
    await ensureFinalizedBadgesLoaded();

    for (const session of sessionManager.listSessions()) {
      scheduleSessionFaviconBadges(session.sessionId);
    }
  } catch {
    // Restored visual state is best-effort; runtime actions will reconcile later.
  }
}

async function publishFinalizedBadge(tabId: number) {
  await ensureFinalizedBadgesLoaded();
  const badge = readEffectiveFaviconBadge(tabId);
  const faviconDataUrl = badge == null ? null : await readFaviconDataUrl(tabId);

  try {
    if (!(await prepareContentScript(tabId))) {
      return;
    }

    await withChromeMessageTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: "TAB_FAVICON_BADGE",
        badge,
        faviconDataUrl
      }),
      250
    );
  } catch {
    // Restricted pages may not accept content scripts or runtime messages.
  }
}

function readEffectiveFaviconBadge(tabId: number): EffectiveBadgePhase | null {
  const lease = sessionManager.getTabLease(tabId);

  if (lease?.state === "active") {
    return "active";
  }

  return finalizedBadgesByTab.get(tabId) ?? null;
}

async function readFaviconDataUrl(tabId: number): Promise<string | null> {
  let tab;

  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return null;
  }

  if (typeof tab.url !== "string" || !tab.url.trim()) {
    return null;
  }

  const cached = faviconDataUrlsByTab.get(tabId);

  if (cached?.pageUrl === tab.url) {
    return cached.dataUrl;
  }

  if (
    typeof tab.favIconUrl !== "string" ||
    !tab.favIconUrl.trim() ||
    isFormaxFaviconBadgeUrl(tab.favIconUrl)
  ) {
    return null;
  }

  const dataUrl = await fetchChromeFaviconDataUrl(tab.url);

  if (dataUrl) {
    faviconDataUrlsByTab.set(tabId, {
      dataUrl,
      pageUrl: tab.url
    });
  }

  return dataUrl;
}

async function fetchChromeFaviconDataUrl(pageUrl: string): Promise<string | null> {
  const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
  faviconUrl.searchParams.set("pageUrl", pageUrl);
  faviconUrl.searchParams.set("size", "32");

  const abort = new AbortController();
  const timeoutId = self.setTimeout(() => abort.abort(), 2000);

  try {
    const response = await fetch(faviconUrl.toString(), {
      signal: abort.signal
    });

    if (!response.ok) {
      return null;
    }

    const contentType = sanitizeFaviconContentType(response.headers.get("content-type"));
    const buffer = await response.arrayBuffer();

    if (buffer.byteLength === 0 || buffer.byteLength > 64 * 1024) {
      return null;
    }

    return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
  } catch {
    return null;
  } finally {
    self.clearTimeout(timeoutId);
  }
}

function sanitizeFaviconContentType(value: string | null): string {
  if (typeof value === "string" && /^image\/[a-z0-9.+-]+$/i.test(value.trim())) {
    return value.trim().toLowerCase();
  }

  return "image/bmp";
}

function isFormaxFaviconBadgeUrl(value: string): boolean {
  if (!value.startsWith("data:image/svg+xml")) {
    return false;
  }

  try {
    return decodeURIComponent(value).includes("data-formax-favicon-badge");
  } catch {
    return false;
  }
}

async function tabIsVisible(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (tab.active !== true || typeof tab.windowId !== "number") {
      return false;
    }

    const windowInfo = await chrome.windows.get(tab.windowId);
    return windowInfo.focused === true;
  } catch {
    return false;
  }
}

function isFinalizedBadgePhase(value: unknown): value is FinalizedBadgePhase {
  return value === "handoff" || value === "deliverable";
}

async function setPageVisualStatus(
  tabId: number,
  phase: CursorPhase,
  meta: {
    reason?: string;
    sessionId?: string | null;
    turnId?: string | null;
  } = {}
) {
  const sessionId = meta.sessionId ?? sessionIdForTab(tabId);
  const turnId = meta.turnId ?? activeActionContext?.turnId ?? null;

  safePostEvent({
    name: "pageVisualStatus",
    sessionId,
    tabId,
    phase,
    reason: meta.reason ?? null,
    turnId
  });

  if (isFinalizedBadgePhase(phase)) {
    await markFinalizedBadge(tabId, phase);
  } else if (phase === "stopped") {
    await clearFinalizedBadge(tabId);
  }

  try {
    if (!(await prepareContentScript(tabId))) {
      return;
    }

    await withChromeMessageTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: "AGENT_PAGE_STATUS",
        phase,
        reason: meta.reason ?? null,
        sessionId,
        turnId
      }),
      250
    );
  } catch {
    // Restricted pages may not accept content scripts or runtime messages.
  }
}

async function detachTabForLifecycle(tabId: number) {
  expectedDebuggerDetachTabs.add(tabId);
  try {
    await debuggerManager.detachTab(tabId);
  } finally {
    self.setTimeout(() => {
      expectedDebuggerDetachTabs.delete(tabId);
    }, 1000);
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
    const response = await withChromeMessageTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: "CONTENT_PING"
      }),
      250
    );

    return response?.ok === true;
  } catch {
    return false;
  }
}

function withChromeMessageTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = self.setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        self.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        self.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function cdp(
  tabId: number,
  method: string,
  params: ActionParams = {},
  options: { timeoutMs?: number; targetId?: string | null } = {}
): Promise<any> {
  if (method === "Target.getTargets") {
    return {
      targetInfos: await withChromeMessageTimeout(
        chrome.debugger.getTargets(),
        options.timeoutMs ?? DEFAULT_CDP_TIMEOUT_MS
      )
    };
  }

  if (typeof options.targetId === "string" && options.targetId.trim()) {
    return debuggerManager.sendToTarget(
      options.targetId,
      method,
      params,
      options
    );
  }

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
  timeoutMs: number,
  predicate?: (method: string, params: any) => boolean
): Promise<{ reason: string }> {
  return waitForDebuggerEvents(tabId, [eventName], timeoutMs, predicate);
}

function waitForDebuggerEvents(
  tabId: number,
  eventNames: string[],
  timeoutMs: number,
  predicate?: (method: string, params: any) => boolean
): Promise<{ reason: string }> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish("timeout"), timeoutMs);

    const listener = (source, method, params) => {
      if (
        source.tabId === tabId &&
        eventNames.includes(method) &&
        (!predicate || predicate(method, params))
      ) {
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

function waitForMainFrameCommit(tabId: number, timeoutMs: number) {
  return waitForDebuggerEvent(
    tabId,
    "Page.frameNavigated",
    timeoutMs,
    (_method, params) => params?.frame && !params.frame.parentId
  );
}

async function waitForLoadStateInTab(
  tabId: number,
  state: string,
  timeoutMs: number,
  idleMs: number,
  options: { commitAlreadySatisfied?: boolean } = {}
) {
  if (state === "commit") {
    return options.commitAlreadySatisfied
      ? { reason: "url_matched" }
      : waitForMainFrameCommit(tabId, timeoutMs);
  }

  if (state !== "networkidle" && await loadStateIsSatisfied(tabId, state)) {
    return { reason: "already_satisfied" };
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { reason: "timeout" };
  }

  if (state === "networkidle") {
    return waitForNetworkIdle(tabId, timeoutMs, idleMs);
  }

  const event =
    state === "domcontentloaded" ? "Page.domContentEventFired" : "Page.loadEventFired";
  return waitForDebuggerEvent(tabId, event, timeoutMs);
}

function waitForNetworkIdle(
  tabId: number,
  timeoutMs: number,
  idleMs: number
): Promise<{ reason: string }> {
  const boundedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;
  const boundedIdleMs =
    Number.isFinite(idleMs) && idleMs > 0 ? Math.max(50, idleMs) : 500;

  return new Promise((resolve) => {
    let done = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const timeoutTimer = setTimeout(() => finish("timeout"), boundedTimeoutMs);

    const listener = (source: chrome.debugger.Debuggee, method: string, params?: any) => {
      if (source.tabId !== tabId || !isNetworkRequestLifecycleEvent(method)) {
        return;
      }

      trackNetworkDebuggerEvent(source, method, params);
      scheduleIdleCheck();
    };

    function scheduleIdleCheck() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }

      if ((networkRequestsByTab.get(tabId)?.size ?? 0) === 0) {
        idleTimer = setTimeout(() => finish("networkidle"), boundedIdleMs);
      }
    }

    function finish(reason: string) {
      if (done) {
        return;
      }

      done = true;
      clearTimeout(timeoutTimer);
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      chrome.debugger.onEvent.removeListener(listener);
      resolve({ reason });
    }

    chrome.debugger.onEvent.addListener(listener);
    scheduleIdleCheck();
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
        x: Math.round(rect.x),
        y: Math.round(rect.y),
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

async function locatorState(
  tabId: number,
  locator: any,
  options: { executionContextId?: number | null; targetId?: string | null; timeoutMs?: number } = {}
) {
  const evaluated = await cdp(
    tabId,
    "Runtime.evaluate",
    {
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
      ...(options.executionContextId != null ? { contextId: options.executionContextId } : {}),
      returnByValue: true,
      awaitPromise: true
    },
    {
      targetId: options.targetId,
      timeoutMs: options.timeoutMs
    }
  );
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

async function summarizeTab(tab: chrome.tabs.Tab) {
  const sessionId =
    typeof tab.id === "number" ? sessionIdForTab(tab.id) : null;
  const groupLabel = await tabGroupLabel(tab.groupId);
  const openedAt =
    typeof tab.id === "number" ? tabOpenedAt.get(tab.id) ?? null : null;
  const lastFocusedAt =
    typeof (tab as any).lastAccessed === "number" && Number.isFinite((tab as any).lastAccessed)
      ? (tab as any).lastAccessed
      : null;

  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title,
    url: tab.url,
    active: tab.active,
    groupId: tab.groupId,
    groupLabel,
    openedAt,
    lastFocusedAt,
    sessionId,
    controlled: sessionId != null
  };
}

async function tabGroupLabel(groupId: number | undefined) {
  if (typeof groupId !== "number" || groupId < 0 || !chrome.tabGroups?.get) {
    return null;
  }

  try {
    const group = await chrome.tabGroups.get(groupId);
    return typeof group.title === "string" && group.title.trim()
      ? group.title
      : null;
  } catch {
    return null;
  }
}

function listCapabilities() {
  const nativeAvailable = nativePort != null;

  return [
    browserCapability("browser.tabs", "List, create, select, and finalize controlled tabs.", true),
    browserCapability("browser.policy.hosts", "Require approval for new hosts and store session, persistent, and blocked host decisions.", true),
    browserCapability("browser.policy.confirmation", "Classify browser actions that require confirmation before execution.", true),
    browserCapability("browser.user.openTabs", "List user-visible claimable Chrome tabs with claim tokens.", true),
    browserCapability("browser.user.claimTab", "Claim a user tab with a claim token or current-tab fallback.", true),
    browserCapability("browser.session.name", "Name the current browser automation session.", true),
    browserCapability("events.wait", "Wait for buffered browser events.", true),
    browserCapability("downloads", "List and wait for Chrome downloads.", true),
    browserCapability("dev.logs", "Read buffered console/log/runtime exception entries.", true),
    browserCapability("rawCdp", "Send raw Chrome DevTools Protocol commands.", true),
    browserCapability("clipboard", "Read and write browser clipboard text with explicit per-request confirmation.", true),
    browserCapability("browser.user.history", "Read user browsing history with explicit per-request confirmation.", true),
    browserCapability("browser.user.bookmarks", "Browser bookmarks are intentionally not exposed by this runtime.", false, "unsupported_sensitive_browser_state"),
    browserCapability("browser.notifications", "Browser/system notifications are intentionally not exposed by this runtime.", false, "unsupported_sensitive_browser_state"),
    tabCapability("tab.navigation", "Navigate, reload, and read URL/title for tabs.", true),
    tabCapability("tab.cua", "Coordinate mouse, keyboard, and scroll interactions.", true),
    tabCapability("tab.domSnapshot", "Capture DOMSnapshot output through CDP.", true),
    tabCapability("tab.accessibility", "Read accessibility tree data through CDP.", true),
    tabCapability("tab.cdp.target", "Send raw CDP commands to a specific DevTools targetId under a controlled tab.", true),
    tabCapability("tab.cdp.target.attach", "Attach and detach Chrome debugger control for DevTools targets under a controlled tab.", true),
    tabCapability("tab.locator.css", "Use CSS selector based waits/actions.", true),
    tabCapability("tab.locator.semantic", "Use role/label/text/test-id locator engine.", true),
    tabCapability("tab.upload.locator", "Upload files through selector or locator targets.", true),
    tabCapability("locator.downloadMedia", "Download image, video, audio, or linked media resolved from a locator with origin approval.", true),
    tabCapability("tab.frameLocator", "Target nested frames with locator chains.", true),
    tabCapability("tab.frameLocator.resolve", "Resolve frame locator selector paths to CDP frame metadata.", true),
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
    downloadId: download.id,
    download_id: download.id,
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
    downloadId: delta.id,
    download_id: delta.id,
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

function normalizeMediaDownloadAttribute(value: any) {
  const attribute = typeof value === "string" && value.trim() ? value.trim() : "auto";
  const allowed = ["auto", "src", "href", "poster", "backgroundImage"];

  if (!allowed.includes(attribute)) {
    throw new Error(`downloadMedia.params.attribute must be one of: ${allowed.join(", ")}`);
  }

  return attribute;
}

function normalizeDownloadConflictAction(value: any) {
  if (value == null || value === "") {
    return null;
  }

  const conflictAction = requireString(value, "downloadMedia.params.conflictAction");
  const allowed = ["uniquify", "overwrite", "prompt"];

  if (!allowed.includes(conflictAction)) {
    throw new Error(`downloadMedia.params.conflictAction must be one of: ${allowed.join(", ")}`);
  }

  return conflictAction as chrome.downloads.FilenameConflictAction;
}

function normalizeDownloadFilename(value: any) {
  if (value == null || value === "") {
    return null;
  }

  const filename = requireString(value, "downloadMedia.params.filename").replace(/\\/g, "/");

  if (filename.startsWith("/") || /^[a-zA-Z]:\//.test(filename) || filename.split("/").includes("..")) {
    throw new Error("downloadMedia.params.filename must be a relative download filename without .. segments");
  }

  return filename;
}

function normalizeDownloadFallbackMaxBytes(value: any) {
  if (value == null) {
    return 25 * 1024 * 1024;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("downloadMedia.params.fallbackMaxBytes must be a positive number");
  }

  return Math.max(1, Math.min(Math.floor(value), 100 * 1024 * 1024));
}

async function fetchMediaAsDataUrl(url: string, maxBytes: number) {
  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`downloadMedia fallback fetch failed with HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`downloadMedia fallback fetch exceeded ${maxBytes} byte limit`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`downloadMedia fallback fetch exceeded ${maxBytes} byte limit`);
  }

  const contentType = sanitizeMediaContentType(response.headers.get("content-type"));
  return {
    finalUrl: response.url || url,
    contentType,
    dataUrl: `data:${contentType};base64,${arrayBufferToBase64(buffer)}`
  };
}

function sanitizeMediaContentType(value: string | null) {
  const contentType = typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : "";
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(contentType)
    ? contentType
    : "application/octet-stream";
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function filenameFromMediaUrl(url: string, contentType: string) {
  let basename = "download";

  try {
    const parsed = new URL(url);
    const pathPart = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    if (pathPart && !pathPart.includes("..")) {
      basename = pathPart.replace(/[\\/:*?"<>|]+/g, "-");
    }
  } catch {
    // Keep the generic filename when the final URL cannot be parsed.
  }

  if (!/\.[a-z0-9]{1,12}$/i.test(basename)) {
    basename += extensionForContentType(contentType);
  }

  return basename;
}

function extensionForContentType(contentType: string) {
  const mapping: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "text/plain": ".txt",
    "application/pdf": ".pdf"
  };

  return mapping[contentType] || ".bin";
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

async function assertBrowserBlocklistForDownloads(
  downloads: chrome.downloads.DownloadItem[],
  sessionId: unknown
) {
  for (const download of downloads) {
    await assertBrowserBlocklistForUrl("download", download.finalUrl || download.url, sessionId);
  }
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

function isNetworkRequestLifecycleEvent(method: string) {
  return (
    method === "Network.requestWillBeSent" ||
    method === "Network.loadingFinished" ||
    method === "Network.loadingFailed"
  );
}

function trackNetworkDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params?: any
) {
  if (typeof source.tabId !== "number" || !isNetworkRequestLifecycleEvent(method)) {
    return;
  }

  const requestId =
    typeof params?.requestId === "string" && params.requestId.trim()
      ? params.requestId.trim()
      : null;

  if (!requestId) {
    return;
  }

  const requests = networkRequestsByTab.get(source.tabId) ?? new Set<string>();

  if (method === "Network.requestWillBeSent") {
    requests.add(requestId);
    networkRequestsByTab.set(source.tabId, requests);
    return;
  }

  requests.delete(requestId);

  if (requests.size === 0) {
    networkRequestsByTab.delete(source.tabId);
  } else {
    networkRequestsByTab.set(source.tabId, requests);
  }
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
      url: sanitizeDebugUrl(params.url),
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
      url: sanitizeDebugUrl(params.url),
      message: sanitizeDebugText(params.message, 500),
      type: params.type,
      hasBrowserHandler: params.hasBrowserHandler,
      defaultPrompt: sanitizeDebugText(params.defaultPrompt, 500)
    };
  }

  if (method === "Page.javascriptDialogClosed") {
    return {
      result: params.result,
      userInput: sanitizeDebugText(params.userInput, 500)
    };
  }

  if (method === "Runtime.exceptionThrown") {
    const details = params.exceptionDetails || {};

    return {
      timestamp: params.timestamp,
      text: sanitizeDebugText(details.text, 500),
      url: sanitizeDebugUrl(details.url),
      lineNumber: details.lineNumber,
      columnNumber: details.columnNumber,
      exception:
        details.exception && typeof details.exception === "object"
          ? {
              description: sanitizeDebugText(details.exception.description, 1000),
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
      text: sanitizeDebugText(entry.text, 1000),
      url: sanitizeDebugUrl(entry.url),
      lineNumber: entry.lineNumber,
      columnNumber: entry.columnNumber
    };
  }

  return {};
}

function summarizeRemoteObject(value: any) {
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizeDebugText(value, 1000) : value;
  }

  return {
    type: value.type,
    subtype: value.subtype,
    value:
      typeof value.value === "string"
        ? sanitizeDebugText(value.value, 1000)
        : value.value,
    description: sanitizeDebugText(value.description, 1000)
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
    description: sanitizeDebugText(stackTrace.description, 500),
    callFrames: callFrames.map((frame) => ({
      functionName: sanitizeDebugText(frame.functionName, 160),
      url: sanitizeDebugUrl(frame.url),
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
    url: sanitizeDebugUrl(frame.url),
    domainAndRegistry: frame.domainAndRegistry,
    securityOrigin: frame.securityOrigin,
    mimeType: frame.mimeType,
    unreachableUrl: sanitizeDebugUrl(frame.unreachableUrl)
  };
}

function sanitizeDebugText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return value;
  }

  return truncateAndRedactString(value, maxLength);
}

function sanitizeDebugUrl(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  return redactSensitiveUrl(value).value;
}

function sessionIdForTab(tabId: number | undefined) {
  if (typeof tabId !== "number") {
    return null;
  }

  return sessionManager.findSessionByTabId(tabId)?.sessionId ?? null;
}

function createClaimToken(tabId: number) {
  pruneClaimTokens();
  const token = crypto.randomUUID();
  claimTokens.set(token, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    tabId
  });
  return token;
}

function resolveClaimedTabId(params: ActionParams = {}) {
  if (typeof params.claimToken === "string" && params.claimToken.trim()) {
    const token = params.claimToken.trim();
    const record = claimTokens.get(token);

    if (!record) {
      throw new Error("claimTab.params.claimToken is invalid or expired");
    }

    if (record.expiresAt < Date.now()) {
      claimTokens.delete(token);
      throw new Error("claimTab.params.claimToken is expired");
    }

    claimTokens.delete(token);
    return record.tabId;
  }

  if (typeof params.tabId === "number" && params.allowUnsafeTabIdClaim !== true) {
    throw new Error(
      "claimTab.params.tabId requires allowUnsafeTabIdClaim=true. Prefer browser.user.openTabs() and pass claimToken."
    );
  }

  return params.tabId;
}

function pruneClaimTokens() {
  const now = Date.now();

  for (const [token, record] of claimTokens.entries()) {
    if (record.expiresAt < now) {
      claimTokens.delete(token);
    }
  }
}

function isClaimableTab(tab: chrome.tabs.Tab) {
  try {
    if (typeof tab.url !== "string" || !tab.url.trim()) {
      return false;
    }

    assertAllowedNavigationUrl(tab.url);
    return true;
  } catch {
    return false;
  }
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
    const text = devLogText(args.join(" "), 1000);
    const url = devLogUrl(firstStackFrameUrl(params.stackTrace));

    return {
      sequence: event.sequence,
      time: event.time,
      timestamp: new Date(event.time).toISOString(),
      sessionId: event.sessionId ?? null,
      tabId: event.tabId ?? null,
      source: "console",
      level: normalizeDevLogLevel(params.type),
      text: text.value,
      redacted: text.redacted || url.redacted,
      redactionReasons: Array.from(new Set([...text.reasons, ...url.reasons])),
      url: url.value,
      lineNumber: firstStackFrameNumber(params.stackTrace, "lineNumber"),
      columnNumber: firstStackFrameNumber(params.stackTrace, "columnNumber")
    };
  }

  if (method === "Log.entryAdded") {
    const text = devLogText(params.text, 1000);
    const url = devLogUrl(params.url);

    return {
      sequence: event.sequence,
      time: event.time,
      timestamp: new Date(event.time).toISOString(),
      sessionId: event.sessionId ?? null,
      tabId: event.tabId ?? null,
      source: "log",
      level: normalizeDevLogLevel(params.level),
      text: text.value,
      redacted: text.redacted || url.redacted,
      redactionReasons: Array.from(new Set([...text.reasons, ...url.reasons])),
      url: url.value,
      lineNumber: params.lineNumber,
      columnNumber: params.columnNumber
    };
  }

  if (method === "Runtime.exceptionThrown") {
    const text = devLogText(
      params.text ||
        (params.exception && typeof params.exception === "object"
          ? params.exception.description
          : undefined),
      1000
    );
    const url = devLogUrl(params.url);

    return {
      sequence: event.sequence,
      time: event.time,
      timestamp: new Date(event.time).toISOString(),
      sessionId: event.sessionId ?? null,
      tabId: event.tabId ?? null,
      source: "exception",
      level: "error",
      text: text.value,
      redacted: text.redacted || url.redacted,
      redactionReasons: Array.from(new Set([...text.reasons, ...url.reasons])),
      url: url.value,
      lineNumber: params.lineNumber,
      columnNumber: params.columnNumber
    };
  }

  return null;
}

function devLogText(value: unknown, maxLength: number) {
  const raw = value == null ? "" : String(value);
  const valueText = truncateAndRedactString(raw, maxLength);
  const redacted = valueText !== raw;

  return {
    value: valueText,
    redacted,
    reasons: redacted ? ["secret_pattern_or_truncation"] : []
  };
}

function devLogUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return {
      value: undefined,
      redacted: false,
      reasons: [] as string[]
    };
  }

  const redacted = redactSensitiveUrl(value);
  return {
    value: redacted.value,
    redacted: redacted.reasons.length > 0,
    reasons: redacted.reasons
  };
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
  const parsed = parseKeyCombo(key);
  const map: Record<string, { key: string; code: string; keyCode: number }> = {
    Enter: { key: "Enter", code: "Enter", keyCode: 13 },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    Delete: { key: "Delete", code: "Delete", keyCode: 46 },
    Insert: { key: "Insert", code: "Insert", keyCode: 45 },
    Space: { key: " ", code: "Space", keyCode: 32 },
    Home: { key: "Home", code: "Home", keyCode: 36 },
    End: { key: "End", code: "End", keyCode: 35 },
    PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
    PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    Pause: { key: "Pause", code: "Pause", keyCode: 19 },
    CapsLock: { key: "CapsLock", code: "CapsLock", keyCode: 20 },
    NumLock: { key: "NumLock", code: "NumLock", keyCode: 144 },
    ScrollLock: { key: "ScrollLock", code: "ScrollLock", keyCode: 145 },
    ContextMenu: { key: "ContextMenu", code: "ContextMenu", keyCode: 93 },
    Convert: { key: "Convert", code: "Convert", keyCode: 28 },
    NonConvert: { key: "NonConvert", code: "NonConvert", keyCode: 29 },
    KanaMode: { key: "KanaMode", code: "KanaMode", keyCode: 21 },
    HangulMode: { key: "HangulMode", code: "HangulMode", keyCode: 21 },
    HanjaMode: { key: "HanjaMode", code: "HanjaMode", keyCode: 25 },
    JunjaMode: { key: "JunjaMode", code: "JunjaMode", keyCode: 23 },
    FinalMode: { key: "FinalMode", code: "FinalMode", keyCode: 24 },
    ModeChange: { key: "ModeChange", code: "ModeChange", keyCode: 31 },
    Process: { key: "Process", code: "Process", keyCode: 229 },
    Compose: { key: "Compose", code: "Compose", keyCode: 229 },
    AudioVolumeMute: { key: "AudioVolumeMute", code: "AudioVolumeMute", keyCode: 173 },
    AudioVolumeDown: { key: "AudioVolumeDown", code: "AudioVolumeDown", keyCode: 174 },
    AudioVolumeUp: { key: "AudioVolumeUp", code: "AudioVolumeUp", keyCode: 175 },
    MediaTrackNext: { key: "MediaTrackNext", code: "MediaTrackNext", keyCode: 176 },
    MediaTrackPrevious: { key: "MediaTrackPrevious", code: "MediaTrackPrevious", keyCode: 177 },
    MediaStop: { key: "MediaStop", code: "MediaStop", keyCode: 178 },
    MediaPlayPause: { key: "MediaPlayPause", code: "MediaPlayPause", keyCode: 179 },
    NumpadEnter: { key: "Enter", code: "NumpadEnter", keyCode: 13 },
    NumpadAdd: { key: "+", code: "NumpadAdd", keyCode: 107 },
    NumpadSubtract: { key: "-", code: "NumpadSubtract", keyCode: 109 },
    NumpadMultiply: { key: "*", code: "NumpadMultiply", keyCode: 106 },
    NumpadDivide: { key: "/", code: "NumpadDivide", keyCode: 111 },
    NumpadDecimal: { key: ".", code: "NumpadDecimal", keyCode: 110 },
    NumpadEqual: { key: "=", code: "NumpadEqual", keyCode: 187 },
    Alt: { key: "Alt", code: "AltLeft", keyCode: 18 },
    Control: { key: "Control", code: "ControlLeft", keyCode: 17 },
    ControlOrMeta: isMacLikePlatform()
      ? { key: "Meta", code: "MetaLeft", keyCode: 91 }
      : { key: "Control", code: "ControlLeft", keyCode: 17 },
    Meta: { key: "Meta", code: "MetaLeft", keyCode: 91 },
    Shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 }
  };

  for (let index = 0; index <= 9; index += 1) {
    map[`Numpad${index}`] = {
      key: String(index),
      code: `Numpad${index}`,
      keyCode: 96 + index
    };
  }

  for (let index = 1; index <= 24; index += 1) {
    map[`F${index}`] = {
      key: `F${index}`,
      code: `F${index}`,
      keyCode: 111 + index
    };
  }

  const normalized = map[canonicalKeyName(parsed.key)] ?? printableKey(parsed.key);

  if (!normalized) {
    throw new Error(`Unsupported key: ${key}`);
  }

  return {
    ...normalized,
    modifiers: modifierBitmask(parsed.modifiers)
  };
}

function canonicalKeyName(key: string) {
  const aliases: Record<string, string> = {
    Esc: "Escape",
    Del: "Delete",
    Spacebar: "Space",
    Left: "ArrowLeft",
    Right: "ArrowRight",
    Up: "ArrowUp",
    Down: "ArrowDown",
    Pageup: "PageUp",
    Pagedown: "PageDown",
    PgUp: "PageUp",
    PgDown: "PageDown",
    Cmd: "Meta",
    Command: "Meta",
    Option: "Alt",
    Ctrl: "Control",
    Return: "Enter",
    Apps: "ContextMenu",
    Menu: "ContextMenu",
    VolumeMute: "AudioVolumeMute",
    VolumeDown: "AudioVolumeDown",
    VolumeUp: "AudioVolumeUp",
    MediaNextTrack: "MediaTrackNext",
    MediaPreviousTrack: "MediaTrackPrevious",
    MediaPrevTrack: "MediaTrackPrevious",
    MediaPlay: "MediaPlayPause",
    MediaPause: "MediaPlayPause",
    NumpadPlus: "NumpadAdd",
    NumpadMinus: "NumpadSubtract",
    NumpadStar: "NumpadMultiply",
    NumpadSlash: "NumpadDivide",
    NumpadDot: "NumpadDecimal",
    Decimal: "NumpadDecimal",
    Multiply: "NumpadMultiply",
    Add: "NumpadAdd",
    Subtract: "NumpadSubtract",
    Divide: "NumpadDivide"
  };

  return aliases[key] ?? key;
}

function printableKey(key: string) {
  if (/^[a-zA-Z]$/.test(key)) {
    const upper = key.toUpperCase();
    return {
      key,
      code: `Key${upper}`,
      keyCode: upper.charCodeAt(0)
    };
  }

  if (/^[0-9]$/.test(key)) {
    return {
      key,
      code: `Digit${key}`,
      keyCode: key.charCodeAt(0)
    };
  }

  const printable: Record<string, { code: string; keyCode: number }> = {
    "`": { code: "Backquote", keyCode: 192 },
    "-": { code: "Minus", keyCode: 189 },
    "=": { code: "Equal", keyCode: 187 },
    "[": { code: "BracketLeft", keyCode: 219 },
    "]": { code: "BracketRight", keyCode: 221 },
    "\\": { code: "Backslash", keyCode: 220 },
    ";": { code: "Semicolon", keyCode: 186 },
    "'": { code: "Quote", keyCode: 222 },
    ",": { code: "Comma", keyCode: 188 },
    ".": { code: "Period", keyCode: 190 },
    "/": { code: "Slash", keyCode: 191 }
  };
  const mapped = printable[key];

  return mapped ? { key, ...mapped } : null;
}

function parseKeyCombo(key: string) {
  const parts = key.split("+").map((part) => part.trim()).filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Unsupported key: empty key");
  }

  if (parts.length === 1) {
    return {
      modifiers: [],
      key: parts[0]
    };
  }

  return {
    modifiers: parts.slice(0, -1),
    key: parts[parts.length - 1]
  };
}

function modifierBitmask(modifiers: string[]) {
  let value = 0;

  for (const modifier of modifiers) {
    const canonicalModifier = canonicalKeyName(modifier);
    const normalized = canonicalModifier === "ControlOrMeta"
      ? isMacLikePlatform() ? "Meta" : "Control"
      : canonicalModifier;

    if (normalized === "Alt") {
      value |= 1;
    } else if (normalized === "Control") {
      value |= 2;
    } else if (normalized === "Meta") {
      value |= 4;
    } else if (normalized === "Shift") {
      value |= 8;
    } else {
      throw new Error(`Unsupported key modifier: ${modifier}`);
    }
  }

  return value;
}

function isMacLikePlatform() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Mac|iPhone|iPad|iPod/i.test(`${navigator.platform || ""} ${navigator.userAgent || ""}`);
}

function normalizeDragPath(value: any): Array<{ x: number; y: number }> {
  if (!Array.isArray(value)) {
    throw new Error("drag.params.path must be an array");
  }

  if (value.length < 2) {
    throw new Error("drag.params.path must contain at least two points");
  }

  return value.map((point, index) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) {
      throw new Error(`drag.params.path[${index}] must be an object`);
    }

    return {
      x: requireFiniteNumber(point.x, `drag.params.path[${index}].x`),
      y: requireFiniteNumber(point.y, `drag.params.path[${index}].y`)
    };
  });
}

function normalizePointerModifiers(value: any) {
  if (value == null) {
    return 0;
  }

  if (!Array.isArray(value)) {
    throw new Error("pointer modifiers must be an array");
  }

  if (!value.every((modifier) => typeof modifier === "string")) {
    throw new Error("pointer modifiers must be strings");
  }

  if (new Set(value).size !== value.length) {
    throw new Error("pointer modifiers must not contain duplicates");
  }

  return modifierBitmask(value);
}

function normalizeMouseButton(button: any) {
  if (button == null) {
    return "left";
  }

  if (button === "left" || button === "middle" || button === "right" || button === "back" || button === "forward") {
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

  if (button === "back") {
    return 8;
  }

  if (button === "forward") {
    return 16;
  }

  return 1;
}

function normalizeLoadState(state: any) {
  if (state == null) {
    return "load";
  }

  if (
    state === "commit" ||
    state === "load" ||
    state === "domcontentloaded" ||
    state === "networkidle"
  ) {
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

function createDefaultBrowserPolicyState(): BrowserPolicyState {
  return {
    sessionAllowedHosts: {},
    persistentAllowedHosts: [],
    blockedHosts: []
  };
}

async function ensureBrowserPolicyLoaded() {
  if (browserPolicyLoaded) {
    return;
  }

  if (!browserPolicyLoadPromise) {
    browserPolicyLoadPromise = loadBrowserPolicyState();
  }

  await browserPolicyLoadPromise;
}

async function loadBrowserPolicyState() {
  const stored = await storageGet(POLICY_STORAGE_KEY);
  browserPolicyState = sanitizeBrowserPolicyState(stored);
  browserPolicyLoaded = true;
}

async function persistBrowserPolicyState() {
  await storageSet(POLICY_STORAGE_KEY, cloneBrowserPolicyState(browserPolicyState));
}

function storageGet(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => {
      resolve(items?.[key]);
    });
  });
}

function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

function storageSessionGet(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.storage.session.get(key, (items) => {
      resolve(items?.[key]);
    });
  });
}

function storageSessionSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

function storageSessionRemove(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.session.remove(key, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

function sanitizeBrowserPolicyState(value: unknown): BrowserPolicyState {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as ActionParams
    : {};
  const sessionAllowedHosts: Record<string, string[]> = {};

  if (
    source.sessionAllowedHosts &&
    typeof source.sessionAllowedHosts === "object" &&
    !Array.isArray(source.sessionAllowedHosts)
  ) {
    for (const [sessionId, hosts] of Object.entries(source.sessionAllowedHosts)) {
      if (Array.isArray(hosts)) {
        sessionAllowedHosts[sessionId] = normalizeHostList(hosts);
      }
    }
  }

  return {
    sessionAllowedHosts,
    persistentAllowedHosts: normalizeHostList(source.persistentAllowedHosts),
    blockedHosts: normalizeHostList(source.blockedHosts)
  };
}

function cloneBrowserPolicyState(
  state: BrowserPolicyState,
  sessionId?: unknown
): BrowserPolicyState {
  const normalizedSessionId = typeof sessionId === "string" && sessionId.trim()
    ? sessionId.trim()
    : null;

  return {
    sessionAllowedHosts: normalizedSessionId
      ? {
          [normalizedSessionId]: [
            ...(state.sessionAllowedHosts[normalizedSessionId] ?? [])
          ]
        }
      : Object.fromEntries(
          Object.entries(state.sessionAllowedHosts).map(([id, hosts]) => [
            id,
            [...hosts]
          ])
        ),
    persistentAllowedHosts: [...state.persistentAllowedHosts],
    blockedHosts: [...state.blockedHosts]
  };
}

function normalizeHostList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(normalizePolicyHost).filter(Boolean) as string[])).sort();
}

function normalizePolicyDecision(value: unknown) {
  if (value === "allow" || value === "always_allow" || value === "deny") {
    return value;
  }

  throw new Error("updatePolicy.params.decision must be allow, always_allow, or deny");
}

function applyHostAccessDecision(
  state: BrowserPolicyState,
  args: { decision: "allow" | "always_allow" | "deny"; host: string; sessionId?: unknown }
) {
  removeHostFromPolicy(state, args.host);

  if (args.decision === "deny") {
    state.blockedHosts = addPolicyHost(state.blockedHosts, args.host);
    return;
  }

  if (args.decision === "always_allow") {
    state.persistentAllowedHosts = addPolicyHost(state.persistentAllowedHosts, args.host);
    return;
  }

  const sessionId = typeof args.sessionId === "string" && args.sessionId.trim()
    ? args.sessionId.trim()
    : null;

  if (!sessionId) {
    throw new Error("Per-session host allow requires updatePolicy.params.sessionId");
  }

  state.sessionAllowedHosts[sessionId] = addPolicyHost(
    state.sessionAllowedHosts[sessionId] ?? [],
    args.host
  );
}

async function assertBrowserPolicyForTab(
  action: BrowserPolicyAction,
  tabId: number,
  sessionId: unknown,
  params: ActionParams = {}
) {
  const tab = await chrome.tabs.get(tabId);
  await assertBrowserPolicyForUrl(action, tab.url ?? null, sessionId, {
    ...params,
    tabId
  });
}

async function assertBrowserPolicyForUrl(
  action: BrowserPolicyAction,
  url: unknown,
  sessionId: unknown,
  params: ActionParams = {}
) {
  await ensureBrowserPolicyLoaded();
  const verdict = evaluateBrowserHostAccess(browserPolicyState, {
    action,
    sessionId,
    url
  });

  if (!verdict.allowed) {
    if (verdict.code === "requires_host_approval" && verdict.host) {
      const details = hostApprovalPromptDetails(action, verdict, sessionId, params);
      postHostApprovalRequiredEvent(details);
      safePostEvent({
        name: "policyBlocked",
        sessionId: details.sessionId,
        tabId: details.tabId,
        host: verdict.host,
        action,
        code: verdict.code,
        approvalId: details.approvalId
      });
      throw browserActionError("requires_host_approval", verdict.message, details);
    }

    safePostEvent({
      name: "policyBlocked",
      sessionId: typeof sessionId === "string" ? sessionId : null,
      tabId: typeof params.tabId === "number" ? params.tabId : null,
      host: verdict.host,
      action,
      code: verdict.code
    });
    throw new Error(`${verdict.code}: ${verdict.message}`);
  }

  const classification = classifyBrowserPolicyAction(action, url, params);
  postPermissionPromptDetectedIfNeeded(action, sessionId, params, classification);

  if (classification.requiresOriginApproval && params.originApproved !== true) {
    const details = browserOriginApprovalDetails(action, classification, sessionId, params);
    postBrowserOriginApprovalRequiredEvent(details);
    throw browserActionError("origin_approval_required", details.message, details);
  }

  const originApprovalSatisfiesConfirmation =
    action === "rawCdp" && !classification.reasons.includes("sensitive_browser_state");
  const confirmed =
    params.confirmed === true ||
    (originApprovalSatisfiesConfirmation && classification.requiresOriginApproval && params.originApproved === true);

  if (classification.requiresConfirmation && !confirmed) {
    const details = browserActionConfirmationDetails(action, classification, sessionId, params);
    postBrowserActionConfirmationRequiredEvent(details);
    throw browserActionError("confirmation_required", details.message, details);
  }
}

function browserActionError(code: string, message: string, details?: ActionParams) {
  const error = new Error(`${code}: ${message}`) as Error & {
    code?: string;
    details?: ActionParams;
  };
  error.code = code;
  error.details = details;
  return error;
}

function hostApprovalPromptDetails(
  action: BrowserPolicyAction,
  verdict: HostAccessVerdict,
  sessionId: unknown,
  params: ActionParams
): HostApprovalPromptDetails {
  const host = verdict.host ?? "unknown";
  const normalizedSessionId =
    typeof sessionId === "string" && sessionId.trim()
      ? sessionId.trim()
      : null;
  const approvalId = hostApprovalId(host, normalizedSessionId, action);
  const allowForSession = normalizedSessionId
    ? {
        decision: "allow" as const,
        host,
        sessionId: normalizedSessionId
      }
    : null;

  return {
    action,
    approvalId,
    host,
    message: verdict.message,
    sessionId: normalizedSessionId,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    suggestedDecisions: {
      allowForSession,
      alwaysAllow: {
        decision: "always_allow",
        host
      },
      deny: {
        decision: "deny",
        host
      }
    }
  };
}

function postHostApprovalRequiredEvent(details: HostApprovalPromptDetails) {
  registerPendingApproval({
    approvalId: details.approvalId,
    kind: "host",
    action: details.action,
    host: details.host,
    sessionId: details.sessionId,
    tabId: details.tabId,
    message: details.message,
    suggestedDecisions: details.suggestedDecisions
  });
  safePostEvent({
    name: "hostApprovalRequired",
    sessionId: details.sessionId,
    tabId: details.tabId,
    action: details.action,
    host: details.host,
    approvalId: details.approvalId,
    message: details.message,
    suggestedDecisions: details.suggestedDecisions
  });
}

function hostApprovalId(host: string, sessionId: string | null, action: BrowserPolicyAction) {
  return `host:${sessionId ?? "global"}:${host}:${action}`;
}

function browserOriginApprovalDetails(
  action: BrowserPolicyAction,
  classification: ActionParams,
  sessionId: unknown,
  params: ActionParams
): BrowserOriginApprovalDetails {
  const reasons = Array.isArray(classification.reasons)
    ? classification.reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  const host = typeof classification.host === "string" ? classification.host : null;
  const normalizedSessionId =
    typeof sessionId === "string" && sessionId.trim()
      ? sessionId.trim()
      : null;
  const approvalId = browserOriginApprovalId(action, host, normalizedSessionId);

  return {
    action,
    approvalId,
    host,
    message: `Browser action ${action} on ${host ?? "unknown origin"} requires originApproved=true.`,
    reasons,
    sessionId: normalizedSessionId,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    subject: browserOriginApprovalSubject(action, params),
    requiredParams: {
      originApproved: true
    }
  };
}

function postBrowserOriginApprovalRequiredEvent(details: BrowserOriginApprovalDetails) {
  registerPendingApproval({
    approvalId: details.approvalId,
    kind: "origin",
    action: details.action,
    host: details.host,
    sessionId: details.sessionId,
    tabId: details.tabId,
    message: details.message,
    reasons: details.reasons,
    subject: details.subject,
    requiredParams: details.requiredParams
  });
  safePostEvent({
    name: "browserOriginApprovalRequired",
    sessionId: details.sessionId,
    tabId: details.tabId,
    action: details.action,
    host: details.host,
    approvalId: details.approvalId,
    message: details.message,
    reasons: details.reasons,
    subject: details.subject,
    requiredParams: details.requiredParams
  });
}

function browserOriginApprovalSubject(action: BrowserPolicyAction, params: ActionParams): ActionParams | undefined {
  if (action === "rawCdp") {
    const subject: ActionParams = {
      kind: "rawCdp",
      method: typeof params.method === "string" ? truncateAndRedactString(params.method, 120) : "unknown"
    };
    if (typeof params.targetId === "string" && params.targetId.trim()) {
      subject.targetId = truncateAndRedactString(params.targetId.trim(), 120);
    }
    return subject;
  }

  if (action === "download") {
    const subject: ActionParams = {
      kind: "download"
    };
    for (const key of ["url", "finalUrl", "filename", "filePath", "attribute"] as const) {
      const value = params[key];
      if (typeof value === "string" && value.trim()) {
        subject[key] = truncateAndRedactString(value.trim(), key === "url" || key === "finalUrl" ? 240 : 160);
      }
    }
    if (typeof params.locator === "object" && params.locator && !Array.isArray(params.locator)) {
      const locator = params.locator as ActionParams;
      subject.locator = {
        kind: typeof locator.kind === "string" ? locator.kind : undefined,
        selector: typeof locator.selector === "string" ? truncateAndRedactString(locator.selector, 160) : undefined,
        text: typeof locator.text === "string" ? truncateAndRedactString(locator.text, 160) : undefined,
        role: typeof locator.role === "string" ? truncateAndRedactString(locator.role, 80) : undefined
      };
    }
    return subject;
  }

  return undefined;
}

function browserOriginApprovalId(
  action: BrowserPolicyAction,
  host: string | null,
  sessionId: string | null
) {
  return `origin:${sessionId ?? "global"}:${host ?? "unknown"}:${action}`;
}

function browserActionConfirmationDetails(
  action: BrowserPolicyAction,
  classification: ActionParams,
  sessionId: unknown,
  params: ActionParams
): BrowserActionConfirmationDetails {
  const reasons = Array.isArray(classification.reasons)
    ? classification.reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  const normalizedSessionId =
    typeof sessionId === "string" && sessionId.trim()
      ? sessionId.trim()
      : null;
  const host = typeof classification.host === "string" ? classification.host : null;
  const confirmationId = browserActionConfirmationId(
    action,
    host,
    normalizedSessionId,
    reasons
  );

  return {
    action,
    confirmationId,
    host,
    message: `Browser action ${action} requires confirmation (${reasons.join(", ")}).`,
    reasons,
    sessionId: normalizedSessionId,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    target: {
      label: truncateAndRedactString(typeof params.label === "string" ? params.label : "", 120),
      text: truncateAndRedactString(typeof params.text === "string" ? params.text : "", 120),
      tagName: typeof params.tagName === "string" ? params.tagName.toLowerCase() : null
    },
    requiredParams: {
      confirmed: true,
      confirmationId
    }
  };
}

function postBrowserActionConfirmationRequiredEvent(details: BrowserActionConfirmationDetails) {
  registerPendingApproval({
    approvalId: details.confirmationId,
    kind: "confirmation",
    action: details.action,
    host: details.host,
    sessionId: details.sessionId,
    tabId: details.tabId,
    message: details.message,
    reasons: details.reasons,
    target: details.target,
    requiredParams: details.requiredParams
  });
  safePostEvent({
    name: "browserActionConfirmationRequired",
    sessionId: details.sessionId,
    tabId: details.tabId,
    action: details.action,
    host: details.host,
    confirmationId: details.confirmationId,
    message: details.message,
    reasons: details.reasons,
    target: details.target,
    requiredParams: details.requiredParams
  });
}

function browserActionConfirmationId(
  action: BrowserPolicyAction,
  host: string | null,
  sessionId: string | null,
  reasons: string[]
) {
  const reasonKey = reasons.length > 0 ? reasons.slice().sort().join(".") : "unspecified";
  return `confirm:${sessionId ?? "global"}:${host ?? "unknown"}:${action}:${reasonKey}`;
}

function postPermissionPromptDetectedIfNeeded(
  action: BrowserPolicyAction,
  sessionId: unknown,
  params: ActionParams,
  classification: ActionParams
) {
  if (!Array.isArray(classification.reasons) || !classification.reasons.includes("browser_permission")) {
    return;
  }

  safePostEvent({
    name: "permissionPromptDetected",
    sessionId: typeof sessionId === "string" ? sessionId : null,
    tabId: typeof params.tabId === "number" ? params.tabId : null,
    action,
    host: typeof classification.host === "string" ? classification.host : null,
    confirmed: params.confirmed === true,
    reasons: classification.reasons,
    target: {
      label: truncateAndRedactString(typeof params.label === "string" ? params.label : "", 120),
      text: truncateAndRedactString(typeof params.text === "string" ? params.text : "", 120),
      tagName: typeof params.tagName === "string" ? params.tagName.toLowerCase() : null
    }
  });
}

async function assertBrowserBlocklistForUrl(
  action: BrowserPolicyAction,
  url: unknown,
  sessionId: unknown
) {
  await ensureBrowserPolicyLoaded();
  const verdict = evaluateBrowserHostAccess(browserPolicyState, {
    action,
    sessionId,
    url
  });

  if (verdict.code !== "host_blocked") {
    return;
  }

  safePostEvent({
    name: "policyBlocked",
    sessionId: typeof sessionId === "string" ? sessionId : null,
    host: verdict.host,
    action,
    code: verdict.code
  });
  throw new Error(`${verdict.code}: ${verdict.message}`);
}

function evaluateBrowserHostAccess(
  state: BrowserPolicyState,
  check: { action: BrowserPolicyAction; sessionId?: unknown; url?: unknown }
): HostAccessVerdict {
  const host = normalizePolicyHost(check.url);

  if (!host) {
    return {
      allowed: false,
      requiresApproval: false,
      code: "invalid_url",
      host: null,
      scope: null,
      message: "A valid http/https URL is required for browser host policy checks."
    };
  }

  if (hostSetHas(state.blockedHosts, host)) {
    return {
      allowed: false,
      requiresApproval: false,
      code: "host_blocked",
      host,
      scope: "blocked",
      message: `Browser access to ${host} is blocked by policy.`
    };
  }

  if (hostSetHas(state.persistentAllowedHosts, host)) {
    return {
      allowed: true,
      requiresApproval: false,
      code: "allowed",
      host,
      scope: "persistent",
      message: `Browser access to ${host} is allowed persistently.`
    };
  }

  const sessionId = typeof check.sessionId === "string" && check.sessionId.trim()
    ? check.sessionId.trim()
    : null;
  if (sessionId && hostSetHas(state.sessionAllowedHosts[sessionId] ?? [], host)) {
    return {
      allowed: true,
      requiresApproval: false,
      code: "allowed",
      host,
      scope: "session",
      message: `Browser access to ${host} is allowed for this session.`
    };
  }

  return {
    allowed: false,
    requiresApproval: true,
    code: "requires_host_approval",
    host,
    scope: null,
    message: `Browser access to ${host} requires approval before ${check.action}.`
  };
}

function classifyBrowserPolicyAction(
  action: BrowserPolicyAction,
  url: unknown,
  params: ActionParams
) {
  const reasons = new Set<string>();
  const script = typeof params.script === "string" ? params.script : "";
  const rawCdpText = action === "rawCdp"
    ? `${typeof params.method === "string" ? params.method : ""} ${stringifyPolicyParams(params.params)}`
    : "";
  const readOnlyEvaluate =
    action === "evaluate" &&
    params.mode !== "write" &&
    !looksLikeMutatingScript(script);
  const label = typeof params.label === "string" ? params.label : "";
  const text = typeof params.text === "string" ? params.text : "";

  if (action === "upload") {
    reasons.add("file_upload");
  }

  if (action === "download" && looksLikeRunnableDownload(url, params.filename ?? params.filePath)) {
    reasons.add("download_run_or_install");
  }

  if (action === "history") {
    reasons.add("browser_history");
  }

  if (action === "clipboard") {
    reasons.add("clipboard");
  }

  if (action === "type" && params.sensitive === true) {
    reasons.add("sensitive_input");
  }

  if (
    DESTRUCTIVE_BROWSER_ACTION_PATTERN.test(label) ||
    DESTRUCTIVE_BROWSER_ACTION_PATTERN.test(text)
  ) {
    reasons.add("destructive_action");
  } else if (
    EXTERNAL_SIDE_EFFECT_PATTERN.test(label) ||
    EXTERNAL_SIDE_EFFECT_PATTERN.test(text)
  ) {
    reasons.add("external_side_effect");
  }

  if (action === "permission" || looksLikeBrowserPermissionPrompt(label, text)) {
    reasons.add("browser_permission");
  }

  if (action === "rawCdp") {
    reasons.add("raw_cdp");
  }

  if ((action === "evaluate" && looksLikeSensitiveBrowserStateAccess(script)) ||
      (action === "rawCdp" && looksLikeSensitiveBrowserStateAccess(rawCdpText))) {
    reasons.add("sensitive_browser_state");
  }

  if (action === "evaluate" && !readOnlyEvaluate) {
    reasons.add("mutating_evaluate");
  }

  return {
    host: normalizePolicyHost(url),
    readOnly: readOnlyEvaluate,
    requiresConfirmation: reasons.size > 0,
    requiresOriginApproval: action === "rawCdp" || action === "download",
    reasons: Array.from(reasons)
  };
}

function looksLikeRunnableDownload(url: unknown, filename: unknown) {
  const source = `${typeof filename === "string" ? filename : ""} ${typeof url === "string" ? url : ""}`.toLowerCase();
  return /\.(app|apk|bat|bin|cmd|com|deb|dmg|exe|msi|pkg|ps1|rpm|run|scr|sh)(?:[?#\s]|$)/i.test(source);
}

function looksLikeBrowserPermissionPrompt(label: string, text: string) {
  const source = `${label} ${text}`.trim();
  return PERMISSION_GRANT_PATTERN.test(source) && BROWSER_PERMISSION_TARGET_PATTERN.test(source);
}

function assertReadOnlyEvaluateAllowed(script: string, params: ActionParams, operation: string) {
  if (params.mode !== "read" || !looksLikeMutatingScript(script)) {
    return;
  }

  throw browserActionError(
    "read_only_evaluate_violation",
    "Read-only evaluate mode rejected a script that appears to mutate page or browser state. Use mode: \"write\" with confirmation for mutating scripts.",
    {
      operation,
      mode: "read",
      reason: "mutating_script_pattern"
    }
  );
}

function looksLikeMutatingScript(script: string) {
  return /\b(click|submit|remove|setAttribute|removeAttribute|appendChild|insertBefore|replaceChild|dispatchEvent|deleteDatabase|localStorage\s*\.\s*(setItem|removeItem|clear)|sessionStorage\s*\.\s*(setItem|removeItem|clear)|document\s*\.\s*cookie\s*=|cookie\s*=)\b|\.value\s*=|\.checked\s*=|\.textContent\s*=|\.innerHTML\s*=/i.test(script);
}

function looksLikeSensitiveBrowserStateAccess(text: string) {
  return /\b(document\s*\.\s*cookie|cookieStore|localStorage|sessionStorage|indexedDB|chrome\s*\.\s*storage|Storage\.|Network\.get(All)?Cookies|password|passwd|pwd|credential|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?(id|token)?|csrf)\b/i.test(text);
}

function stringifyPolicyParams(params: unknown) {
  if (params == null) {
    return "";
  }

  if (typeof params === "string") {
    return params;
  }

  try {
    return JSON.stringify(params).slice(0, 8000);
  } catch {
    return String(params);
  }
}

function normalizePolicyHost(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  let parsed: URL;

  try {
    parsed = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.host.toLowerCase();
}

function hostSetHas(hosts: string[], host: string) {
  return hosts.some((candidate) => candidate === host || host.endsWith(`.${candidate}`));
}

function addPolicyHost(hosts: string[], host: string) {
  return Array.from(new Set([...hosts, host])).sort();
}

function removeHostFromPolicy(state: BrowserPolicyState, host: string) {
  state.blockedHosts = state.blockedHosts.filter((candidate) => candidate !== host);
  state.persistentAllowedHosts = state.persistentAllowedHosts.filter((candidate) => candidate !== host);

  for (const [sessionId, hosts] of Object.entries(state.sessionAllowedHosts)) {
    const nextHosts = hosts.filter((candidate) => candidate !== host);
    if (nextHosts.length > 0) {
      state.sessionAllowedHosts[sessionId] = nextHosts;
    } else {
      delete state.sessionAllowedHosts[sessionId];
    }
  }
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

function truncateAndRedactString(value: any, maxLength: number) {
  const truncated = truncateString(value, maxLength);
  return typeof truncated === "string" ? redactSecretPatterns(truncated) : truncated;
}

function redactObservation(observation: ActionParams) {
  if (typeof observation.text === "string") {
    observation.text = redactSecretPatterns(observation.text);
  }

  if (typeof observation.selectedText === "string") {
    observation.selectedText = redactSecretPatterns(observation.selectedText);
  }

  if (observation.focusedElement && typeof observation.focusedElement === "object") {
    redactStringFields(observation.focusedElement as ActionParams, ["label", "visibleText"]);
  }

  if (observation.modalState && typeof observation.modalState === "object") {
    const dialogs = (observation.modalState as ActionParams).dialogs;
    if (Array.isArray(dialogs)) {
      for (const dialog of dialogs) {
        if (dialog && typeof dialog === "object") {
          redactStringFields(dialog as ActionParams, ["label", "text"]);
        }
      }
    }
  }

  if (Array.isArray(observation.elements)) {
    for (const element of observation.elements) {
      if (element && typeof element === "object") {
        redactStringFields(element as ActionParams, ["label", "visibleText", "href", "placeholder", "testId"]);

        if (Array.isArray((element as ActionParams).selectorCandidates)) {
          for (const candidate of (element as ActionParams).selectorCandidates as ActionParams[]) {
            if (candidate && typeof candidate === "object") {
              redactStringFields(candidate, ["selector"]);
            }
          }
        }
      }
    }
  }

  if (Array.isArray(observation.accessibilityTree)) {
    redactAccessibilityLikeNodes(observation.accessibilityTree);
  }

  if (observation.semanticTree && Array.isArray(observation.semanticTree.nodes)) {
    redactAccessibilityLikeNodes(observation.semanticTree.nodes);
  }
}

function redactHistoryEntry(entry: chrome.history.HistoryItem) {
  const url = redactSensitiveUrl(entry.url ?? "");
  const title = typeof entry.title === "string"
    ? redactSecretPatterns(entry.title)
    : entry.title;
  const redactionReasons = new Set(url.reasons);

  if (title !== entry.title) {
    redactionReasons.add("secret_pattern");
  }

  return {
    id: entry.id,
    url: url.value,
    title,
    lastVisitTime: entry.lastVisitTime,
    dateVisited:
      typeof entry.lastVisitTime === "number"
        ? new Date(entry.lastVisitTime).toISOString()
        : undefined,
    visitCount: entry.visitCount,
    typedCount: entry.typedCount,
    redacted: redactionReasons.size > 0,
    redactionReasons: Array.from(redactionReasons)
  };
}

function redactStringFields(target: ActionParams, keys: string[]) {
  for (const key of keys) {
    if (typeof target[key] === "string") {
      target[key] = redactSecretPatterns(target[key]);
    }
  }
}

function redactAccessibilityLikeNodes(nodes: ActionParams[]) {
  for (const node of nodes) {
    for (const key of ["name", "value", "description"]) {
      if (typeof node[key] === "string") {
        node[key] = redactSecretPatterns(node[key]);
      }
    }
  }
}

function redactSecretPatterns(value: string) {
  return value
    .replace(/\b(token|access_token|refresh_token|secret)\s*=\s*([^\s&]+)/gi, "$1=[redacted]")
    .replace(/\b(password|passwd|pwd)\s*:\s*([^\s]+)/gi, "$1: [redacted]")
    .replace(/\b(api[_-]?key)\s*=\s*"([^"]*)"/gi, "$1=\"[redacted]\"")
    .replace(/\b(api[_-]?key)\s*=\s*(?!")([^\s&]+)/gi, "$1=[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]");
}

function redactSensitiveUrl(value: string) {
  const reasons = new Set<string>();

  try {
    const parsed = new URL(value);
    const sensitiveParamPattern = /(^|[_-])(token|access|refresh|secret|password|passwd|pwd|key|api[_-]?key|auth|session|sid|code|credential)([_-]|$)/i;

    parsed.searchParams.forEach((_value, key) => {
      if (sensitiveParamPattern.test(key)) {
        parsed.searchParams.set(key, "[redacted]");
        reasons.add("sensitive_query_param");
      }
    });

    if (parsed.hash && redactSecretPatterns(parsed.hash) !== parsed.hash) {
      parsed.hash = "#[redacted]";
      reasons.add("sensitive_fragment");
    }

    return {
      value: parsed.toString(),
      reasons: Array.from(reasons)
    };
  } catch {
    const redacted = redactSecretPatterns(value);
    return {
      value: redacted,
      reasons: redacted !== value ? ["secret_pattern"] : []
    };
  }
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
