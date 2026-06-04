type CdpCommandParams = Record<string, any>;

type CdpCommandOptions = {
  timeoutMs?: number;
};

class CdpCommandTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for CDP command ${method}`);
    this.name = "CdpCommandTimeoutError";
  }
}

class DebuggerManager {
  private readonly cdpVersion: string;
  private readonly defaultTimeoutMs: number;
  private readonly attachedTabs = new Set<number>();
  private readonly attachLocks = new Map<number, Promise<void>>();

  constructor(options: { cdpVersion: string; defaultTimeoutMs?: number }) {
    this.cdpVersion = options.cdpVersion;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;
  }

  listAttachedTabs(): number[] {
    return Array.from(this.attachedTabs);
  }

  markDetached(source: chrome.debugger.Debuggee): void {
    if (typeof source.tabId === "number") {
      this.attachedTabs.delete(source.tabId);
      this.attachLocks.delete(source.tabId);
    }
  }

  markTabRemoved(tabId: number): void {
    this.attachedTabs.delete(tabId);
    this.attachLocks.delete(tabId);
  }

  async attachTab(tabId: number): Promise<void> {
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
    } finally {
      if (this.attachLocks.get(tabId) === attachPromise) {
        this.attachLocks.delete(tabId);
      }
    }
  }

  async detachTab(tabId: number): Promise<void> {
    assertIntegerTabId(tabId);

    try {
      if (this.attachedTabs.has(tabId)) {
        await chrome.debugger.detach({ tabId });
      }
    } finally {
      this.attachedTabs.delete(tabId);
      this.attachLocks.delete(tabId);
    }
  }

  async detachTabs(tabIds: Iterable<number>): Promise<void> {
    for (const tabId of tabIds) {
      try {
        await this.detachTab(tabId);
      } catch {
        // Best-effort cleanup should continue across all managed tabs.
      }
    }
  }

  async send(
    tabId: number,
    method: string,
    commandParams: CdpCommandParams = {},
    options: CdpCommandOptions = {}
  ): Promise<any> {
    assertIntegerTabId(tabId);
    const commandName = requireCdpMethod(method);
    await this.attachTab(tabId);

    try {
      return await withTimeout(
        chrome.debugger.sendCommand({ tabId }, commandName, commandParams),
        commandName,
        options.timeoutMs ?? this.defaultTimeoutMs
      );
    } catch (error) {
      if (error instanceof CdpCommandTimeoutError) {
        await this.forceDetachTab(tabId);
      }

      throw error;
    }
  }

  private async forceDetachTab(tabId: number): Promise<void> {
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // A timed-out CDP command can leave Chrome and our local bookkeeping out of
      // sync. Detach is best-effort here; always clear local state so the next
      // attach starts from a clean lock.
    } finally {
      this.attachedTabs.delete(tabId);
      this.attachLocks.delete(tabId);
    }
  }

  private async attachTabUnlocked(tabId: number): Promise<void> {
    await chrome.debugger.attach({ tabId }, this.cdpVersion);

    try {
      await this.sendEnabledCommand(tabId, "Page.enable");
      await this.sendEnabledCommand(tabId, "Runtime.enable");
      await this.sendEnabledCommand(tabId, "DOM.enable");
      try {
        await this.sendEnabledCommand(tabId, "Log.enable");
      } catch {
        // Log domain is useful for dev logs but should not block control.
      }
      this.attachedTabs.add(tabId);
    } catch (error) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch {
        // Ignore detach failures after a partial attach.
      }

      this.attachedTabs.delete(tabId);
      throw error;
    }
  }

  private async sendEnabledCommand(tabId: number, method: string): Promise<void> {
    await withTimeout(
      chrome.debugger.sendCommand({ tabId }, method),
      method,
      this.defaultTimeoutMs
    );
  }
}

function assertIntegerTabId(tabId: number): void {
  if (!Number.isInteger(tabId)) {
    throw new Error("CDP command requires an integer tabId");
  }
}

function requireCdpMethod(method: string): string {
  if (typeof method !== "string" || !method.trim()) {
    throw new Error("CDP command requires a non-empty method");
  }

  return method.trim();
}

function withTimeout<T>(
  promise: Promise<T>,
  method: string,
  timeoutMs: number
): Promise<T> {
  const boundedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CdpCommandTimeoutError(method, boundedTimeoutMs));
    }, boundedTimeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
