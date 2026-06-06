import type { BrowserAction } from "./types.js";

export type BrowserToolName = `browser_${string}`;

export type BrowserActionRegistryEntry = {
  action: BrowserAction;
  toolName: BrowserToolName;
  capabilityId?: string;
};

export const browserActionRegistry = [
  { action: "health", toolName: "browser_health" },
  { action: "reloadExtension", toolName: "browser_reload_extension" },
  { action: "getEvents", toolName: "browser_get_events" },
  { action: "clearEvents", toolName: "browser_clear_events" },
  { action: "waitForEvent", toolName: "browser_wait_for_event" },
  { action: "startSession", toolName: "browser_start_session" },
  { action: "nameSession", toolName: "browser_name_session", capabilityId: "browser.nameSession" },
  { action: "openTabs", toolName: "browser_user_open_tabs", capabilityId: "browser.user.openTabs" },
  { action: "claimTab", toolName: "browser_claim_tab", capabilityId: "browser.user.claimTab" },
  { action: "createTab", toolName: "browser_create_tab", capabilityId: "browser.tabs.new" },
  { action: "switchTab", toolName: "browser_switch_tab", capabilityId: "browser.tabs.selected" },
  { action: "openUrl", toolName: "browser_open_url", capabilityId: "tab.goto" },
  { action: "goBack", toolName: "browser_go_back", capabilityId: "tab.back" },
  { action: "goForward", toolName: "browser_go_forward", capabilityId: "tab.forward" },
  { action: "reload", toolName: "browser_reload", capabilityId: "tab.reload" },
  { action: "waitForLoadState", toolName: "browser_wait_for_load_state", capabilityId: "tab.playwright.waitForLoadState" },
  { action: "waitForUrl", toolName: "browser_wait_for_url", capabilityId: "tab.playwright.waitForURL" },
  { action: "waitForSelector", toolName: "browser_wait_for_selector" },
  { action: "waitForText", toolName: "browser_wait_for_text", capabilityId: "tab.playwright.getByText" },
  { action: "observe", toolName: "browser_observe", capabilityId: "tab.dom_cua.get_visible_dom" },
  { action: "locatorQuery", toolName: "browser_locator_query", capabilityId: "tab.playwright.locator" },
  { action: "locatorAction", toolName: "browser_locator_action", capabilityId: "locator.click" },
  { action: "locatorWait", toolName: "browser_locator_wait", capabilityId: "locator.waitFor" },
  { action: "click", toolName: "browser_click", capabilityId: "tab.cua.click" },
  { action: "moveMouse", toolName: "browser_move_mouse", capabilityId: "tab.cua.move" },
  { action: "scroll", toolName: "browser_scroll", capabilityId: "tab.cua.scroll" },
  { action: "typeText", toolName: "browser_type_text", capabilityId: "tab.cua.type" },
  { action: "evaluate", toolName: "browser_evaluate", capabilityId: "tab.playwright.evaluate" },
  { action: "pressKey", toolName: "browser_press_key", capabilityId: "tab.cua.keypress" },
  { action: "handleDialog", toolName: "browser_handle_dialog" },
  { action: "screenshot", toolName: "browser_screenshot", capabilityId: "tab.screenshot" },
  { action: "uploadFile", toolName: "browser_upload_file", capabilityId: "tab.playwright.fileChooser" },
  { action: "cdp", toolName: "browser_cdp", capabilityId: "tab.cdp.raw" },
  { action: "listTabs", toolName: "browser_list_tabs", capabilityId: "browser.tabs.list" },
  { action: "getTab", toolName: "browser_get_tab", capabilityId: "browser.tabs.get" },
  { action: "listDownloads", toolName: "browser_list_downloads", capabilityId: "browser.downloads.list" },
  { action: "waitForDownload", toolName: "browser_wait_for_download", capabilityId: "browser.downloads.wait" },
  { action: "getDevLogs", toolName: "browser_get_dev_logs", capabilityId: "tab.dev.logs" },
  { action: "getCapabilities", toolName: "browser_get_capabilities", capabilityId: "browser.capabilities.list" },
  { action: "closeTab", toolName: "browser_close_tab", capabilityId: "tab.close" },
  { action: "finalizeSession", toolName: "browser_finalize_session", capabilityId: "browser.tabs.finalize" },
  { action: "endTurn", toolName: "browser_end_turn" },
  { action: "stopSession", toolName: "browser_stop_session" }
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
