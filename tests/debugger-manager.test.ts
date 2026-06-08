import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type DebuggerCall =
  | { name: "attach"; target: Record<string, unknown>; version: string }
  | { name: "detach"; target: Record<string, unknown> }
  | { name: "sendCommand"; target: Record<string, unknown>; method: string; params?: Record<string, unknown> };

type DebuggerManagerConstructor = new (options: {
  cdpVersion: string;
  defaultTimeoutMs?: number;
}) => {
  listAttachedTabs(): number[];
  markDetached(source: Record<string, unknown>): void;
  markTabRemoved(tabId: number): void;
  send(
    tabId: number,
    method: string,
    commandParams?: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<unknown>;
  sendToTarget(
    targetId: string,
    method: string,
    commandParams?: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<unknown>;
};

function loadDebuggerManager(options?: {
  sendCommand?: (
    target: Record<string, unknown>,
    method: string,
    params?: Record<string, unknown>
  ) => Promise<unknown>;
}) {
  const calls: DebuggerCall[] = [];
  const sendCommand = options?.sendCommand ?? (async () => ({ ok: true }));
  const source = fs.readFileSync(path.join(root, "extension/debugger-manager.js"), "utf8");
  const context = vm.createContext({
    chrome: {
      debugger: {
        attach: vi.fn(async (target: Record<string, unknown>, version: string) => {
          calls.push({ name: "attach", target: { ...target }, version });
        }),
        detach: vi.fn(async (target: Record<string, unknown>) => {
          calls.push({ name: "detach", target: { ...target } });
        }),
        sendCommand: vi.fn(
          async (
            target: Record<string, unknown>,
            method: string,
            params?: Record<string, unknown>
          ) => {
            calls.push({ name: "sendCommand", target: { ...target }, method, params });
            return sendCommand(target, method, params);
          }
        )
      }
    },
    clearTimeout,
    setTimeout
  });

  const DebuggerManager = vm.runInContext(
    `${source}\nDebuggerManager;`,
    context
  ) as DebuggerManagerConstructor;

  return { DebuggerManager, calls };
}

describe("extension debugger manager", () => {
  it("clears target attachments when Chrome reports debugger detach", async () => {
    const { DebuggerManager, calls } = loadDebuggerManager();
    const manager = new DebuggerManager({ cdpVersion: "1.3", defaultTimeoutMs: 50 });

    await manager.sendToTarget("target-1", "Runtime.evaluate", { expression: "1" });
    await manager.sendToTarget("target-1", "DOM.getDocument");

    expect(calls.filter((call) => call.name === "attach")).toEqual([
      { name: "attach", target: { targetId: "target-1" }, version: "1.3" }
    ]);

    manager.markDetached({ targetId: "target-1" });
    await manager.sendToTarget("target-1", "Runtime.evaluate", { expression: "2" });

    expect(calls.filter((call) => call.name === "attach")).toEqual([
      { name: "attach", target: { targetId: "target-1" }, version: "1.3" },
      { name: "attach", target: { targetId: "target-1" }, version: "1.3" }
    ]);
  });

  it("clears tab attachment state when a user closes the tab mid-action", async () => {
    let resolveEvaluate: ((value: unknown) => void) | undefined;
    let pendingEvaluate = true;
    const { DebuggerManager, calls } = loadDebuggerManager({
      sendCommand: async (_target, method) => {
        if (method === "Runtime.evaluate" && pendingEvaluate) {
          pendingEvaluate = false;
          return new Promise((resolve) => {
            resolveEvaluate = resolve;
          });
        }
        return { ok: true };
      }
    });
    const manager = new DebuggerManager({ cdpVersion: "1.3", defaultTimeoutMs: 50 });

    const inFlight = manager.send(101, "Runtime.evaluate", { expression: "document.title" });

    await vi.waitFor(() => {
      expect(calls).toContainEqual({
        name: "sendCommand",
        target: { tabId: 101 },
        method: "Runtime.evaluate",
        params: { expression: "document.title" }
      });
    });
    expect(manager.listAttachedTabs()).toEqual([101]);

    manager.markTabRemoved(101);
    expect(manager.listAttachedTabs()).toEqual([]);

    resolveEvaluate?.({ ok: true });
    await expect(inFlight).resolves.toEqual({ ok: true });

    await manager.send(101, "Runtime.evaluate", { expression: "document.URL" });

    expect(calls.filter((call) => call.name === "attach")).toEqual([
      { name: "attach", target: { tabId: 101 }, version: "1.3" },
      { name: "attach", target: { tabId: 101 }, version: "1.3" }
    ]);
  });

  it("force-detaches and clears local state after a timed-out CDP command", async () => {
    const { DebuggerManager, calls } = loadDebuggerManager({
      sendCommand: async (_target, method) => {
        if (method === "Runtime.evaluate") {
          return new Promise(() => undefined);
        }
        return { ok: true };
      }
    });
    const manager = new DebuggerManager({ cdpVersion: "1.3", defaultTimeoutMs: 50 });

    await expect(
      manager.sendToTarget("target-timeout", "Runtime.evaluate", {}, { timeoutMs: 1 })
    ).rejects.toMatchObject({ name: "CdpCommandTimeoutError" });

    expect(calls).toContainEqual({ name: "detach", target: { targetId: "target-timeout" } });

    await manager.sendToTarget("target-timeout", "DOM.getDocument");

    expect(calls.filter((call) => call.name === "attach")).toEqual([
      { name: "attach", target: { targetId: "target-timeout" }, version: "1.3" },
      { name: "attach", target: { targetId: "target-timeout" }, version: "1.3" }
    ]);
  });
});
