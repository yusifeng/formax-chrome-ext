type SessionActionParams = Record<string, any>;

type AgentSessionStatus = "active" | "stopped" | "error";
type AgentTabOrigin = "agent" | "user";
type AgentTabLeaseState = "active" | "handoff";
type AgentGroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

type AgentTabLease = {
  tabId: number;
  sessionId: string;
  turnId: string | null;
  origin: AgentTabOrigin;
  state: AgentTabLeaseState;
  claimedAt: number;
  instanceId: string;
  groupId?: number;
  isActiveHandoff?: boolean;
};

type AgentGroupMetadata = {
  chromeGroupId: number;
  title: string;
  color: AgentGroupColor;
};

type AgentSession = {
  sessionId: string;
  name?: string;
  groupId: number | null;
  activeTabId: number | null;
  tabIds: number[];
  status: AgentSessionStatus;
  createdAt: number;
  lastActiveAt: number;
  stoppedAt?: number;
  error?: string;
};

type SessionManagerSnapshot = {
  version: 1;
  extensionInstanceId: string | null;
  sessions: AgentSession[];
  tabLeases: AgentTabLease[];
  managedGroupIds: number[];
  groupMetadata: AgentGroupMetadata[];
};

type ResolvedSessionAndTab = {
  session: AgentSession | null;
  tabId: number;
};

class SessionManager {
  private static readonly STORAGE_KEY = "formax.agentBrowser.sessions.v1";
  private static readonly INSTANCE_STORAGE_KEY = "formax.agentBrowser.extensionInstanceId";

