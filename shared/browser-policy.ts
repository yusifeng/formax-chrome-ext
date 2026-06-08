import type { BrowserKey } from "./types.js";

export type NormalizedKey = {
  key: string;
  code: string;
  keyCode: number;
};

export type BrowserPolicyAction =
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

export type HostAccessDecision = "allow" | "always_allow" | "deny";

export type BrowserPolicyState = {
  sessionAllowedHosts: Record<string, string[]>;
  persistentAllowedHosts: string[];
  blockedHosts: string[];
};

export type HostAccessCheck = {
  action: BrowserPolicyAction;
  sessionId?: string | null;
  url?: string | null;
  host?: string | null;
};

export type HostAccessVerdict = {
  allowed: boolean;
  requiresApproval: boolean;
  code: "allowed" | "requires_host_approval" | "host_blocked" | "invalid_url";
  host: string | null;
  scope: "session" | "persistent" | "blocked" | null;
  message: string;
};

export type ApplyHostAccessDecisionArgs = {
  decision: HostAccessDecision;
  sessionId?: string | null;
  url?: string | null;
  host?: string | null;
};

export type BrowserActionClassificationInput = {
  action: BrowserPolicyAction;
  url?: string | null;
  label?: string | null;
  text?: string | null;
  filePath?: string | null;
  filename?: string | null;
  method?: string | null;
  params?: unknown;
  script?: string | null;
  mode?: "read" | "write" | string;
  sensitive?: boolean;
};

export type BrowserActionClassification = {
  action: BrowserPolicyAction;
  host: string | null;
  readOnly: boolean;
  requiresConfirmation: boolean;
  requiresOriginApproval: boolean;
  reasons: string[];
};

