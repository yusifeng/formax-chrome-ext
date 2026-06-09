const statusEl = document.querySelector("#status");
const statusLabelEl = document.querySelector("#status-label");
const refreshButtonEl = document.querySelector("#refresh");
const versionEl = document.querySelector("#version");
const approvalCountEl = document.querySelector("#approval-count");
const approvalListEl = document.querySelector("#approval-list");
function setStatus(state, label) {
    statusEl.dataset.state = state;
    statusLabelEl.textContent = label;
}
function setVersion(version) {
    const manifestVersion = chrome.runtime.getManifest().version;
    versionEl.textContent = `Version v${version || manifestVersion}`;
}
async function checkHealth() {
    setStatus("checking", "Checking...");
    refreshButtonEl.disabled = true;
    try {
        const response = await chrome.runtime.sendMessage({
            type: "POPUP_HEALTH"
        });
        setStatus(response?.ok ? "connected" : "disconnected", response?.ok ? "Connected" : "Disconnected");
        setVersion(response?.health?.version);
    }
    catch (error) {
        setStatus("error", "Error");
        setVersion();
    }
    finally {
        refreshButtonEl.disabled = false;
    }
    await loadApprovals();
}
async function loadApprovals() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: "POPUP_PENDING_APPROVALS",
            limit: 5
        });
        const approvals = Array.isArray(response?.approvals)
            ? response.approvals.filter(isPopupApproval)
            : [];
        renderApprovals(approvals);
    }
    catch (error) {
        renderApprovalError("Unable to load pending approvals.");
    }
}
function renderApprovals(approvals) {
    approvalCountEl.textContent = String(approvals.length);
    approvalListEl.textContent = "";
    if (approvals.length === 0) {
        const empty = document.createElement("p");
        empty.className = "approval-empty";
        empty.textContent = "No pending approvals.";
        approvalListEl.appendChild(empty);
        return;
    }
    for (const approval of approvals) {
        approvalListEl.appendChild(approvalCard(approval));
    }
}
function renderApprovalError(message) {
    approvalCountEl.textContent = "!";
    approvalListEl.textContent = "";
    const error = document.createElement("p");
    error.className = "approval-empty";
    error.textContent = message;
    approvalListEl.appendChild(error);
}
function approvalCard(approval) {
    const item = document.createElement("article");
    item.className = "approval-item";
    const meta = document.createElement("div");
    meta.className = "approval-meta";
    for (const label of approvalLabels(approval)) {
        const chip = document.createElement("span");
        chip.className = "approval-chip";
        chip.textContent = label;
        meta.appendChild(chip);
    }
    const message = document.createElement("p");
    message.className = "approval-message";
    message.textContent = approval.message || "Browser approval is required.";
    const details = approvalDetailsList(approval);
    const actions = document.createElement("div");
    actions.className = "approval-actions";
    for (const button of approvalActionButtons(approval)) {
        actions.appendChild(button);
    }
    item.append(meta, message);
    if (details) {
        item.appendChild(details);
    }
    item.appendChild(actions);
    return item;
}
function approvalDetailsList(approval) {
    const details = approvalDetails(approval);
    if (!details.length) {
        return null;
    }
    const list = document.createElement("dl");
    list.className = "approval-details";
    for (const detail of details) {
        const term = document.createElement("dt");
        term.textContent = detail.label;
        const value = document.createElement("dd");
        value.textContent = detail.value;
        list.append(term, value);
    }
    return list;
}
function approvalDetails(approval) {
    const details = [];
    if (approval.reasons?.length) {
        details.push({ label: "Reasons", value: approval.reasons.join(", ") });
    }
    const subject = approvalSubjectSummary(approval.subject);
    if (subject) {
        details.push({ label: "Subject", value: subject });
    }
    const target = approval.target;
    if (target) {
        const targetParts = [
            target.tagName ? `<${target.tagName}>` : null,
            target.label ? `label "${target.label}"` : null,
            target.text ? `text "${target.text}"` : null
        ].filter((part) => Boolean(part));
        if (targetParts.length) {
            details.push({ label: "Target", value: targetParts.join(" · ") });
        }
    }
    const retryHints = approvalRetryHints(approval);
    if (retryHints.length) {
        details.push({ label: "Retry with", value: retryHints.join(", ") });
    }
    return details;
}
function approvalSubjectSummary(subject) {
    if (!subject) {
        return null;
    }
    if (subject.kind === "rawCdp") {
        const parts = [
            typeof subject.method === "string" ? `method ${subject.method}` : null,
            typeof subject.targetId === "string" ? `target ${subject.targetId}` : null
        ].filter((part) => Boolean(part));
        return parts.length ? parts.join(" · ") : "raw CDP";
    }
    if (subject.kind === "download") {
        const parts = [
            typeof subject.attribute === "string" ? `attribute ${subject.attribute}` : null,
            typeof subject.filename === "string" ? `filename ${subject.filename}` : null,
            typeof subject.url === "string" ? `url ${subject.url}` : null,
            typeof subject.finalUrl === "string" ? `final URL ${subject.finalUrl}` : null,
            approvalLocatorSummary(subject.locator)
        ].filter((part) => Boolean(part));
        return parts.length ? parts.join(" · ") : "page asset download";
    }
    return null;
}
function approvalLocatorSummary(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const locator = value;
    const parts = [
        typeof locator.kind === "string" ? locator.kind : null,
        typeof locator.selector === "string" ? locator.selector : null,
        typeof locator.text === "string" ? `text "${locator.text}"` : null,
        typeof locator.role === "string" ? `role ${locator.role}` : null
    ].filter((part) => Boolean(part));
    return parts.length ? `locator ${parts.join(" ")}` : null;
}
function approvalRetryHints(approval) {
    const requiredParams = approval.requiredParams;
    if (!requiredParams) {
        return [];
    }
    const hints = [];
    if (requiredParams.confirmed === true) {
        hints.push("confirmed=true");
    }
    if (requiredParams.originApproved === true) {
        hints.push("originApproved=true");
    }
    return hints;
}
function approvalActionButtons(approval) {
    if (approval.kind !== "host") {
        return [
            approvalButton(approval, "approve", "Approve"),
            approvalButton(approval, "deny", "Deny")
        ];
    }
    const buttons = [
        approvalButton(approval, "deny", "Deny", "deny")
    ];
    const allowForSession = approval.suggestedDecisions?.allowForSession;
    if (allowForSession) {
        buttons.push(approvalButton(approval, "approve", "Allow session", hostPolicyDecision(allowForSession, "allow")));
    }
    buttons.push(approvalButton(approval, "approve", "Always allow", hostPolicyDecision(approval.suggestedDecisions?.alwaysAllow, "always_allow")));
    return buttons;
}
function approvalButton(approval, decision, label, policyDecision) {
    const button = document.createElement("button");
    button.className = "approval-button";
    button.type = "button";
    button.dataset.decision = decision;
    button.textContent = label;
    button.addEventListener("click", async () => {
        await resolveApprovalFromPopup(approval, decision, policyDecision);
    });
    return button;
}
async function resolveApprovalFromPopup(approval, decision, policyDecision) {
    setApprovalButtonsDisabled(true);
    try {
        await chrome.runtime.sendMessage({
            type: "POPUP_RESOLVE_APPROVAL",
            approvalId: approval.approvalId,
            decision,
            ...(approval.kind === "host" && policyDecision
                ? { policyDecision }
                : {})
        });
        await loadApprovals();
    }
    catch (error) {
        renderApprovalError("Unable to resolve approval.");
    }
    finally {
        setApprovalButtonsDisabled(false);
    }
}
function setApprovalButtonsDisabled(disabled) {
    for (const button of Array.from(approvalListEl.querySelectorAll("button"))) {
        button.disabled = disabled;
    }
}
function approvalLabels(approval) {
    const labels = [
        approval.kind || "approval",
        approval.action,
        approval.host || undefined,
        ...(Array.isArray(approval.reasons) ? approval.reasons.slice(0, 2) : [])
    ];
    return labels.filter((label) => Boolean(label));
}
function hostPolicyDecision(suggestedDecision, fallback) {
    return typeof suggestedDecision?.decision === "string" ? suggestedDecision.decision : fallback;
}
function isPopupApproval(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    return typeof value.approvalId === "string";
}
refreshButtonEl.addEventListener("click", checkHealth);
setVersion();
void checkHealth();
