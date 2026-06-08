type ExtensionParamKind =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "locator"
  | "numberArray"
  | "stringArray"
  | "objectArray";

type ExtensionParamSpec = {
  name: string;
  kind: ExtensionParamKind;
  required?: boolean;
};

function extParam(
  name: string,
  kind: ExtensionParamKind,
  required = false
): ExtensionParamSpec {
  return { name, kind, required };
}

const EXTENSION_SESSION_TAB_PARAMS = [
  extParam("sessionId", "string"),
  extParam("tabId", "number")
];

const EXTENSION_DOWNLOAD_PARAMS = [
  extParam("sessionId", "string"),
  extParam("tabId", "number"),
  extParam("id", "number"),
  extParam("state", "string"),
  extParam("urlContains", "string"),
  extParam("filenameContains", "string"),
  extParam("mimeContains", "string"),
  extParam("startedAfter", "number"),
  extParam("limit", "number")
];

const EXTENSION_ACTION_PARAM_SPECS: Record<string, ExtensionParamSpec[]> = {
  health: [
    extParam("nativeDiagnostics", "object")
  ],
  reloadExtension: [],
  getEvents: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("name", "string"),
    extParam("sinceSequence", "number"),
    extParam("limit", "number"),
    extParam("includeSnapshots", "boolean"),
    extParam("snapshotLimit", "number")
  ],
  clearEvents: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("name", "string"),
    extParam("sinceSequence", "number"),
    extParam("includeSnapshots", "boolean")
  ],
  waitForEvent: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("name", "string"),
    extParam("sinceSequence", "number"),
    extParam("limit", "number"),
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number")
  ],
  getDiagnostics: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("eventLimit", "number"),
    extParam("devLogLimit", "number"),
    extParam("includeSnapshots", "boolean"),
    extParam("nativeDiagnostics", "object")
  ],
  getPolicy: [extParam("sessionId", "string")],
  updatePolicy: [
    extParam("decision", "string"),
    extParam("sessionId", "string"),
    extParam("host", "string"),
    extParam("url", "string"),
    extParam("reset", "boolean")
  ],
  startSession: [
    extParam("sessionId", "string", true),
    extParam("turnId", "string"),
    extParam("active", "boolean"),
    extParam("initialUrl", "string"),
    extParam("name", "string")
  ],
  nameSession: [
    extParam("sessionId", "string", true),
    extParam("name", "string", true)
  ],
  openTabs: [
    extParam("currentWindow", "boolean"),
    extParam("includeControlled", "boolean")
  ],
  claimTab: [
    extParam("sessionId", "string", true),
    extParam("turnId", "string"),
    extParam("claimToken", "string"),
    extParam("tabId", "number"),
    extParam("active", "boolean"),
    extParam("allowUnsafeTabIdClaim", "boolean")
  ],
  getHistory: [
    extParam("query", "string"),
    extParam("from", "number"),
    extParam("to", "number"),
    extParam("limit", "number"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  clipboardReadText: [
    extParam("sessionId", "string"),
    extParam("tabId", "number"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  clipboardWriteText: [
    extParam("sessionId", "string"),
    extParam("tabId", "number"),
    extParam("text", "string", true),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string"),
    extParam("sensitive", "boolean")
  ],
  clipboardRead: [
    extParam("sessionId", "string"),
    extParam("tabId", "number"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  clipboardWrite: [
    extParam("sessionId", "string"),
    extParam("tabId", "number"),
    extParam("items", "objectArray", true),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string"),
    extParam("sensitive", "boolean")
  ],
  createTab: [
    extParam("sessionId", "string", true),
    extParam("turnId", "string"),
    extParam("url", "string"),
    extParam("active", "boolean")
  ],
  switchTab: [...EXTENSION_SESSION_TAB_PARAMS],
  openUrl: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("url", "string", true),
    extParam("active", "boolean"),
    extParam("timeoutMs", "number")
  ],
  goBack: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("waitForLoad", "boolean"),
    extParam("timeoutMs", "number")
  ],
  goForward: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("waitForLoad", "boolean"),
    extParam("timeoutMs", "number")
  ],
  reload: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("ignoreCache", "boolean"),
    extParam("waitForLoad", "boolean"),
    extParam("timeoutMs", "number")
  ],
  waitForLoadState: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("state", "string"),
    extParam("timeoutMs", "number"),
    extParam("idleMs", "number")
  ],
  waitForUrl: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("url", "string"),
    extParam("urlContains", "string"),
    extParam("urlRegex", "string"),
    extParam("waitUntil", "string"),
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number"),
    extParam("idleMs", "number")
  ],
  waitForSelector: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("selector", "string", true),
    extParam("state", "string"),
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number")
  ],
  waitForText: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("text", "string", true),
    extParam("state", "string"),
    extParam("exact", "boolean"),
    extParam("caseSensitive", "boolean"),
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number")
  ],
  observe: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("includeAccessibility", "boolean"),
    extParam("maxAccessibilityNodes", "number"),
    extParam("includeDomSnapshot", "boolean")
  ],
  elementInfo: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("x", "number", true),
    extParam("y", "number", true),
    extParam("includeNonInteractable", "boolean")
  ],
  locatorQuery: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("locator", "locator", true),
    extParam("kind", "string", true),
    extParam("args", "object"),
    extParam("timeoutMs", "number")
  ],
  locatorAction: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("locator", "locator", true),
    extParam("kind", "string", true),
    extParam("args", "object"),
    extParam("timeoutMs", "number"),
    extParam("waitMs", "number")
  ],
  locatorWait: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("locator", "locator", true),
    extParam("state", "string"),
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number")
  ],
  resolveFrame: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("frameSelectors", "stringArray", true),
    extParam("targetId", "string"),
    extParam("timeoutMs", "number")
  ],
  click: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("ref", "string"),
    extParam("selector", "string"),
    extParam("x", "number"),
    extParam("y", "number"),
    extParam("button", "string"),
    extParam("clickCount", "number"),
    extParam("modifiers", "stringArray"),
    extParam("waitMs", "number"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  drag: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("path", "objectArray", true),
    extParam("button", "string"),
    extParam("modifiers", "stringArray"),
    extParam("waitMs", "number"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  moveMouse: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("x", "number", true),
    extParam("y", "number", true),
    extParam("modifiers", "stringArray"),
    extParam("waitForArrival", "boolean"),
    extParam("waitMs", "number")
  ],
  scroll: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("deltaX", "number"),
    extParam("deltaY", "number"),
    extParam("x", "number"),
    extParam("y", "number"),
    extParam("modifiers", "stringArray"),
    extParam("waitMs", "number")
  ],
  typeText: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("ref", "string"),
    extParam("selector", "string"),
    extParam("x", "number"),
    extParam("y", "number"),
    extParam("text", "string", true),
    extParam("clear", "boolean"),
    extParam("waitMs", "number"),
    extParam("sensitive", "boolean"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  evaluate: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("targetId", "string"),
    extParam("frameId", "string"),
    extParam("script", "string", true),
    extParam("awaitPromise", "boolean"),
    extParam("timeoutMs", "number"),
    extParam("mode", "string"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string"),
    extParam("reason", "string")
  ],
  pressKey: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("key", "string", true),
    extParam("waitMs", "number")
  ],
  handleDialog: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("accept", "boolean"),
    extParam("promptText", "string")
  ],
  screenshot: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("format", "string"),
    extParam("fullPage", "boolean"),
    extParam("clip", "object"),
    extParam("highlight", "boolean"),
    extParam("highlightClip", "object"),
    extParam("highlightColor", "string"),
    extParam("highlightDurationMs", "number")
  ],
  waitForFileChooser: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number"),
    extParam("sinceSequence", "number")
  ],
  setFileChooserFiles: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("fileChooserId", "string"),
    extParam("file_chooser_id", "string"),
    extParam("files", "stringArray"),
    extParam("filePath", "string"),
    extParam("filePaths", "stringArray"),
    extParam("timeoutMs", "number"),
    extParam("waitMs", "number"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  uploadFile: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("ref", "string"),
    extParam("selector", "string"),
    extParam("locator", "locator"),
    extParam("filePath", "string"),
    extParam("filePaths", "stringArray"),
    extParam("waitMs", "number"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  downloadMedia: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("locator", "locator", true),
    extParam("attribute", "string"),
    extParam("filename", "string"),
    extParam("conflictAction", "string"),
    extParam("saveAs", "boolean"),
    extParam("waitForCompletion", "boolean"),
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number"),
    extParam("fallbackFetch", "boolean"),
    extParam("fallbackMaxBytes", "number"),
    extParam("originApproved", "boolean"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string")
  ],
  attachTarget: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("targetId", "string", true),
    extParam("originApproved", "boolean"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string"),
    extParam("reason", "string")
  ],
  detachTarget: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("targetId", "string", true),
    extParam("reason", "string")
  ],
  cdp: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("targetId", "string"),
    extParam("method", "string", true),
    extParam("params", "object"),
    extParam("timeoutMs", "number"),
    extParam("originApproved", "boolean"),
    extParam("confirmed", "boolean"),
    extParam("confirmationId", "string"),
    extParam("reason", "string")
  ],
  listTabs: [
    extParam("sessionId", "string"),
    extParam("controlledOnly", "boolean"),
    extParam("currentWindow", "boolean")
  ],
  getTab: [...EXTENSION_SESSION_TAB_PARAMS],
  listDownloads: [...EXTENSION_DOWNLOAD_PARAMS],
  waitForDownload: [
    ...EXTENSION_DOWNLOAD_PARAMS,
    extParam("timeoutMs", "number"),
    extParam("pollMs", "number")
  ],
  getDevLogs: [
    ...EXTENSION_SESSION_TAB_PARAMS,
    extParam("level", "string"),
    extParam("levels", "stringArray"),
    extParam("filter", "string"),
    extParam("sinceSequence", "number"),
    extParam("limit", "number")
  ],
  getCapabilities: [
    extParam("scope", "string"),
    extParam("sessionId", "string"),
    extParam("tabId", "number")
  ],
  closeTab: [...EXTENSION_SESSION_TAB_PARAMS],
  finalizeSession: [
    extParam("sessionId", "string", true),
    extParam("keepTabIds", "numberArray"),
    extParam("handoffTabIds", "numberArray"),
    extParam("deliverableTabIds", "numberArray"),
    extParam("turnId", "string"),
    extParam("closeRest", "boolean")
  ],
  endTurn: [
    extParam("sessionId", "string", true),
    extParam("turnId", "string", true)
  ],
  stopSession: [
    extParam("sessionId", "string", true),
    extParam("closeTabs", "boolean")
  ]
};

