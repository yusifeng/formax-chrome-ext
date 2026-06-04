export type BrowserAction =
  | "health"
  | "getEvents"
  | "clearEvents"
  | "startSession"
  | "claimTab"
  | "createTab"
  | "switchTab"
  | "openUrl"
  | "goBack"
  | "goForward"
  | "reload"
  | "waitForLoadState"
  | "waitForUrl"
  | "waitForSelector"
  | "waitForText"
  | "observe"
  | "click"
  | "moveMouse"
  | "scroll"
  | "typeText"
  | "evaluate"
  | "pressKey"
  | "handleDialog"
  | "screenshot"
  | "uploadFile"
  | "cdp"
  | "listTabs"
  | "listDownloads"
  | "waitForDownload"
  | "closeTab"
  | "finalizeSession"
  | "stopSession";

export type BrowserKey =
  | "Enter"
  | "Tab"
  | "Escape"
  | "Backspace"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight";

export type NativeRequest = {
  type: "request";
  id: string;
  action: BrowserAction;
  params?: BrowserActionParams;
};

export type NativeResponse =
  | {
      type: "response";
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      type: "response";
      id: string;
      ok: false;
      error: {
        message: string;
      };
    };

export type NativeEvent = {
  type: "event";
  name: string;
  time: number;
  sequence?: number;
  sessionId?: string | null;
  tabId?: number | null;
  [key: string]: unknown;
};

export type BrowserSession = {
  sessionId: string;
  groupId: number;
  activeTabId: number | null;
  tabIds: number[];
  status: BrowserSessionStatus;
  createdAt: number;
  lastActiveAt: number;
  stoppedAt?: number;
  error?: string;
};

export type BrowserSessionStatus = "active" | "stopped" | "error";

export type BrowserElement = {
  ref: string;
  role: string;
  label: string;
  sensitive: boolean;
  tagName: string;
  x: number;
  y: number;
  rect: BrowserRect;
};

export type BrowserObservation = {
  sessionId: string | null;
  tabId: number;
  source: "chrome_page";
  trust: "untrusted";
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  text: string;
  elements: BrowserElement[];
  accessibilityTree?: BrowserAccessibilityNode[];
  domSnapshot?: unknown;
};

export type BrowserAccessibilityNode = {
  nodeId?: string;
  ignored: boolean;
  role?: unknown;
  name?: unknown;
  value?: unknown;
  description?: unknown;
  childIds?: string[];
  backendDOMNodeId?: number;
};

export type BrowserTiming = {
  startedAt: number;
  endedAt: number;
  durationMs: number;
};

export type BrowserToolResult<T> = {
  actionId: string;
  action: BrowserAction;
  ok: true;
  sessionId: string | null;
  tabId: number | null;
  timing: BrowserTiming;
  result: T;
};

export type BrowserToolError = {
  actionId: string;
  action: BrowserAction;
  ok: false;
  sessionId: string | null;
  tabId: number | null;
  timing: BrowserTiming;
  error: {
    message: string;
  };
};

export type HealthResult = {
  ok: true;
  extensionId: string;
  version: string;
  nativeConnected: boolean;
  lastNativeError: string | null;
  sessions: BrowserSession[];
  attachedTabs: number[];
};

export type BrowserEvent = NativeEvent & {
  sequence: number;
};

export type GetEventsParams = {
  sessionId?: string;
  tabId?: number;
  name?: string;
  sinceSequence?: number;
  limit?: number;
};

export type GetEventsResult = {
  events: BrowserEvent[];
};

export type ClearEventsParams = {
  sessionId?: string;
  tabId?: number;
  name?: string;
  sinceSequence?: number;
};

export type ClearEventsResult = {
  cleared: number;
};

export type StartSessionParams = {
  sessionId?: string;
  active?: boolean;
  initialUrl?: string;
};

