type SessionActionParams = Record<string, any>;

type AgentSessionStatus = "active" | "stopped" | "error";

type AgentSession = {
  sessionId: string;
  name?: string;
  groupId: number;
  activeTabId: number | null;
  tabIds: number[];
  status: AgentSessionStatus;
  createdAt: number;
  lastActiveAt: number;
  stoppedAt?: number;
  error?: string;
};

type ResolvedSessionAndTab = {
  session: AgentSession | null;
  tabId: number;
};

class SessionManager {
  private readonly sessions = new Map<string, AgentSession>();

  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  serializeAll() {
    return this.listSessions().map((session) => this.serializeSession(session));
  }

  serializeSession(session: AgentSession | undefined | null) {
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      name: session.name,
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

  hasActiveSessions(): boolean {
    return this.listSessions().some((session) => session.status === "active");
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  findSessionByTabId(tabId: number): AgentSession | null {
    for (const session of this.sessions.values()) {
      if (session.tabIds.includes(tabId)) {
        return session;
      }
    }

    return null;
  }

  getExistingSession(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return session;
  }

  resolveOptionalSession(params: SessionActionParams = {}): AgentSession | null {
    if (typeof params.sessionId !== "string" || !params.sessionId.trim()) {
      return null;
    }

    return this.getExistingSession(params.sessionId.trim());
  }

  resolveSessionAndTab(params: SessionActionParams = {}): ResolvedSessionAndTab {
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

  async startSession(params: SessionActionParams = {}): Promise<AgentSession> {
    const sessionId = this.resolveNewSessionId(params.sessionId);
    const existing = this.sessions.get(sessionId);

    if (existing) {
      return existing;
    }

    const initialUrl =
      typeof params.initialUrl === "string" && params.initialUrl.trim()
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

    return this.createSessionForTab(sessionId, tab.id, params.name);
  }

  async claimTab(params: SessionActionParams = {}): Promise<{
    session: AgentSession;
    tab: chrome.tabs.Tab;
  }> {
    const tabId =
      typeof params.tabId === "number" ? params.tabId : await this.getActiveTabId();
    const tab = await chrome.tabs.get(tabId);

    if (typeof tab.id !== "number") {
      throw new Error("Chrome did not return a valid tab id");
    }

    this.assertClaimableTabUrl(tab.url);

    let session = this.resolveOptionalSession(params);

    if (!session) {
      const sessionId = this.resolveNewSessionId(params.sessionId);
      session = await this.createSessionForTab(sessionId, tab.id, params.name);
    } else {
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

  async createTab(params: SessionActionParams = {}): Promise<{
    session: AgentSession;
    tab: chrome.tabs.Tab;
  }> {
    const initialUrl =
      typeof params.url === "string" && params.url.trim()
        ? params.url.trim()
        : "about:blank";

    if (initialUrl !== "about:blank") {
      this.assertAllowedNavigationUrl(initialUrl);
    }

    let session = this.resolveOptionalSession(params);
    const createProperties: chrome.tabs.CreateProperties = {
      url: initialUrl,
      active: params.active === true
    };

    if (session?.activeTabId != null) {
      try {
        const activeTab = await chrome.tabs.get(session.activeTabId);

        if (typeof activeTab.windowId === "number") {
          createProperties.windowId = activeTab.windowId;
        }
      } catch {
        // If the remembered active tab is stale, Chrome will choose a window.
      }
    }

    const tab = await chrome.tabs.create(createProperties);

    if (typeof tab.id !== "number") {
      throw new Error("Chrome did not return a valid tab id");
    }

    if (!session) {
      const sessionId = this.resolveNewSessionId(params.sessionId);
      session = await this.createSessionForTab(sessionId, tab.id, params.name);
    } else {
      await this.addTabToSession(session, tab.id);
    }

    session.activeTabId = tab.id;
    this.touchSession(session.sessionId);

    return { session, tab };
  }

  async switchTab(params: SessionActionParams = {}): Promise<AgentSession | null> {
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

  async markSessionStopped(sessionId: string): Promise<AgentSession | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    session.status = "stopped";
    session.lastActiveAt = Date.now();
    session.stoppedAt = session.lastActiveAt;

    return session;
  }

  async nameSession(sessionId: string, name: string): Promise<AgentSession> {
    const session = this.getExistingSession(sessionId);
    const title = this.normalizeSessionName(name);

    session.name = title;
    session.lastActiveAt = Date.now();

    try {
      await chrome.tabGroups.update(session.groupId, {
        title
      });
    } catch {
      // The group may have been closed by the user. Keep metadata in memory.
    }

    return session;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  onTabRemoved(tabId: number): void {
    for (const session of this.sessions.values()) {
      this.removeTabFromSession(session, tabId);
    }
  }

  removeTab(tabId: number): AgentSession[] {
    const changedSessions = [];

    for (const session of this.sessions.values()) {
      if (session.tabIds.includes(tabId)) {
        this.removeTabFromSession(session, tabId);
        changedSessions.push(session);
      }
    }

    return changedSessions;
  }

  touchSession(sessionId: string | null | undefined): void {
    if (!sessionId) {
      return;
    }

    const session = this.sessions.get(sessionId);

    if (session) {
      session.lastActiveAt = Date.now();
    }
  }

  private async createSessionForTab(
    sessionId: string,
    tabId: number,
    name?: unknown
  ): Promise<AgentSession> {
    const groupId = await chrome.tabs.group({
      tabIds: [tabId]
    });

    const sessionName =
      typeof name === "string" && name.trim()
        ? this.normalizeSessionName(name)
        : undefined;
    const title = sessionName || `Agent ${sessionId.slice(0, 6)}`;

    await chrome.tabGroups.update(groupId, {
      title,
      color: "green",
      collapsed: false
    });

    const now = Date.now();
    const session: AgentSession = {
      sessionId,
      name: sessionName,
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

  private async addTabToSession(
    session: AgentSession,
    tabId: number
  ): Promise<void> {
    if (!session.tabIds.includes(tabId)) {
      session.tabIds.push(tabId);
    }

    session.lastActiveAt = Date.now();

    try {
      await chrome.tabs.group({
        groupId: session.groupId,
        tabIds: [tabId]
      });
    } catch {
      const groupId = await chrome.tabs.group({
        tabIds: session.tabIds
      });

      session.groupId = groupId;
      await chrome.tabGroups.update(groupId, {
        title: session.name || `Agent ${session.sessionId.slice(0, 6)}`,
        color: "green",
        collapsed: false
      });
    }
  }

  private removeTabFromSession(session: AgentSession, tabId: number): void {
    session.tabIds = session.tabIds.filter((id) => id !== tabId);

    if (session.activeTabId === tabId) {
      session.activeTabId = session.tabIds[0] ?? null;
    }

    session.lastActiveAt = Date.now();
  }

  private async getActiveTabId(): Promise<number> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (typeof tab?.id !== "number") {
      throw new Error("No active tab found to claim");
    }

    return tab.id;
  }

  private resolveNewSessionId(sessionId: unknown): string {
    return typeof sessionId === "string" && sessionId.trim()
      ? sessionId.trim()
      : crypto.randomUUID();
  }

  private normalizeSessionName(name: unknown): string {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Session name must be a non-empty string");
    }

    return name.trim().slice(0, 80);
  }

  private assertAllowedNavigationUrl(url: string): void {
    let parsed;

    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Only http/https URLs are allowed in MVP: ${url}`);
    }
  }

  private assertClaimableTabUrl(url: string | undefined): void {
    if (!url || url === "about:blank") {
      return;
    }

    this.assertAllowedNavigationUrl(url);
  }
}
