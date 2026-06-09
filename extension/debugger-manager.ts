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
  private readonly attachedTargets = new Set<string>();
  private readonly targetAttachLocks = new Map<string, Promise<void>>();
  private readonly tabCommandLocks = new Map<number, Promise<void>>();
  private readonly targetCommandLocks = new Map<string, Promise<void>>();

  constructor(options: { cdpVersion: string; defaultTimeoutMs?: number }) {
    this.cdpVersion = options.cdpVersion;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;
  }

  listAttachedTabs(): number[] {
    return Array.from(this.attachedTabs);
  }

  listAttachedTargets(): string[] {
    return Array.from(this.attachedTargets);
  }

  markDetached(source: chrome.debugger.Debuggee): void {
    if (typeof source.tabId === "number") {
      this.attachedTabs.delete(source.tabId);
      this.attachLocks.delete(source.tabId);
    }

    if (typeof source.targetId === "string" && source.targetId) {
      this.attachedTargets.delete(source.targetId);
      this.targetAttachLocks.delete(source.targetId);
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

    return this.enqueueTabCommand(tabId, () => this.detachTabUnlocked(tabId));
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

  async attachTarget(targetId: string): Promise<void> {
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
    } finally {
      if (this.targetAttachLocks.get(normalizedTargetId) === attachPromise) {
        this.targetAttachLocks.delete(normalizedTargetId);
      }
    }
  }

  async detachTarget(targetId: string): Promise<void> {
    const normalizedTargetId = requireTargetId(targetId);

    return this.enqueueTargetCommand(normalizedTargetId, () =>
      this.detachTargetUnlocked(normalizedTargetId)
    );
  }

  async send(
    tabId: number,
    method: string,
    commandParams: CdpCommandParams = {},
    options: CdpCommandOptions = {}
  ): Promise<any> {
    assertIntegerTabId(tabId);
    const commandName = requireCdpMethod(method);
    return this.enqueueTabCommand(tabId, async () => {
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
    });
  }

  async sendToTarget(
    targetId: string,
    method: string,
    commandParams: CdpCommandParams = {},
    options: CdpCommandOptions = {}
  ): Promise<any> {
    const normalizedTargetId = requireTargetId(targetId);
    const commandName = requireCdpMethod(method);
    return this.enqueueTargetCommand(normalizedTargetId, async () => {
      await this.attachTarget(normalizedTargetId);

      try {
        return await withTimeout(
          chrome.debugger.sendCommand(
            { targetId: normalizedTargetId },
            commandName,
            commandParams
          ),
          commandName,
          options.timeoutMs ?? this.defaultTimeoutMs
        );
      } catch (error) {
        if (error instanceof CdpCommandTimeoutError) {
          await this.forceDetachTarget(normalizedTargetId);
        }

        throw error;
      }
    });
  }

  private enqueueTabCommand<T>(tabId: number, work: () => Promise<T>): Promise<T> {
    return this.enqueueCommand(this.tabCommandLocks, tabId, work);
  }

  private enqueueTargetCommand<T>(targetId: string, work: () => Promise<T>): Promise<T> {
    return this.enqueueCommand(this.targetCommandLocks, targetId, work);
  }

  private async enqueueCommand<Key, Result>(
    locks: Map<Key, Promise<void>>,
    key: Key,
    work: () => Promise<Result>
  ): Promise<Result> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.catch(() => undefined).then(() => current);
    locks.set(key, next);

    await previous.catch(() => undefined);

    try {
      return await work();
    } finally {
      release();
      if (locks.get(key) === next) {
        locks.delete(key);
      }
    }
  }

  private async detachTabUnlocked(tabId: number): Promise<void> {
    try {
      if (this.attachedTabs.has(tabId)) {
        await chrome.debugger.detach({ tabId });
      }
    } finally {
      this.attachedTabs.delete(tabId);
      this.attachLocks.delete(tabId);
    }
  }

  private async detachTargetUnlocked(targetId: string): Promise<void> {
    try {
      if (this.attachedTargets.has(targetId)) {
        await chrome.debugger.detach({ targetId });
      }
    } finally {
      this.attachedTargets.delete(targetId);
      this.targetAttachLocks.delete(targetId);
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

  private async forceDetachTarget(targetId: string): Promise<void> {
    try {
      await chrome.debugger.detach({ targetId });
    } catch {
      // See tab-level timeout cleanup above. Always clear local target state so
      // the next attach starts from a clean slate.
    } finally {
      this.attachedTargets.delete(targetId);
      this.targetAttachLocks.delete(targetId);
    }
  }

  private async attachTabUnlocked(tabId: number): Promise<void> {
    await chrome.debugger.attach({ tabId }, this.cdpVersion);

    try {
      await this.sendEnabledCommand(tabId, "Page.enable");
      await this.sendEnabledCommand(tabId, "Runtime.enable");
      await this.sendEnabledCommand(tabId, "DOM.enable");
      await this.sendEnabledCommand(tabId, "Network.enable");
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

  private async attachTargetUnlocked(targetId: string): Promise<void> {
    await chrome.debugger.attach({ targetId }, this.cdpVersion);
    this.attachedTargets.add(targetId);
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

function requireTargetId(targetId: string): string {
  if (typeof targetId !== "string" || !targetId.trim()) {
    throw new Error("CDP target command requires a non-empty targetId");
  }

  return targetId.trim();
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
