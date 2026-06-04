import { describe, expect, it } from "vitest";
import {
  createBrowserSession,
  markBrowserSessionErrored,
  markBrowserSessionStopped,
  removeTabFromBrowserSession,
  touchBrowserSession
} from "../shared/session-store.js";

describe("session store", () => {
  it("creates active sessions", () => {
    expect(
      createBrowserSession({
        sessionId: "s1",
        groupId: 10,
        activeTabId: 20,
        now: 100
      })
    ).toEqual({
      sessionId: "s1",
      groupId: 10,
      activeTabId: 20,
      tabIds: [20],
      status: "active",
      createdAt: 100,
      lastActiveAt: 100
    });
  });

  it("touches last activity", () => {
    const session = createBrowserSession({
      sessionId: "s1",
      groupId: 10,
      activeTabId: 20,
      now: 100
    });

    expect(touchBrowserSession(session, 150).lastActiveAt).toBe(150);
  });

  it("updates active tab when a tab is removed", () => {
    const session = createBrowserSession({
      sessionId: "s1",
      groupId: 10,
      activeTabId: 20,
      tabIds: [20, 21],
      now: 100
    });

    expect(removeTabFromBrowserSession(session, 20, 200)).toMatchObject({
      activeTabId: 21,
      tabIds: [21],
      lastActiveAt: 200
    });
  });

  it("marks sessions stopped", () => {
    const session = createBrowserSession({
      sessionId: "s1",
      groupId: 10,
      activeTabId: 20,
      now: 100
    });

    expect(markBrowserSessionStopped(session, 300)).toMatchObject({
      status: "stopped",
      stoppedAt: 300,
      lastActiveAt: 300
    });
  });

  it("marks sessions errored", () => {
    const session = createBrowserSession({
      sessionId: "s1",
      groupId: 10,
      activeTabId: 20,
      now: 100
    });

    expect(markBrowserSessionErrored(session, "boom", 400)).toMatchObject({
      status: "error",
      error: "boom",
      lastActiveAt: 400
    });
  });
});
