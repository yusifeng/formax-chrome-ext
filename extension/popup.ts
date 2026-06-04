const statusEl = document.querySelector("#status");
const outputEl = document.querySelector("#output");
const buttonEl = document.querySelector("#health");

async function checkHealth() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "POPUP_HEALTH"
    });

    statusEl.textContent = response?.ok ? "Connected" : "Disconnected";
    outputEl.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    statusEl.textContent = "Error";
    outputEl.textContent = String(error);
  }
}

buttonEl.addEventListener("click", checkHealth);
checkHealth();
