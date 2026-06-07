const statusEl = document.querySelector("#status");
const statusLabelEl = document.querySelector("#status-label");
const refreshButtonEl = document.querySelector("#refresh");
const versionEl = document.querySelector("#version");
function setStatus(state, label) {
    statusEl.dataset.state = state;
    statusLabelEl.textContent = label;
}
function setVersion(version) {
    const manifestVersion = chrome.runtime.getManifest().version;
    versionEl.textContent = `Version v${version || manifestVersion}`;
}
async function checkHealth() {
    setStatus("checking", "Checking...");
    refreshButtonEl.disabled = true;
    try {
        const response = await chrome.runtime.sendMessage({
            type: "POPUP_HEALTH"
        });
        setStatus(response?.ok ? "connected" : "disconnected", response?.ok ? "Connected" : "Disconnected");
        setVersion(response?.health?.version);
    }
    catch (error) {
        setStatus("error", "Error");
        setVersion();
    }
    finally {
        refreshButtonEl.disabled = false;
    }
}
refreshButtonEl.addEventListener("click", checkHealth);
setVersion();
void checkHealth();
