export function createBrowserSession(args) {
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
export function touchBrowserSession(session, now = Date.now()) {
    return {
        ...session,
        lastActiveAt: now
    };
}
export function markBrowserSessionStopped(session, now = Date.now()) {
    return {
        ...session,
        status: "stopped",
        lastActiveAt: now,
        stoppedAt: now
    };
}
export function markBrowserSessionErrored(session, error, now = Date.now()) {
    return {
        ...session,
        status: "error",
        error,
        lastActiveAt: now
    };
}
export function removeTabFromBrowserSession(session, tabId, now = Date.now()) {
    const tabIds = session.tabIds.filter((id) => id !== tabId);
    const activeTabId = session.activeTabId === tabId ? tabIds[0] ?? null : session.activeTabId;
    return {
        ...session,
        tabIds,
        activeTabId,
        lastActiveAt: now
    };
}
