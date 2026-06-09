import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  BrowserAction,
  CdpParams,
  CdpResult,
  CloseTabParams,
  CloseTabResult,
  EvaluateParams,
  EvaluateResult,
  EndTurnParams,
  EndTurnResult,
  FinalizeSessionParams,
  FinalizeSessionResult,
  GetCapabilitiesParams,
  GetCapabilitiesResult,
  GetDiagnosticsParams,
  GetDiagnosticsResult,
  ClearEventsParams,
  ClearEventsResult,
  GetDevLogsParams,
  GetDevLogsResult,
  GetEventsParams,
  GetEventsResult,
  GetPolicyParams,
  GetPolicyResult,
  GetPendingApprovalsParams,
  GetPendingApprovalsResult,
  GetTabParams,
  GetTabResult,
  HandleDialogParams,
  HandleDialogResult,
  BrowserKey,
  BrowserObservation,
  BrowserSession,
  BrowserToolResult,
  BrowserElementInfo,
  BrowserElementInfoParams,
  BrowserHistoryParams,
  BrowserHistoryResult,
  ClipboardReadTextParams,
  ClipboardReadTextResult,
  ClipboardWriteTextParams,
  ClipboardWriteTextResult,
  ClipboardReadParams,
  ClipboardReadResult,
  ClipboardWriteParams,
  ClipboardWriteResult,
  ClaimTabParams,
  UserOpenTabsParams,
  UserOpenTabsResult,
  ClickParams,
  CreateTabParams,
  CreateTabResult,
  DragParams,
  HealthResult,
  JsonObject,
  ListDownloadsParams,
  ListDownloadsResult,
  ListTabsParams,
  ListTabsResult,
  LocatorActionParams,
  LocatorQueryParams,
  LocatorQueryResult,
  LocatorWaitParams,
  LocatorWaitResult,
  MoveMouseParams,
  MoveMouseResult,
  NavigationParams,
  NavigationResult,
  NameSessionParams,
  NameSessionResult,
  OpenUrlParams,
  ObserveParams,
  PressKeyParams,
  ReloadParams,
  ReloadExtensionResult,
  ResolveFrameParams,
  ResolveFrameResult,
  ResolveApprovalParams,
  ResolveApprovalResult,
  ScrollParams,
  ScreenshotParams,
  ScreenshotResult,
  StartSessionParams,
  StopSessionParams,
  StopSessionResult,
  SwitchTabParams,
  SwitchTabResult,
  TypeTextParams,
  UpdatePolicyParams,
  UpdatePolicyResult,
  UploadFileParams,
  WaitForFileChooserParams,
  WaitForFileChooserResult,
  SetFileChooserFilesParams,
  WaitForDownloadParams,
  WaitForDownloadResult,
  WaitForEventParams,
  WaitForEventResult,
  WaitForLoadStateParams,
  WaitForLoadStateResult,
  WaitForUrlParams,
  WaitForUrlResult,
  WaitForSelectorParams,
  WaitForSelectorResult,
  WaitForTextParams,
  WaitForTextResult
} from "../shared/types.js";
import { actionForToolName } from "../shared/action-registry.js";
import {
  browserActionParameterSchemas,
  browserToolSchemas,
  validateBrowserActionParams
} from "../shared/browser-tool-schemas.js";

const RPC_URL = process.env.AGENT_BROWSER_RPC_URL || "http://127.0.0.1:8765/rpc";
let cachedRpcToken: string | null = null;

function browserRpcToken(): string {
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

  const tokenFile =
    process.env.AGENT_BROWSER_TOKEN_FILE?.trim() ||
    join(homedir(), ".formax", "browser-rpc-token");

  try {
    const token = readFileSync(tokenFile, "utf8").trim();

    if (token) {
      cachedRpcToken = token;
      return token;
    }
  } catch {
    // The native host may not have created the default token file yet. The
    // request will fail with 401 if the host already requires authentication.
  }

  return "";
}

function parseBooleanEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

