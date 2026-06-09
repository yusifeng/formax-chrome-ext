import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { actionForToolName } from "../shared/action-registry.js";
import { browserActionParameterSchemas, browserToolSchemas, validateBrowserActionParams } from "../shared/browser-tool-schemas.js";
const RPC_URL = process.env.AGENT_BROWSER_RPC_URL || "http://127.0.0.1:8765/rpc";
let cachedRpcToken = null;
function browserRpcToken() {
    const explicitToken = process.env.AGENT_BROWSER_TOKEN?.trim();
    if (explicitToken) {
        return explicitToken;
    }
    if (parseBooleanEnv(process.env.AGENT_BROWSER_ALLOW_UNAUTHENTICATED_RPC)) {
        return "";
    }
    if (cachedRpcToken) {
        return cachedRpcToken;
    }
    const tokenFile = process.env.AGENT_BROWSER_TOKEN_FILE?.trim() ||
        join(homedir(), ".formax", "browser-rpc-token");
    try {
        const token = readFileSync(tokenFile, "utf8").trim();
        if (token) {
            cachedRpcToken = token;
            return token;
        }
    }
    catch {
        // The native host may not have created the default token file yet. The
        // request will fail with 401 if the host already requires authentication.
    }
    return "";
}
function parseBooleanEnv(value) {
    return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}
