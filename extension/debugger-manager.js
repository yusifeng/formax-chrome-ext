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
    async send(tabId, method, commandParams = {}, options = {}) {
        assertIntegerTabId(tabId);
        const commandName = requireCdpMethod(method);
        await this.attachTab(tabId);
        try {
            return await withTimeout(chrome.debugger.sendCommand({ tabId }, commandName, commandParams), commandName, options.timeoutMs ?? this.defaultTimeoutMs);
        }
        catch (error) {
            if (error instanceof CdpCommandTimeoutError) {
                this.attachedTabs.delete(tabId);
            }
            throw error;
        }
    }
    async attachTabUnlocked(tabId) {
        await chrome.debugger.attach({ tabId }, this.cdpVersion);
        try {
            await this.sendEnabledCommand(tabId, "Page.enable");
            await this.sendEnabledCommand(tabId, "Runtime.enable");
            await this.sendEnabledCommand(tabId, "DOM.enable");
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