async function browserRpc<T = unknown>(
  action: BrowserAction,
  params: JsonObject = {},
  timeoutMs = 30000
): Promise<BrowserToolResult<T>> {
  const paramsValidation = validateBrowserActionParams(action, params);

  if (paramsValidation.ok === false) {
    const error = new Error(
      `${paramsValidation.code}: Invalid browser params for ${action}: ${paramsValidation.message}`
    ) as Error & { code?: string };
    error.code = paramsValidation.code;
    throw error;
  }

  const headers: Record<string, string> = {
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
  const json = (await response.json()) as {
    ok?: boolean;
    result?: BrowserToolResult<T>;
    error?: string | { code?: string; message?: string; details?: JsonObject };
    errorCode?: string;
  };

  if (!response.ok || json.ok !== true) {
    const errorMessage =
      typeof json.error === "string"
        ? json.error
        : typeof json.error?.message === "string"
          ? json.error.message
          : `Browser RPC failed: ${action}`;
    const errorCode =
      json.errorCode ||
      (typeof json.error === "object" && typeof json.error?.code === "string"
        ? json.error.code
        : null) ||
      (typeof errorMessage === "string"
        ? errorMessage.match(/^([a-z][a-z0-9_]+):\s+/)?.[1] ?? null
        : null);
    const error = new Error(errorCode ? `${errorCode}: ${errorMessage}` : errorMessage);
    if (errorCode) {
      (error as Error & { code?: string }).code = errorCode;
    }
    if (typeof json.error === "object" && json.error?.details && typeof json.error.details === "object") {
      (error as Error & { details?: JsonObject }).details = json.error.details;
    }
    throw error;
  }

  return json.result as BrowserToolResult<T>;
}

export async function browserHealth() {
  return browserRpc<HealthResult>("health");
}

export async function browserReloadExtension() {
  return browserRpc<ReloadExtensionResult>("reloadExtension");
}

export async function browserGetEvents(args: GetEventsParams = {}) {
  return browserRpc<GetEventsResult>("getEvents", args as JsonObject);
}

export async function browserClearEvents(args: ClearEventsParams = {}) {
  return browserRpc<ClearEventsResult>("clearEvents", args as JsonObject);
}

export async function browserWaitForEvent(args: WaitForEventParams = {}) {
  return browserRpc<WaitForEventResult>("waitForEvent", args as JsonObject);
}

export async function browserGetDiagnostics(args: GetDiagnosticsParams = {}) {
  return browserRpc<GetDiagnosticsResult>("getDiagnostics", args as JsonObject);
}

export async function browserGetPolicy(args: GetPolicyParams = {}) {
  return browserRpc<GetPolicyResult>("getPolicy", args as JsonObject);
}

export async function browserUpdatePolicy(args: UpdatePolicyParams = {}) {
  return browserRpc<UpdatePolicyResult>("updatePolicy", args as JsonObject);
}

export async function browserGetPendingApprovals(args: GetPendingApprovalsParams = {}) {
  return browserRpc<GetPendingApprovalsResult>("getPendingApprovals", args as JsonObject);
}

export async function browserResolveApproval(args: ResolveApprovalParams) {
  return browserRpc<ResolveApprovalResult>("resolveApproval", args as JsonObject);
}

export async function browserStartSession(args: StartSessionParams) {
  return browserRpc<BrowserSession>("startSession", args as JsonObject);
}

export async function browserNameSession(args: NameSessionParams) {
  return browserRpc<NameSessionResult>("nameSession", args as JsonObject);
}

export async function browserUserOpenTabs(args: UserOpenTabsParams = {}) {
  return browserRpc<UserOpenTabsResult>("openTabs", args as JsonObject);
}

export async function browserClaimTab(args: ClaimTabParams) {
  return browserRpc<BrowserSession>("claimTab", args as JsonObject);
}

export async function browserUserHistory(args: BrowserHistoryParams = {}) {
  return browserRpc<BrowserHistoryResult>("getHistory", args as JsonObject);
}

export async function browserClipboardReadText(args: ClipboardReadTextParams = {}) {
  return browserRpc<ClipboardReadTextResult>("clipboardReadText", args as JsonObject);
}

export async function browserClipboardWriteText(args: ClipboardWriteTextParams) {
  return browserRpc<ClipboardWriteTextResult>("clipboardWriteText", args as JsonObject);
}

export async function browserClipboardRead(args: ClipboardReadParams = {}) {
  return browserRpc<ClipboardReadResult>("clipboardRead", args as JsonObject);
}

export async function browserClipboardWrite(args: ClipboardWriteParams) {
  return browserRpc<ClipboardWriteResult>("clipboardWrite", args as unknown as JsonObject);
}

export async function browserCreateTab(args: CreateTabParams) {
  return browserRpc<CreateTabResult>("createTab", args as JsonObject);
}

export async function browserSwitchTab(args: SwitchTabParams) {
  return browserRpc<SwitchTabResult>("switchTab", args as JsonObject);
}

export async function browserListTabs(args: ListTabsParams = {}) {
  return browserRpc<ListTabsResult>("listTabs", args as JsonObject);
}

export async function browserGetTab(args: GetTabParams = {}) {
  return browserRpc<GetTabResult>("getTab", args as JsonObject);
}

export async function browserOpenUrl(args: OpenUrlParams) {
  return browserRpc<BrowserObservation>("openUrl", args as JsonObject);
}

export async function browserGoBack(args: NavigationParams = {}) {
  return browserRpc<NavigationResult>("goBack", args as JsonObject);
}

export async function browserGoForward(args: NavigationParams = {}) {
  return browserRpc<NavigationResult>("goForward", args as JsonObject);
}

export async function browserReload(args: ReloadParams = {}) {
  return browserRpc<NavigationResult>("reload", args as JsonObject);
}

export async function browserWaitForLoadState(args: WaitForLoadStateParams) {
  return browserRpc<WaitForLoadStateResult>(
    "waitForLoadState",
    args as JsonObject
  );
}

export async function browserWaitForUrl(args: WaitForUrlParams) {
  return browserRpc<WaitForUrlResult>("waitForUrl", args as JsonObject);
}

export async function browserWaitForSelector(args: WaitForSelectorParams) {
  return browserRpc<WaitForSelectorResult>(
    "waitForSelector",
    args as JsonObject
  );
}

export async function browserWaitForText(args: WaitForTextParams) {
  return browserRpc<WaitForTextResult>("waitForText", args as JsonObject);
}

export async function browserObserve(args: ObserveParams) {
  return browserRpc<BrowserObservation>("observe", args as JsonObject);
}

export async function browserElementInfo(args: BrowserElementInfoParams) {
  return browserRpc<BrowserElementInfo>("elementInfo", args as JsonObject);
}

export async function browserLocatorQuery(args: LocatorQueryParams) {
  return browserRpc<LocatorQueryResult>("locatorQuery", args as unknown as JsonObject);
}

export async function browserLocatorAction(args: LocatorActionParams) {
  return browserRpc<BrowserObservation>("locatorAction", args as unknown as JsonObject);
}

export async function browserLocatorWait(args: LocatorWaitParams) {
  return browserRpc<LocatorWaitResult>("locatorWait", args as unknown as JsonObject);
}

export async function browserResolveFrame(args: ResolveFrameParams) {
  return browserRpc<ResolveFrameResult>("resolveFrame", args as unknown as JsonObject);
}

export async function browserClick(args: ClickParams) {
  return browserRpc<BrowserObservation>("click", args as JsonObject);
}

export async function browserDrag(args: DragParams) {
  return browserRpc<BrowserObservation>("drag", args as unknown as JsonObject);
}

export async function browserMoveMouse(args: MoveMouseParams) {
  return browserRpc<MoveMouseResult>("moveMouse", args as unknown as JsonObject);
}

export async function browserScroll(args: ScrollParams) {
  return browserRpc<BrowserObservation>("scroll", args as JsonObject);
}

export async function browserTypeText(args: TypeTextParams) {
  return browserRpc<BrowserObservation>("typeText", args as JsonObject);
}

export async function browserEvaluate(args: EvaluateParams) {
  return browserRpc<EvaluateResult>("evaluate", args as unknown as JsonObject);
}

export async function browserPressKey(args: PressKeyParams) {
  return browserRpc("pressKey", args as JsonObject);
}

export async function browserHandleDialog(args: HandleDialogParams) {
  return browserRpc<HandleDialogResult>(
    "handleDialog",
    args as unknown as JsonObject
  );
}

export async function browserScreenshot(args: ScreenshotParams) {
  return browserRpc<ScreenshotResult>("screenshot", args as JsonObject);
}

export async function browserWaitForFileChooser(args: WaitForFileChooserParams = {}) {
  return browserRpc<WaitForFileChooserResult>(
    "waitForFileChooser",
    args as JsonObject
  );
}

export async function browserSetFileChooserFiles(args: SetFileChooserFilesParams) {
  return browserRpc<BrowserObservation>("setFileChooserFiles", args as unknown as JsonObject);
}

export async function browserUploadFile(args: UploadFileParams) {
  return browserRpc<BrowserObservation>("uploadFile", args as unknown as JsonObject);
}

export async function browserCdp(args: CdpParams) {
  return browserRpc<CdpResult>("cdp", args as unknown as JsonObject);
}

export async function browserGetDevLogs(args: GetDevLogsParams = {}) {
  return browserRpc<GetDevLogsResult>("getDevLogs", args as JsonObject);
}

export async function browserGetCapabilities(args: GetCapabilitiesParams = {}) {
  return browserRpc<GetCapabilitiesResult>("getCapabilities", args as JsonObject);
}

export async function browserListDownloads(args: ListDownloadsParams = {}) {
  return browserRpc<ListDownloadsResult>("listDownloads", args as JsonObject);
}

export async function browserWaitForDownload(args: WaitForDownloadParams = {}) {
  return browserRpc<WaitForDownloadResult>(
    "waitForDownload",
    args as JsonObject
  );
}

export async function browserCloseTab(args: CloseTabParams) {
  return browserRpc<CloseTabResult>("closeTab", args as JsonObject);
}

export async function browserFinalizeSession(args: FinalizeSessionParams) {
  return browserRpc<FinalizeSessionResult>(
    "finalizeSession",
    args as unknown as JsonObject
  );
}

export async function browserEndTurn(args: EndTurnParams) {
  return browserRpc<EndTurnResult>("endTurn", args as JsonObject);
}

export async function browserStopSession(args: StopSessionParams) {
  return browserRpc<StopSessionResult>("stopSession", args as JsonObject);
}

export {
  browserActionParameterSchemas,
  browserToolSchemas,
  validateBrowserActionParams
};

export async function callBrowserTool(name: string, args: JsonObject) {
  const action = actionForToolName(name);

  if (action == null) {
    throw new Error(`Unknown browser tool: ${name}`);
  }

  const paramsValidation = validateBrowserActionParams(action, args);

  if (paramsValidation.ok === false) {
    throw new Error(
      `${paramsValidation.code}: Invalid browser params for ${action}: ${paramsValidation.message}`
    );
  }

  switch (name) {
    case "browser_health":
      return browserHealth();
    case "browser_reload_extension":
      return browserReloadExtension();
    case "browser_get_events":
      return browserGetEvents(args as GetEventsParams);
    case "browser_clear_events":
      return browserClearEvents(args as ClearEventsParams);
    case "browser_wait_for_event":
      return browserWaitForEvent(args as WaitForEventParams);
    case "browser_get_diagnostics":
      return browserGetDiagnostics(args as GetDiagnosticsParams);
    case "browser_get_policy":
      return browserGetPolicy(args as GetPolicyParams);
    case "browser_update_policy":
      return browserUpdatePolicy(args as UpdatePolicyParams);
    case "browser_get_pending_approvals":
      return browserGetPendingApprovals(args as GetPendingApprovalsParams);
    case "browser_resolve_approval":
      return browserResolveApproval(args as ResolveApprovalParams);
    case "browser_start_session":
      return browserStartSession(args as StartSessionParams);
    case "browser_name_session":
      return browserNameSession(args as NameSessionParams);
    case "browser_user_open_tabs":
      return browserUserOpenTabs(args as UserOpenTabsParams);
    case "browser_claim_tab":
      return browserClaimTab(args as ClaimTabParams);
    case "browser_user_history":
      return browserUserHistory(args as BrowserHistoryParams);
    case "browser_clipboard_read_text":
      return browserClipboardReadText(args as ClipboardReadTextParams);
    case "browser_clipboard_write_text":
      return browserClipboardWriteText(args as ClipboardWriteTextParams);
    case "browser_clipboard_read":
      return browserClipboardRead(args as ClipboardReadParams);
    case "browser_clipboard_write":
      return browserClipboardWrite(args as unknown as ClipboardWriteParams);
    case "browser_create_tab":
      return browserCreateTab(args as CreateTabParams);
    case "browser_switch_tab":
      return browserSwitchTab(args as SwitchTabParams);
    case "browser_list_tabs":
      return browserListTabs(args as ListTabsParams);
    case "browser_get_tab":
      return browserGetTab(args as GetTabParams);
    case "browser_open_url":
      return browserOpenUrl(args as OpenUrlParams);
    case "browser_go_back":
      return browserGoBack(args as NavigationParams);
    case "browser_go_forward":
      return browserGoForward(args as NavigationParams);
    case "browser_reload":
      return browserReload(args as ReloadParams);
    case "browser_wait_for_load_state":
      return browserWaitForLoadState(args as WaitForLoadStateParams);
    case "browser_wait_for_url":
      return browserWaitForUrl(args as WaitForUrlParams);
    case "browser_wait_for_selector":
      return browserWaitForSelector(args as WaitForSelectorParams);
    case "browser_wait_for_text":
      return browserWaitForText(args as WaitForTextParams);
    case "browser_observe":
      return browserObserve(args as ObserveParams);
    case "browser_element_info":
      return browserElementInfo(args as BrowserElementInfoParams);
    case "browser_locator_query":
      return browserLocatorQuery(args as unknown as LocatorQueryParams);
    case "browser_locator_action":
      return browserLocatorAction(args as unknown as LocatorActionParams);
    case "browser_locator_wait":
      return browserLocatorWait(args as unknown as LocatorWaitParams);
    case "browser_resolve_frame":
      return browserResolveFrame(args as unknown as ResolveFrameParams);
    case "browser_click":
      return browserClick(args as ClickParams);
    case "browser_drag":
      return browserDrag(args as unknown as DragParams);
    case "browser_move_mouse":
      return browserMoveMouse(args as unknown as MoveMouseParams);
    case "browser_scroll":
      return browserScroll(args as ScrollParams);
    case "browser_type_text":
      return browserTypeText(args as TypeTextParams);
    case "browser_evaluate":
      return browserEvaluate(args as unknown as EvaluateParams);
    case "browser_press_key":
      return browserPressKey(args as PressKeyParams);
    case "browser_handle_dialog":
      return browserHandleDialog(args as unknown as HandleDialogParams);
    case "browser_screenshot":
      return browserScreenshot(args as ScreenshotParams);
    case "browser_wait_for_file_chooser":
      return browserWaitForFileChooser(args as WaitForFileChooserParams);
    case "browser_set_file_chooser_files":
      return browserSetFileChooserFiles(args as unknown as SetFileChooserFilesParams);
    case "browser_upload_file":
      return browserUploadFile(args as unknown as UploadFileParams);
    case "browser_cdp":
      return browserCdp(args as unknown as CdpParams);
    case "browser_get_dev_logs":
      return browserGetDevLogs(args as GetDevLogsParams);
    case "browser_get_capabilities":
      return browserGetCapabilities(args as GetCapabilitiesParams);
    case "browser_list_downloads":
      return browserListDownloads(args as ListDownloadsParams);
    case "browser_wait_for_download":
      return browserWaitForDownload(args as WaitForDownloadParams);
    case "browser_close_tab":
      return browserCloseTab(args as CloseTabParams);
    case "browser_finalize_session":
      return browserFinalizeSession(args as unknown as FinalizeSessionParams);
    case "browser_end_turn":
      return browserEndTurn(args as EndTurnParams);
    case "browser_stop_session":
      return browserStopSession(args as StopSessionParams);
    default:
      throw new Error(`Unknown browser tool: ${name}`);
  }
}
