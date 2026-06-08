const readOnly = (overrides = {}) => annotations({
    readOnly: true,
    sideEffecting: false,
    ...overrides
});
const sideEffect = (overrides = {}) => annotations({
    readOnly: false,
    sideEffecting: true,
    ...overrides
});
function annotations(overrides) {
    return {
        readOnly: false,
        sideEffecting: false,
        destructive: false,
        requiresHostApproval: false,
        requiresUserConfirmation: false,
        requiresFileSystemRead: false,
        requiresBrowserHistory: false,
        requiresRawCdp: false,
        requiresSensitiveDataReview: false,
        ...overrides
    };
}
export const browserActionRegistry = [
    { action: "health", toolName: "browser_health", annotations: readOnly() },
    { action: "reloadExtension", toolName: "browser_reload_extension", annotations: sideEffect() },
    { action: "getEvents", toolName: "browser_get_events", annotations: readOnly() },
    { action: "clearEvents", toolName: "browser_clear_events", annotations: sideEffect() },
    { action: "waitForEvent", toolName: "browser_wait_for_event", annotations: readOnly() },
    { action: "getDiagnostics", toolName: "browser_get_diagnostics", capabilityId: "browser.diagnostics", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "getPolicy", toolName: "browser_get_policy", capabilityId: "browser.policy.get", annotations: readOnly() },
    { action: "updatePolicy", toolName: "browser_update_policy", capabilityId: "browser.policy.update", annotations: sideEffect() },
    { action: "startSession", toolName: "browser_start_session", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "nameSession", toolName: "browser_name_session", capabilityId: "browser.nameSession", annotations: sideEffect() },
    { action: "openTabs", toolName: "browser_user_open_tabs", capabilityId: "browser.user.openTabs", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
    { action: "claimTab", toolName: "browser_claim_tab", capabilityId: "browser.user.claimTab", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "getHistory", toolName: "browser_user_history", capabilityId: "browser.user.history", annotations: readOnly({ requiresUserConfirmation: true, requiresBrowserHistory: true, requiresSensitiveDataReview: true }) },
    { action: "clipboardReadText", toolName: "browser_clipboard_read_text", capabilityId: "tab.clipboard.readText", annotations: readOnly({ requiresUserConfirmation: true, requiresSensitiveDataReview: true }) },
    { action: "clipboardWriteText", toolName: "browser_clipboard_write_text", capabilityId: "tab.clipboard.writeText", annotations: sideEffect({ requiresUserConfirmation: true, requiresSensitiveDataReview: true }) },
    { action: "clipboardRead", toolName: "browser_clipboard_read", capabilityId: "tab.clipboard.read", annotations: readOnly({ requiresUserConfirmation: true, requiresSensitiveDataReview: true }) },
    { action: "clipboardWrite", toolName: "browser_clipboard_write", capabilityId: "tab.clipboard.write", annotations: sideEffect({ requiresUserConfirmation: true, requiresSensitiveDataReview: true }) },
    { action: "createTab", toolName: "browser_create_tab", capabilityId: "browser.tabs.new", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "switchTab", toolName: "browser_switch_tab", capabilityId: "browser.tabs.selected", annotations: sideEffect() },
    { action: "openUrl", toolName: "browser_open_url", capabilityId: "tab.goto", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "goBack", toolName: "browser_go_back", capabilityId: "tab.back", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "goForward", toolName: "browser_go_forward", capabilityId: "tab.forward", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "reload", toolName: "browser_reload", capabilityId: "tab.reload", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "waitForLoadState", toolName: "browser_wait_for_load_state", capabilityId: "tab.playwright.waitForLoadState", annotations: readOnly() },
    { action: "waitForUrl", toolName: "browser_wait_for_url", capabilityId: "tab.playwright.waitForURL", annotations: readOnly() },
    { action: "waitForSelector", toolName: "browser_wait_for_selector", annotations: readOnly() },
    { action: "waitForText", toolName: "browser_wait_for_text", capabilityId: "tab.playwright.getByText", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "observe", toolName: "browser_observe", capabilityId: "tab.dom_cua.get_visible_dom", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "elementInfo", toolName: "browser_element_info", capabilityId: "tab.dom_cua.element_info", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "locatorQuery", toolName: "browser_locator_query", capabilityId: "tab.playwright.locator", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "locatorAction", toolName: "browser_locator_action", capabilityId: "locator.click", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true, requiresSensitiveDataReview: true }) },
    { action: "locatorWait", toolName: "browser_locator_wait", capabilityId: "locator.waitFor", annotations: readOnly() },
    { action: "click", toolName: "browser_click", capabilityId: "tab.cua.click", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true }) },
    { action: "drag", toolName: "browser_drag", capabilityId: "tab.cua.drag", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true }) },
    { action: "moveMouse", toolName: "browser_move_mouse", capabilityId: "tab.cua.move", annotations: sideEffect() },
    { action: "scroll", toolName: "browser_scroll", capabilityId: "tab.cua.scroll", annotations: sideEffect({ requiresHostApproval: true }) },
    { action: "typeText", toolName: "browser_type_text", capabilityId: "tab.cua.type", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true, requiresSensitiveDataReview: true }) },
    { action: "evaluate", toolName: "browser_evaluate", capabilityId: "tab.playwright.evaluate", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true, requiresSensitiveDataReview: true }) },
    { action: "pressKey", toolName: "browser_press_key", capabilityId: "tab.cua.keypress", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true }) },
    { action: "handleDialog", toolName: "browser_handle_dialog", annotations: sideEffect({ requiresUserConfirmation: true }) },
    { action: "screenshot", toolName: "browser_screenshot", capabilityId: "tab.screenshot", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "uploadFile", toolName: "browser_upload_file", capabilityId: "tab.playwright.fileChooser", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true, requiresFileSystemRead: true, requiresSensitiveDataReview: true }) },
    { action: "cdp", toolName: "browser_cdp", capabilityId: "tab.cdp.raw", annotations: sideEffect({ requiresHostApproval: true, requiresUserConfirmation: true, requiresRawCdp: true, requiresSensitiveDataReview: true }) },
    { action: "listTabs", toolName: "browser_list_tabs", capabilityId: "browser.tabs.list", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "getTab", toolName: "browser_get_tab", capabilityId: "browser.tabs.get", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "listDownloads", toolName: "browser_list_downloads", capabilityId: "browser.downloads.list", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "waitForDownload", toolName: "browser_wait_for_download", capabilityId: "browser.downloads.wait", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "getDevLogs", toolName: "browser_get_dev_logs", capabilityId: "tab.dev.logs", annotations: readOnly({ requiresSensitiveDataReview: true }) },
    { action: "getCapabilities", toolName: "browser_get_capabilities", capabilityId: "browser.capabilities.list", annotations: readOnly() },
    { action: "closeTab", toolName: "browser_close_tab", capabilityId: "tab.close", annotations: sideEffect({ destructive: true, requiresUserConfirmation: true }) },
    { action: "finalizeSession", toolName: "browser_finalize_session", capabilityId: "browser.tabs.finalize", annotations: sideEffect({ destructive: true, requiresUserConfirmation: true }) },
    { action: "endTurn", toolName: "browser_end_turn", annotations: sideEffect() },
    { action: "stopSession", toolName: "browser_stop_session", annotations: sideEffect({ destructive: true, requiresUserConfirmation: true }) }
];
export const browserActions = browserActionRegistry.map((entry) => entry.action);
export const browserToolNames = browserActionRegistry.map((entry) => entry.toolName);
export function toolNameForAction(action) {
    const entry = browserActionRegistry.find((candidate) => candidate.action === action);
    if (!entry) {
        throw new Error(`No browser tool registered for action: ${action}`);
    }
    return entry.toolName;
}
export function actionForToolName(toolName) {
    return browserActionRegistry.find((entry) => entry.toolName === toolName)?.action ?? null;
}
export function annotationsForAction(action) {
    const entry = browserActionRegistry.find((candidate) => candidate.action === action);
    if (!entry) {
        throw new Error(`No browser action annotations registered for action: ${action}`);
    }
    return entry.annotations;
}
export function isReadOnlyAction(action) {
    return annotationsForAction(action).readOnly;
}
