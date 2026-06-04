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
    root.style.pointerEvents = "none";
    root.style.zIndex = "2147483647";
    const cursor = document.createElement("div");
    cursor.id = "agent-browser-controller-cursor";
    cursor.style.all = "initial";
    cursor.style.position = "fixed";
    cursor.style.left = "0";
    cursor.style.top = "0";
    cursor.style.width = "18px";
    cursor.style.height = "18px";
    cursor.style.borderRadius = "9999px";
    cursor.style.background = "rgba(34, 197, 94, 0.95)";
    cursor.style.boxShadow = "0 0 0 4px rgba(34, 197, 94, 0.25)";
    cursor.style.pointerEvents = "none";
    cursor.style.transform = "translate(-100px, -100px)";
    cursor.style.transition = "transform 120ms ease";
    cursor.style.display = "none";
    const label = document.createElement("div");
    label.id = "agent-browser-controller-label";
    label.style.all = "initial";
    label.style.position = "fixed";
    label.style.left = "0";
    label.style.top = "0";
    label.style.padding = "4px 8px";
    label.style.borderRadius = "9999px";
    label.style.background = "rgba(17, 24, 39, 0.95)";
    label.style.color = "white";
    label.style.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    label.style.pointerEvents = "none";
    label.style.transform = "translate(-100px, -100px)";
    label.style.transition = "transform 120ms ease";
    label.style.display = "none";
    label.textContent = "Agent";
    const highlight = document.createElement("div");
    highlight.id = "agent-browser-controller-highlight";
    highlight.style.all = "initial";
    highlight.style.position = "fixed";
    highlight.style.left = "0";
    highlight.style.top = "0";
    highlight.style.border = "2px solid rgba(34, 197, 94, 0.95)";
    highlight.style.borderRadius = "6px";
    highlight.style.boxShadow = "0 0 0 4px rgba(34, 197, 94, 0.18)";
    highlight.style.pointerEvents = "none";
    highlight.style.transform = "translate(-100px, -100px)";
    highlight.style.display = "none";
    root.appendChild(highlight);
    root.appendChild(cursor);
    root.appendChild(label);
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
    mount();
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
            cursor.style.display = "block";
            label.style.display = "block";
            cursor.style.transform = `translate(${x - 9}px, ${y - 9}px)`;
            label.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
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
            highlight.style.display = "block";
            highlight.style.width = `${rect.width}px`;
            highlight.style.height = `${rect.height}px`;
            highlight.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
            window.setTimeout(() => {
                highlight.style.display = "none";
            }, 900);
        }
    });
})();
