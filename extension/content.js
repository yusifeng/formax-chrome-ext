(() => {
    const pageWindow = window;
    if (pageWindow.__agentBrowserControllerContentInstalled) {
        return;
    }
    pageWindow.__agentBrowserControllerContentInstalled = true;
    const root = document.createElement("div");
    root.id = "agent-browser-controller-overlay-root";
    root.style.all = "initial";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.overflow = "hidden";
    root.style.pointerEvents = "none";
    root.style.zIndex = "2147483647";
    const highlight = document.createElement("div");
    highlight.id = "agent-browser-controller-highlight";
    highlight.style.all = "initial";
    highlight.style.position = "fixed";
    highlight.style.left = "0";
    highlight.style.top = "0";
    highlight.style.border = "2px solid rgba(16, 185, 129, 0.95)";
    highlight.style.borderRadius = "8px";
    highlight.style.background = "rgba(16, 185, 129, 0.08)";
    highlight.style.boxShadow =
        "0 0 0 4px rgba(16, 185, 129, 0.16), 0 12px 30px rgba(5, 150, 105, 0.20)";
    highlight.style.opacity = "0";
    highlight.style.pointerEvents = "none";
    highlight.style.transform = "translate3d(-9999px, -9999px, 0) scale(0.98)";
    highlight.style.transition =
        "opacity 140ms ease, transform 180ms cubic-bezier(.2,.8,.2,1), width 180ms cubic-bezier(.2,.8,.2,1), height 180ms cubic-bezier(.2,.8,.2,1)";
    highlight.style.willChange = "opacity, transform, width, height";
    const cursor = document.createElement("div");
    cursor.id = "agent-browser-controller-cursor";
    cursor.style.all = "initial";
    cursor.style.position = "fixed";
    cursor.style.left = "0";
    cursor.style.top = "0";
    cursor.style.height = "28px";
    cursor.style.opacity = "0";
    cursor.style.pointerEvents = "none";
    cursor.style.transform = "translate3d(-9999px, -9999px, 0)";
    cursor.style.transformOrigin = "7.2px 3.3px";
    cursor.style.width = "28px";
    cursor.style.willChange = "opacity, filter, transform";
    const cursorImage = document.createElement("img");
    cursorImage.alt = "";
    cursorImage.draggable = false;
    cursorImage.src = chrome.runtime.getURL("images/agent-cursor.png");
    cursorImage.style.all = "initial";
    cursorImage.style.display = "block";
    cursorImage.style.filter =
        "drop-shadow(0 0 7px rgba(16, 185, 129, 0.82)) drop-shadow(0 0 18px rgba(16, 185, 129, 0.42))";
    cursorImage.style.height = "28px";
    cursorImage.style.pointerEvents = "none";
    cursorImage.style.userSelect = "none";
    cursorImage.style.width = "28px";
    const activityDot = document.createElement("div");
    activityDot.style.all = "initial";
    activityDot.style.position = "absolute";
    activityDot.style.left = "20px";
    activityDot.style.top = "19px";
    activityDot.style.width = "6px";
    activityDot.style.height = "6px";
    activityDot.style.border = "1px solid rgba(255, 255, 255, 0.82)";
    activityDot.style.borderRadius = "9999px";
    activityDot.style.background = "rgba(16, 185, 129, 0.95)";
    activityDot.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.18)";
    activityDot.style.opacity = "0";
    activityDot.style.pointerEvents = "none";
    activityDot.style.transition =
        "opacity 140ms ease, background 140ms ease, box-shadow 140ms ease";
    const label = document.createElement("div");
    label.id = "agent-browser-controller-label";
    label.style.all = "initial";
    label.style.position = "fixed";
    label.style.left = "0";
    label.style.top = "0";
    label.style.padding = "4px 8px";
    label.style.border = "1px solid rgba(255, 255, 255, 0.72)";
    label.style.borderRadius = "9999px";
    label.style.background = "rgba(15, 23, 42, 0.88)";
    label.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.22)";
    label.style.color = "white";
    label.style.font =
        "500 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    label.style.opacity = "0";
    label.style.pointerEvents = "none";
    label.style.transform = "translate3d(-9999px, -9999px, 0)";
    label.style.transition = "opacity 120ms ease";
    label.style.whiteSpace = "nowrap";
    label.style.willChange = "opacity, transform";
    label.textContent = "Agent";
    cursor.appendChild(cursorImage);
    cursor.appendChild(activityDot);
    root.appendChild(highlight);
    root.appendChild(cursor);
    root.appendChild(label);
    let current = {
        x: Math.round(window.innerWidth * 0.58),
        y: Math.round(window.innerHeight * 0.55)
    };
    let target = { ...current };
    let velocity = { x: 0, y: 0 };
    let visible = false;
    let phase = "idle";
    let pendingArrival = null;
    let rafId = null;
    let lastFrameAt = 0;
    let highlightTimer = null;
    const faviconBadgeId = "agent-browser-controller-favicon-badge";
    function mount() {
        const parent = document.documentElement || document.body;
        if (!parent) {
            requestAnimationFrame(mount);
            return;
        }
        if (!root.isConnected) {
            parent.appendChild(root);
        }
    }
    function clampPoint(point) {
        return {
            x: Math.max(0, Math.min(window.innerWidth, point.x)),
            y: Math.max(0, Math.min(window.innerHeight, point.y))
        };
    }
    function updateCursorTransform() {
        const speed = Math.hypot(velocity.x, velocity.y);
        const scale = visible ? Math.min(1.04, 0.96 + speed / 9000) : 0.86;
        const opacity = visible ? Math.max(0.72, Math.min(1, 0.92 + speed / 7000)) : 0;
        const blur = visible ? 0 : 2;
        cursor.style.opacity = `${opacity}`;
        cursor.style.filter = `blur(${blur.toFixed(2)}px)`;
        cursor.style.transform = [
            `translate3d(${(current.x - 7.2).toFixed(2)}px, ${(current.y - 3.3).toFixed(2)}px, 0)`,
            `scale(${scale.toFixed(3)})`
        ].join(" ");
        label.style.opacity = "0";
        label.style.transform = `translate3d(${(current.x + 14).toFixed(2)}px, ${(current.y + 14).toFixed(2)}px, 0)`;
    }
    function applyPhase(nextPhase) {
        phase =
            nextPhase === "active" || nextPhase === "thinking" || nextPhase === "idle"
                ? nextPhase
                : "active";
        if (!visible || phase === "idle") {
            activityDot.style.opacity = "0";
            removeFaviconBadge();
            return;
        }
        if (phase === "thinking") {
            cursorImage.style.filter =
                "drop-shadow(0 0 7px rgba(59, 130, 246, 0.78)) drop-shadow(0 0 18px rgba(16, 185, 129, 0.32))";
            activityDot.style.background = "rgba(59, 130, 246, 0.96)";
            activityDot.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.20)";
        }
        else {
            cursorImage.style.filter =
                "drop-shadow(0 0 7px rgba(16, 185, 129, 0.82)) drop-shadow(0 0 18px rgba(16, 185, 129, 0.42))";
            activityDot.style.background = "rgba(16, 185, 129, 0.95)";
            activityDot.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.18)";
        }
        activityDot.style.opacity = "1";
        updateFaviconBadge(phase);
    }
    function updateFaviconBadge(nextPhase) {
        const color = nextPhase === "thinking" ? "#3b82f6" : "#10b981";
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
            '<rect width="32" height="32" rx="7" fill="#0f172a"/>',
            `<circle cx="22" cy="10" r="6" fill="${color}" stroke="white" stroke-width="2"/>`,
            '<path d="M8 22V8l10 10h-6l-4 4z" fill="white"/>',
            "</svg>"
        ].join("");
        const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        let link = document.getElementById(faviconBadgeId);
        if (!link) {
            link = document.createElement("link");
            link.id = faviconBadgeId;
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.href = href;
    }
    function removeFaviconBadge() {
        document.getElementById(faviconBadgeId)?.remove();
    }
    function sendCursorArrived() {
        const arrival = pendingArrival;
        if (!arrival) {
            return;
        }
        pendingArrival = null;
        chrome.runtime
            .sendMessage({
            type: "AGENT_CURSOR_ARRIVED",
            moveSequence: arrival.moveSequence,
            sessionId: arrival.sessionId,
            turnId: arrival.turnId
        })
            .catch(() => {
            // Visual acknowledgement is best effort.
        });
    }
    function animate(frameAt) {
        const dt = Math.max(1 / 240, Math.min(1 / 30, (frameAt - lastFrameAt) / 1000 || 1 / 60));
        lastFrameAt = frameAt;
        const stiffness = 42;
        const damping = 14;
        const ax = (target.x - current.x) * stiffness - velocity.x * damping;
        const ay = (target.y - current.y) * stiffness - velocity.y * damping;
        velocity = {
            x: velocity.x + ax * dt,
            y: velocity.y + ay * dt
        };
        current = {
            x: current.x + velocity.x * dt,
            y: current.y + velocity.y * dt
        };
        updateCursorTransform();
        const settled = Math.hypot(target.x - current.x, target.y - current.y) < 0.35 &&
            Math.hypot(velocity.x, velocity.y) < 6;
        if (settled) {
            current = { ...target };
            velocity = { x: 0, y: 0 };
            updateCursorTransform();
            rafId = null;
            sendCursorArrived();
            return;
        }
        rafId = requestAnimationFrame(animate);
    }
    function ensureAnimation() {
        if (rafId != null)
            return;
        lastFrameAt = performance.now();
        rafId = requestAnimationFrame(animate);
    }
    function setCursor(point, options = {}) {
        const next = clampPoint(point);
        const shouldAnimate = options.animate !== false;
        visible = options.visible !== false;
        pendingArrival = options.arrival ?? null;
        applyPhase(options.phase ?? phase);
        if (!shouldAnimate) {
            target = next;
            current = next;
            velocity = { x: 0, y: 0 };
            updateCursorTransform();
            sendCursorArrived();
            return;
        }
        target = next;
        updateCursorTransform();
        ensureAnimation();
    }
    function showClickRipple(point) {
        const ripple = document.createElement("div");
        ripple.style.all = "initial";
        ripple.style.position = "fixed";
        ripple.style.left = `${point.x - 16}px`;
        ripple.style.top = `${point.y - 16}px`;
        ripple.style.width = "32px";
        ripple.style.height = "32px";
        ripple.style.border = "2px solid rgba(16, 185, 129, 0.95)";
        ripple.style.borderRadius = "9999px";
        ripple.style.boxShadow = "0 0 0 6px rgba(16, 185, 129, 0.14)";
        ripple.style.opacity = "0.95";
        ripple.style.pointerEvents = "none";
        ripple.style.transform = "scale(0.45)";
        ripple.style.transition =
            "opacity 360ms ease-out, transform 360ms cubic-bezier(.2,.8,.2,1)";
        ripple.style.willChange = "opacity, transform";
        root.appendChild(ripple);
        requestAnimationFrame(() => {
            ripple.style.opacity = "0";
            ripple.style.transform = "scale(1.75)";
        });
        window.setTimeout(() => {
            ripple.remove();
        }, 420);
    }
    function showHighlight(rect) {
        if (highlightTimer != null) {
            window.clearTimeout(highlightTimer);
            highlightTimer = null;
        }
        const margin = 3;
        highlight.style.width = `${Math.max(0, rect.width + margin * 2)}px`;
        highlight.style.height = `${Math.max(0, rect.height + margin * 2)}px`;
        highlight.style.opacity = "1";
        highlight.style.transform = `translate3d(${rect.x - margin}px, ${rect.y - margin}px, 0) scale(1)`;
        highlightTimer = window.setTimeout(() => {
            highlight.style.opacity = "0";
            highlight.style.transform = `translate3d(${rect.x - margin}px, ${rect.y - margin}px, 0) scale(0.985)`;
        }, 900);
    }
    mount();
    setCursor(current, { animate: false, visible: false });
    restoreCursorState();
    function restoreCursorState() {
        chrome.runtime
            .sendMessage({
            type: "GET_AGENT_CURSOR_STATE"
        })
            .then((response) => {
            const state = response?.state;
            if (!response?.ok ||
                !state ||
                !Number.isFinite(state.x) ||
                !Number.isFinite(state.y)) {
                return;
            }
            setCursor({
                x: Number(state.x),
                y: Number(state.y)
            }, {
                animate: false,
                phase: state.phase,
                visible: state.visible !== false
            });
        })
            .catch(() => {
            // The background may not be ready on restricted pages.
        });
    }
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || typeof message !== "object") {
            return;
        }
        if (message.type === "CONTENT_PING") {
            sendResponse({ ok: true });
            return true;
        }
        if (message.type === "AGENT_CURSOR") {
            const x = Number(message.x);
            const y = Number(message.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }
            setCursor({ x, y }, {
                animate: message.animate !== false,
                arrival: Number.isFinite(Number(message.moveSequence))
                    ? {
                        moveSequence: Number(message.moveSequence),
                        sessionId: typeof message.sessionId === "string" ? message.sessionId : null,
                        turnId: typeof message.turnId === "string" ? message.turnId : null
                    }
                    : null,
                phase: message.phase,
                visible: message.visible !== false
            });
            return;
        }
        if (message.type === "AGENT_CURSOR_CLICK") {
            const x = Number(message.x);
            const y = Number(message.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }
            setCursor({ x, y }, { animate: true, phase: "active", visible: true });
            showClickRipple({ x, y });
            return;
        }
        if (message.type === "AGENT_HIGHLIGHT") {
            const rect = message.rect;
            if (!rect ||
                !Number.isFinite(rect.x) ||
                !Number.isFinite(rect.y) ||
                !Number.isFinite(rect.width) ||
                !Number.isFinite(rect.height)) {
                return;
            }
            showHighlight(rect);
        }
    });
})();
