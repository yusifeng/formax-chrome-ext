class EventBuffer {
    maxEvents;
    events = [];
    nextSequence = 1;
    constructor(options = {}) {
        this.maxEvents = options.maxEvents ?? 500;
    }
    push(payload) {
        const event = {
            sequence: this.nextSequence++,
            type: "event",
            time: Date.now(),
            ...payload
        };
        this.events.push(event);
        while (this.events.length > this.maxEvents) {
            this.events.shift();
        }
        return event;
    }
    list(query = {}) {
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
    clear(query = {}) {
        const before = this.events.length;
        for (let index = this.events.length - 1; index >= 0; index -= 1) {
            const event = this.events[index];
            if (this.matchesClearQuery(event, query)) {
                this.events.splice(index, 1);
            }
        }
        return before - this.events.length;
    }
    matchesClearQuery(event, query) {
        if (typeof query.sinceSequence === "number" &&
            event.sequence <= query.sinceSequence) {
            return false;
        }
        if (typeof query.name === "string" &&
            query.name.trim() &&
            event.name !== query.name.trim()) {
            return false;
        }
        if (typeof query.sessionId === "string" &&
            query.sessionId.trim() &&
            event.sessionId !== query.sessionId.trim()) {
            return false;
        }
        if (typeof query.tabId === "number" && event.tabId !== query.tabId) {
            return false;
        }
        return true;
    }
    normalizeLimit(limit) {
        if (typeof limit !== "number" || !Number.isFinite(limit)) {
            return 100;
        }
        return Math.max(1, Math.min(Math.floor(limit), this.maxEvents));
    }
}
