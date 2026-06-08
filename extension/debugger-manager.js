class CdpCommandTimeoutError extends Error {
    constructor(method, timeoutMs) {
        super(`Timed out after ${timeoutMs}ms waiting for CDP command ${method}`);
        this.name = "CdpCommandTimeoutError";
    }
}
class DebuggerManager {
    cdpVersion;
    defaultTimeoutMs;
    attachedTabs = new Set();
    attachLocks = new Map();
    attachedTargets = new Set();
    targetAttachLocks = new Map();
    constructor(options) {
        this.cdpVersion = options.cdpVersion;
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;
    }
    listAttachedTabs() {
        return Array.from(this.attachedTabs);
    }
    markDetached(source) {
        if (typeof source.tabId === "number") {
            this.attachedTabs.delete(source.tabId);
            this.attachLocks.delete(source.tabId);
        }
        if (typeof source.targetId === "string" && source.targetId) {
            this.attachedTargets.delete(source.targetId);
            this.targetAttachLocks.delete(source.targetId);
        }
    }
    markTabRemoved(tabId) {
        this.attachedTabs.delete(tabId);
        this.attachLocks.delete(tabId);
    }
    async attachTab(tabId) {
        assertIntegerTabId(tabId);
        if (this.attachedTabs.has(tabId)) {
            return;
        }
        const pending = this.attachLocks.get(tabId);
        if (pending) {
            await pending;
            return;
        }
        const attachPromise = this.attachTabUnlocked(tabId);
        this.attachLocks.set(tabId, attachPromise);
        try {
            await attachPromise;
        }
        finally {
            if (this.attachLocks.get(tabId) === attachPromise) {
                this.attachLocks.delete(tabId);
            }
        }
    }
    async detachTab(tabId) {
        assertIntegerTabId(tabId);
        try {
            if (this.attachedTabs.has(tabId)) {
                await chrome.debugger.detach({ tabId });
            }
        }
        finally {
            this.attachedTabs.delete(tabId);
            this.attachLocks.delete(tabId);
        }
    }
    async detachTabs(tabIds) {
        for (const tabId of tabIds) {
            try {
                await this.detachTab(tabId);
            }
            catch {
                // Best-effort cleanup should continue across all managed tabs.
            }
        }
    }
    async attachTarget(targetId) {
        const normalizedTargetId = requireTargetId(targetId);
        if (this.attachedTargets.has(normalizedTargetId)) {
            return;
        }
        const pending = this.targetAttachLocks.get(normalizedTargetId);
        if (pending) {
            await pending;
            return;
        }
        const attachPromise = this.attachTargetUnlocked(normalizedTargetId);
        this.targetAttachLocks.set(normalizedTargetId, attachPromise);
        try {
            await attachPromise;
        }
        finally {
            if (this.targetAttachLocks.get(normalizedTargetId) === attachPromise) {
                this.targetAttachLocks.delete(normalizedTargetId);
            }
        }
    }
    async detachTarget(targetId) {
        const normalizedTargetId = requireTargetId(targetId);
        try {
            if (this.attachedTargets.has(normalizedTargetId)) {
                await chrome.debugger.detach({ targetId: normalizedTargetId });
            }
        }
        finally {
            this.attachedTargets.delete(normalizedTargetId);
            this.targetAttachLocks.delete(normalizedTargetId);
        }
    }
    async send(tabId, method, commandParams = {}, options = {}) {
        assertIntegerTabId(tabId);
        const commandName = requireCdpMethod(method);
        await this.attachTab(tabId);
        try {
            return await withTimeout(chrome.debugger.sendCommand({ tabId }, commandName, commandParams), commandName, options.timeoutMs ?? this.defaultTimeoutMs);
        }
        catch (error) {
            if (error instanceof CdpCommandTimeoutError) {
                await this.forceDetachTab(tabId);
            }
            throw error;
        }
    }
    async sendToTarget(targetId, method, commandParams = {}, options = {}) {
        const normalizedTargetId = requireTargetId(targetId);
        const commandName = requireCdpMethod(method);
        await this.attachTarget(normalizedTargetId);
        try {
            return await withTimeout(chrome.debugger.sendCommand({ targetId: normalizedTargetId }, commandName, commandParams), commandName, options.timeoutMs ?? this.defaultTimeoutMs);
        }
        catch (error) {
            if (error instanceof CdpCommandTimeoutError) {
                await this.forceDetachTarget(normalizedTargetId);
            }
            throw error;
        }
    }
    async forceDetachTab(tabId) {
        try {
            await chrome.debugger.detach({ tabId });
        }
        catch {
            // A timed-out CDP command can leave Chrome and our local bookkeeping out of
            // sync. Detach is best-effort here; always clear local state so the next
            // attach starts from a clean lock.
        }
        finally {
            this.attachedTabs.delete(tabId);
            this.attachLocks.delete(tabId);
        }
    }
    async forceDetachTarget(targetId) {
        try {
            await chrome.debugger.detach({ targetId });
        }
        catch {
            // See tab-level timeout cleanup above. Always clear local target state so
            // the next attach starts from a clean slate.
        }
        finally {
            this.attachedTargets.delete(targetId);
            this.targetAttachLocks.delete(targetId);
        }
    }
    async attachTabUnlocked(tabId) {
        await chrome.debugger.attach({ tabId }, this.cdpVersion);
        try {
            await this.sendEnabledCommand(tabId, "Page.enable");
            await this.sendEnabledCommand(tabId, "Runtime.enable");
            await this.sendEnabledCommand(tabId, "DOM.enable");
            await this.sendEnabledCommand(tabId, "Network.enable");
            try {
                await this.sendEnabledCommand(tabId, "Log.enable");
            }
            catch {
                // Log domain is useful for dev logs but should not block control.
            }
            this.attachedTabs.add(tabId);
        }
        catch (error) {
            try {
                await chrome.debugger.detach({ tabId });
            }
            catch {
                // Ignore detach failures after a partial attach.
            }
            this.attachedTabs.delete(tabId);
            throw error;
        }
    }
    async attachTargetUnlocked(targetId) {
        await chrome.debugger.attach({ targetId }, this.cdpVersion);
        this.attachedTargets.add(targetId);
    }
    async sendEnabledCommand(tabId, method) {
        await withTimeout(chrome.debugger.sendCommand({ tabId }, method), method, this.defaultTimeoutMs);
    }
}
function assertIntegerTabId(tabId) {
    if (!Number.isInteger(tabId)) {
        throw new Error("CDP command requires an integer tabId");
    }
}
function requireCdpMethod(method) {
    if (typeof method !== "string" || !method.trim()) {
        throw new Error("CDP command requires a non-empty method");
    }
    return method.trim();
}
function requireTargetId(targetId) {
    if (typeof targetId !== "string" || !targetId.trim()) {
        throw new Error("CDP target command requires a non-empty targetId");
    }
    return targetId.trim();
}
function withTimeout(promise, method, timeoutMs) {
    const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new CdpCommandTimeoutError(method, boundedTimeoutMs));
        }, boundedTimeoutMs);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