export type OpenUrlParams = {
  sessionId?: string;
  tabId?: number;
  url: string;
  active?: boolean;
  timeoutMs?: number;
};

export type NavigationParams = {
  sessionId?: string;
  tabId?: number;
  waitForLoad?: boolean;
  timeoutMs?: number;
};

export type ReloadParams = NavigationParams & {
  ignoreCache?: boolean;
};

export type NavigationResult = BrowserObservation & {
  navigated: boolean;
  reason?: string;
  historyIndex?: number;
};

export type ClaimTabParams = {
  sessionId?: string;
  tabId?: number;
  active?: boolean;
};

export type CreateTabParams = {
  sessionId?: string;
  url?: string;
  active?: boolean;
};

export type CreateTabResult = {
  session: BrowserSession;
  tab: BrowserTabSummary;
};

export type SwitchTabParams = {
  sessionId?: string;
  tabId?: number;
};

export type SwitchTabResult = {
  session: BrowserSession | null;
  tab: BrowserTabSummary;
};

export type WaitForLoadStateParams = {
  sessionId?: string;
  tabId?: number;
  state?: "load" | "domcontentloaded";
  timeoutMs?: number;
};

export type WaitForLoadStateResult = {
  sessionId: string | null;
  tabId: number;
  state: "load" | "domcontentloaded";
  reason: "already_satisfied" | "Page.loadEventFired" | "Page.domContentEventFired" | "timeout";
};

export type WaitForUrlParams = {
  sessionId?: string;
  tabId?: number;
  url?: string;
  urlContains?: string;
  urlRegex?: string;
  timeoutMs?: number;
  pollMs?: number;
};

export type WaitForUrlResult = {
  sessionId: string | null;
  tabId: number;
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
  url?: string;
  title?: string;
};

export type WaitForSelectorParams = {
  sessionId?: string;
  tabId?: number;
  selector: string;
  state?: "attached" | "visible" | "hidden" | "detached";
  timeoutMs?: number;
  pollMs?: number;
};

export type WaitForSelectorResult = {
  sessionId: string | null;
  tabId: number;
  selector: string;
  state: "attached" | "visible" | "hidden" | "detached";
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
  element?: unknown;
};

export type WaitForTextParams = {
  sessionId?: string;
  tabId?: number;
  text: string;
  state?: "present" | "hidden";
  exact?: boolean;
  caseSensitive?: boolean;
  timeoutMs?: number;
  pollMs?: number;
};

export type WaitForTextResult = {
  sessionId: string | null;
  tabId: number;
  text: string;
  state: "present" | "hidden";
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
  found: boolean;
  title?: string;
  url?: string;
};

export type ObserveParams = {
  sessionId?: string;
  tabId?: number;
  includeAccessibility?: boolean;
  maxAccessibilityNodes?: number;
  includeDomSnapshot?: boolean;
};

export type ClickParams = {
  sessionId?: string;
  tabId?: number;
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  button?: "left" | "middle" | "right";
  clickCount?: number;
  waitMs?: number;
};

export type MoveMouseParams = {
  sessionId?: string;
  tabId?: number;
  x: number;
  y: number;
  waitMs?: number;
};

export type MoveMouseResult = {
  sessionId: string | null;
  tabId: number;
  x: number;
  y: number;
};

export type ScrollParams = {
  sessionId?: string;
  tabId?: number;
  deltaX?: number;
  deltaY?: number;
  x?: number;
  y?: number;
  waitMs?: number;
};

export type TypeTextParams = {
  sessionId?: string;
  tabId?: number;
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  text: string;
  clear?: boolean;
  waitMs?: number;
};

export type EvaluateParams = {
  sessionId?: string;
  tabId?: number;
  script: string;
  awaitPromise?: boolean;
  timeoutMs?: number;
};

export type EvaluateResult = {
  sessionId: string | null;
  tabId: number;
  value: unknown;
};

export type PressKeyParams = {
  sessionId?: string;
  tabId?: number;
  key: BrowserKey;
  waitMs?: number;
};

