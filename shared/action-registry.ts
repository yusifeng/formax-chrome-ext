import type { BrowserAction } from "./types.js";

export type BrowserToolName = `browser_${string}`;

export type BrowserActionAnnotations = {
  readOnly: boolean;
  sideEffecting: boolean;
  destructive: boolean;
  requiresFileSystemRead: boolean;
  requiresBrowserHistory: boolean;
  requiresRawCdp: boolean;
  requiresSensitiveDataReview: boolean;
};

export type BrowserActionRegistryEntry = {
  action: BrowserAction;
  toolName: BrowserToolName;
  capabilityId?: string;
  annotations: BrowserActionAnnotations;
};

const readOnly = (overrides: Partial<BrowserActionAnnotations> = {}) =>
  annotations({
    readOnly: true,
    sideEffecting: false,
    ...overrides
  });

const sideEffect = (overrides: Partial<BrowserActionAnnotations> = {}) =>
  annotations({
    readOnly: false,
    sideEffecting: true,
    ...overrides
  });

function annotations(overrides: Partial<BrowserActionAnnotations>): BrowserActionAnnotations {
  return {
    readOnly: false,
    sideEffecting: false,
    destructive: false,
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
  { action: "startSession", toolName: "browser_start_session", annotations: sideEffect() },
  { action: "nameSession", toolName: "browser_name_session", capabilityId: "browser.nameSession", annotations: sideEffect() },
  { action: "openTabs", toolName: "browser_user_open_tabs", capabilityId: "browser.user.openTabs", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
  { action: "claimTab", toolName: "browser_claim_tab", capabilityId: "browser.user.claimTab", annotations: sideEffect() },
  { action: "getHistory", toolName: "browser_user_history", capabilityId: "browser.user.history", annotations: readOnly({ requiresBrowserHistory: true, requiresSensitiveDataReview: true }) },
  { action: "clipboardReadText", toolName: "browser_clipboard_read_text", capabilityId: "tab.clipboard.readText", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "clipboardWriteText", toolName: "browser_clipboard_write_text", capabilityId: "tab.clipboard.writeText", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
  { action: "clipboardRead", toolName: "browser_clipboard_read", capabilityId: "tab.clipboard.read", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "clipboardWrite", toolName: "browser_clipboard_write", capabilityId: "tab.clipboard.write", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
  { action: "createTab", toolName: "browser_create_tab", capabilityId: "browser.tabs.new", annotations: sideEffect() },
  { action: "switchTab", toolName: "browser_switch_tab", capabilityId: "browser.tabs.selected", annotations: sideEffect() },
  { action: "openUrl", toolName: "browser_open_url", capabilityId: "tab.goto", annotations: sideEffect() },
  { action: "goBack", toolName: "browser_go_back", capabilityId: "tab.back", annotations: sideEffect() },
  { action: "goForward", toolName: "browser_go_forward", capabilityId: "tab.forward", annotations: sideEffect() },
  { action: "reload", toolName: "browser_reload", capabilityId: "tab.reload", annotations: sideEffect() },
  { action: "waitForLoadState", toolName: "browser_wait_for_load_state", capabilityId: "tab.playwright.waitForLoadState", annotations: readOnly() },
  { action: "waitForUrl", toolName: "browser_wait_for_url", capabilityId: "tab.playwright.waitForURL", annotations: readOnly() },
  { action: "waitForSelector", toolName: "browser_wait_for_selector", annotations: readOnly() },
  { action: "waitForText", toolName: "browser_wait_for_text", capabilityId: "tab.playwright.getByText", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "observe", toolName: "browser_observe", capabilityId: "tab.dom_cua.get_visible_dom", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "elementInfo", toolName: "browser_element_info", capabilityId: "tab.dom_cua.element_info", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "locatorQuery", toolName: "browser_locator_query", capabilityId: "tab.playwright.locator", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "locatorAction", toolName: "browser_locator_action", capabilityId: "locator.click", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
  { action: "locatorWait", toolName: "browser_locator_wait", capabilityId: "locator.waitFor", annotations: readOnly() },
  { action: "resolveFrame", toolName: "browser_resolve_frame", capabilityId: "tab.frameLocator.resolve", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "click", toolName: "browser_click", capabilityId: "tab.cua.click", annotations: sideEffect() },
  { action: "drag", toolName: "browser_drag", capabilityId: "tab.cua.drag", annotations: sideEffect() },
  { action: "moveMouse", toolName: "browser_move_mouse", capabilityId: "tab.cua.move", annotations: sideEffect() },
  { action: "scroll", toolName: "browser_scroll", capabilityId: "tab.cua.scroll", annotations: sideEffect() },
  { action: "typeText", toolName: "browser_type_text", capabilityId: "tab.cua.type", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
  { action: "evaluate", toolName: "browser_evaluate", capabilityId: "tab.playwright.evaluate", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
  { action: "pressKey", toolName: "browser_press_key", capabilityId: "tab.cua.keypress", annotations: sideEffect() },
  { action: "handleDialog", toolName: "browser_handle_dialog", annotations: sideEffect() },
  { action: "screenshot", toolName: "browser_screenshot", capabilityId: "tab.screenshot", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "waitForFileChooser", toolName: "browser_wait_for_file_chooser", capabilityId: "tab.playwright.fileChooser", annotations: readOnly() },
  { action: "setFileChooserFiles", toolName: "browser_set_file_chooser_files", capabilityId: "tab.playwright.fileChooser", annotations: sideEffect({ requiresFileSystemRead: true, requiresSensitiveDataReview: true }) },
  { action: "uploadFile", toolName: "browser_upload_file", capabilityId: "tab.playwright.fileChooser", annotations: sideEffect({ requiresFileSystemRead: true, requiresSensitiveDataReview: true }) },
  { action: "downloadMedia", toolName: "browser_download_media", capabilityId: "locator.downloadMedia", annotations: sideEffect({ requiresSensitiveDataReview: true }) },
  { action: "attachTarget", toolName: "browser_attach_target", capabilityId: "tab.cdp.target.attach", annotations: sideEffect({ requiresRawCdp: true, requiresSensitiveDataReview: true }) },
  { action: "detachTarget", toolName: "browser_detach_target", capabilityId: "tab.cdp.target.detach", annotations: sideEffect({ requiresRawCdp: true }) },
  { action: "cdp", toolName: "browser_cdp", capabilityId: "tab.cdp.raw", annotations: sideEffect({ requiresRawCdp: true, requiresSensitiveDataReview: true }) },
  { action: "listTabs", toolName: "browser_list_tabs", capabilityId: "browser.tabs.list", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "getTab", toolName: "browser_get_tab", capabilityId: "browser.tabs.get", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "listDownloads", toolName: "browser_list_downloads", capabilityId: "browser.downloads.list", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "waitForDownload", toolName: "browser_wait_for_download", capabilityId: "browser.downloads.wait", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "getDevLogs", toolName: "browser_get_dev_logs", capabilityId: "tab.dev.logs", annotations: readOnly({ requiresSensitiveDataReview: true }) },
  { action: "getCapabilities", toolName: "browser_get_capabilities", capabilityId: "browser.capabilities.list", annotations: readOnly() },
  { action: "closeTab", toolName: "browser_close_tab", capabilityId: "tab.close", annotations: sideEffect({ destructive: true }) },
  { action: "finalizeSession", toolName: "browser_finalize_session", capabilityId: "browser.tabs.finalize", annotations: sideEffect({ destructive: true }) },
  { action: "endTurn", toolName: "browser_end_turn", annotations: sideEffect() },
  { action: "stopSession", toolName: "browser_stop_session", annotations: sideEffect({ destructive: true }) }
] as const satisfies readonly BrowserActionRegistryEntry[];

export const browserActions = browserActionRegistry.map((entry) => entry.action);
export const browserToolNames = browserActionRegistry.map((entry) => entry.toolName);

export function toolNameForAction(action: BrowserAction): BrowserToolName {
  const entry = browserActionRegistry.find((candidate) => candidate.action === action);

  if (!entry) {
    throw new Error(`No browser tool registered for action: ${action}`);
  }

  return entry.toolName;
}

export function actionForToolName(toolName: string): BrowserAction | null {
  return browserActionRegistry.find((entry) => entry.toolName === toolName)?.action ?? null;
}

export function annotationsForAction(action: BrowserAction): BrowserActionAnnotations {
  const entry = browserActionRegistry.find((candidate) => candidate.action === action);

  if (!entry) {
    throw new Error(`No browser action annotations registered for action: ${action}`);
  }

  return entry.annotations;
}

export function isReadOnlyAction(action: BrowserAction): boolean {
  return annotationsForAction(action).readOnly;
}