const EXTENSION_BASE_KEYS = [
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "Insert",
  "Space",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Pause",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "ContextMenu",
  ...Array.from({ length: 12 }, (_value, index) => `F${index + 1}`),
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."0123456789".split(""),
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/"
];
const EXTENSION_KEY_ALIASES = [
  "Esc",
  "Del",
  "Spacebar",
  "Left",
  "Right",
  "Up",
  "Down",
  "PgUp",
  "PgDown",
  "Return",
  "Apps",
  "Menu"
];
const EXTENSION_MODIFIER_KEYS = ["Alt", "Control", "ControlOrMeta", "Meta", "Shift"];
const EXTENSION_MODIFIER_ALIASES = ["Ctrl", "Cmd", "Command", "Option"];
const EXTENSION_PRESS_KEY_BASES = [...EXTENSION_BASE_KEYS, ...EXTENSION_KEY_ALIASES];
const EXTENSION_PRESS_KEY_MODIFIERS = [...EXTENSION_MODIFIER_KEYS, ...EXTENSION_MODIFIER_ALIASES];
const EXTENSION_SUPPORTED_KEYS = [
  ...EXTENSION_PRESS_KEY_BASES,
  ...EXTENSION_PRESS_KEY_MODIFIERS,
  ...EXTENSION_PRESS_KEY_MODIFIERS.flatMap((modifier) =>
    EXTENSION_PRESS_KEY_BASES.map((key) => `${modifier}+${key}`)
  ),
  ...EXTENSION_PRESS_KEY_MODIFIERS.flatMap((first, firstIndex) =>
    EXTENSION_PRESS_KEY_MODIFIERS.slice(firstIndex + 1).flatMap((second) =>
      EXTENSION_PRESS_KEY_BASES.map((key) => `${first}+${second}+${key}`)
    )
  )
];