  private readonly sessions = new Map<string, AgentSession>();
  private readonly tabLeases = new Map<number, AgentTabLease>();
  private readonly managedGroupIds = new Set<number>();
  private readonly groupMetadata = new Map<number, AgentGroupMetadata>();
  private extensionInstanceId: string | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private persistTimer: number | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this.restore();
    await this.initializing;
    this.initialized = true;
    this.initializing = null;
    await this.persist();
  }

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
      leases: this.getSessionLeases(session.sessionId),
      extensionInstanceId: this.extensionInstanceId,
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
    const lease = this.tabLeases.get(tabId);
    return lease ? this.sessions.get(lease.sessionId) ?? null : null;
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

  findOptionalSession(params: SessionActionParams = {}): AgentSession | null {
    if (typeof params.sessionId !== "string" || !params.sessionId.trim()) {
      return null;
    }

    return this.sessions.get(params.sessionId.trim()) ?? null;
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

    if (session) {
      const lease = this.tabLeases.get(tabId);

      if (lease?.sessionId !== session.sessionId) {
        throw new Error(
          `Tab ${tabId} is not part of browser session ${session.sessionId}. Use openTabs and claimTab to claim an existing user tab.`
        );
      }
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

    const session = this.createSession(sessionId, params.name);
    await this.addTabToSession(session, tab.id, {
      origin: "agent",
      turnId: params.turnId
    });
    await this.persist();

    return session;
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

    let session = this.findOptionalSession(params);

    if (!session) {
      const sessionId = this.resolveNewSessionId(params.sessionId);
      session = this.createSession(sessionId, params.name);
    }

    await this.addTabToSession(session, tab.id, {
      origin: "user",
      turnId: params.turnId
    });

    if (params.active === true) {
      await chrome.tabs.update(tab.id, {
        active: true
      });
    }

    session.activeTabId = tab.id;
    this.touchSession(session.sessionId);
    await this.persist();

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

    let session = this.findOptionalSession(params);
    const newSessionId = session ? null : this.resolveNewSessionId(params.sessionId);
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
      session = this.createSession(newSessionId!, params.name);
    }

    await this.addTabToSession(session, tab.id, {
      origin: "agent",
      turnId: params.turnId
    });

    session.activeTabId = tab.id;
    this.touchSession(session.sessionId);
    await this.persist();

    return { session, tab };
  }

  async switchTab(params: SessionActionParams = {}): Promise<AgentSession | null> {
    const { session, tabId } = this.resolveSessionAndTab(params);
    const tab = await chrome.tabs.get(tabId);

    if (typeof tab.id !== "number") {
      throw new Error("Chrome did not return a valid tab id");
    }

    if (session && !session.tabIds.includes(tab.id)) {
      throw new Error(
        `Tab ${tab.id} is not part of browser session ${session.sessionId}. Use openTabs and claimTab to claim an existing user tab.`
      );
    }

    if (session) {
      session.activeTabId = tab.id;
      this.touchSession(session.sessionId);
      await this.persist();
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
    this.schedulePersist();

    return session;
  }

  async nameSession(sessionId: string, name: string): Promise<AgentSession> {
    const session = this.getExistingSession(sessionId);
    const title = this.normalizeSessionName(name);

    session.name = title;
    session.lastActiveAt = Date.now();

    try {
      const groupIds = await this.findSessionManagedGroupIds(session.sessionId);
      await Promise.all(
        groupIds.map((groupId) =>
          chrome.tabGroups.update(groupId, {
            title
          })
        )
      );
    } catch {
      // Groups may have been closed or moved by the user. Keep metadata in memory.
    }

    await this.persist();

    return session;
  }

  deleteSession(sessionId: string): void {
    for (const lease of this.getSessionLeases(sessionId)) {
      this.tabLeases.delete(lease.tabId);
    }

    this.sessions.delete(sessionId);
    this.schedulePersist();
  }

  onTabRemoved(tabId: number): void {
    const lease = this.tabLeases.get(tabId);

    if (!lease) {
      return;
    }

    const session = this.sessions.get(lease.sessionId);

    if (session) {
      this.removeTabFromSession(session, tabId);
    } else {
      this.tabLeases.delete(tabId);
    }

    this.schedulePersist();
  }

  removeTab(tabId: number): AgentSession[] {
    const changedSessions = [];
    const lease = this.tabLeases.get(tabId);

    if (lease) {
      const session = this.sessions.get(lease.sessionId);

      if (session) {
        this.removeTabFromSession(session, tabId);
        changedSessions.push(session);
      } else {
        this.tabLeases.delete(tabId);
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
      this.schedulePersist();
    }
  }

  getTabLease(tabId: number): AgentTabLease | null {
    const lease = this.tabLeases.get(tabId);
    return lease ? { ...lease } : null;
  }

  getSessionLeases(sessionId: string): AgentTabLease[] {
    return Array.from(this.tabLeases.values())
      .filter((lease) => lease.sessionId === sessionId)
      .map((lease) => ({ ...lease }));
  }

  getExtensionInstanceId(): string | null {
    return this.extensionInstanceId;
  }

  async handoffTabs(
    sessionId: string,
    tabIds: number[],
    options: { activeTabId?: number | null; turnId?: unknown } = {}
  ): Promise<number[]> {
    const session = this.getExistingSession(sessionId);
    const tabIdSet = new Set(tabIds);
    const handedOff = [];
    const activeTabId =
      typeof options.activeTabId === "number" ? options.activeTabId : session.activeTabId;
    const turnId = this.normalizeTurnId(options.turnId);

    for (const lease of this.tabLeases.values()) {
      if (lease.sessionId !== sessionId || !tabIdSet.has(lease.tabId)) {
        continue;
      }

      const groupId = await this.currentTabGroupId(lease.tabId);

      lease.state = "handoff";
      lease.turnId = turnId;
      lease.groupId = groupId ?? lease.groupId;
      lease.isActiveHandoff = lease.tabId === activeTabId;
      handedOff.push(lease.tabId);
    }

    session.tabIds = this.getSessionTabIds(sessionId);
    session.activeTabId = activeTabId ?? session.tabIds[0] ?? null;
    session.groupId = await this.findReusableManagedGroupId(session.sessionId, null);
    this.touchSession(sessionId);
    await this.persist();

    return handedOff;
  }

  releaseTabs(sessionId: string, tabIds: number[]): number[] {
    const session = this.sessions.get(sessionId);
    const released = [];

    for (const tabId of tabIds) {
      const lease = this.tabLeases.get(tabId);

      if (lease?.sessionId !== sessionId) {
        continue;
      }

      this.tabLeases.delete(tabId);
      released.push(tabId);
    }

    if (session) {
      session.tabIds = this.getSessionTabIds(sessionId);
      session.activeTabId = session.tabIds.includes(session.activeTabId ?? -1)
        ? session.activeTabId
        : session.tabIds[0] ?? null;
      session.lastActiveAt = Date.now();
    }

    this.schedulePersist();

    return released;
  }

  releaseActiveTurn(sessionId: string, turnId: string): number[] {
    const session = this.sessions.get(sessionId);
    const released = [];

    for (const lease of [...this.tabLeases.values()]) {
      if (
        lease.sessionId !== sessionId ||
        lease.turnId !== turnId ||
        lease.state !== "active"
      ) {
        continue;
      }

      this.tabLeases.delete(lease.tabId);
      released.push(lease.tabId);
    }

    if (session) {
      session.tabIds = this.getSessionTabIds(sessionId);
      session.activeTabId = session.tabIds.includes(session.activeTabId ?? -1)
        ? session.activeTabId
        : session.tabIds[0] ?? null;
      session.lastActiveAt = Date.now();
    }

    this.schedulePersist();

    return released;
  }

  private createSession(
    sessionId: string,
    name?: unknown
  ): AgentSession {
    const sessionName =
      typeof name === "string" && name.trim()
        ? this.normalizeSessionName(name)
        : undefined;

    const now = Date.now();
    const session: AgentSession = {
      sessionId,
      name: sessionName,
      groupId: null,
      activeTabId: null,
      tabIds: [],
      status: "active",
      createdAt: now,
      lastActiveAt: now
    };

    this.sessions.set(sessionId, session);
    this.schedulePersist();

    return session;
  }

  private async addTabToSession(
    session: AgentSession,
    tabId: number,
    options: { origin: AgentTabOrigin; turnId?: unknown }
  ): Promise<void> {
    const existingLease = this.tabLeases.get(tabId);

    if (existingLease && existingLease.sessionId !== session.sessionId) {
      throw new Error(
        `Tab ${tabId} is already part of browser session ${existingLease.sessionId}`
      );
    }

    const now = Date.now();
    const lease: AgentTabLease = {
      tabId,
      sessionId: session.sessionId,
      turnId: this.normalizeTurnId(options.turnId),
      origin: existingLease?.origin ?? options.origin,
      state: "active",
      claimedAt: existingLease?.claimedAt ?? now,
      instanceId: existingLease?.instanceId ?? this.requireExtensionInstanceId(),
      groupId: existingLease?.groupId,
      isActiveHandoff: false
    };

    if (!session.tabIds.includes(tabId)) {
      session.tabIds.push(tabId);
    }

    session.lastActiveAt = Date.now();
    session.activeTabId = tabId;
    this.tabLeases.set(tabId, lease);

    if (options.origin === "agent") {
      lease.groupId = await this.ensureAgentTabGroup(session, tabId);
      session.groupId = lease.groupId;
    }

    this.schedulePersist();
  }

  private removeTabFromSession(session: AgentSession, tabId: number): void {
    this.tabLeases.delete(tabId);
    session.tabIds = session.tabIds.filter((id) => id !== tabId);

    if (session.activeTabId === tabId) {
      session.activeTabId = session.tabIds[0] ?? null;
    }

    session.lastActiveAt = Date.now();
    this.schedulePersist();
  }

  private async ensureAgentTabGroup(
    session: AgentSession,
    tabId: number
  ): Promise<number> {
    const reusableGroupId = await this.findReusableManagedGroupId(session.sessionId, tabId);

    if (typeof reusableGroupId === "number") {
      try {
        await chrome.tabs.group({
          groupId: reusableGroupId,
          tabIds: [tabId]
        });
        await this.updateGroupPresentation(reusableGroupId, session);
        return reusableGroupId;
      } catch {
        this.managedGroupIds.delete(reusableGroupId);
      }
    }

    const groupId = await chrome.tabs.group({
      tabIds: [tabId]
    });

    this.managedGroupIds.add(groupId);
    await this.updateGroupPresentation(groupId, session);

    return groupId;
  }

  private async findReusableManagedGroupId(
    sessionId: string,
    excludingTabId: number | null
  ): Promise<number | null> {
    const leases = this.getSessionLeases(sessionId).filter(
      (lease) =>
        lease.origin === "agent" &&
        (lease.state === "active" || lease.state === "handoff") &&
        lease.tabId !== excludingTabId
    );

    for (const lease of leases) {
      const groupId = await this.currentTabGroupId(lease.tabId);

      if (typeof groupId === "number") {
        this.managedGroupIds.add(groupId);
        return groupId;
      }

      if (typeof lease.groupId === "number" && this.managedGroupIds.has(lease.groupId)) {
        return lease.groupId;
      }
    }

    return null;
  }

  private async findSessionManagedGroupIds(sessionId: string): Promise<number[]> {
    const groupIds = new Set<number>();

    for (const lease of this.getSessionLeases(sessionId)) {
      if (lease.origin !== "agent") {
        continue;
      }

      const groupId = await this.currentTabGroupId(lease.tabId);

      if (typeof groupId === "number") {
        groupIds.add(groupId);
      }
    }

    return [...groupIds];
  }

  private async currentTabGroupId(tabId: number): Promise<number | null> {
    try {
      const tab = await chrome.tabs.get(tabId);
      return typeof tab.groupId === "number" && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
        ? tab.groupId
        : null;
    } catch {
      return null;
    }
  }

  private async updateGroupPresentation(
    groupId: number,
    session: AgentSession
  ): Promise<void> {
    const title = session.name || "Formax";
    const color: AgentGroupColor = "green";

    await chrome.tabGroups.update(groupId, {
      title,
      color,
      collapsed: false
    });
    this.groupMetadata.set(groupId, {
      chromeGroupId: groupId,
      title,
      color
    });
  }

  private getSessionTabIds(sessionId: string): number[] {
    return Array.from(this.tabLeases.values())
      .filter((lease) => lease.sessionId === sessionId)
      .map((lease) => lease.tabId);
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
    if (typeof sessionId === "string" && sessionId.trim()) {
      return sessionId.trim();
    }

    throw new Error("Missing required browser sessionId");
  }

  private normalizeSessionName(name: unknown): string {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Session name must be a non-empty string");
    }

    return name.trim().slice(0, 80);
  }

  private normalizeTurnId(turnId: unknown): string | null {
    return typeof turnId === "string" && turnId.trim() ? turnId.trim() : null;
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

  private async restore(): Promise<void> {
    this.extensionInstanceId = await this.loadOrCreateExtensionInstanceId();
    const snapshot = await this.readSnapshot();

    if (!snapshot) {
      return;
    }

    const liveTabIds = new Set<number>();

    for (const lease of snapshot.tabLeases) {
      if (!this.isValidLease(lease)) {
        continue;
      }

      try {
        await chrome.tabs.get(lease.tabId);
        liveTabIds.add(lease.tabId);
        this.tabLeases.set(lease.tabId, {
          ...lease,
          instanceId: lease.instanceId || this.requireExtensionInstanceId()
        });
      } catch {
        // Drop stale leases for tabs that no longer exist.
      }
    }

    for (const groupId of snapshot.managedGroupIds) {
      if (Number.isInteger(groupId)) {
        this.managedGroupIds.add(groupId);
      }
    }

    for (const group of snapshot.groupMetadata ?? []) {
      if (this.isValidGroupMetadata(group)) {
        this.groupMetadata.set(group.chromeGroupId, { ...group });
      }
    }

    for (const session of snapshot.sessions) {
      if (!this.isValidSession(session)) {
        continue;
      }

      const tabIds = session.tabIds.filter((tabId) => liveTabIds.has(tabId));
      const restored: AgentSession = {
        ...session,
        groupId: typeof session.groupId === "number" ? session.groupId : null,
        activeTabId:
          typeof session.activeTabId === "number" && tabIds.includes(session.activeTabId)
            ? session.activeTabId
            : tabIds[0] ?? null,
        tabIds
      };

      if (tabIds.length > 0) {
        this.sessions.set(restored.sessionId, restored);
      }
    }

    for (const lease of [...this.tabLeases.values()]) {
      if (!this.sessions.has(lease.sessionId)) {
        this.tabLeases.delete(lease.tabId);
      }
    }

  }

  private async readSnapshot(): Promise<SessionManagerSnapshot | null> {
    try {
      const stored = await chrome.storage.session.get(SessionManager.STORAGE_KEY);
      const value = stored[SessionManager.STORAGE_KEY];

      if (!value || typeof value !== "object") {
        return null;
      }

      const snapshot = value as Partial<SessionManagerSnapshot>;

      if (
        snapshot.version !== 1 ||
        !Array.isArray(snapshot.sessions) ||
        !Array.isArray(snapshot.tabLeases) ||
        !Array.isArray(snapshot.managedGroupIds)
      ) {
        return null;
      }

      return snapshot as SessionManagerSnapshot;
    } catch {
      return null;
    }
  }

  private schedulePersist(): void {
    if (!this.initialized) {
      return;
    }

    if (this.persistTimer != null) {
      self.clearTimeout(this.persistTimer);
    }

    this.persistTimer = self.setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, 50);
  }

  private async persist(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    const snapshot: SessionManagerSnapshot = {
      version: 1,
      extensionInstanceId: this.extensionInstanceId,
      sessions: this.listSessions().map((session) => ({
        ...session,
        tabIds: [...session.tabIds]
      })),
      tabLeases: Array.from(this.tabLeases.values()).map((lease) => ({ ...lease })),
      managedGroupIds: [...this.managedGroupIds],
      groupMetadata: Array.from(this.groupMetadata.values()).map((group) => ({ ...group }))
    };

    try {
      await chrome.storage.session.set({
        [SessionManager.STORAGE_KEY]: snapshot
      });
    } catch {
      // Session tracking should keep working even if transient storage writes fail.
    }
  }

  private isValidSession(value: unknown): value is AgentSession {
    const session = value as AgentSession;

    return (
      session != null &&
      typeof session === "object" &&
      typeof session.sessionId === "string" &&
      Array.isArray(session.tabIds) &&
      (session.activeTabId == null || typeof session.activeTabId === "number") &&
      (session.groupId == null || typeof session.groupId === "number")
    );
  }

  private isValidLease(value: unknown): value is AgentTabLease {
    const lease = value as AgentTabLease;

    return (
      lease != null &&
      typeof lease === "object" &&
      Number.isInteger(lease.tabId) &&
      typeof lease.sessionId === "string" &&
      (lease.turnId == null || typeof lease.turnId === "string") &&
      (lease.origin === "agent" || lease.origin === "user") &&
      (lease.state === "active" || lease.state === "handoff")
    );
  }

  private isValidGroupMetadata(value: unknown): value is AgentGroupMetadata {
    const metadata = value as AgentGroupMetadata;

    return (
      metadata != null &&
      typeof metadata === "object" &&
      Number.isInteger(metadata.chromeGroupId) &&
      typeof metadata.title === "string" &&
      typeof metadata.color === "string"
    );
  }

  private async loadOrCreateExtensionInstanceId(): Promise<string> {
    try {
      const stored = await chrome.storage.local.get(SessionManager.INSTANCE_STORAGE_KEY);
      const value = stored[SessionManager.INSTANCE_STORAGE_KEY];

      if (typeof value === "string" && value.trim()) {
        return value;
      }

      const instanceId = crypto.randomUUID();
      await chrome.storage.local.set({
        [SessionManager.INSTANCE_STORAGE_KEY]: instanceId
      });
      return instanceId;
    } catch {
      return crypto.randomUUID();
    }
  }

  private requireExtensionInstanceId(): string {
    if (!this.extensionInstanceId) {
      throw new Error("Session manager is not initialized");
    }

    return this.extensionInstanceId;
  }
}