export type HandleDialogParams = {
  sessionId?: string;
  tabId?: number;
  accept?: boolean;
  promptText?: string;
};

export type HandleDialogResult = {
  sessionId: string | null;
  tabId: number;
  accepted: boolean;
};

export type ScreenshotParams = {
  sessionId?: string;
  tabId?: number;
  format?: "png" | "jpeg";
};

export type ScreenshotResult = {
  sessionId: string | null;
  tabId: number;
  format: "png" | "jpeg";
  dataBase64: string;
};

export type UploadFileParams = {
  sessionId?: string;
  tabId?: number;
  ref: string;
  filePath: string;
  waitMs?: number;
};

export type CdpParams = {
  sessionId?: string;
  tabId?: number;
  method: string;
  params?: JsonObject;
  timeoutMs?: number;
};

export type CdpResult = {
  sessionId: string | null;
  tabId: number;
  method: string;
  result: unknown;
};

export type CloseTabParams = {
  sessionId?: string;
  tabId?: number;
};

export type CloseTabResult = {
  closed: boolean;
  sessionId: string | null;
  tabId: number;
  remainingSessions: BrowserSession[];
};

export type FinalizeSessionParams = {
  sessionId: string;
  keepTabIds?: number[];
  closeRest?: boolean;
};

export type FinalizeSessionResult = {
  finalized: boolean;
  sessionId?: string;
  reason?: "session_not_found";
  closedTabs: number[];
  keptTabs: number[];
};

export type StopSessionParams = {
  sessionId: string;
  closeTabs?: boolean;
};

export type StopSessionResult = {
  stopped: boolean;
  sessionId?: string;
  reason?: "session_not_found";
  closedTabs: number[];
};

export type BrowserTabSummary = {
  id?: number;
  windowId: number;
  title?: string;
  url?: string;
  active: boolean;
  groupId: number;
};

export type BrowserDownloadState = "in_progress" | "interrupted" | "complete";

export type BrowserDownloadSummary = {
  id: number;
  url: string;
  finalUrl?: string;
  filename: string;
  mime: string;
  state: BrowserDownloadState;
  danger?: string;
  totalBytes: number;
  bytesReceived: number;
  startTime: string;
  endTime?: string;
  error?: string;
};

export type ListDownloadsParams = {
  id?: number;
  state?: BrowserDownloadState;
  urlContains?: string;
  filenameContains?: string;
  mimeContains?: string;
  startedAfter?: number;
  limit?: number;
};

export type ListDownloadsResult = {
  downloads: BrowserDownloadSummary[];
};

export type WaitForDownloadParams = ListDownloadsParams & {
  state?: BrowserDownloadState | "any";
  timeoutMs?: number;
  pollMs?: number;
};

export type WaitForDownloadResult = {
  matched: boolean;
  timedOut: boolean;
  state: BrowserDownloadState | "any";
  elapsedMs: number;
  download: BrowserDownloadSummary | null;
};

export type BrowserActionParams =
  | JsonObject
  | GetEventsParams
  | ClearEventsParams
  | StartSessionParams
  | ClaimTabParams
  | CreateTabParams
  | SwitchTabParams
  | OpenUrlParams
  | NavigationParams
  | ReloadParams
  | WaitForLoadStateParams
  | WaitForUrlParams
  | WaitForSelectorParams
  | WaitForTextParams
  | ObserveParams
  | ClickParams
  | MoveMouseParams
  | ScrollParams
  | TypeTextParams
  | EvaluateParams
  | PressKeyParams
  | HandleDialogParams
  | ScreenshotParams
  | UploadFileParams
  | CdpParams
  | ListDownloadsParams
  | WaitForDownloadParams
  | CloseTabParams
  | FinalizeSessionParams
  | StopSessionParams;

export type BrowserRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type JsonObject = Record<string, unknown>;