const EXTENSION_ACTION_PARAM_ENUMS: Record<string, Record<string, string[]>> = {
  updatePolicy: {
    decision: ["allow", "always_allow", "deny"]
  },
  waitForLoadState: {
    state: ["commit", "load", "domcontentloaded", "networkidle"]
  },
  waitForUrl: {
    waitUntil: ["commit", "load", "domcontentloaded", "networkidle"]
  },
  waitForSelector: {
    state: ["attached", "visible", "hidden", "detached"]
  },
  waitForText: {
    state: ["present", "hidden"]
  },
  locatorQuery: {
    kind: [
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
    ]
  },
  locatorAction: {
    kind: [
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
    ]
  },
  locatorWait: {
    state: ["attached", "visible", "hidden", "detached"]
  },
  click: {
    button: ["left", "middle", "right", "back", "forward"]
  },
  drag: {
    button: ["left", "middle", "right", "back", "forward"]
  },
  evaluate: {
    mode: ["read", "write"]
  },
  pressKey: {
    key: EXTENSION_SUPPORTED_KEYS
  },
  screenshot: {
    format: ["png", "jpeg"]
  },
  getCapabilities: {
    scope: ["browser", "tab"]
  },
  listDownloads: {
    state: ["in_progress", "interrupted", "complete"]
  },
  waitForDownload: {
    state: ["in_progress", "interrupted", "complete", "any"]
  }
};