const KEY_MAP: Record<string, NormalizedKey> = {
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
  Alt: { key: "Alt", code: "AltLeft", keyCode: 18 },
  Control: { key: "Control", code: "ControlLeft", keyCode: 17 },
  ControlOrMeta: { key: "Control", code: "ControlLeft", keyCode: 17 },
  Meta: { key: "Meta", code: "MetaLeft", keyCode: 91 },
  Shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 }
};
const KEY_ALIASES: Record<string, string> = {
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
  Menu: "ContextMenu"
};
const PRINTABLE_KEY_CODES: Record<string, { code: string; keyCode: number }> = {
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

for (let index = 1; index <= 12; index += 1) {
  KEY_MAP[`F${index}`] = {
    key: `F${index}`,
    code: `F${index}`,
    keyCode: 111 + index
  };
}

const destructivePattern = /\b(delete|remove|destroy|cancel|close\s+account|deactivate|terminate|drop)\b/i;
const sideEffectPattern = /\b(send|submit|post|publish|comment|reply|create|book|schedule|invite|save|update|confirm|pay|purchase|subscribe|unsubscribe)\b/i;
const permissionGrantPattern = /\b(allow|enable|grant|authorize|request|share|use|start|turn\s+on|access)\b/i;
const browserPermissionTargetPattern = /\b(camera|webcam|microphone|\bmic\b|location|geolocation|notification|notify|screen|display|clipboard|account\s+access|login\s+access|extension\s+install|install\s+extension)\b/i;
const mutatingEvaluatePattern = /\b(click|submit|remove|setAttribute|removeAttribute|appendChild|insertBefore|replaceChild|dispatchEvent|deleteDatabase|localStorage\s*\.\s*(setItem|removeItem|clear)|sessionStorage\s*\.\s*(setItem|removeItem|clear)|document\s*\.\s*cookie\s*=|cookie\s*=)\b|\.value\s*=|\.checked\s*=|\.textContent\s*=|\.innerHTML\s*=/i;
const sensitiveBrowserStatePattern = /\b(document\s*\.\s*cookie|cookieStore|localStorage|sessionStorage|indexedDB|chrome\s*\.\s*storage|Storage\.|Network\.get(All)?Cookies|password|passwd|pwd|credential|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?(id|token)?|csrf)\b/i;

const secretPatterns: Array<[RegExp, string]> = [
  [/\b(token|access_token|refresh_token|secret)\s*=\s*([^\s&]+)/gi, "$1=[redacted]"],
  [/\b(password|passwd|pwd)\s*:\s*([^\s]+)/gi, "$1: [redacted]"],
  [/\b(api[_-]?key)\s*=\s*"([^"]*)"/gi, "$1=\"[redacted]\""],
  [/\b(api[_-]?key)\s*=\s*(?!")([^\s&]+)/gi, "$1=[redacted]"],
  [/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]"]
];
const sensitiveUrlParamPattern = /(^|[_-])(token|access|refresh|secret|password|passwd|pwd|key|api[_-]?key|auth|session|sid|code|credential)([_-]|$)/i;

export function createDefaultBrowserPolicyState(): BrowserPolicyState {
  return {
    sessionAllowedHosts: {},
    persistentAllowedHosts: [],
    blockedHosts: []
  };
}

export function assertAllowedNavigationUrl(url: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only http/https URLs are allowed in MVP: ${url}`);
  }
}

export function evaluateHostAccess(
  state: BrowserPolicyState,
  check: HostAccessCheck
): HostAccessVerdict {
  const host = normalizePolicyHost(check.host ?? check.url);

  if (!host) {
    return {
      allowed: false,
      requiresApproval: false,
      code: "invalid_url",
      host: null,
      scope: null,
      message: "A valid http/https URL or host is required for browser host policy checks."
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

  const sessionId = normalizeOptionalString(check.sessionId);
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

export function assertHostAccessAllowed(
  state: BrowserPolicyState,
  check: HostAccessCheck
): void {
  const verdict = evaluateHostAccess(state, check);

  if (!verdict.allowed) {
    throw new Error(verdict.message);
  }
}

export function applyHostAccessDecision(
  state: BrowserPolicyState,
  args: ApplyHostAccessDecisionArgs
): BrowserPolicyState {
  const host = normalizePolicyHost(args.host ?? args.url);
  if (!host) {
    throw new Error("Host access policy updates require a valid http/https host or URL.");
  }

  removeHostFromPolicy(state, host);

  if (args.decision === "deny") {
    state.blockedHosts = addHost(state.blockedHosts, host);
    return state;
  }

  if (args.decision === "always_allow") {
    state.persistentAllowedHosts = addHost(state.persistentAllowedHosts, host);
    return state;
  }

  const sessionId = normalizeOptionalString(args.sessionId);
  if (!sessionId) {
    throw new Error("Per-session host allow requires a non-empty sessionId.");
  }

  state.sessionAllowedHosts[sessionId] = addHost(state.sessionAllowedHosts[sessionId] ?? [], host);
  return state;
}

export function classifyBrowserAction(
  input: BrowserActionClassificationInput
): BrowserActionClassification {
  const action = input.action;
  const label = input.label ?? "";
  const text = input.text ?? "";
  const reasons = new Set<string>();
  const script = input.script ?? "";
  const rawCdpText = action === "rawCdp" ? `${input.method ?? ""} ${stringifyPolicyParams(input.params)}` : "";
  const readOnly =
    action === "evaluate" &&
    input.mode !== "write" &&
    !mutatingEvaluatePattern.test(script);

  if (action === "upload") {
    reasons.add("file_upload");
  }

  if (action === "download" && looksLikeRunnableDownload(input.url, input.filename ?? input.filePath)) {
    reasons.add("download_run_or_install");
  }

  if (action === "history") {
    reasons.add("browser_history");
  }

  if (action === "clipboard") {
    reasons.add("clipboard");
  }

  if (input.sensitive === true && (action === "type" || action === "upload")) {
    reasons.add("sensitive_input");
  }

  if (destructivePattern.test(label) || destructivePattern.test(text)) {
    reasons.add("destructive_action");
  } else if (sideEffectPattern.test(label) || sideEffectPattern.test(text)) {
    reasons.add("external_side_effect");
  }

  if (action === "permission" || looksLikeBrowserPermissionPrompt(label, text)) {
    reasons.add("browser_permission");
  }

  if (action === "rawCdp") {
    reasons.add("raw_cdp");
  }

  if ((action === "evaluate" && sensitiveBrowserStatePattern.test(script)) ||
      (action === "rawCdp" && sensitiveBrowserStatePattern.test(rawCdpText))) {
    reasons.add("sensitive_browser_state");
  }

  if (action === "evaluate" && !readOnly) {
    reasons.add("mutating_evaluate");
  }

  return {
    action,
    host: normalizePolicyHost(input.url),
    readOnly,
    requiresConfirmation: reasons.size > 0,
    requiresOriginApproval: action === "rawCdp" || action === "download",
    reasons: Array.from(reasons)
  };
}

function looksLikeRunnableDownload(url?: string | null, filename?: string | null) {
  const source = `${filename ?? ""} ${url ?? ""}`.toLowerCase();
  return /\.(app|apk|bat|bin|cmd|com|deb|dmg|exe|msi|pkg|ps1|rpm|run|scr|sh)(?:[?#\s]|$)/i.test(source);
}

function looksLikeBrowserPermissionPrompt(label: string, text: string) {
  const source = `${label} ${text}`.trim();
  return permissionGrantPattern.test(source) && browserPermissionTargetPattern.test(source);
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

export function normalizeKey(key: string): NormalizedKey {
  const baseKey = key.split("+").map((part) => part.trim()).filter(Boolean).at(-1) ?? key;
  const normalized = KEY_MAP[canonicalKeyName(baseKey) as BrowserKey] ?? printableKey(baseKey);

  if (!normalized) {
    throw new Error(`Unsupported key: ${key}`);
  }

  return normalized;
}

function canonicalKeyName(key: string) {
  return KEY_ALIASES[key] ?? key;
}

function printableKey(key: string): NormalizedKey | null {
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

  const mapped = PRINTABLE_KEY_CODES[key];
  return mapped ? { key, ...mapped } : null;
}

export function redactPasswordValue(inputType: string, value: string): string {
  return inputType.toLowerCase() === "password" ? "[password field]" : value;
}

export function redactSecretPatterns(value: string): string {
  let result = value;

  for (const [pattern, replacement] of secretPatterns) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

export function redactSensitiveUrl(value: string): {
  url: string;
  redacted: boolean;
  reasons: string[];
} {
  const reasons = new Set<string>();

  try {
    const parsed = new URL(value);

    parsed.searchParams.forEach((_value, key) => {
      if (sensitiveUrlParamPattern.test(key)) {
        parsed.searchParams.set(key, "[redacted]");
        reasons.add("sensitive_query_param");
      }
    });

    if (parsed.hash && redactSecretPatterns(parsed.hash) !== parsed.hash) {
      parsed.hash = "#[redacted]";
      reasons.add("sensitive_fragment");
    }

    return {
      url: parsed.toString(),
      redacted: reasons.size > 0,
      reasons: Array.from(reasons)
    };
  } catch {
    const redacted = redactSecretPatterns(value);
    return {
      url: redacted,
      redacted: redacted !== value,
      reasons: redacted !== value ? ["secret_pattern"] : []
    };
  }
}

export function normalizePolicyHost(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  let parsed: URL | null = null;

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

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hostSetHas(hosts: string[], host: string) {
  return hosts.some((candidate) => candidate === host || host.endsWith(`.${candidate}`));
}

function addHost(hosts: string[], host: string) {
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
