export type BrowserAction =
  | "health"
  | "reloadExtension"
  | "getEvents"
  | "clearEvents"
  | "waitForEvent"
  | "getDiagnostics"
  | "getPolicy"
  | "updatePolicy"
  | "getPendingApprovals"
  | "resolveApproval"
  | "startSession"
  | "nameSession"
  | "openTabs"
  | "claimTab"
  | "getHistory"
  | "clipboardReadText"
  | "clipboardWriteText"
  | "clipboardRead"
  | "clipboardWrite"
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
  | "elementInfo"
  | "locatorQuery"
  | "locatorAction"
  | "locatorWait"
  | "resolveFrame"
  | "click"
  | "drag"
  | "moveMouse"
  | "scroll"
  | "typeText"
  | "evaluate"
  | "pressKey"
  | "handleDialog"
  | "screenshot"
  | "waitForFileChooser"
  | "setFileChooserFiles"
  | "uploadFile"
  | "downloadMedia"
  | "attachTarget"
  | "detachTarget"
  | "cdp"
  | "listTabs"
  | "getTab"
  | "listDownloads"
  | "waitForDownload"
  | "getDevLogs"
  | "getCapabilities"
  | "closeTab"
  | "finalizeSession"
  | "endTurn"
  | "stopSession";

export type BrowserNamedKey =
  | "Enter"
  | "Tab"
  | "Escape"
  | "Backspace"
  | "Delete"
  | "Insert"
  | "Space"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Pause"
  | "CapsLock"
  | "NumLock"
  | "ScrollLock"
  | "ContextMenu"
  | "Convert"
  | "NonConvert"
  | "KanaMode"
  | "HangulMode"
  | "HanjaMode"
  | "JunjaMode"
  | "FinalMode"
  | "ModeChange"
  | "Process"
  | "Compose"
  | "AudioVolumeMute"
  | "AudioVolumeDown"
  | "AudioVolumeUp"
  | "MediaTrackNext"
  | "MediaTrackPrevious"
  | "MediaStop"
  | "MediaPlayPause"
  | `Numpad${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | "NumpadEnter"
  | "NumpadAdd"
  | "NumpadSubtract"
  | "NumpadMultiply"
  | "NumpadDivide"
  | "NumpadDecimal"
  | "NumpadEqual"
  | `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24}`;
export type BrowserModifierKey =
  | "Alt"
  | "Control"
  | "ControlOrMeta"
  | "Meta"
  | "Shift";
export type BrowserKey =
  | BrowserNamedKey
  | BrowserModifierKey
  | `${BrowserModifierKey}+${string}`
  | (string & {});

export type BrowserMouseButton = "left" | "middle" | "right" | "back" | "forward";
export type BrowserPointerModifier = BrowserModifierKey;

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
        code?: string;
        message: string;
        details?: JsonObject;
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
  name?: string;
  groupId: number | null;
  activeTabId: number | null;
  tabIds: number[];
  leases?: BrowserTabLease[];
  extensionInstanceId?: string | null;
  status: BrowserSessionStatus;
  createdAt: number;
  lastActiveAt: number;
  stoppedAt?: number;
  error?: string;
};

export type BrowserSessionStatus = "active" | "stopped" | "error";

export type BrowserTabLease = {
  tabId: number;
  sessionId: string;
  turnId: string | null;
  origin: "agent" | "user";
  state: "active" | "handoff";
  claimedAt: number;
  instanceId: string;
  groupId?: number;
  isActiveHandoff?: boolean;
};

export type BrowserElement = {
  ref: string;
  nodeId?: string;
  stableNodeId?: string;
  role: string;
  label: string;
  visibleText?: string;
  sensitive: boolean;
  tagName: string;
  shadowRoot?: "open" | "closed_unsupported" | null;
  shadowHostSelector?: string | null;
  shadowUnsupportedReason?: string | null;
  frameSelectors?: string[];
  selectorCandidates?: BrowserSelectorCandidate[];
  href?: string | null;
  placeholder?: string | null;
  testId?: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  checked?: boolean;
  selected?: boolean;
  x: number;
  y: number;
  rect: BrowserRect;
};

export type BrowserSelectorCandidate = {
  kind: string;
  selector: string;
};

export type BrowserElementInfoParams = {
  sessionId?: string;
  tabId?: number;
  x: number;
  y: number;
  includeNonInteractable?: boolean;
};

export type BrowserElementInfo = {
  sessionId: string | null;
  tabId: number;
  source: "chrome_page";
  trust: "untrusted";
  x: number;
  y: number;
  found: boolean;
  nodeId?: string | null;
  backendNodeId?: number | null;
  role?: string | null;
  name?: string | null;
  visibleText?: string;
  tagName?: string | null;
  sensitive?: boolean;
  shadowRoot?: "open" | "closed_unsupported" | null;
  shadowHostSelector?: string | null;
  shadowUnsupportedReason?: string | null;
  frameSelectors?: string[];
  selectorCandidates?: BrowserSelectorCandidate[];
  rect?: BrowserRect | null;
  center?: {
    x: number;
    y: number;
  } | null;
  state?: {
    disabled: boolean;
    readOnly: boolean;
    checked: boolean;
    selected: boolean;
    href: string | null;
    placeholder: string | null;
    testId: string | null;
  };
  rawHit?: {
    tagName: string | null;
    role: string | null;
    name: string | null;
    rect: BrowserRect | null;
  } | null;
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
  scroll?: {
    x: number;
    y: number;
    maxX: number;
    maxY: number;
  };
  focusedElement?: {
    role: string;
    label: string;
    tagName: string;
    rect: BrowserRect | null;
  } | null;
  selectedText?: string;
  modalState?: {
    hasModal: boolean;
    dialogs: {
      role: string | null;
      label: string;
      text: string;
      rect: BrowserRect;
    }[];
  };
  truncation?: {
    text: boolean;
    textMaxLength: number;
    textSource?: "body" | "summary";
    textSummarized?: boolean;
    bodyTextLength?: number;
    elements: boolean;
    elementCount: number;
    elementMaxCount: number;
  };
  text: string;
  elements: BrowserElement[];
  accessibilityTree?: BrowserAccessibilityNode[];
  frameTree?: BrowserFrameTree;
  domSnapshot?: unknown;
  domSnapshotSummary?: BrowserDomSnapshotSummary;
  semanticTree?: BrowserSemanticTree;
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

export type BrowserSemanticTree = {
  error?: string;
  source: "accessibility";
  nodeCount: number;
  nodes: BrowserSemanticNode[];
};

export type BrowserSemanticNode = {
  role?: string | number | boolean;
  name?: string | number | boolean;
  value?: string | number | boolean;
  description?: string | number | boolean;
  backendDOMNodeId?: number;
};

export type BrowserFrameTree = {
  source: "cdp";
  frameCount: number;
  root: BrowserFrameTreeNode | null;
  error?: string;
};

export type BrowserFrameTreeNode = {
  id: string | null;
  parentId: string | null;
  name: string | null;
  url: string | null;
  securityOrigin: string | null;
  mimeType: string | null;
  unreachableUrl?: string | null;
  childFrames: BrowserFrameTreeNode[];
};

export type BrowserDomSnapshotSummary = {
  documentCount: number;
  stringCount: number;
  documents: {
    nodeCount: number;
    layoutNodeCount: number;
    textValueCount: number;
    attributeNameCount: number;
  }[];
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
    code?: string;
    message: string;
    details?: JsonObject;
  };
};

export type HealthResult = {
  ok: true;
  extensionId: string;
  version: string;
  nativeConnected: boolean;
  lastNativeError: string | null;
  sessions: BrowserSession[];
  policy?: BrowserPolicyState;
  extensionInstanceId?: string | null;
  attachedTabs: number[];
  supportedActions?: BrowserAction[];
  backendRevision?: number;
  profile?: BrowserProfileMetadata;
  permissions?: {
    required: string[];
    granted: boolean;
    missing: string[];
    hostPermissions: string[];
    hostPermissionsGranted: boolean;
    missingHostPermissions: string[];
    error?: string;
  };
  fileUrlAccess?: {
    detectable: boolean;
    allowed: boolean | null;
    error?: string;
  };
  nativeManifest?: {
    path: string | null;
    expectedOrigin: string | null;
    hostName?: string | null;
    extensionId?: string | null;
    extensionOrigin: string;
    originMatchesExtensionId: boolean;
  };
};

export type BrowserProfileMetadata = {
  activeProfileName: string | null;
  activeProfileId: string | null;
  activeProfileSource: "native_diagnostics" | "unavailable";
  lastUsedProfileHint: string | null;
  lastUsedProfileSource: "native_diagnostics" | "unavailable";
  incognito: boolean;
  extensionInstanceId: string | null;
  readsProfileFiles: false;
};

export type ReloadExtensionResult = {
  reloading: true;
  backendRevision: number;
};

export type BrowserEvent = NativeEvent & {
  sequence: number;
};

export type BrowserFileChooserSummary = {
  fileChooserId?: string;
  file_chooser_id?: string;
  ref?: string | null;
  selector?: string | null;
  multiple: boolean;
  isMultiple?: boolean;
  is_multiple?: boolean;
  accept?: string;
  name?: string;
  inputId?: string;
};

export type BrowserFileChooserEvent = BrowserEvent & {
  name: "fileChooserOpened";
  fileChooser: BrowserFileChooserSummary;
};

export type BrowserUserHandoffRequiredEvent = BrowserEvent & {
  name: "userHandoffRequired";
  action: string;
  category:
    | "captcha"
    | "password_change_final_submission"
    | "browser_security_interstitial"
    | "paywall_bypass";
  reason: string;
  sessionId: string | null;
  tabId: number;
  target?: {
    label?: string;
    text?: string;
    tagName?: string | null;
  };
};

export type BrowserPermissionPromptDetectedEvent = BrowserEvent & {
  name: "permissionPromptDetected";
  action: string;
  host: string | null;
  confirmed: boolean;
  reasons: string[];
  sessionId: string | null;
  tabId: number | null;
  target?: {
    label?: string;
    text?: string;
    tagName?: string | null;
  };
};

export type BrowserHostApprovalRequiredEvent = BrowserEvent & {
  name: "hostApprovalRequired";
  action: string;
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

export type BrowserActionConfirmationRequiredEvent = BrowserEvent & {
  name: "browserActionConfirmationRequired";
  action: string;
  confirmationId: string;
  host: string | null;
  message: string;
  reasons: string[];
  sessionId: string | null;
  tabId: number | null;
  target?: {
    label?: string;
    text?: string;
    tagName?: string | null;
  };
  requiredParams: {
    confirmed: true;
    confirmationId: string;
  };
};

export type BrowserOriginApprovalRequiredEvent = BrowserEvent & {
  name: "browserOriginApprovalRequired";
  action: string;
  approvalId: string;
  host: string | null;
  message: string;
  reasons: string[];
  sessionId: string | null;
  tabId: number | null;
  subject?: JsonObject;
  requiredParams: {
    originApproved: true;
  };
};

export type BrowserEventSnapshot = {
  version: 1;
  sessionId: string;
  reason: string;
  createdAt: number;
  eventCount: number;
  firstSequence: number | null;
  lastSequence: number | null;
  events: BrowserEvent[];
};

export type BrowserEventSnapshotSummary = Omit<BrowserEventSnapshot, "events">;

export type BrowserActionAuditEvent = BrowserEvent & {
  name: "browserActionAudit";
  auditKind: "action" | "diagnostic";
  category: string;
  action: string;
  actionId: string | null;
  sessionId: string | null;
  turnId?: string | null;
  tabId: number | null;
  origin: string | null;
  status?: "ok" | "error";
  resultCode?: string | null;
  errorCode?: string | null;
  confirmed?: boolean;
  originApproved?: boolean;
  confirmationId?: string | null;
  timing?: {
    startedAt: number;
    endedAt: number;
    durationMs: number;
  };
  method?: string;
  reason?: string;
  mode?: string;
  readOnly?: boolean;
};

export type GetEventsParams = {
  sessionId?: string;
  tabId?: number;
  name?: string;
  sinceSequence?: number;
  limit?: number;
  includeSnapshots?: boolean;
  snapshotLimit?: number;
};

export type GetEventsResult = {
  events: BrowserEvent[];
  snapshots?: BrowserEventSnapshot[];
};

export type ClearEventsParams = {
  sessionId?: string;
  tabId?: number;
  name?: string;
  sinceSequence?: number;
  includeSnapshots?: boolean;
};

export type ClearEventsResult = {
  cleared: number;
  clearedSnapshots?: number;
};

export type WaitForEventParams = GetEventsParams & {
  timeoutMs?: number;
  pollMs?: number;
};

export type WaitForEventResult = {
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
  event: BrowserEvent | null;
};

export type GetDiagnosticsParams = {
  sessionId?: string;
  tabId?: number;
  eventLimit?: number;
  devLogLimit?: number;
  includeSnapshots?: boolean;
  nativeDiagnostics?: JsonObject;
};

export type GetDiagnosticsResult = {
  health: HealthResult;
  events: BrowserEvent[];
  eventSnapshots?: BrowserEventSnapshot[];
  devLogs: DevLogEntry[];
  activeSessions: BrowserSession[];
  attachedTabs: number[];
  nativeManifest: {
    path: string | null;
    expectedOrigin: string | null;
    hostName?: string | null;
    extensionId?: string | null;
    extensionOrigin?: string;
    originMatchesExtensionId?: boolean;
  };
  extension: {
    id: string;
    version: string;
    backendRevision: number;
  };
};

export type BrowserPolicyState = {
  sessionAllowedHosts: Record<string, string[]>;
  persistentAllowedHosts: string[];
  blockedHosts: string[];
};

export type GetPolicyParams = {
  sessionId?: string;
};

export type GetPolicyResult = {
  policy: BrowserPolicyState;
};

export type HostPolicyDecision = "allow" | "always_allow" | "deny";

export type UpdatePolicyParams = {
  decision?: HostPolicyDecision;
  sessionId?: string;
  host?: string;
  url?: string;
  reset?: boolean;
};

export type UpdatePolicyResult = {
  policy: BrowserPolicyState;
};

export type PendingApprovalKind = "host" | "confirmation" | "origin";
export type PendingApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type PendingApprovalRecord = {
  approvalId: string;
  kind: PendingApprovalKind;
  status: PendingApprovalStatus;
  action?: string;
  host?: string | null;
  sessionId?: string | null;
  tabId?: number | null;
  message: string;
  createdAt: number;
  expiresAt: number;
  reasons?: string[];
  subject?: JsonObject;
  target?: {
    label?: string;
    text?: string;
    tagName?: string | null;
  };
  requiredParams?: JsonObject;
  suggestedDecisions?: JsonObject;
};

export type GetPendingApprovalsParams = {
  sessionId?: string;
  kind?: PendingApprovalKind;
  includeResolved?: boolean;
  limit?: number;
};

export type GetPendingApprovalsResult = {
  approvals: PendingApprovalRecord[];
};

export type ResolveApprovalParams = {
  approvalId: string;
  decision: "approve" | "deny";
  policyDecision?: HostPolicyDecision;
  sessionId?: string;
};

export type ResolveApprovalResult = {
  approval: PendingApprovalRecord;
  requiredParams?: JsonObject;
  policy?: BrowserPolicyState;
};

export type StartSessionParams = {
  sessionId: string;
  turnId?: string;
  name?: string;
  active?: boolean;
  initialUrl?: string;
};

export type NameSessionParams = {
  sessionId: string;
  name: string;
};

export type NameSessionResult = {
  session: BrowserSession;
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
  sessionId: string;
  turnId?: string;
  claimToken?: string;
  tabId?: number;
  active?: boolean;
  allowUnsafeTabIdClaim?: boolean;
};

export type UserOpenTabsParams = {
  currentWindow?: boolean;
  includeControlled?: boolean;
};

export type ClaimableTabDescriptor = BrowserTabSummary & {
  claimToken: string;
  claimTokenExpiresAt: number;
};

export type UserOpenTabsResult = {
  tabs: ClaimableTabDescriptor[];
};

export type BrowserHistoryParams = {
  query?: string;
  from?: number;
  to?: number;
  limit?: number;
  confirmed?: boolean;
  confirmationId?: string;
};

export type BrowserHistoryEntry = {
  id: string;
  url: string;
  title?: string;
  dateVisited?: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
  redacted?: boolean;
  redactionReasons?: string[];
};

export type BrowserHistoryResult = {
  entries: BrowserHistoryEntry[];
  sensitive: true;
};

export type ClipboardReadTextParams = {
  sessionId?: string;
  tabId?: number;
  confirmed?: boolean;
  confirmationId?: string;
};

export type ClipboardReadTextResult = {
  text: string;
  sensitive: true;
};

export type ClipboardWriteTextParams = {
  sessionId?: string;
  tabId?: number;
  text: string;
  confirmed?: boolean;
  confirmationId?: string;
  sensitive?: boolean;
};

export type ClipboardWriteTextResult = {
  written: true;
  textLength: number;
};

export type ClipboardItemPayload = {
  mimeType: string;
  text?: string;
  dataBase64?: string;
  size?: number;
};

export type ClipboardItemData = {
  types: ClipboardItemPayload[];
};

export type ClipboardReadParams = {
  sessionId?: string;
  tabId?: number;
  confirmed?: boolean;
  confirmationId?: string;
};

export type ClipboardReadResult = {
  items: ClipboardItemData[];
  sensitive: true;
};

export type ClipboardWriteParams = {
  sessionId?: string;
  tabId?: number;
  items: ClipboardItemData[];
  confirmed?: boolean;
  confirmationId?: string;
  sensitive?: boolean;
};

export type ClipboardWriteResult = {
  written: true;
  itemCount: number;
};

export type CreateTabParams = {
  sessionId: string;
  turnId?: string;
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

export type ListTabsParams = {
  sessionId?: string;
  controlledOnly?: boolean;
  currentWindow?: boolean;
};

export type ListTabsResult = {
  tabs: BrowserTabSummary[];
};

export type GetTabParams = {
  sessionId?: string;
  tabId?: number;
};

export type GetTabResult = {
  tab: BrowserTabSummary;
};

export type WaitForLoadStateParams = {
  sessionId?: string;
  tabId?: number;
  state?: "commit" | "load" | "domcontentloaded" | "networkidle";
  timeoutMs?: number;
  idleMs?: number;
};

export type WaitForLoadStateResult = {
  sessionId: string | null;
  tabId: number;
  state: "commit" | "load" | "domcontentloaded" | "networkidle";
  reason:
    | "already_satisfied"
    | "Page.frameNavigated"
    | "Page.loadEventFired"
    | "Page.domContentEventFired"
    | "networkidle"
    | "timeout";
};

export type WaitForUrlParams = {
  sessionId?: string;
  tabId?: number;
  url?: string;
  urlContains?: string;
  urlRegex?: string;
  waitUntil?: "commit" | "load" | "domcontentloaded" | "networkidle";
  timeoutMs?: number;
  pollMs?: number;
  idleMs?: number;
};

export type WaitForUrlResult = {
  sessionId: string | null;
  tabId: number;
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
  url?: string;
  title?: string;
  waitUntil?: "commit" | "load" | "domcontentloaded" | "networkidle";
  loadReason?: "url_matched" | "already_satisfied" | "Page.frameNavigated" | "Page.loadEventFired" | "Page.domContentEventFired" | "networkidle" | "timeout";
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

export type LocatorPlan = {
  kind: "css" | "text" | "role" | "label" | "placeholder" | "testId" | "altText" | "title" | "displayValue";
  selector?: string;
  text?: string;
  role?: string;
  name?: string;
  testId?: string;
  frameSelectors?: string[];
  within?: LocatorPlan;
  and?: LocatorPlan;
  or?: LocatorPlan;
  has?: LocatorPlan;
  hasNot?: LocatorPlan;
  hasText?: string;
  hasNotText?: string;
  visible?: boolean;
  exact?: boolean;
  index?: number;
  strict?: boolean;
};

export type LocatorQueryKind =
  | "count"
  | "allTextContents"
  | "allInnerTexts"
  | "textContent"
  | "innerText"
  | "innerHTML"
  | "getAttribute"
  | "isVisible"
  | "isHidden"
  | "isEnabled"
  | "isDisabled"
  | "isEditable"
  | "inputValue"
  | "isChecked"
  | "boundingBox";

export type LocatorQueryParams = {
  sessionId?: string;
  tabId?: number;
  locator: LocatorPlan;
  kind: LocatorQueryKind;
  args?: JsonObject;
  timeoutMs?: number;
};

export type LocatorQueryResult = {
  sessionId: string | null;
  tabId: number;
  kind: LocatorQueryKind;
  frameId?: string | null;
  targetId?: string | null;
  value: unknown;
  count: number;
};

export type LocatorActionKind =
  | "click"
  | "dblclick"
  | "dragTo"
  | "fill"
  | "type"
  | "press"
  | "clear"
  | "focus"
  | "blur"
  | "scrollIntoViewIfNeeded"
  | "selectText"
  | "hover"
  | "highlight"
  | "setChecked"
  | "selectOption"
  | "evaluate"
  | "evaluateAll"
  | "dispatchEvent";

export type LocatorActionParams = {
  sessionId?: string;
  tabId?: number;
  locator: LocatorPlan;
  kind: LocatorActionKind;
  args?: JsonObject;
  timeoutMs?: number;
  waitMs?: number;
};

export type LocatorWaitParams = {
  sessionId?: string;
  tabId?: number;
  locator: LocatorPlan;
  state?: "attached" | "visible" | "hidden" | "detached";
  timeoutMs?: number;
  pollMs?: number;
};

export type LocatorWaitResult = {
  sessionId: string | null;
  tabId: number;
  state: "attached" | "visible" | "hidden" | "detached";
  frameId?: string | null;
  targetId?: string | null;
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
  count: number;
};

export type ResolveFrameParams = {
  sessionId?: string;
  tabId?: number;
  frameSelectors: string[];
  targetId?: string;
  timeoutMs?: number;
};

export type ResolveFrameResult = {
  sessionId: string | null;
  tabId: number;
  targetId?: string | null;
  frameSelectors: string[];
  matched: boolean;
  accessible: boolean;
  frameId: string | null;
  resolvedSelectorCount?: number;
  unresolvedFrameSelectors?: string[];
  targetCandidates?: Array<{
    targetId: string;
    type?: string | null;
    title?: string | null;
    url?: string | null;
    score: number;
  }>;
  frame: BrowserFrameTreeNode | null;
  path: Array<{
    selector: string;
    index: number;
    accessible: boolean;
    id?: string | null;
    name?: string | null;
    title?: string | null;
    src?: string | null;
    url?: string | null;
    viewportOffset?: BrowserPoint;
    frameId?: string | null;
  }>;
  targetViewportOffset?: BrowserPoint;
  viewportOffset?: BrowserPoint;
};

export type ClickParams = {
  sessionId?: string;
  tabId?: number;
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  button?: BrowserMouseButton;
  clickCount?: number;
  modifiers?: BrowserPointerModifier[];
  waitMs?: number;
  confirmed?: boolean;
  confirmationId?: string;
};

export type DragPoint = {
  x: number;
  y: number;
};

export type DragParams = {
  sessionId?: string;
  tabId?: number;
  path: DragPoint[];
  button?: BrowserMouseButton;
  modifiers?: BrowserPointerModifier[];
  waitMs?: number;
  confirmed?: boolean;
  confirmationId?: string;
};

export type MoveMouseParams = {
  sessionId?: string;
  tabId?: number;
  x: number;
  y: number;
  modifiers?: BrowserPointerModifier[];
  waitForArrival?: boolean;
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
  modifiers?: BrowserPointerModifier[];
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
  sensitive?: boolean;
  confirmed?: boolean;
  confirmationId?: string;
};

export type EvaluateParams = {
  sessionId?: string;
  tabId?: number;
  targetId?: string;
  frameId?: string;
  script: string;
  awaitPromise?: boolean;
  timeoutMs?: number;
  mode?: "read" | "write";
  confirmed?: boolean;
  confirmationId?: string;
  reason?: string;
};

export type EvaluateResult = {
  sessionId: string | null;
  tabId: number;
  targetId?: string | null;
  frameId?: string | null;
  executionContextId?: number | null;
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
  fullPage?: boolean;
  clip?: BrowserRect;
  highlight?: boolean;
  highlightClip?: BrowserRect;
  highlightColor?: string;
  highlightDurationMs?: number;
};

export type ScreenshotResult = {
  sessionId: string | null;
  tabId: number;
  format: "png" | "jpeg";
  fullPage?: boolean;
  clip?: (BrowserRect & { scale?: number }) | null;
  dataBase64: string;
};

export type WaitForFileChooserParams = {
  sessionId?: string;
  tabId?: number;
  timeoutMs?: number;
  pollMs?: number;
  sinceSequence?: number;
};

export type WaitForFileChooserResult = {
  sessionId: string | null;
  tabId: number | null;
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
  fileChooserId: string | null;
  file_chooser_id: string | null;
  isMultiple: boolean | null;
  is_multiple: boolean | null;
  fileChooser: BrowserFileChooserSummary | null;
  event: BrowserFileChooserEvent | null;
};

export type SetFileChooserFilesParams = {
  sessionId?: string;
  tabId?: number;
  fileChooserId?: string;
  file_chooser_id?: string;
  files?: string[];
  filePath?: string;
  filePaths?: string[];
  timeoutMs?: number;
  waitMs?: number;
  confirmed?: boolean;
  confirmationId?: string;
};

export type UploadFileParams = {
  sessionId?: string;
  tabId?: number;
  ref?: string;
  selector?: string;
  locator?: LocatorPlan;
  filePath?: string;
  filePaths?: string[];
  waitMs?: number;
  confirmed?: boolean;
  confirmationId?: string;
};

export type DownloadMediaParams = {
  sessionId?: string;
  tabId?: number;
  locator: LocatorPlan;
  attribute?: "auto" | "src" | "href" | "poster" | "backgroundImage";
  filename?: string;
  conflictAction?: "uniquify" | "overwrite" | "prompt";
  saveAs?: boolean;
  waitForCompletion?: boolean;
  timeoutMs?: number;
  pollMs?: number;
  fallbackFetch?: boolean;
  fallbackMaxBytes?: number;
  originApproved?: boolean;
  confirmed?: boolean;
  confirmationId?: string;
};

export type DownloadMediaResult = {
  sessionId: string | null;
  tabId: number;
  media: {
    url: string;
    kind: string;
    tagName: string;
    attribute: string;
    filename: string | null;
    originalUrl?: string;
    method?: "chrome_downloads" | "fetch_blob";
  };
  download: BrowserDownloadSummary | null;
  matched?: boolean;
  timedOut?: boolean;
  elapsedMs?: number;
};

export type CdpParams = {
  sessionId?: string;
  tabId?: number;
  targetId?: string;
  method: string;
  params?: JsonObject;
  timeoutMs?: number;
  originApproved?: boolean;
  confirmed?: boolean;
  confirmationId?: string;
  reason?: string;
};

export type CdpResult = {
  sessionId: string | null;
  tabId: number;
  targetId?: string | null;
  method: string;
  result: unknown;
};

export type TargetAttachmentParams = {
  sessionId?: string;
  tabId?: number;
  targetId: string;
  originApproved?: boolean;
  confirmed?: boolean;
  confirmationId?: string;
  reason?: string;
};

export type TargetAttachmentResult = {
  attached: boolean;
  sessionId: string | null;
  tabId: number;
  targetId: string;
};

export type DevLogLevel = "log" | "debug" | "info" | "warning" | "error";

export type DevLogEntry = {
  sequence: number;
  time: number;
  timestamp?: string;
  sessionId: string | null;
  tabId: number | null;
  source: "console" | "log" | "exception";
  level?: DevLogLevel | string;
  text?: string;
  redacted?: boolean;
  redactionReasons?: string[];
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
};

export type GetDevLogsParams = {
  sessionId?: string;
  tabId?: number;
  level?: DevLogLevel | string;
  levels?: Array<DevLogLevel | string>;
  filter?: string;
  sinceSequence?: number;
  limit?: number;
};

export type GetDevLogsResult = {
  logs: DevLogEntry[];
};

export type BrowserCapabilityScope = "browser" | "tab";

export type BrowserCapability = {
  id: string;
  scope: BrowserCapabilityScope;
  description: string;
  available: boolean;
  reason?: string;
};

export type GetCapabilitiesParams = {
  scope?: BrowserCapabilityScope;
  sessionId?: string;
  tabId?: number;
};

export type GetCapabilitiesResult = {
  capabilities: BrowserCapability[];
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
  handoffTabIds?: number[];
  deliverableTabIds?: number[];
  closeRest?: boolean;
  turnId?: string;
};

export type FinalizeSessionResult = {
  finalized: boolean;
  sessionId?: string;
  reason?: "session_not_found";
  closedTabs: number[];
  keptTabs: number[];
  handoffTabs?: number[];
  deliverableTabs?: number[];
  releasedTabs?: number[];
  eventSnapshot?: BrowserEventSnapshotSummary | null;
  clearedEvents?: number;
};

export type EndTurnParams = {
  sessionId: string;
  turnId: string;
};

export type EndTurnResult = {
  ended: boolean;
  sessionId?: string;
  turnId?: string;
  reason?: "session_not_found";
  releasedTabs: number[];
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
  eventSnapshot?: BrowserEventSnapshotSummary | null;
  clearedEvents?: number;
};

export type BrowserTabSummary = {
  id?: number;
  windowId: number;
  title?: string;
  url?: string;
  active: boolean;
  groupId: number;
  groupLabel?: string | null;
  openedAt?: number | null;
  lastFocusedAt?: number | null;
  sessionId?: string | null;
  controlled: boolean;
};

export type BrowserDownloadState = "in_progress" | "interrupted" | "complete";

export type BrowserDownloadSummary = {
  id: number;
  downloadId?: number;
  download_id?: number;
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
  sessionId?: string;
  tabId?: number;
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
  | WaitForEventParams
  | GetDiagnosticsParams
  | GetPolicyParams
  | UpdatePolicyParams
  | GetPendingApprovalsParams
  | ResolveApprovalParams
  | StartSessionParams
  | NameSessionParams
  | UserOpenTabsParams
  | ClaimTabParams
  | BrowserHistoryParams
  | ClipboardReadTextParams
  | ClipboardWriteTextParams
  | ClipboardReadParams
  | ClipboardWriteParams
  | CreateTabParams
  | SwitchTabParams
  | ListTabsParams
  | GetTabParams
  | OpenUrlParams
  | NavigationParams
  | ReloadParams
  | WaitForLoadStateParams
  | WaitForUrlParams
  | WaitForSelectorParams
  | WaitForTextParams
  | ObserveParams
  | BrowserElementInfoParams
  | LocatorQueryParams
  | LocatorActionParams
  | LocatorWaitParams
  | ResolveFrameParams
  | ClickParams
  | DragParams
  | MoveMouseParams
  | ScrollParams
  | TypeTextParams
  | EvaluateParams
  | PressKeyParams
  | HandleDialogParams
  | ScreenshotParams
  | WaitForFileChooserParams
  | SetFileChooserFilesParams
  | UploadFileParams
  | DownloadMediaParams
  | TargetAttachmentParams
  | CdpParams
  | GetDevLogsParams
  | GetCapabilitiesParams
  | ListDownloadsParams
  | WaitForDownloadParams
  | CloseTabParams
  | FinalizeSessionParams
  | EndTurnParams
  | StopSessionParams;

export type BrowserRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserPoint = {
  x: number;
  y: number;
};

export type JsonObject = Record<string, unknown>;
