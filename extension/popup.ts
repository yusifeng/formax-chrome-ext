const statusEl = document.querySelector("#status") as HTMLElement;
const statusLabelEl = document.querySelector("#status-label") as HTMLElement;
const refreshButtonEl = document.querySelector("#refresh") as HTMLButtonElement;
const versionEl = document.querySelector("#version") as HTMLElement;

function setStatus(state: "checking" | "connected" | "disconnected" | "error", label: string) {
  statusEl.dataset.state = state;
  statusLabelEl.textContent = label;
}

function setVersion(version?: string) {
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
  } catch (error) {
    setStatus("error", "Error");
    setVersion();
  } finally {
    refreshButtonEl.disabled = false;
  }
}

refreshButtonEl.addEventListener("click", checkHealth);
setVersion();
void checkHealth();