const EXTENSION_LOCATOR_PARAM_SPECS = [
  extParam("kind", "string", true),
  extParam("selector", "string"),
  extParam("text", "string"),
  extParam("role", "string"),
  extParam("name", "string"),
  extParam("testId", "string"),
  extParam("frameSelectors", "stringArray"),
  extParam("and", "locator"),
  extParam("or", "locator"),
  extParam("has", "locator"),
  extParam("hasNot", "locator"),
  extParam("hasText", "string"),
  extParam("hasNotText", "string"),
  extParam("visible", "boolean"),
  extParam("exact", "boolean"),
  extParam("index", "number"),
  extParam("strict", "boolean")
];

function validateExtensionActionParams(action: string, params: unknown) {
  const specs = EXTENSION_ACTION_PARAM_SPECS[action];

  if (!specs) {
    throw new Error(`Unknown action: ${action}`);
  }

  if (!isExtensionPlainObject(params)) {
    throw new Error(`${action}.params must be an object`);
  }

  validateExtensionParamSpecs(action, `${action}.params`, params, specs);
  validateExtensionParamEnums(
    `${action}.params`,
    params,
    EXTENSION_ACTION_PARAM_ENUMS[action] || {}
  );
}

function validateExtensionParamSpecs(
  action: string,
  path: string,
  params: Record<string, unknown>,
  specs: ExtensionParamSpec[]
) {
  for (const key of Object.keys(params)) {
    if (!specs.some((spec) => spec.name === key)) {
      throw new Error(`${path}.${key} is not allowed`);
    }
  }

  for (const spec of specs) {
    const value = params[spec.name];

    if (value === undefined) {
      if (spec.required) {
        throw new Error(`${path}.${spec.name} is required`);
      }

      continue;
    }

    validateExtensionParamKind(action, `${path}.${spec.name}`, spec.kind, value);
  }
}

function validateExtensionParamKind(
  action: string,
  path: string,
  kind: ExtensionParamKind,
  value: unknown
) {
  if (kind === "string") {
    if (typeof value !== "string") {
      throw new Error(`${path} must be a string`);
    }
    return;
  }

  if (kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${path} must be a finite number`);
    }
    return;
  }

  if (kind === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${path} must be a boolean`);
    }
    return;
  }

  if (kind === "object") {
    if (!isExtensionPlainObject(value)) {
      throw new Error(`${path} must be an object`);
    }
    return;
  }

  if (kind === "numberArray") {
    validateExtensionNumberArray(path, value);
    return;
  }

  if (kind === "stringArray") {
    validateExtensionStringArray(path, value);
    return;
  }

  if (kind === "objectArray") {
    validateExtensionObjectArray(path, value);
    return;
  }

  validateExtensionLocator(action, path, value);
}

function validateExtensionLocator(action: string, path: string, value: unknown) {
  if (!isExtensionPlainObject(value)) {
    throw new Error(`${path} must be an object`);
  }

  validateExtensionParamSpecs(
    action,
    path,
    value,
    EXTENSION_LOCATOR_PARAM_SPECS
  );
  validateExtensionParamEnums(path, value, {
    kind: ["css", "text", "role", "label", "placeholder", "testId"]
  });
}

function validateExtensionNumberArray(path: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "number" || !Number.isFinite(value[index])) {
      throw new Error(`${path}[${index}] must be a finite number`);
    }
  }
}

function validateExtensionStringArray(path: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      throw new Error(`${path}[${index}] must be a string`);
    }
  }
}

function validateExtensionObjectArray(path: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!isExtensionPlainObject(value[index])) {
      throw new Error(`${path}[${index}] must be an object`);
    }
  }
}

function validateExtensionParamEnums(
  path: string,
  params: Record<string, unknown>,
  enums: Record<string, string[]>
) {
  for (const [key, allowed] of Object.entries(enums)) {
    const value = params[key];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== "string") {
      continue;
    }

    if (!allowed.includes(value)) {
      throw new Error(`${path}.${key} must be one of: ${allowed.join(", ")}`);
    }
  }
}

function isExtensionPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
