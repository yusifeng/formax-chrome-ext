class SessionManager {
    sessions = new Map();
    listSessions() {
        return Array.from(this.sessions.values());
    }
    serializeAll() {
        return this.listSessions().map((session) => this.serializeSession(session));
    }
    serializeSession(session) {
        if (!session) {
            return null;
        }
        return {
            sessionId: session.sessionId,
            groupId: session.groupId,
            activeTabId: session.activeTabId,
            tabIds: [...session.tabIds],
            status: session.status,
            createdAt: session.createdAt,
            lastActiveAt: session.lastActiveAt,
            stoppedAt: session.stoppedAt,
            error: session.error
        };
    }
    hasActiveSessions() {
        return this.listSessions().some((session) => session.status === "active");
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    findSessionByTabId(tabId) {
        for (const session of this.sessions.values()) {
            if (session.tabIds.includes(tabId)) {
                return session;
            }
        }
        return null;
    }
    getExistingSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return session;
    }
    resolveOptionalSession(params = {}) {
        if (typeof params.sessionId !== "string" || !params.sessionId.trim()) {
            return null;
        }
        return this.getExistingSession(params.sessionId.trim());
    }
    resolveSessionAndTab(params = {}) {
        const session = this.resolveOptionalSession(params);
        let tabId = params.tabId;
        if (typeof tabId !== "number") {
            tabId = session?.activeTabId;
        }
        if (typeof tabId !== "number") {
            throw new Error("Missing tabId or valid sessionId");
        }
        return { session, tabId };
    }
    async startSession(params = {}) {
        const sessionId = this.resolveNewSessionId(params.sessionId);
        const existing = this.sessions.get(sessionId);
        if (existing) {
            return existing;
        }
        const initialUrl = typeof params.initialUrl === "string" && params.initialUrl.trim()
            ? params.initialUrl.trim()
            : "about:blank";
        if (initialUrl !== "about:blank") {
            this.assertAllowedNavigationUrl(initialUrl);
        }
        const tab = await chrome.tabs.create({
            url: initialUrl,
            active: params.active === true
        });
        if (typeof tab.id !== "number") {
            throw new Error("Chrome did not return a valid tab id");
        }
        return this.createSessionForTab(sessionId, tab.id);
    }
    async claimTab(params = {}) {
        const tabId = typeof params.tabId === "number" ? params.tabId : await this.getActiveTabId();
        const tab = await chrome.tabs.get(tabId);
        if (typeof tab.id !== "number") {
            throw new Error("Chrome did not return a valid tab id");
        }
        this.assertClaimableTabUrl(tab.url);
        let session = this.resolveOptionalSession(params);
        if (!session) {
            const sessionId = this.resolveNewSessionId(params.sessionId);
            session = await this.createSessionForTab(sessionId, tab.id);
        }
        else {
            await this.addTabToSession(session, tab.id);
        }
        if (params.active === true) {
            await chrome.tabs.update(tab.id, {
                active: true
            });
        }
        session.activeTabId = tab.id;
        this.touchSession(session.sessionId);
        return { session, tab };
    }
    async createTab(params = {}) {
        const initialUrl = typeof params.url === "string" && params.url.trim()
            ? params.url.trim()
            : "about:blank";
        if (initialUrl !== "about:blank") {
            this.assertAllowedNavigationUrl(initialUrl);
        }
        let session = this.resolveOptionalSession(params);
        const createProperties = {
            url: initialUrl,
            active: params.active === true
        };
        if (session?.activeTabId != null) {
            try {
                const activeTab = await chrome.tabs.get(session.activeTabId);
                if (typeof activeTab.windowId === "number") {
                    createProperties.windowId = activeTab.windowId;
                }
            }
            catch {
                // If the remembered active tab is stale, Chrome will choose a window.
            }
        }
        const tab = await chrome.tabs.create(createProperties);
        if (typeof tab.id !== "number") {
            throw new Error("Chrome did not return a valid tab id");
        }
        if (!session) {
            const sessionId = this.resolveNewSessionId(params.sessionId);
            session = await this.createSessionForTab(sessionId, tab.id);
        }
        else {
            await this.addTabToSession(session, tab.id);
        }
        session.activeTabId = tab.id;
        this.touchSession(session.sessionId);
        return { session, tab };
    }
    async switchTab(params = {}) {
        const { session, tabId } = this.resolveSessionAndTab(params);
        const tab = await chrome.tabs.get(tabId);
        if (typeof tab.id !== "number") {
            throw new Error("Chrome did not return a valid tab id");
        }
        if (session && !session.tabIds.includes(tab.id)) {
            await this.addTabToSession(session, tab.id);
        }
        if (session) {
            session.activeTabId = tab.id;
            this.touchSession(session.sessionId);
        }
        await chrome.tabs.update(tab.id, {
            active: true
        });
        return session;
    }
    async markSessionStopped(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }
        session.status = "stopped";
        session.lastActiveAt = Date.now();
        session.stoppedAt = session.lastActiveAt;
        return session;
    }
    deleteSession(sessionId) {
        this.sessions.delete(sessionId);
    }
    onTabRemoved(tabId) {
        for (const session of this.sessions.values()) {
            this.removeTabFromSession(session, tabId);
        }
    }
    removeTab(tabId) {
        const changedSessions = [];
        for (const session of this.sessions.values()) {
            if (session.tabIds.includes(tabId)) {
                this.removeTabFromSession(session, tabId);
                changedSessions.push(session);
            }
        }
        return changedSessions;
    }
    touchSession(sessionId) {
        if (!sessionId) {
            return;
        }
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActiveAt = Date.now();
        }
    }
    async createSessionForTab(sessionId, tabId) {
        const groupId = await chrome.tabs.group({
            tabIds: [tabId]
        });
        await chrome.tabGroups.update(groupId, {
            title: `Agent ${sessionId.slice(0, 6)}`,
            color: "green",
            collapsed: false
        });
        const now = Date.now();
        const session = {
            sessionId,
            groupId,
            activeTabId: tabId,
            tabIds: [tabId],
            status: "active",
            createdAt: now,
            lastActiveAt: now
        };
        this.sessions.set(sessionId, session);
        return session;
    }
    async addTabToSession(session, tabId) {
        if (!session.tabIds.includes(tabId)) {
            session.tabIds.push(tabId);
        }
        session.lastActiveAt = Date.now();
        try {
            await chrome.tabs.group({
                groupId: session.groupId,
                tabIds: [tabId]
            });
        }
        catch {
            const groupId = await chrome.tabs.group({
                tabIds: session.tabIds
            });
            session.groupId = groupId;
            await chrome.tabGroups.update(groupId, {
                title: `Agent ${session.sessionId.slice(0, 6)}`,
                color: "green",
                collapsed: false
            });
        }
    }
    removeTabFromSession(session, tabId) {
        session.tabIds = session.tabIds.filter((id) => id !== tabId);
        if (session.activeTabId === tabId) {
            session.activeTabId = session.tabIds[0] ?? null;
        }
        session.lastActiveAt = Date.now();
    }
    async getActiveTabId() {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        if (typeof tab?.id !== "number") {
            throw new Error("No active tab found to claim");
        }
        return tab.id;
    }
    resolveNewSessionId(sessionId) {
        return typeof sessionId === "string" && sessionId.trim()
            ? sessionId.trim()
            : crypto.randomUUID();
    }
    assertAllowedNavigationUrl(url) {
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch {
            throw new Error(`Invalid URL: ${url}`);
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error(`Only http/https URLs are allowed in MVP: ${url}`);
        }
    }
    assertClaimableTabUrl(url) {
        if (!url || url === "about:blank") {
            return;
        }
        this.assertAllowedNavigationUrl(url);
    }
}
