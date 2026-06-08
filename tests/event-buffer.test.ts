import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEventBuffer() {
  const source = fs.readFileSync(path.join(root, "extension/event-buffer.js"), "utf8");
  const context = vm.createContext({
    Date,
  });
  return vm.runInContext(`${source}\nEventBuffer;`, context) as new (options?: { maxEvents?: number }) => {
    push(payload: Record<string, unknown>): Record<string, unknown>;
    list(query?: Record<string, unknown>): Record<string, unknown>[];
    clear(query?: Record<string, unknown>): number;
  };
}

describe("extension event buffer", () => {
  it("keeps bounded ordered events and applies list filters", () => {
    const EventBuffer = loadEventBuffer();
    const buffer = new EventBuffer({ maxEvents: 3 });

    buffer.push({ name: "first", sessionId: "s1", tabId: 1 });
    const second = buffer.push({ name: "second", sessionId: "s1", tabId: 2 });
    const third = buffer.push({ name: "second", sessionId: "s2", tabId: 2 });
    const fourth = buffer.push({ name: "fourth", sessionId: "s1", tabId: 1 });

    expect(buffer.list().map((event) => event.name)).toEqual(["second", "second", "fourth"]);
    expect(buffer.list({ sessionId: "s1" }).map((event) => event.name)).toEqual(["second", "fourth"]);
    expect(buffer.list({ tabId: 2 }).map((event) => event.name)).toEqual(["second", "second"]);
    expect(buffer.list({ name: "second" })).toHaveLength(2);
    expect(buffer.list({ sinceSequence: second.sequence }).map((event) => event.sequence)).toEqual([
      third.sequence,
      fourth.sequence,
    ]);
    expect(buffer.list({ sinceSequence: third.sequence })).toEqual([
      expect.objectContaining({ sequence: fourth.sequence }),
    ]);
    expect(buffer.list({ limit: 1 })).toEqual([
      expect.objectContaining({ name: "fourth" }),
    ]);
  });

  it("clears only events matching the supplied filters", () => {
    const EventBuffer = loadEventBuffer();
    const buffer = new EventBuffer({ maxEvents: 10 });

    buffer.push({ name: "keep", sessionId: "s1", tabId: 1 });
    buffer.push({ name: "drop", sessionId: "s1", tabId: 1 });
    buffer.push({ name: "drop", sessionId: "s2", tabId: 1 });
    buffer.push({ name: "drop", sessionId: "s1", tabId: 2 });

    expect(buffer.clear({ sessionId: "s1", tabId: 1, name: "drop" })).toBe(1);
    expect(buffer.list().map((event) => [event.sessionId, event.tabId, event.name])).toEqual([
      ["s1", 1, "keep"],
      ["s2", 1, "drop"],
      ["s1", 2, "drop"],
    ]);
  });
});
