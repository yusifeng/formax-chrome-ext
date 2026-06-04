import type { BrowserSession } from "./types.js";

export function createBrowserSession(args: {
  sessionId: string;
  groupId: number;
  activeTabId: number;
  tabIds?: number[];
  now?: number;
}): BrowserSession {
  const now = args.now ?? Date.now();

  return {
    sessionId: args.sessionId,
    groupId: args.groupId,
    activeTabId: args.activeTabId,
    tabIds: args.tabIds ?? [args.activeTabId],
    status: "active",
    createdAt: now,
    lastActiveAt: now
  };
}

export function touchBrowserSession(
  session: BrowserSession,
  now = Date.now()
): BrowserSession {
  return {
    ...session,
    lastActiveAt: now
  };
}

export function markBrowserSessionStopped(
  session: BrowserSession,
  now = Date.now()
): BrowserSession {
  return {
    ...session,
    status: "stopped",
    lastActiveAt: now,
    stoppedAt: now
  };
}

export function markBrowserSessionErrored(
  session: BrowserSession,
  error: string,
  now = Date.now()
): BrowserSession {
  return {
    ...session,
    status: "error",
    error,
    lastActiveAt: now
  };
}

export function removeTabFromBrowserSession(
  session: BrowserSession,
  tabId: number,
  now = Date.now()
): BrowserSession {
  const tabIds = session.tabIds.filter((id) => id !== tabId);
  const activeTabId =
    session.activeTabId === tabId ? tabIds[0] ?? null : session.activeTabId;

  return {
    ...session,
    tabIds,
    activeTabId,
    lastActiveAt: now
  };
}
