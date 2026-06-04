type BrowserEventPayload = Record<string, any>;

type BufferedBrowserEvent = BrowserEventPayload & {
  sequence: number;
  type: "event";
  name: string;
  time: number;
  sessionId?: string | null;
  tabId?: number | null;
};

type BrowserEventQuery = {
  sessionId?: string;
  tabId?: number;
  name?: string;
  sinceSequence?: number;
  limit?: number;
};

class EventBuffer {
  private readonly maxEvents: number;
  private readonly events: BufferedBrowserEvent[] = [];
  private nextSequence = 1;

  constructor(options: { maxEvents?: number } = {}) {
    this.maxEvents = options.maxEvents ?? 500;
  }

  push(payload: BrowserEventPayload): BufferedBrowserEvent {
    const event: BufferedBrowserEvent = {
      sequence: this.nextSequence++,
      type: "event",
      time: Date.now(),
      ...payload
    } as BufferedBrowserEvent;

    this.events.push(event);

    while (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    return event;
  }

  list(query: BrowserEventQuery = {}): BufferedBrowserEvent[] {
    const limit = this.normalizeLimit(query.limit);
    let events = this.events;

    if (typeof query.sinceSequence === "number") {
      events = events.filter((event) => event.sequence > query.sinceSequence);
    }

    if (typeof query.name === "string" && query.name.trim()) {
      const name = query.name.trim();
      events = events.filter((event) => event.name === name);
    }

    if (typeof query.sessionId === "string" && query.sessionId.trim()) {
      const sessionId = query.sessionId.trim();
      events = events.filter((event) => event.sessionId === sessionId);
    }

    if (typeof query.tabId === "number") {
      events = events.filter((event) => event.tabId === query.tabId);
    }

    return events.slice(-limit);
  }

  clear(query: BrowserEventQuery = {}): number {
    const before = this.events.length;

    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index];

      if (this.matchesClearQuery(event, query)) {
        this.events.splice(index, 1);
      }
    }

    return before - this.events.length;
  }

  private matchesClearQuery(
    event: BufferedBrowserEvent,
    query: BrowserEventQuery
  ): boolean {
    if (
      typeof query.sinceSequence === "number" &&
      event.sequence <= query.sinceSequence
    ) {
      return false;
    }

    if (
      typeof query.name === "string" &&
      query.name.trim() &&
      event.name !== query.name.trim()
    ) {
      return false;
    }

    if (
      typeof query.sessionId === "string" &&
      query.sessionId.trim() &&
      event.sessionId !== query.sessionId.trim()
    ) {
      return false;
    }

    if (typeof query.tabId === "number" && event.tabId !== query.tabId) {
      return false;
    }

    return true;
  }

  private normalizeLimit(limit: unknown): number {
    if (typeof limit !== "number" || !Number.isFinite(limit)) {
      return 100;
    }

    return Math.max(1, Math.min(Math.floor(limit), this.maxEvents));
  }
}
