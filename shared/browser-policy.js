const KEY_MAP = {
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
    ControlOrMeta: { key: "Control", code: "ControlLeft", keyCode: 17 },
    Meta: { key: "Meta", code: "MetaLeft", keyCode: 91 },
    Shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 }
};
const destructivePattern = /\b(delete|remove|destroy|cancel|close\s+account|deactivate|terminate|drop)\b/i;
const sideEffectPattern = /\b(send|submit|post|publish|comment|reply|create|book|schedule|invite|save|update|confirm|pay|purchase|subscribe|unsubscribe)\b/i;
const mutatingEvaluatePattern = /\b(click|submit|remove|setAttribute|removeAttribute|appendChild|insertBefore|replaceChild|dispatchEvent|localStorage|sessionStorage|indexedDB|cookie\s*=)\b|\.value\s*=|\.checked\s*=|\.textContent\s*=|\.innerHTML\s*=/i;
const secretPatterns = [
    [/\b(token|access_token|refresh_token|secret)\s*=\s*([^\s&]+)/gi, "$1=[redacted]"],
    [/\b(password|passwd|pwd)\s*:\s*([^\s]+)/gi, "$1: [redacted]"],
    [/\b(api[_-]?key)\s*=\s*"([^"]*)"/gi, "$1=\"[redacted]\""],
    [/\b(api[_-]?key)\s*=\s*(?!")([^\s&]+)/gi, "$1=[redacted]"],
    [/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]"]
];
const sensitiveUrlParamPattern = /(^|[_-])(token|access|refresh|secret|password|passwd|pwd|key|api[_-]?key|auth|session|sid|code|credential)([_-]|$)/i;
export function createDefaultBrowserPolicyState() {
    return {
        sessionAllowedHosts: {},
        persistentAllowedHosts: [],
        blockedHosts: []
    };
}
export function assertAllowedNavigationUrl(url) {
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
export function evaluateHostAccess(state, check) {
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
export function assertHostAccessAllowed(state, check) {
    const verdict = evaluateHostAccess(state, check);
    if (!verdict.allowed) {
        throw new Error(verdict.message);
    }
}
export function applyHostAccessDecision(state, args) {
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
export function classifyBrowserAction(input) {
    const action = input.action;
    const label = input.label ?? "";
    const text = input.text ?? "";
    const reasons = new Set();
    const script = input.script ?? "";
    const readOnly = action === "evaluate" &&
        input.mode !== "write" &&
        !mutatingEvaluatePattern.test(script);
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
    if (input.sensitive === true && (action === "type" || action === "upload")) {
        reasons.add("sensitive_input");
    }
    if (destructivePattern.test(label) || destructivePattern.test(text)) {
        reasons.add("destructive_action");
    }
    else if (sideEffectPattern.test(label) || sideEffectPattern.test(text)) {
        reasons.add("external_side_effect");
    }
    if (action === "permission") {
        reasons.add("browser_permission");
    }
    if (action === "rawCdp") {
        reasons.add("raw_cdp");
    }
    if (action === "evaluate" && !readOnly) {
        reasons.add("mutating_evaluate");
    }
    return {
        action,
        host: normalizePolicyHost(input.url),
        readOnly,
        requiresConfirmation: reasons.size > 0,
        requiresOriginApproval: action === "rawCdp",
        reasons: Array.from(reasons)
    };
}
export function normalizeKey(key) {
    const baseKey = key.split("+").map((part) => part.trim()).filter(Boolean).at(-1) ?? key;
    const normalized = KEY_MAP[baseKey];
    if (!normalized) {
        throw new Error(`Unsupported key: ${key}`);
    }
    return normalized;
}
export function redactPasswordValue(inputType, value) {
    return inputType.toLowerCase() === "password" ? "[password field]" : value;
}
export function redactSecretPatterns(value) {
    let result = value;
    for (const [pattern, replacement] of secretPatterns) {
        result = result.replace(pattern, replacement);
    }
    return result;
}
export function redactSensitiveUrl(value) {
    const reasons = new Set();
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
    }
    catch {
        const redacted = redactSecretPatterns(value);
        return {
            url: redacted,
            redacted: redacted !== value,
            reasons: redacted !== value ? ["secret_pattern"] : []
        };
    }
}
export function normalizePolicyHost(value) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }
    const trimmed = value.trim();
    let parsed = null;
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
function normalizeOptionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function hostSetHas(hosts, host) {
    return hosts.some((candidate) => candidate === host || host.endsWith(`.${candidate}`));
}
function addHost(hosts, host) {
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