async function browserRpc(action, params = {}, timeoutMs = 30000) {
    const paramsValidation = validateBrowserActionParams(action, params);
    if (paramsValidation.ok === false) {
        throw new Error(`${paramsValidation.code}: Invalid browser params for ${action}: ${paramsValidation.message}`);
    }
    const headers = {
        "content-type": "application/json"
    };
    const rpcToken = browserRpcToken();
    if (rpcToken) {
        headers["x-agent-browser-token"] = rpcToken;
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
    const json = (await response.json());
    if (!response.ok || json.ok !== true) {
        const errorMessage = typeof json.error === "string"
            ? json.error
            : typeof json.error?.message === "string"
                ? json.error.message
                : `Browser RPC failed: ${action}`;
        const errorCode = json.errorCode ||
            (typeof json.error === "object" && typeof json.error?.code === "string"
                ? json.error.code
                : null);
        const error = new Error(errorCode ? `${errorCode}: ${errorMessage}` : errorMessage);
        if (errorCode) {
            error.code = errorCode;
        }
        if (typeof json.error === "object" && json.error?.details && typeof json.error.details === "object") {
            error.details = json.error.details;
        }
        throw error;
    }
    return json.result;
}
export async function browserHealth() {
    return browserRpc("health");
}
export async function browserReloadExtension() {
    return browserRpc("reloadExtension");
}
export async function browserGetEvents(args = {}) {
    return browserRpc("getEvents", args);
}
export async function browserClearEvents(args = {}) {
    return browserRpc("clearEvents", args);
}
export async function browserWaitForEvent(args = {}) {
    return browserRpc("waitForEvent", args);
}
export async function browserGetDiagnostics(args = {}) {
    return browserRpc("getDiagnostics", args);
}
export async function browserGetPolicy(args = {}) {
    return browserRpc("getPolicy", args);
}
export async function browserUpdatePolicy(args = {}) {
    return browserRpc("updatePolicy", args);
}
export async function browserGetPendingApprovals(args = {}) {
    return browserRpc("getPendingApprovals", args);
}
export async function browserResolveApproval(args) {
    return browserRpc("resolveApproval", args);
}
export async function browserStartSession(args) {
    return browserRpc("startSession", args);
}
export async function browserNameSession(args) {
    return browserRpc("nameSession", args);
}
export async function browserUserOpenTabs(args = {}) {
    return browserRpc("openTabs", args);
}
export async function browserClaimTab(args) {
    return browserRpc("claimTab", args);
}
export async function browserUserHistory(args = {}) {
    return browserRpc("getHistory", args);
}
export async function browserClipboardReadText(args = {}) {
    return browserRpc("clipboardReadText", args);
}
export async function browserClipboardWriteText(args) {
    return browserRpc("clipboardWriteText", args);
}
export async function browserClipboardRead(args = {}) {
    return browserRpc("clipboardRead", args);
}
export async function browserClipboardWrite(args) {
    return browserRpc("clipboardWrite", args);
}
export async function browserCreateTab(args) {
    return browserRpc("createTab", args);
}
export async function browserSwitchTab(args) {
    return browserRpc("switchTab", args);
}
export async function browserListTabs(args = {}) {
    return browserRpc("listTabs", args);
}
export async function browserGetTab(args = {}) {
    return browserRpc("getTab", args);
}
export async function browserOpenUrl(args) {
    return browserRpc("openUrl", args);
}
export async function browserGoBack(args = {}) {
    return browserRpc("goBack", args);
}
export async function browserGoForward(args = {}) {
    return browserRpc("goForward", args);
}
export async function browserReload(args = {}) {
    return browserRpc("reload", args);
}
export async function browserWaitForLoadState(args) {
    return browserRpc("waitForLoadState", args);
}
export async function browserWaitForUrl(args) {
    return browserRpc("waitForUrl", args);
}
export async function browserWaitForSelector(args) {
    return browserRpc("waitForSelector", args);
}
export async function browserWaitForText(args) {
    return browserRpc("waitForText", args);
}
export async function browserObserve(args) {
    return browserRpc("observe", args);
}
export async function browserElementInfo(args) {
    return browserRpc("elementInfo", args);
}
export async function browserLocatorQuery(args) {
    return browserRpc("locatorQuery", args);
}
export async function browserLocatorAction(args) {
    return browserRpc("locatorAction", args);
}
export async function browserLocatorWait(args) {
    return browserRpc("locatorWait", args);
}
export async function browserClick(args) {
    return browserRpc("click", args);
}
export async function browserDrag(args) {
    return browserRpc("drag", args);
}
export async function browserMoveMouse(args) {
    return browserRpc("moveMouse", args);
}
export async function browserScroll(args) {
    return browserRpc("scroll", args);
}
export async function browserTypeText(args) {
    return browserRpc("typeText", args);
}
export async function browserEvaluate(args) {
    return browserRpc("evaluate", args);
}
export async function browserPressKey(args) {
    return browserRpc("pressKey", args);
}
export async function browserHandleDialog(args) {
    return browserRpc("handleDialog", args);
}
export async function browserScreenshot(args) {
    return browserRpc("screenshot", args);
}
export async function browserUploadFile(args) {
    return browserRpc("uploadFile", args);
}
export async function browserCdp(args) {
    return browserRpc("cdp", args);
}
export async function browserGetDevLogs(args = {}) {
    return browserRpc("getDevLogs", args);
}
export async function browserGetCapabilities(args = {}) {
    return browserRpc("getCapabilities", args);
}
export async function browserListDownloads(args = {}) {
    return browserRpc("listDownloads", args);
}
export async function browserWaitForDownload(args = {}) {
    return browserRpc("waitForDownload", args);
}
export async function browserCloseTab(args) {
    return browserRpc("closeTab", args);
}
export async function browserFinalizeSession(args) {
    return browserRpc("finalizeSession", args);
}
export async function browserEndTurn(args) {
    return browserRpc("endTurn", args);
}
export async function browserStopSession(args) {
    return browserRpc("stopSession", args);
}
export { browserActionParameterSchemas, browserToolSchemas, validateBrowserActionParams };
export async function callBrowserTool(name, args) {
    const action = actionForToolName(name);
    if (action == null) {
        throw new Error(`Unknown browser tool: ${name}`);
    }
    const paramsValidation = validateBrowserActionParams(action, args);
    if (paramsValidation.ok === false) {
        throw new Error(`${paramsValidation.code}: Invalid browser params for ${action}: ${paramsValidation.message}`);
    }
    switch (name) {
        case "browser_health":
            return browserHealth();
        case "browser_reload_extension":
            return browserReloadExtension();
        case "browser_get_events":
            return browserGetEvents(args);
        case "browser_clear_events":
            return browserClearEvents(args);
        case "browser_wait_for_event":
            return browserWaitForEvent(args);
        case "browser_get_diagnostics":
            return browserGetDiagnostics(args);
        case "browser_get_policy":
            return browserGetPolicy(args);
        case "browser_update_policy":
            return browserUpdatePolicy(args);
        case "browser_get_pending_approvals":
            return browserGetPendingApprovals(args);
        case "browser_resolve_approval":
            return browserResolveApproval(args);
        case "browser_start_session":
            return browserStartSession(args);
        case "browser_name_session":
            return browserNameSession(args);
        case "browser_user_open_tabs":
            return browserUserOpenTabs(args);
        case "browser_claim_tab":
            return browserClaimTab(args);
        case "browser_user_history":
            return browserUserHistory(args);
        case "browser_clipboard_read_text":
            return browserClipboardReadText(args);
        case "browser_clipboard_write_text":
            return browserClipboardWriteText(args);
        case "browser_clipboard_read":
            return browserClipboardRead(args);
        case "browser_clipboard_write":
            return browserClipboardWrite(args);
        case "browser_create_tab":
            return browserCreateTab(args);
        case "browser_switch_tab":
            return browserSwitchTab(args);
        case "browser_list_tabs":
            return browserListTabs(args);
        case "browser_get_tab":
            return browserGetTab(args);
        case "browser_open_url":
            return browserOpenUrl(args);
        case "browser_go_back":
            return browserGoBack(args);
        case "browser_go_forward":
            return browserGoForward(args);
        case "browser_reload":
            return browserReload(args);
        case "browser_wait_for_load_state":
            return browserWaitForLoadState(args);
        case "browser_wait_for_url":
            return browserWaitForUrl(args);
        case "browser_wait_for_selector":
            return browserWaitForSelector(args);
        case "browser_wait_for_text":
            return browserWaitForText(args);
        case "browser_observe":
            return browserObserve(args);
        case "browser_element_info":
            return browserElementInfo(args);
        case "browser_locator_query":
            return browserLocatorQuery(args);
        case "browser_locator_action":
            return browserLocatorAction(args);
        case "browser_locator_wait":
            return browserLocatorWait(args);
        case "browser_click":
            return browserClick(args);
        case "browser_drag":
            return browserDrag(args);
        case "browser_move_mouse":
            return browserMoveMouse(args);
        case "browser_scroll":
            return browserScroll(args);
        case "browser_type_text":
            return browserTypeText(args);
        case "browser_evaluate":
            return browserEvaluate(args);
        case "browser_press_key":
            return browserPressKey(args);
        case "browser_handle_dialog":
            return browserHandleDialog(args);
        case "browser_screenshot":
            return browserScreenshot(args);
        case "browser_upload_file":
            return browserUploadFile(args);
        case "browser_cdp":
            return browserCdp(args);
        case "browser_get_dev_logs":
            return browserGetDevLogs(args);
        case "browser_get_capabilities":
            return browserGetCapabilities(args);
        case "browser_list_downloads":
            return browserListDownloads(args);
        case "browser_wait_for_download":
            return browserWaitForDownload(args);
        case "browser_close_tab":
            return browserCloseTab(args);
        case "browser_finalize_session":
            return browserFinalizeSession(args);
        case "browser_end_turn":
            return browserEndTurn(args);
        case "browser_stop_session":
            return browserStopSession(args);
        default:
            throw new Error(`Unknown browser tool: ${name}`);
    }
}
