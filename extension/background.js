/// <reference path="./action-validator.ts" />
/// <reference path="./debugger-manager.ts" />
/// <reference path="./event-buffer.ts" />
/// <reference path="./session-manager.ts" />
importScripts("action-validator.js", "debugger-manager.js", "event-buffer.js", "session-manager.js");
const HOST_NAME = "com.formax.browserhost";
const CDP_VERSION = "1.3";
const HEARTBEAT_ALARM = "formax-native-reconnect";
const CLIPBOARD_OFFSCREEN_URL = "clipboard-offscreen.html";
const EVENT_SNAPSHOT_STORAGE_KEY = "formax.agentBrowser.eventSnapshots.v1";
const POLICY_STORAGE_KEY = "formax.browserPolicy.v1";
const DEFAULT_CDP_TIMEOUT_MS = 10000;
const MAX_EVENT_SNAPSHOTS = 50;
const MAX_EVENTS_PER_SESSION_SNAPSHOT = 200;
const BACKEND_REVISION = 5;
const DESTRUCTIVE_BROWSER_ACTION_PATTERN = /\b(delete|remove|destroy|cancel|close\s+account|deactivate|terminate|drop)\b/i;
const EXTERNAL_SIDE_EFFECT_PATTERN = /\b(send|submit|post|publish|comment|reply|create|book|schedule|invite|save|update|confirm|pay|purchase|subscribe|unsubscribe)\b/i;
const SUPPORTED_ACTIONS = [
    "health",
    "reloadExtension",
    "getEvents",
    "clearEvents",
    "waitForEvent",
    "getDiagnostics",
    "getPolicy",
    "updatePolicy",
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
    "click",
    "drag",
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
    "endTurn",
    "stopSession"
];
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
const cursorOverlayStateByTab = new Map();
const claimTokens = new Map();
const tabOpenedAt = new Map();
const networkRequestsByTab = new Map();
const cursorArrivalWaiters = new Map();
let activeActionContext = null;
let nextCursorMoveSequence = 0;
let browserPolicyState = createDefaultBrowserPolicyState();
let browserPolicyLoaded = false;
let browserPolicyLoadPromise = null;
registerTopLevelListeners();
connectNativeHost();
ensureReconnectAlarm();
void ensureBrowserPolicyLoaded();
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
        if (message?.type === "GET_AGENT_CURSOR_STATE") {
            const tabId = sender.tab?.id;
            sendResponse({
                ok: true,
                state: typeof tabId === "number"
                    ? cursorOverlayStateByTab.get(tabId) ?? null
                    : null
            });
            return true;
        }
        if (message?.type === "AGENT_CURSOR_ARRIVED") {
            const tabId = sender.tab?.id;
            const moveSequence = Number(message.moveSequence);
            const sessionId = typeof message.sessionId === "string" ? message.sessionId : null;
            const turnId = typeof message.turnId === "string" ? message.turnId : null;
            const state = typeof tabId === "number" ? cursorOverlayStateByTab.get(tabId) : null;
            if (state &&
                Number.isFinite(moveSequence) &&
                state.moveSequence === moveSequence &&
                state.sessionId === sessionId &&
                state.turnId === turnId) {
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
                    error: structuredError(error)
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
            error: structuredError(error)
        });
    }
}
async function dispatchAction(action, params, actionId) {
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
    }
    catch (error) {
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
    }
    finally {
        activeActionContext = previousContext;
    }
}
async function dispatchActionRaw(action, params) {
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
        case "getDiagnostics":
            return getDiagnostics(params);
        case "getPolicy":
            return getPolicy(params);
        case "updatePolicy":
            return updatePolicy(params);
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
        case "endTurn":
            return endTurn(params);
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
function extractParamsMetadata(params = {}) {
    return {
        sessionId: typeof params.sessionId === "string" ? params.sessionId : null,
        tabId: typeof params.tabId === "number" ? params.tabId : null,
        turnId: typeof params.turnId === "string" ? params.turnId : null,
        url: typeof params.url === "string" ? params.url : null,
        confirmed: params.confirmed === true,
        originApproved: params.originApproved === true,
        confirmationId: typeof params.confirmationId === "string" && params.confirmationId.trim()
            ? truncateAndRedactString(params.confirmationId.trim(), 120)
            : null
    };
}
async function postBrowserActionAudit(args) {
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
    }
    catch (error) {
        console.warn("Failed to post browser action audit", error);
    }
}
async function originForActionAudit(url, tabId) {
    if (url) {
        return originForAudit(url);
    }
    if (typeof tabId !== "number") {
        return null;
    }
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    return originForAudit(tab?.url ?? null);
}
function actionAuditCategory(action) {
    if (["health", "getCapabilities", "reloadExtension"].includes(action))
        return "runtime";
    if (["startSession", "nameSession", "createTab", "switchTab", "claimTab", "openTabs", "closeTab", "finalizeSession", "endTurn", "stopSession", "listTabs", "getTab"].includes(action))
        return "session";
    if (["getEvents", "clearEvents", "waitForEvent", "getDevLogs"].includes(action))
        return "diagnostic";
    if (["getPolicy", "updatePolicy"].includes(action))
        return "policy";
    if (["openUrl", "goBack", "goForward", "reload", "waitForLoadState", "waitForUrl"].includes(action))
        return "navigation";
    if (["waitForSelector", "waitForText", "observe", "elementInfo", "locatorQuery", "locatorWait", "screenshot"].includes(action))
        return "inspection";
    if (["locatorAction", "click", "drag", "moveMouse", "scroll", "typeText", "pressKey", "handleDialog"].includes(action))
        return "interaction";
    if (["evaluate", "cdp"].includes(action))
        return "diagnostic";
    if (["uploadFile"].includes(action))
        return "file";
    if (["listDownloads", "waitForDownload"].includes(action))
        return "download";
    if (["getHistory"].includes(action))
        return "history";
    if (["clipboardReadText", "clipboardWriteText", "clipboardRead", "clipboardWrite"].includes(action))
        return "clipboard";
    return "unknown";
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
function structuredError(error) {
    const message = stringifyError(error);
    return {
        code: errorCodeForMessage(message),
        message
    };
}
function errorCodeForMessage(message) {
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
    if (message.includes("must be") || message.includes("requires")) {
        return "invalid_params";
    }
    return "internal_error";
}
async function health() {
    const permissionStatus = await chromePermissionStatus();
    const fileUrlAccess = await chromeFileUrlAccessStatus();
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
        supportedActions: SUPPORTED_ACTIONS,
        backendRevision: BACKEND_REVISION,
        permissions: permissionStatus,
        fileUrlAccess
    };
}
async function chromePermissionStatus() {
    const manifest = chrome.runtime.getManifest();
    const required = Array.isArray(manifest.permissions)
        ? manifest.permissions.filter((permission) => typeof permission === "string")
        : [];
    const hostPermissions = Array.isArray(manifest.host_permissions)
        ? manifest.host_permissions.filter((permission) => typeof permission === "string")
        : [];
    try {
        const granted = required.length === 0
            ? true
            : await chrome.permissions.contains({ permissions: required });
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
    }
    catch (error) {
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
    const extensionApi = chrome.extension;
    if (!extensionApi || typeof extensionApi.isAllowedFileSchemeAccess !== "function") {
        return {
            detectable: false,
            allowed: null,
            error: "chrome.extension.isAllowedFileSchemeAccess is unavailable"
        };
    }
    try {
        const allowed = await new Promise((resolve) => {
            extensionApi.isAllowedFileSchemeAccess((value) => resolve(Boolean(value)));
        });
        return {
            detectable: true,
            allowed
        };
    }
    catch (error) {
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
async function getEvents(params = {}) {
    const result = {
        events: eventBuffer.list(params)
    };
    if (params.includeSnapshots === true) {
        result.snapshots = await listEventSnapshots(params);
    }
    return result;
}
async function clearEvents(params = {}) {
    const cleared = eventBuffer.clear(params);
    const clearedSnapshots = params.includeSnapshots === true
        ? await clearEventSnapshots(params)
        : 0;
    return {
        cleared,
        clearedSnapshots
    };
}
async function waitForEvent(params = {}) {
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
async function getDiagnostics(params = {}) {
    const eventLimit = normalizeDiagnosticsLimit(params.eventLimit, 100, 500);
    const devLogLimit = normalizeDiagnosticsLimit(params.devLogLimit, 100, 500);
    const healthSnapshot = await health();
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
        nativeManifest: normalizeNativeManifestDiagnostics(params.nativeDiagnostics),
        extension: {
            id: healthSnapshot.extensionId,
            version: healthSnapshot.version,
            backendRevision: healthSnapshot.backendRevision
        }
    };
}
function normalizeDiagnosticsLimit(value, fallback, max) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(1, Math.min(Math.floor(value), max));
}
function normalizeNativeManifestDiagnostics(value) {
    const source = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    return {
        path: typeof source.manifestPath === "string" ? source.manifestPath : null,
        expectedOrigin: typeof source.expectedOrigin === "string" ? source.expectedOrigin : null,
        hostName: typeof source.hostName === "string" ? source.hostName : null,
        extensionId: typeof source.extensionId === "string" ? source.extensionId : null
    };
}
async function persistSessionEventSnapshot(sessionId, reason) {
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
async function listEventSnapshots(params = {}) {
    const limit = normalizeEventSnapshotLimit(params.snapshotLimit);
    let snapshots = await loadEventSnapshots();
    if (typeof params.sessionId === "string" && params.sessionId.trim()) {
        const sessionId = params.sessionId.trim();
        snapshots = snapshots.filter((snapshot) => snapshot.sessionId === sessionId);
    }
    if (typeof params.sinceSequence === "number") {
        snapshots = snapshots.filter((snapshot) => typeof snapshot.lastSequence === "number" &&
            snapshot.lastSequence > params.sinceSequence);
    }
    if (typeof params.name === "string" && params.name.trim()) {
        const name = params.name.trim();
        snapshots = snapshots
            .map((snapshot) => ({
            ...snapshot,
            events: snapshot.events.filter((event) => event.name === name)
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
async function clearEventSnapshots(params = {}) {
    const snapshots = await loadEventSnapshots();
    const kept = snapshots.filter((snapshot) => !eventSnapshotMatches(snapshot, params));
    const cleared = snapshots.length - kept.length;
    if (cleared > 0) {
        await saveEventSnapshots(kept);
    }
    return cleared;
}
function eventSnapshotMatches(snapshot, params = {}) {
    if (typeof params.sessionId === "string" && params.sessionId.trim() && snapshot.sessionId !== params.sessionId.trim()) {
        return false;
    }
    if (typeof params.sinceSequence === "number" &&
        (typeof snapshot.lastSequence !== "number" ||
            snapshot.lastSequence <= params.sinceSequence)) {
        return false;
    }
    if (typeof params.name === "string" && params.name.trim()) {
        const name = params.name.trim();
        return Array.isArray(snapshot.events) && snapshot.events.some((event) => event.name === name);
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
        .map((snapshot) => snapshot)
        .filter((snapshot) => typeof snapshot.sessionId === "string" && Array.isArray(snapshot.events))
        .slice(-MAX_EVENT_SNAPSHOTS);
}
async function saveEventSnapshots(snapshots) {
    await storageSessionSet(EVENT_SNAPSHOT_STORAGE_KEY, snapshots.slice(-MAX_EVENT_SNAPSHOTS));
}
function normalizeEventSnapshotLimit(limit) {
    if (typeof limit !== "number" || !Number.isFinite(limit)) {
        return MAX_EVENT_SNAPSHOTS;
    }
    return Math.max(1, Math.min(Math.floor(limit), MAX_EVENT_SNAPSHOTS));
}
function summarizeEventSnapshot(snapshot) {
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
async function getPolicy(params = {}) {
    await ensureBrowserPolicyLoaded();
    return {
        policy: cloneBrowserPolicyState(browserPolicyState, params.sessionId)
    };
}
async function updatePolicy(params = {}) {
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
async function startSession(params = {}) {
    if (typeof params.initialUrl === "string" && params.initialUrl.trim()) {
        await assertBrowserPolicyForUrl("navigate", params.initialUrl, params.sessionId, params);
    }
    const session = await sessionManager.startSession(params);
    if (typeof session.activeTabId === "number") {
        await debuggerManager.attachTab(session.activeTabId);
    }
    return sessionManager.serializeSession(session);
}
async function nameSession(params = {}) {
    const sessionId = requireString(params.sessionId, "nameSession.params.sessionId");
    const name = requireString(params.name, "nameSession.params.name");
    const session = await sessionManager.nameSession(sessionId, name);
    return {
        session: sessionManager.serializeSession(session)
    };
}
async function claimTab(params = {}) {
    const claimParams = {
        ...params,
        tabId: resolveClaimedTabId(params)
    };
    const { session, tab } = await sessionManager.claimTab(claimParams);
    await debuggerManager.attachTab(tab.id);
    return sessionManager.serializeSession(session);
}
async function createTab(params = {}) {
    if (typeof params.url === "string" && params.url.trim()) {
        await assertBrowserPolicyForUrl("navigate", params.url, params.sessionId, params);
    }
    const { session, tab } = await sessionManager.createTab(params);
    await debuggerManager.attachTab(tab.id);
    return {
        session: sessionManager.serializeSession(session),
        tab: await summarizeTab(tab)
    };
}
async function switchTab(params = {}) {
    const { tabId } = sessionManager.resolveSessionAndTab(params);
    const session = await sessionManager.switchTab(params);
    await debuggerManager.attachTab(tabId);
    const tab = await chrome.tabs.get(tabId);
    return {
        session: sessionManager.serializeSession(session),
        tab: await summarizeTab(tab)
    };
}
async function openUrl(params = {}) {
    const url = requireString(params.url, "openUrl.params.url");
    assertAllowedNavigationUrl(url);
    let session = sessionManager.findOptionalSession(params);
    await assertBrowserPolicyForUrl("navigate", url, session?.sessionId ?? params.sessionId, params);
    if (!session) {
        if (typeof params.tabId === "number") {
            throw new Error("Cannot open URL in an unclaimed tab. Use openTabs and claimTab before controlling an existing user tab.");
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
async function waitForLoadState(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const state = normalizeLoadState(params.state);
    const timeoutMs = numberOrDefault(params.timeoutMs, 15000);
    const idleMs = numberOrDefault(params.idleMs, 500);
    await debuggerManager.attachTab(tabId);
    await showCursorActivity(tabId, "thinking");
    if (state === "networkidle") {
        const result = await waitForNetworkIdle(tabId, timeoutMs, idleMs);
        sessionManager.touchSession(session?.sessionId);
        return {
            sessionId: session?.sessionId ?? null,
            tabId,
            state,
            ...result
        };
    }
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
async function waitForText(params = {}) {
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
async function observe(params = {}) {
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

  const shadowMetadataFor = (el) => {
    const root = el.getRootNode?.();
    if (!(root instanceof ShadowRoot)) {
      return {
        shadowRoot: null,
        shadowHostSelector: null
      };
    }

    return {
      shadowRoot: "open",
      shadowHostSelector: selectorForHost(root.host)
    };
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

  const allCandidates = queryAllPiercingOpenShadow(selector);
  const candidates = allCandidates
    .filter((el) => isFileInput(el) || isVisible(el))
    .slice(0, MAX_ELEMENTS);
  const allCandidateCount = allCandidates
    .filter((el) => isFileInput(el) || isVisible(el))
    .length;

  const elements = candidates.map((el, index) => {
    const ref = refScope + "-e" + index;
    const rect = el.getBoundingClientRect();
    const sensitive = isSensitive(el);
    const visibleText = normalizeText(el.innerText || el.textContent || "").slice(0, 160);

    window.__agentBrowserController.elements[ref] = el;
    el.setAttribute("data-agent-browser-ref", ref);

    return {
      ref,
      nodeId: ref,
      role: roleOf(el),
      label: labelOf(el),
      visibleText,
      sensitive,
      tagName: el.tagName.toLowerCase(),
      ...shadowMetadataFor(el),
      selectorCandidates: selectorCandidatesFor(el),
      ...elementState(el),
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
  const bodyText = normalizeText(document.body?.innerText || "");
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
      text: bodyText.length > MAX_TEXT_LENGTH,
      textMaxLength: MAX_TEXT_LENGTH,
      elements: allCandidateCount > MAX_ELEMENTS,
      elementCount: allCandidateCount,
      elementMaxCount: MAX_ELEMENTS
    },
    text: bodyText.slice(0, MAX_TEXT_LENGTH),
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
    const maxAccessibilityNodes = numberOrDefault(params.maxAccessibilityNodes, 200);
    let accessibilityTree = [];
    let accessibilityError;
    if (params.includeAccessibility !== false) {
        try {
            accessibilityTree = await getAccessibilityTree(tabId, maxAccessibilityNodes);
        }
        catch (error) {
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
    redactObservation(observation);
    return observation;
}
async function elementInfo(params = {}) {
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
      return {
        shadowRoot: null,
        shadowHostSelector: null
      };
    }

    return {
      shadowRoot: "open",
      shadowHostSelector: selectorForHost(root.host)
    };
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
async function locatorQuery(params = {}) {
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
async function locatorAction(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const locator = normalizeLocatorPlan(params.locator);
    const kind = normalizeLocatorActionKind(params.kind);
    const args = params.args && typeof params.args === "object" ? params.args : {};
    const waitMs = numberOrDefault(params.waitMs, 300);
    await debuggerManager.attachTab(tabId);
    if (kind === "click" || kind === "dblclick") {
        const target = await resolveLocatorRef(tabId, locator, `locatorAction.${kind}`, kind, args);
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
        const target = await resolveLocatorRef(tabId, locator, `locatorAction.${kind}`, kind, args);
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
        await focusLocator(tabId, locator, args);
        return pressKey({
            sessionId: session?.sessionId,
            tabId,
            key,
            waitMs
        });
    }
    if (kind === "clear" || kind === "focus" || kind === "hover") {
        const target = await resolveLocatorRef(tabId, locator, `locatorAction.${kind}`, kind, args);
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
async function locatorWait(params = {}) {
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
async function click(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    await debuggerManager.attachTab(tabId);
    const target = await resolvePointerTarget(tabId, params, "click");
    await assertBrowserPolicyForTab("click", tabId, session?.sessionId, {
        ...params,
        label: typeof target.label === "string" ? target.label : undefined,
        text: typeof target.text === "string" ? target.text : undefined
    });
    await showCursor(tabId, target.x, target.y);
    await dispatchMouseClick(tabId, target.x, target.y, params);
    await showCursorClick(tabId, target.x, target.y);
    await sleep(numberOrDefault(params.waitMs, 500));
    return observe({
        sessionId: session?.sessionId,
        tabId
    });
}
async function drag(params = {}) {
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
async function moveMouse(params = {}) {
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
async function scroll(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const deltaX = numberOrDefault(params.deltaX, 0);
    const deltaY = numberOrDefault(params.deltaY, 0);
    const modifiers = normalizePointerModifiers(params.modifiers);
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
        deltaY,
        modifiers
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
    await assertBrowserPolicyForTab("type", tabId, session?.sessionId, {
        ...params,
        text
    });
    const ref = typeof params.ref === "string" ? params.ref : null;
    const selector = typeof params.selector === "string" ? params.selector : null;
    const hasCoordinates = typeof params.x === "number" && typeof params.y === "number";
    await debuggerManager.attachTab(tabId);
    if (ref || selector) {
        if (params.clear === true) {
            const target = await focusAndMaybeClearElement(tabId, params, true);
            await showCursor(tabId, target.x, target.y);
        }
        else {
            const target = await focusAndMaybeClearElement(tabId, params, false);
            await showCursor(tabId, target.x, target.y);
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
        readOnly: params.mode !== "write" && !looksLikeMutatingScript(script)
    });
    await showCursorActivity(tabId, "thinking");
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
    const keyText = normalized.key === "Enter"
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
    const captureParams = {
        format,
        fromSurface: true
    };
    const clip = normalizeScreenshotClip(params.clip);
    if (clip) {
        captureParams.clip = clip;
    }
    else if (params.fullPage === true) {
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
function normalizeScreenshotClip(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const source = value;
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
async function uploadFile(params = {}) {
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
        files: filePaths
    });
    await sleep(numberOrDefault(params.waitMs, 1000));
    sessionManager.touchSession(session?.sessionId);
    return observe({
        sessionId: session?.sessionId,
        tabId
    });
}
function normalizeUploadFilePaths(params) {
    const filePaths = Array.isArray(params.filePaths)
        ? params.filePaths.map((item, index) => requireString(item, `uploadFile.params.filePaths[${index}]`))
        : [];
    if (typeof params.filePath === "string" && params.filePath.trim()) {
        filePaths.unshift(params.filePath.trim());
    }
    if (filePaths.length === 0) {
        throw new Error("uploadFile.params requires filePath or filePaths");
    }
    return filePaths;
}
async function listTabs(params = {}) {
    const query = {};
    const session = typeof params.sessionId === "string" && params.sessionId.trim()
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
        tabs = tabs.filter((tab) => typeof tab.id === "number" &&
            sessionManager.findSessionByTabId(tab.id) != null);
    }
    return {
        tabs: await Promise.all(tabs.map((tab) => summarizeTab(tab)))
    };
}
async function openTabs(params = {}) {
    const query = {};
    if (params.currentWindow === true) {
        query.currentWindow = true;
    }
    let tabs = await chrome.tabs.query(query);
    if (params.includeControlled !== true) {
        tabs = tabs.filter((tab) => typeof tab.id !== "number" ||
            sessionManager.findSessionByTabId(tab.id) == null);
    }
    const claimableTabs = tabs.filter((tab) => typeof tab.id === "number" && isClaimableTab(tab));
    const summaries = await Promise.all(claimableTabs.map((tab) => summarizeTab(tab)));
    return {
        tabs: claimableTabs.map((tab, index) => {
            const token = createClaimToken(tab.id);
            return {
                ...summaries[index],
                claimToken: token,
                claimTokenExpiresAt: claimTokens.get(token)?.expiresAt ?? Date.now()
            };
        })
    };
}
async function getHistory(params = {}) {
    if (params.confirmed !== true) {
        throw new Error("confirmation_required: Browser history access requires confirmed=true for this request.");
    }
    const limit = Math.max(1, Math.min(Math.floor(numberOrDefault(params.limit, 50)), 100));
    const search = {
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
async function clipboardReadText(params = {}) {
    if (params.confirmed !== true) {
        throw new Error("confirmation_required: Clipboard read requires confirmed=true for this request.");
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
async function clipboardWriteText(params = {}) {
    if (params.confirmed !== true) {
        throw new Error("confirmation_required: Clipboard write requires confirmed=true for this request.");
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
async function clipboardRead(params = {}) {
    if (params.confirmed !== true) {
        throw new Error("confirmation_required: Clipboard read requires confirmed=true for this request.");
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
async function clipboardWrite(params = {}) {
    if (params.confirmed !== true) {
        throw new Error("confirmation_required: Clipboard write requires confirmed=true for this request.");
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
function normalizeClipboardItems(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error("clipboardWrite.params.items must be a non-empty array");
    }
    return value.map((item, itemIndex) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error(`clipboardWrite.params.items[${itemIndex}] must be an object`);
        }
        const source = item;
        if (!Array.isArray(source.types) || source.types.length === 0) {
            throw new Error(`clipboardWrite.params.items[${itemIndex}].types must be a non-empty array`);
        }
        return {
            types: source.types.map((payload, typeIndex) => {
                if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
                    throw new Error(`clipboardWrite.params.items[${itemIndex}].types[${typeIndex}] must be an object`);
                }
                const candidate = payload;
                const mimeType = requireString(candidate.mimeType, `clipboardWrite.params.items[${itemIndex}].types[${typeIndex}].mimeType`);
                const text = typeof candidate.text === "string" ? candidate.text : undefined;
                const dataBase64 = typeof candidate.dataBase64 === "string" ? candidate.dataBase64 : undefined;
                if (text == null && dataBase64 == null) {
                    throw new Error(`clipboardWrite.params.items[${itemIndex}].types[${typeIndex}] requires text or dataBase64`);
                }
                const normalized = {
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
async function sendClipboardOffscreenMessage(message) {
    await ensureClipboardOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
        type: "FORMAX_CLIPBOARD_OFFSCREEN",
        ...message
    });
    if (!response || response.ok !== true) {
        throw new Error(response?.error || "Clipboard offscreen request failed");
    }
    return response.result && typeof response.result === "object"
        ? response.result
        : {};
}
async function ensureClipboardOffscreenDocument() {
    const offscreen = chrome.offscreen;
    if (!offscreen?.createDocument) {
        throw new Error("Clipboard backend requires chrome.offscreen support.");
    }
    const runtime = chrome.runtime;
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
    }
    catch (error) {
        const message = stringifyError(error);
        if (!message.includes("Only a single offscreen document")) {
            throw error;
        }
    }
}
async function getTab(params = {}) {
    const { tabId } = sessionManager.resolveSessionAndTab(params);
    const tab = await chrome.tabs.get(tabId);
    return {
        tab: await summarizeTab(tab)
    };
}
function getCapabilities(params = {}) {
    const scope = params.scope === "tab" ? "tab" : params.scope === "browser" ? "browser" : null;
    const capabilities = listCapabilities().filter((capability) => !scope || capability.scope === scope);
    return {
        capabilities
    };
}
function getDevLogs(params = {}) {
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
async function listDownloads(params = {}) {
    const downloads = await findDownloads(params);
    await assertBrowserBlocklistForDownloads(downloads, params.sessionId);
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
async function rawCdp(params = {}) {
    const { session, tabId } = sessionManager.resolveSessionAndTab(params);
    const method = requireString(params.method, "cdp.params.method");
    const targetId = typeof params.targetId === "string" && params.targetId.trim()
        ? params.targetId.trim()
        : null;
    const commandParams = params.params && typeof params.params === "object" && !Array.isArray(params.params)
        ? params.params
        : {};
    const timeoutMs = numberOrDefault(params.timeoutMs, DEFAULT_CDP_TIMEOUT_MS);
    await assertBrowserPolicyForTab("rawCdp", tabId, session?.sessionId, {
        ...params,
        method
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
async function backendNodeForPoint(tabId, x, y, includeNonInteractable) {
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
    }
    catch {
        return {
            backendNodeId: null,
            nodeId: null,
            frameId: null
        };
    }
    finally {
        try {
            await cdp(tabId, "Runtime.releaseObjectGroup", {
                objectGroup: "formaxElementInfo"
            });
        }
        catch {
            // Releasing debug handles is best-effort and should not affect inspection.
        }
    }
}
async function postDiagnosticActionAudit(args) {
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
function auditReason(value, fallback) {
    return typeof value === "string" && value.trim()
        ? truncateAndRedactString(value.trim(), 160)
        : fallback;
}
function evaluateAuditReason(script, params) {
    if (params.mode === "write" || looksLikeMutatingScript(script)) {
        return "mutating_evaluate";
    }
    return "read_only_evaluate";
}
function originForAudit(url) {
    if (typeof url !== "string" || !url.trim()) {
        return null;
    }
    try {
        return new URL(url).origin;
    }
    catch {
        return null;
    }
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
        await debuggerManager.detachTab(tabId);
        cursorOverlayStateByTab.delete(tabId);
        if (handoff.has(tabId)) {
            keptTabs.push(tabId);
            continue;
        }
        if (deliverable.has(tabId) || !closeRest || lease?.origin === "user") {
            try {
                await chrome.tabs.ungroup(tabId);
            }
            catch {
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
            }
            catch {
                // The tab may have already been closed.
            }
        }
    }
    const handedOffTabs = await sessionManager.handoffTabs(sessionId, handoffTabIds, {
        activeTabId: typeof params.activeTabId === "number" ? params.activeTabId : session.activeTabId,
        turnId: params.turnId
    });
    if (handedOffTabs.length === 0) {
        await sessionManager.markSessionStopped(sessionId);
        sessionManager.deleteSession(sessionId);
    }
    const eventSnapshot = await persistSessionEventSnapshot(sessionId, "finalizeSession");
    const clearedEvents = eventBuffer.clear({ sessionId });
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
async function endTurn(params = {}) {
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
        await debuggerManager.detachTab(tabId);
        cursorOverlayStateByTab.delete(tabId);
    }
    if (session.tabIds.length === 0) {
        await sessionManager.markSessionStopped(sessionId);
        sessionManager.deleteSession(sessionId);
    }
    return {
        ended: true,
        sessionId,
        turnId,
        releasedTabs
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
        cursorOverlayStateByTab.delete(tabId);
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
    const eventSnapshot = await persistSessionEventSnapshot(sessionId, "stopSession");
    const clearedEvents = eventBuffer.clear({ sessionId });
    return {
        stopped: true,
        sessionId,
        closedTabs,
        eventSnapshot: summarizeEventSnapshot(eventSnapshot),
        clearedEvents
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
  const visibleText = normalizeText(el.innerText || el.textContent || "");

  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    label: labelOf(el).slice(0, 160),
    text: visibleText.slice(0, 160),
    tagName: el.tagName,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
})()`;
}
function normalizeLocatorPlan(locator, depth = 0) {
    if (!locator || typeof locator !== "object") {
        throw new Error("locator params require a locator object");
    }
    if (depth > 4) {
        throw new Error("locator nested filters exceed the supported depth");
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
    const frameSelectors = Array.isArray(locator.frameSelectors)
        ? locator.frameSelectors.map((selector, selectorIndex) => requireString(selector, `locator.frameSelectors[${selectorIndex}]`))
        : undefined;
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
function normalizeLocatorQueryKind(kind) {
    const value = requireString(kind, "locatorQuery.kind");
    const allowed = [
        "count",
        "allTextContents",
        "textContent",
        "innerText",
        "getAttribute",
        "isVisible",
        "isEnabled",
        "inputValue",
        "isChecked",
        "boundingBox"
    ];
    if (!allowed.includes(value)) {
        throw new Error(`Unsupported locator query kind: ${value}`);
    }
    return value;
}
function normalizeLocatorActionKind(kind) {
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
async function resolveLocatorRef(tabId, locator, actionName, actionKind = "click", actionArgs = {}) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: locatorTargetExpression(locator, `agent-locator-${crypto.randomUUID()}`, actionKind, actionArgs),
        returnByValue: true,
        awaitPromise: true
    });
    const value = readRuntimeValue(evaluated);
    if (!value || value.ok !== true) {
        throw new Error(value?.error || `Unable to resolve locator for ${actionName}: ${locator.selector}`);
    }
    return value;
}
async function focusLocator(tabId, locator, actionArgs = {}) {
    const evaluated = await cdp(tabId, "Runtime.evaluate", {
        expression: `(async () => {
  ${locatorResolverSource(locator)}
  ${locatorActionabilitySource("press", actionArgs)}
  const resolved = resolveLocator();

  if (!resolved.ok) {
    return resolved;
  }

  const el = resolved.element;
  const actionability = await checkLocatorActionability(el);
  if (!actionability.ok) return actionability;
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
function locatorTargetExpression(locator, ref, actionKind = "click", actionArgs = {}) {
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
      error: "Element target not found",
      count: resolved.count
    };
  }

  const ref = ${JSON.stringify(ref)};
  const actionability = await checkLocatorActionability(el);
  if (!actionability.ok) return actionability;

  window.__agentBrowserController = window.__agentBrowserController || {};
  window.__agentBrowserController.elements = window.__agentBrowserController.elements || {};
  window.__agentBrowserController.elements[ref] = el;
  el.setAttribute("data-agent-browser-ref", ref);

  const rect = actionability.rect || el.getBoundingClientRect();

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
function locatorActionabilitySource(actionKind, actionArgs = {}) {
    const requiresEditable = ["fill", "type", "clear"].includes(actionKind);
    const requiresPointer = ["click", "dblclick", "hover"].includes(actionKind);
    const requiresEnabled = [
        "click",
        "dblclick",
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
  const locatorActionabilityEnabled = (node) => {
    return !node.disabled &&
      node.getAttribute("aria-disabled") !== "true" &&
      !node.closest?.("fieldset[disabled]");
  };
  const locatorActionabilityEditable = (node) => {
    const tag = node.tagName.toLowerCase();
    const type = (node.getAttribute("type") || "").toLowerCase();
    const isTextInput = tag === "textarea" ||
      (tag === "input" && !["button", "checkbox", "file", "hidden", "image", "radio", "reset", "submit"].includes(type));
    return node.isContentEditable ||
      (isTextInput && !node.readOnly && !node.disabled && node.getAttribute("aria-readonly") !== "true");
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
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;

    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element center is outside the viewport",
        code: "outside_viewport"
      };
    }

    const top = locatorActionabilityElementFromPoint(x, y);
    if (!top || (top !== node && !node.contains(top))) {
      return {
        ok: false,
        error: "Locator actionability failed for " + locatorActionabilityKind + ": element does not receive pointer events",
        code: "occluded"
      };
    }

    return { ok: true };
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
      const receivesPointer = locatorActionabilityReceivesPointer(node, rect);
      if (!receivesPointer.ok) return receivesPointer;
    }

    return { ok: true, rect };
  };
`;
}
function uploadTargetExpression(options) {
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
function locatorResolverSource(locator) {
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
function locatorQueryExpression(locator, kind, args) {
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
function locatorMutationExpression(locator, kind, args) {
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
async function dispatchMouseClick(tabId, x, y, params = {}) {
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
async function dispatchMouseDrag(tabId, path, params = {}) {
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
async function locateElementByRef(tabId, ref) {
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
function summarizeAccessibilityNodes(nodes, maxNodes) {
    return nodes
        .filter((node) => node && node.ignored !== true)
        .map((node) => ({
        role: primitiveOrUndefined(node.role),
        name: primitiveOrUndefined(node.name),
        value: primitiveOrUndefined(node.value),
        description: primitiveOrUndefined(node.description),
        backendDOMNodeId: typeof node.backendDOMNodeId === "number"
            ? node.backendDOMNodeId
            : undefined
    }))
        .filter((node) => node.role || node.name || node.value || node.description)
        .slice(0, Math.max(1, Math.min(maxNodes, 200)));
}
function summarizeDomSnapshot(snapshot) {
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
function primitiveOrUndefined(value) {
    if (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean") {
        return value;
    }
    return undefined;
}
function arrayLength(value) {
    return Array.isArray(value) ? value.length : 0;
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
async function showCursor(tabId, x, y, options = {}) {
    const sessionId = sessionIdForTab(tabId);
    const turnId = activeActionContext?.turnId ?? null;
    const moveSequence = ++nextCursorMoveSequence;
    const state = {
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
        const shouldWaitForArrival = options.waitForArrival !== false &&
            options.animate !== false &&
            state.visible;
        const arrivalPromise = shouldWaitForArrival
            ? waitForCursorArrival(tabId, moveSequence, options.arrivalTimeoutMs)
            : null;
        await withChromeMessageTimeout(chrome.tabs.sendMessage(tabId, {
            type: "AGENT_CURSOR",
            animate: options.animate !== false,
            moveSequence,
            phase: state.phase,
            sessionId,
            turnId,
            visible: state.visible,
            x,
            y
        }), 250);
        await arrivalPromise;
    }
    catch {
        cancelCursorArrivalWaiter(tabId, moveSequence);
        // Some pages cannot receive content scripts.
    }
}
function cursorArrivalKey(tabId, moveSequence) {
    return `${tabId}:${moveSequence}`;
}
function waitForCursorArrival(tabId, moveSequence, timeoutMs = 900) {
    return new Promise((resolve) => {
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
function resolveCursorArrivalWaiter(tabId, moveSequence) {
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
function cancelCursorArrivalWaiter(tabId, moveSequence) {
    const key = cursorArrivalKey(tabId, moveSequence);
    const waiter = cursorArrivalWaiters.get(key);
    if (!waiter) {
        return;
    }
    cursorArrivalWaiters.delete(key);
    self.clearTimeout(waiter.timeoutId);
    waiter.resolve();
}
function clearCursorArrivalWaitersForTab(tabId) {
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
async function showCursorActivity(tabId, phase = "thinking") {
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
async function showCursorClick(tabId, x, y) {
    try {
        if (!(await prepareContentScript(tabId))) {
            return;
        }
        await chrome.tabs.sendMessage(tabId, {
            type: "AGENT_CURSOR_CLICK",
            x,
            y
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
        const response = await withChromeMessageTimeout(chrome.tabs.sendMessage(tabId, {
            type: "CONTENT_PING"
        }), 250);
        return response?.ok === true;
    }
    catch {
        return false;
    }
}
function withChromeMessageTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeoutId = self.setTimeout(() => {
            reject(new Error(`Timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        promise.then((value) => {
            self.clearTimeout(timeoutId);
            resolve(value);
        }, (error) => {
            self.clearTimeout(timeoutId);
            reject(error);
        });
    });
}
async function cdp(tabId, method, params = {}, options = {}) {
    if (typeof options.targetId === "string" && options.targetId.trim()) {
        return debuggerManager.sendToTarget(options.targetId, method, params, options);
    }
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
function waitForNetworkIdle(tabId, timeoutMs, idleMs) {
    const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;
    const boundedIdleMs = Number.isFinite(idleMs) && idleMs > 0 ? Math.max(50, idleMs) : 500;
    return new Promise((resolve) => {
        let done = false;
        let idleTimer = null;
        const timeoutTimer = setTimeout(() => finish("timeout"), boundedTimeoutMs);
        const listener = (source, method, params) => {
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
        function finish(reason) {
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
async function locatorState(tabId, locator) {
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
async function summarizeTab(tab) {
    const sessionId = typeof tab.id === "number" ? sessionIdForTab(tab.id) : null;
    const groupLabel = await tabGroupLabel(tab.groupId);
    const openedAt = typeof tab.id === "number" ? tabOpenedAt.get(tab.id) ?? null : null;
    const lastFocusedAt = typeof tab.lastAccessed === "number" && Number.isFinite(tab.lastAccessed)
        ? tab.lastAccessed
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
async function tabGroupLabel(groupId) {
    if (typeof groupId !== "number" || groupId < 0 || !chrome.tabGroups?.get) {
        return null;
    }
    try {
        const group = await chrome.tabGroups.get(groupId);
        return typeof group.title === "string" && group.title.trim()
            ? group.title
            : null;
    }
    catch {
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
        tabCapability("tab.navigation", "Navigate, reload, and read URL/title for tabs.", true),
        tabCapability("tab.cua", "Coordinate mouse, keyboard, and scroll interactions.", true),
        tabCapability("tab.domSnapshot", "Capture DOMSnapshot output through CDP.", true),
        tabCapability("tab.accessibility", "Read accessibility tree data through CDP.", true),
        tabCapability("tab.cdp.target", "Send raw CDP commands to a specific DevTools targetId under a controlled tab.", true),
        tabCapability("tab.locator.css", "Use CSS selector based waits/actions.", true),
        tabCapability("tab.locator.semantic", "Use role/label/text/test-id locator engine.", true),
        tabCapability("tab.upload.locator", "Upload files through selector or locator targets.", true),
        tabCapability("tab.frameLocator", "Target nested frames with locator chains.", false, "not_implemented"),
        tabCapability("native.connected", "Native host connection is available.", nativeAvailable, nativeAvailable ? undefined : "native_disconnected")
    ];
}
function browserCapability(id, description, available, reason) {
    return {
        id,
        scope: "browser",
        description,
        available,
        reason
    };
}
function tabCapability(id, description, available, reason) {
    return {
        id,
        scope: "tab",
        description,
        available,
        reason
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
async function assertBrowserBlocklistForDownloads(downloads, sessionId) {
    for (const download of downloads) {
        await assertBrowserBlocklistForUrl("download", download.finalUrl || download.url, sessionId);
    }
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
        "Runtime.consoleAPICalled",
        "Runtime.exceptionThrown",
        "Log.entryAdded"
    ].includes(method);
}
function isNetworkRequestLifecycleEvent(method) {
    return (method === "Network.requestWillBeSent" ||
        method === "Network.loadingFinished" ||
        method === "Network.loadingFailed");
}
function trackNetworkDebuggerEvent(source, method, params) {
    if (typeof source.tabId !== "number" || !isNetworkRequestLifecycleEvent(method)) {
        return;
    }
    const requestId = typeof params?.requestId === "string" && params.requestId.trim()
        ? params.requestId.trim()
        : null;
    if (!requestId) {
        return;
    }
    const requests = networkRequestsByTab.get(source.tabId) ?? new Set();
    if (method === "Network.requestWillBeSent") {
        requests.add(requestId);
        networkRequestsByTab.set(source.tabId, requests);
        return;
    }
    requests.delete(requestId);
    if (requests.size === 0) {
        networkRequestsByTab.delete(source.tabId);
    }
    else {
        networkRequestsByTab.set(source.tabId, requests);
    }
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
function summarizeRemoteObject(value) {
    if (!value || typeof value !== "object") {
        return value;
    }
    return {
        type: value.type,
        subtype: value.subtype,
        value: typeof value.value === "string"
            ? truncateString(value.value, 1000)
            : value.value,
        description: truncateString(value.description, 1000)
    };
}
function summarizeStackTrace(stackTrace) {
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
function createClaimToken(tabId) {
    pruneClaimTokens();
    const token = crypto.randomUUID();
    claimTokens.set(token, {
        expiresAt: Date.now() + 5 * 60 * 1000,
        tabId
    });
    return token;
}
function resolveClaimedTabId(params = {}) {
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
        throw new Error("claimTab.params.tabId requires allowUnsafeTabIdClaim=true. Prefer browser.user.openTabs() and pass claimToken.");
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
function isClaimableTab(tab) {
    try {
        if (typeof tab.url !== "string" || !tab.url.trim()) {
            return false;
        }
        assertAllowedNavigationUrl(tab.url);
        return true;
    }
    catch {
        return false;
    }
}
function devLogFromEvent(event) {
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
            timestamp: new Date(event.time).toISOString(),
            sessionId: event.sessionId ?? null,
            tabId: event.tabId ?? null,
            source: "console",
            level: normalizeDevLogLevel(params.type),
            text: truncateAndRedactString(args.join(" "), 1000),
            url: firstStackFrameUrl(params.stackTrace),
            lineNumber: firstStackFrameNumber(params.stackTrace, "lineNumber"),
            columnNumber: firstStackFrameNumber(params.stackTrace, "columnNumber")
        };
    }
    if (method === "Log.entryAdded") {
        return {
            sequence: event.sequence,
            time: event.time,
            timestamp: new Date(event.time).toISOString(),
            sessionId: event.sessionId ?? null,
            tabId: event.tabId ?? null,
            source: "log",
            level: normalizeDevLogLevel(params.level),
            text: truncateAndRedactString(params.text, 1000),
            url: params.url,
            lineNumber: params.lineNumber,
            columnNumber: params.columnNumber
        };
    }
    if (method === "Runtime.exceptionThrown") {
        return {
            sequence: event.sequence,
            time: event.time,
            timestamp: new Date(event.time).toISOString(),
            sessionId: event.sessionId ?? null,
            tabId: event.tabId ?? null,
            source: "exception",
            level: "error",
            text: truncateAndRedactString(params.text ||
                (params.exception && typeof params.exception === "object"
                    ? params.exception.description
                    : undefined), 1000),
            url: params.url,
            lineNumber: params.lineNumber,
            columnNumber: params.columnNumber
        };
    }
    return null;
}
function normalizeDevLogLevel(level) {
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
function firstStackFrameUrl(stackTrace) {
    const frame = Array.isArray(stackTrace?.callFrames)
        ? stackTrace.callFrames[0]
        : null;
    return typeof frame?.url === "string" ? frame.url : undefined;
}
function firstStackFrameNumber(stackTrace, key) {
    const frame = Array.isArray(stackTrace?.callFrames)
        ? stackTrace.callFrames[0]
        : null;
    const value = frame?.[key];
    return typeof value === "number" ? value : undefined;
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
    const parsed = parseKeyCombo(key);
    const map = {
        Enter: { key: "Enter", code: "Enter", keyCode: 13 },
        Tab: { key: "Tab", code: "Tab", keyCode: 9 },
        Escape: { key: "Escape", code: "Escape", keyCode: 27 },
        Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
        Delete: { key: "Delete", code: "Delete", keyCode: 46 },
        Space: { key: " ", code: "Space", keyCode: 32 },
        Home: { key: "Home", code: "Home", keyCode: 36 },
        End: { key: "End", code: "End", keyCode: 35 },
        PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
        PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
        ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
        ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
        ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
        ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
        Alt: { key: "Alt", code: "AltLeft", keyCode: 18 },
        Control: { key: "Control", code: "ControlLeft", keyCode: 17 },
        ControlOrMeta: isMacLikePlatform()
            ? { key: "Meta", code: "MetaLeft", keyCode: 91 }
            : { key: "Control", code: "ControlLeft", keyCode: 17 },
        Meta: { key: "Meta", code: "MetaLeft", keyCode: 91 },
        Shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 }
    };
    const normalized = map[parsed.key];
    if (!normalized) {
        throw new Error(`Unsupported key: ${key}`);
    }
    return {
        ...normalized,
        modifiers: modifierBitmask(parsed.modifiers)
    };
}
function parseKeyCombo(key) {
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
function modifierBitmask(modifiers) {
    let value = 0;
    for (const modifier of modifiers) {
        const normalized = modifier === "ControlOrMeta"
            ? isMacLikePlatform() ? "Meta" : "Control"
            : modifier;
        if (normalized === "Alt") {
            value |= 1;
        }
        else if (normalized === "Control") {
            value |= 2;
        }
        else if (normalized === "Meta") {
            value |= 4;
        }
        else if (normalized === "Shift") {
            value |= 8;
        }
        else {
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
function normalizeDragPath(value) {
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
function normalizePointerModifiers(value) {
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
function normalizeMouseButton(button) {
    if (button == null) {
        return "left";
    }
    if (button === "left" || button === "middle" || button === "right" || button === "back" || button === "forward") {
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
    if (button === "back") {
        return 8;
    }
    if (button === "forward") {
        return 16;
    }
    return 1;
}
function normalizeLoadState(state) {
    if (state == null) {
        return "load";
    }
    if (state === "load" || state === "domcontentloaded" || state === "networkidle") {
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
function createDefaultBrowserPolicyState() {
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
function storageGet(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get(key, (items) => {
            resolve(items?.[key]);
        });
    });
}
function storageSet(key, value) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
            }
            else {
                resolve();
            }
        });
    });
}
function storageSessionGet(key) {
    return new Promise((resolve) => {
        chrome.storage.session.get(key, (items) => {
            resolve(items?.[key]);
        });
    });
}
function storageSessionSet(key, value) {
    return new Promise((resolve, reject) => {
        chrome.storage.session.set({ [key]: value }, () => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
            }
            else {
                resolve();
            }
        });
    });
}
function sanitizeBrowserPolicyState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const sessionAllowedHosts = {};
    if (source.sessionAllowedHosts &&
        typeof source.sessionAllowedHosts === "object" &&
        !Array.isArray(source.sessionAllowedHosts)) {
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
function cloneBrowserPolicyState(state, sessionId) {
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
            : Object.fromEntries(Object.entries(state.sessionAllowedHosts).map(([id, hosts]) => [
                id,
                [...hosts]
            ])),
        persistentAllowedHosts: [...state.persistentAllowedHosts],
        blockedHosts: [...state.blockedHosts]
    };
}
function normalizeHostList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.map(normalizePolicyHost).filter(Boolean))).sort();
}
function normalizePolicyDecision(value) {
    if (value === "allow" || value === "always_allow" || value === "deny") {
        return value;
    }
    throw new Error("updatePolicy.params.decision must be allow, always_allow, or deny");
}
function applyHostAccessDecision(state, args) {
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
    state.sessionAllowedHosts[sessionId] = addPolicyHost(state.sessionAllowedHosts[sessionId] ?? [], args.host);
}
async function assertBrowserPolicyForTab(action, tabId, sessionId, params = {}) {
    const tab = await chrome.tabs.get(tabId);
    await assertBrowserPolicyForUrl(action, tab.url ?? null, sessionId, params);
}
async function assertBrowserPolicyForUrl(action, url, sessionId, params = {}) {
    await ensureBrowserPolicyLoaded();
    const verdict = evaluateBrowserHostAccess(browserPolicyState, {
        action,
        sessionId,
        url
    });
    if (!verdict.allowed) {
        safePostEvent({
            name: "policyBlocked",
            sessionId: typeof sessionId === "string" ? sessionId : null,
            host: verdict.host,
            action,
            code: verdict.code
        });
        throw new Error(`${verdict.code}: ${verdict.message}`);
    }
    const classification = classifyBrowserPolicyAction(action, url, params);
    if (classification.requiresOriginApproval && params.originApproved !== true) {
        throw new Error(`origin_approval_required: Browser action ${action} on ${classification.host} requires originApproved=true.`);
    }
    const confirmed = params.confirmed === true ||
        (classification.requiresOriginApproval && params.originApproved === true);
    if (classification.requiresConfirmation && !confirmed) {
        throw new Error(`confirmation_required: Browser action ${action} requires confirmation (${classification.reasons.join(", ")}).`);
    }
}
async function assertBrowserBlocklistForUrl(action, url, sessionId) {
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
function evaluateBrowserHostAccess(state, check) {
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
function classifyBrowserPolicyAction(action, url, params) {
    const reasons = new Set();
    const script = typeof params.script === "string" ? params.script : "";
    const readOnlyEvaluate = action === "evaluate" &&
        params.mode !== "write" &&
        !looksLikeMutatingScript(script);
    const label = typeof params.label === "string" ? params.label : "";
    const text = typeof params.text === "string" ? params.text : "";
    if (action === "upload") {
        reasons.add("file_upload");
    }
    if (action === "download") {
        reasons.add("download");
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
    if (DESTRUCTIVE_BROWSER_ACTION_PATTERN.test(label) ||
        DESTRUCTIVE_BROWSER_ACTION_PATTERN.test(text)) {
        reasons.add("destructive_action");
    }
    else if (EXTERNAL_SIDE_EFFECT_PATTERN.test(label) ||
        EXTERNAL_SIDE_EFFECT_PATTERN.test(text)) {
        reasons.add("external_side_effect");
    }
    if (action === "permission") {
        reasons.add("browser_permission");
    }
    if (action === "rawCdp") {
        reasons.add("raw_cdp");
    }
    if (action === "evaluate" && !readOnlyEvaluate) {
        reasons.add("mutating_evaluate");
    }
    return {
        host: normalizePolicyHost(url),
        readOnly: readOnlyEvaluate,
        requiresConfirmation: reasons.size > 0,
        requiresOriginApproval: action === "rawCdp",
        reasons: Array.from(reasons)
    };
}
function looksLikeMutatingScript(script) {
    return /\b(click|submit|remove|setAttribute|removeAttribute|appendChild|insertBefore|replaceChild|dispatchEvent|localStorage|sessionStorage|indexedDB|cookie\s*=)\b|\.value\s*=|\.checked\s*=|\.textContent\s*=|\.innerHTML\s*=/i.test(script);
}
function normalizePolicyHost(value) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }
    const trimmed = value.trim();
    let parsed;
    try {
        parsed = trimmed.includes("://")
            ? new URL(trimmed)
            : new URL(`https://${trimmed}`);
    }
    catch {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
    }
    return parsed.host.toLowerCase();
}
function hostSetHas(hosts, host) {
    return hosts.some((candidate) => candidate === host || host.endsWith(`.${candidate}`));
}
function addPolicyHost(hosts, host) {
    return Array.from(new Set([...hosts, host])).sort();
}
function removeHostFromPolicy(state, host) {
    state.blockedHosts = state.blockedHosts.filter((candidate) => candidate !== host);
    state.persistentAllowedHosts = state.persistentAllowedHosts.filter((candidate) => candidate !== host);
    for (const [sessionId, hosts] of Object.entries(state.sessionAllowedHosts)) {
        const nextHosts = hosts.filter((candidate) => candidate !== host);
        if (nextHosts.length > 0) {
            state.sessionAllowedHosts[sessionId] = nextHosts;
        }
        else {
            delete state.sessionAllowedHosts[sessionId];
        }
    }
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
function truncateAndRedactString(value, maxLength) {
    const truncated = truncateString(value, maxLength);
    return typeof truncated === "string" ? redactSecretPatterns(truncated) : truncated;
}
function redactObservation(observation) {
    if (typeof observation.text === "string") {
        observation.text = redactSecretPatterns(observation.text);
    }
    if (typeof observation.selectedText === "string") {
        observation.selectedText = redactSecretPatterns(observation.selectedText);
    }
    if (observation.focusedElement && typeof observation.focusedElement === "object") {
        redactStringFields(observation.focusedElement, ["label", "visibleText"]);
    }
    if (observation.modalState && typeof observation.modalState === "object") {
        const dialogs = observation.modalState.dialogs;
        if (Array.isArray(dialogs)) {
            for (const dialog of dialogs) {
                if (dialog && typeof dialog === "object") {
                    redactStringFields(dialog, ["label", "text"]);
                }
            }
        }
    }
    if (Array.isArray(observation.elements)) {
        for (const element of observation.elements) {
            if (element && typeof element === "object") {
                redactStringFields(element, ["label", "visibleText", "href", "placeholder", "testId"]);
                if (Array.isArray(element.selectorCandidates)) {
                    for (const candidate of element.selectorCandidates) {
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
function redactHistoryEntry(entry) {
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
        dateVisited: typeof entry.lastVisitTime === "number"
            ? new Date(entry.lastVisitTime).toISOString()
            : undefined,
        visitCount: entry.visitCount,
        typedCount: entry.typedCount,
        redacted: redactionReasons.size > 0,
        redactionReasons: Array.from(redactionReasons)
    };
}
function redactStringFields(target, keys) {
    for (const key of keys) {
        if (typeof target[key] === "string") {
            target[key] = redactSecretPatterns(target[key]);
        }
    }
}
function redactAccessibilityLikeNodes(nodes) {
    for (const node of nodes) {
        for (const key of ["name", "value", "description"]) {
            if (typeof node[key] === "string") {
                node[key] = redactSecretPatterns(node[key]);
            }
        }
    }
}
function redactSecretPatterns(value) {
    return value
        .replace(/\b(token|access_token|refresh_token|secret)\s*=\s*([^\s&]+)/gi, "$1=[redacted]")
        .replace(/\b(password|passwd|pwd)\s*:\s*([^\s]+)/gi, "$1: [redacted]")
        .replace(/\b(api[_-]?key)\s*=\s*"([^"]*)"/gi, "$1=\"[redacted]\"")
        .replace(/\b(api[_-]?key)\s*=\s*(?!")([^\s&]+)/gi, "$1=[redacted]")
        .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]");
}
function redactSensitiveUrl(value) {
    const reasons = new Set();
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
    }
    catch {
        const redacted = redactSecretPatterns(value);
        return {
            value: redacted,
            reasons: redacted !== value ? ["secret_pattern"] : []
        };
    }
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
