const RPC_URL = process.env.AGENT_BROWSER_RPC_URL || "http://127.0.0.1:8765/rpc";
const RPC_TOKEN = process.env.AGENT_BROWSER_TOKEN || "";
async function browserRpc(action, params = {}, timeoutMs = 30000) {
    const headers = {
        "content-type": "application/json"
    };
    if (RPC_TOKEN) {
        headers["x-agent-browser-token"] = RPC_TOKEN;
    }
    const response = await fetch(RPC_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
            action,
            params,
            timeoutMs
        })
    });
    const json = (await response.json());
    if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `Browser RPC failed: ${action}`);
    }
    return json.result;
}
export async function browserHealth() {
    return browserRpc("health");
}
export async function browserGetEvents(args = {}) {
    return browserRpc("getEvents", args);
}
export async function browserClearEvents(args = {}) {
    return browserRpc("clearEvents", args);
}
export async function browserWaitForEvent(args = {}) {
    return browserRpc("waitForEvent", args);
}
export async function browserStartSession(args = {}) {
    return browserRpc("startSession", args);
}
export async function browserNameSession(args) {
    return browserRpc("nameSession", args);
}
export async function browserClaimTab(args = {}) {
    return browserRpc("claimTab", args);
}
export async function browserCreateTab(args = {}) {
    return browserRpc("createTab", args);
}
export async function browserSwitchTab(args) {
    return browserRpc("switchTab", args);
}
export async function browserListTabs(args = {}) {
    return browserRpc("listTabs", args);
}
export async function browserGetTab(args = {}) {
    return browserRpc("getTab", args);
}
export async function browserOpenUrl(args) {
    return browserRpc("openUrl", args);
}
export async function browserGoBack(args = {}) {
    return browserRpc("goBack", args);
}
export async function browserGoForward(args = {}) {
    return browserRpc("goForward", args);
}
export async function browserReload(args = {}) {
    return browserRpc("reload", args);
}
export async function browserWaitForLoadState(args) {
    return browserRpc("waitForLoadState", args);
}
export async function browserWaitForUrl(args) {
    return browserRpc("waitForUrl", args);
}
export async function browserWaitForSelector(args) {
    return browserRpc("waitForSelector", args);
}
export async function browserWaitForText(args) {
    return browserRpc("waitForText", args);
}
export async function browserObserve(args) {
    return browserRpc("observe", args);
}
export async function browserLocatorQuery(args) {
    return browserRpc("locatorQuery", args);
}
export async function browserLocatorAction(args) {
    return browserRpc("locatorAction", args);
}
export async function browserLocatorWait(args) {
    return browserRpc("locatorWait", args);
}
export async function browserClick(args) {
    return browserRpc("click", args);
}
export async function browserMoveMouse(args) {
    return browserRpc("moveMouse", args);
}
export async function browserScroll(args) {
    return browserRpc("scroll", args);
}
export async function browserTypeText(args) {
    return browserRpc("typeText", args);
}
export async function browserEvaluate(args) {
    return browserRpc("evaluate", args);
}
export async function browserPressKey(args) {
    return browserRpc("pressKey", args);
}
export async function browserHandleDialog(args) {
    return browserRpc("handleDialog", args);
}
export async function browserScreenshot(args) {
    return browserRpc("screenshot", args);
}
export async function browserUploadFile(args) {
    return browserRpc("uploadFile", args);
}
export async function browserCdp(args) {
    return browserRpc("cdp", args);
}
export async function browserGetDevLogs(args = {}) {
    return browserRpc("getDevLogs", args);
}
export async function browserGetCapabilities(args = {}) {
    return browserRpc("getCapabilities", args);
}
export async function browserListDownloads(args = {}) {
    return browserRpc("listDownloads", args);
}
export async function browserWaitForDownload(args = {}) {
    return browserRpc("waitForDownload", args);
}
export async function browserCloseTab(args) {
    return browserRpc("closeTab", args);
}
export async function browserFinalizeSession(args) {
    return browserRpc("finalizeSession", args);
}
export async function browserStopSession(args) {
    return browserRpc("stopSession", args);
}
export const browserToolSchemas = [
    {
        name: "browser_health",
        description: "Check whether the browser extension and native host are connected.",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false
        }
    },
    {
        name: "browser_get_events",
        description: "Read recent buffered browser events such as navigation, dialogs, downloads, and debugger detach.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                name: { type: "string" },
                sinceSequence: { type: "number" },
                limit: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_clear_events",
        description: "Clear buffered browser events, optionally filtered by session, tab, name, or sequence.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                name: { type: "string" },
                sinceSequence: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_wait_for_event",
        description: "Wait for a buffered browser event such as navigation, dialog, download, or dev log.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                name: { type: "string" },
                sinceSequence: { type: "number" },
                limit: { type: "number" },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_start_session",
        description: "Start a Chrome browser control session.",
        parameters: {
            type: "object",
            properties: {
                active: { type: "boolean" },
                initialUrl: { type: "string" },
                name: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_name_session",
        description: "Name an active browser automation session and its Chrome tab group.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                name: { type: "string" }
            },
            required: ["sessionId", "name"],
            additionalProperties: false
        }
    },
    {
        name: "browser_claim_tab",
        description: "Claim the current or specified Chrome tab into a browser control session.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                active: { type: "boolean" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_create_tab",
        description: "Create a new tab inside a browser control session.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                url: { type: "string" },
                active: { type: "boolean" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_switch_tab",
        description: "Make a controlled tab active inside its session.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_list_tabs",
        description: "List Chrome tabs, optionally filtered to controlled tabs or a browser session.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                controlledOnly: { type: "boolean" },
                currentWindow: { type: "boolean" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_get_tab",
        description: "Get one Chrome tab summary by tabId or the active tab in a session.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_open_url",
        description: "Open an http or https URL in a controlled Chrome tab.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                url: { type: "string" },
                active: { type: "boolean" },
                timeoutMs: { type: "number" }
            },
            required: ["url"],
            additionalProperties: false
        }
    },
    {
        name: "browser_go_back",
        description: "Navigate the controlled tab back in browser history.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                waitForLoad: { type: "boolean" },
                timeoutMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_go_forward",
        description: "Navigate the controlled tab forward in browser history.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                waitForLoad: { type: "boolean" },
                timeoutMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_reload",
        description: "Reload the controlled tab.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                ignoreCache: { type: "boolean" },
                waitForLoad: { type: "boolean" },
                timeoutMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_wait_for_load_state",
        description: "Wait until the controlled tab reaches a page load state.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                state: {
                    type: "string",
                    enum: ["load", "domcontentloaded"]
                },
                timeoutMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_wait_for_url",
        description: "Wait for the controlled tab URL to match an exact URL, substring, or regular expression.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                url: { type: "string" },
                urlContains: { type: "string" },
                urlRegex: { type: "string" },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_wait_for_selector",
        description: "Wait for a CSS selector to become attached, visible, hidden, or detached.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                selector: { type: "string" },
                state: {
                    type: "string",
                    enum: ["attached", "visible", "hidden", "detached"]
                },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" }
            },
            required: ["selector"],
            additionalProperties: false
        }
    },
    {
        name: "browser_wait_for_text",
        description: "Wait for page text to appear or disappear.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                text: { type: "string" },
                state: {
                    type: "string",
                    enum: ["present", "hidden"]
                },
                exact: { type: "boolean" },
                caseSensitive: { type: "boolean" },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" }
            },
            required: ["text"],
            additionalProperties: false
        }
    },
    {
        name: "browser_observe",
        description: "Read the current page URL, title, visible text, and interactable elements.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                includeAccessibility: { type: "boolean" },
                maxAccessibilityNodes: { type: "number" },
                includeDomSnapshot: { type: "boolean" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_locator_query",
        description: "Query a CSS locator in the controlled tab for count, visibility, text, attributes, or bounds.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                locator: {
                    type: "object",
                    properties: {
                        kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
                        selector: { type: "string" },
                        text: { type: "string" },
                        role: { type: "string" },
                        name: { type: "string" },
                        testId: { type: "string" },
                        exact: { type: "boolean" },
                        index: { type: "number" },
                        strict: { type: "boolean" }
                    },
                    required: ["kind"],
                    additionalProperties: false
                },
                kind: {
                    type: "string",
                    enum: [
                        "count",
                        "allTextContents",
                        "textContent",
                        "innerText",
                        "getAttribute",
                        "isVisible",
                        "isEnabled",
                        "boundingBox"
                    ]
                },
                args: {
                    type: "object",
                    additionalProperties: true
                },
                timeoutMs: { type: "number" }
            },
            required: ["locator", "kind"],
            additionalProperties: false
        }
    },
    {
        name: "browser_locator_action",
        description: "Perform a basic action on a CSS locator, resolving it at action time.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                locator: {
                    type: "object",
                    properties: {
                        kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
                        selector: { type: "string" },
                        text: { type: "string" },
                        role: { type: "string" },
                        name: { type: "string" },
                        testId: { type: "string" },
                        exact: { type: "boolean" },
                        index: { type: "number" },
                        strict: { type: "boolean" }
                    },
                    required: ["kind"],
                    additionalProperties: false
                },
                kind: {
                    type: "string",
                    enum: ["click", "dblclick", "fill", "type", "press", "clear", "focus", "hover", "setChecked", "selectOption"]
                },
                args: {
                    type: "object",
                    additionalProperties: true
                },
                timeoutMs: { type: "number" },
                waitMs: { type: "number" }
            },
            required: ["locator", "kind"],
            additionalProperties: false
        }
    },
    {
        name: "browser_locator_wait",
        description: "Wait for a CSS locator to become attached, visible, hidden, or detached.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                locator: {
                    type: "object",
                    properties: {
                        kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
                        selector: { type: "string" },
                        text: { type: "string" },
                        role: { type: "string" },
                        name: { type: "string" },
                        testId: { type: "string" },
                        exact: { type: "boolean" },
                        index: { type: "number" },
                        strict: { type: "boolean" }
                    },
                    required: ["kind"],
                    additionalProperties: false
                },
                state: {
                    type: "string",
                    enum: ["attached", "visible", "hidden", "detached"]
                },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" }
            },
            required: ["locator"],
            additionalProperties: false
        }
    },
    {
        name: "browser_click",
        description: "Click a page target by observation ref, CSS selector, or viewport coordinates.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                ref: { type: "string" },
                selector: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
                button: {
                    type: "string",
                    enum: ["left", "middle", "right"]
                },
                clickCount: { type: "number" },
                waitMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_move_mouse",
        description: "Move the visible agent cursor and Chrome mouse pointer to page coordinates.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                x: { type: "number" },
                y: { type: "number" },
                waitMs: { type: "number" }
            },
            required: ["x", "y"],
            additionalProperties: false
        }
    },
    {
        name: "browser_scroll",
        description: "Scroll the controlled tab by pixel deltas.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                deltaX: { type: "number" },
                deltaY: { type: "number" },
                x: { type: "number" },
                y: { type: "number" },
                waitMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_type_text",
        description: "Type text into the focused page or into a target by ref, CSS selector, or coordinates.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                ref: { type: "string" },
                selector: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
                text: { type: "string" },
                clear: { type: "boolean" },
                waitMs: { type: "number" }
            },
            required: ["text"],
            additionalProperties: false
        }
    },
    {
        name: "browser_evaluate",
        description: "Evaluate JavaScript in the controlled tab and return the JSON-serializable value.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                script: { type: "string" },
                awaitPromise: { type: "boolean" },
                timeoutMs: { type: "number" }
            },
            required: ["script"],
            additionalProperties: false
        }
    },
    {
        name: "browser_press_key",
        description: "Press a key in the controlled Chrome tab.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                key: {
                    type: "string",
                    enum: [
                        "Enter",
                        "Tab",
                        "Escape",
                        "Backspace",
                        "ArrowUp",
                        "ArrowDown",
                        "ArrowLeft",
                        "ArrowRight"
                    ]
                },
                waitMs: { type: "number" }
            },
            required: ["key"],
            additionalProperties: false
        }
    },
    {
        name: "browser_handle_dialog",
        description: "Accept or dismiss the currently open JavaScript alert, confirm, or prompt dialog.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                accept: { type: "boolean" },
                promptText: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_screenshot",
        description: "Capture a screenshot of the controlled Chrome tab.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                format: {
                    type: "string",
                    enum: ["png", "jpeg"]
                }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_upload_file",
        description: "Upload a local file through an input[type=file] element by observation ref, selector, or locator.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                ref: { type: "string" },
                selector: { type: "string" },
                locator: {
                    type: "object",
                    properties: {
                        kind: { type: "string", enum: ["css", "text", "role", "label", "placeholder", "testId"] },
                        selector: { type: "string" },
                        text: { type: "string" },
                        role: { type: "string" },
                        name: { type: "string" },
                        testId: { type: "string" },
                        exact: { type: "boolean" },
                        index: { type: "number" },
                        strict: { type: "boolean" }
                    },
                    required: ["kind"],
                    additionalProperties: false
                },
                filePath: { type: "string" },
                waitMs: { type: "number" }
            },
            required: ["filePath"],
            additionalProperties: false
        }
    },
    {
        name: "browser_cdp",
        description: "Send a raw Chrome DevTools Protocol command to a controlled tab.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                method: { type: "string" },
                params: {
                    type: "object",
                    additionalProperties: true
                },
                timeoutMs: { type: "number" }
            },
            required: ["method"],
            additionalProperties: false
        }
    },
    {
        name: "browser_get_dev_logs",
        description: "Read buffered console, log, and runtime exception entries for a tab.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                level: { type: "string" },
                sinceSequence: { type: "number" },
                limit: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_get_capabilities",
        description: "List browser or tab capabilities advertised by the current backend.",
        parameters: {
            type: "object",
            properties: {
                scope: {
                    type: "string",
                    enum: ["browser", "tab"]
                },
                sessionId: { type: "string" },
                tabId: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_list_downloads",
        description: "List recent Chrome downloads matching optional filters.",
        parameters: {
            type: "object",
            properties: {
                id: { type: "number" },
                state: {
                    type: "string",
                    enum: ["in_progress", "interrupted", "complete"]
                },
                urlContains: { type: "string" },
                filenameContains: { type: "string" },
                mimeContains: { type: "string" },
                startedAfter: { type: "number" },
                limit: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_wait_for_download",
        description: "Wait for a Chrome download to reach a target state and return its local filename.",
        parameters: {
            type: "object",
            properties: {
                id: { type: "number" },
                state: {
                    type: "string",
                    enum: ["in_progress", "interrupted", "complete", "any"]
                },
                urlContains: { type: "string" },
                filenameContains: { type: "string" },
                mimeContains: { type: "string" },
                startedAfter: { type: "number" },
                limit: { type: "number" },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_close_tab",
        description: "Close one controlled Chrome tab and clean up debugger/session state.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_finalize_session",
        description: "End a browser control session, optionally keeping selected tabs open for the user.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                keepTabIds: {
                    type: "array",
                    items: { type: "number" }
                },
                closeRest: { type: "boolean" }
            },
            required: ["sessionId"],
            additionalProperties: false
        }
    },
    {
        name: "browser_stop_session",
        description: "Stop a Chrome browser control session and optionally close its tabs.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                closeTabs: { type: "boolean" }
            },
            required: ["sessionId"],
            additionalProperties: false
        }
    }
];
export async function callBrowserTool(name, args) {
    switch (name) {
        case "browser_health":
            return browserHealth();
        case "browser_get_events":
            return browserGetEvents(args);
        case "browser_clear_events":
            return browserClearEvents(args);
        case "browser_wait_for_event":
            return browserWaitForEvent(args);
        case "browser_start_session":
            return browserStartSession(args);
        case "browser_name_session":
            return browserNameSession(args);
        case "browser_claim_tab":
            return browserClaimTab(args);
        case "browser_create_tab":
            return browserCreateTab(args);
        case "browser_switch_tab":
            return browserSwitchTab(args);
        case "browser_list_tabs":
            return browserListTabs(args);
        case "browser_get_tab":
            return browserGetTab(args);
        case "browser_open_url":
            return browserOpenUrl(args);
        case "browser_go_back":
            return browserGoBack(args);
        case "browser_go_forward":
            return browserGoForward(args);
        case "browser_reload":
            return browserReload(args);
        case "browser_wait_for_load_state":
            return browserWaitForLoadState(args);
        case "browser_wait_for_url":
            return browserWaitForUrl(args);
        case "browser_wait_for_selector":
            return browserWaitForSelector(args);
        case "browser_wait_for_text":
            return browserWaitForText(args);
        case "browser_observe":
            return browserObserve(args);
        case "browser_locator_query":
            return browserLocatorQuery(args);
        case "browser_locator_action":
            return browserLocatorAction(args);
        case "browser_locator_wait":
            return browserLocatorWait(args);
        case "browser_click":
            return browserClick(args);
        case "browser_move_mouse":
            return browserMoveMouse(args);
        case "browser_scroll":
            return browserScroll(args);
        case "browser_type_text":
            return browserTypeText(args);
        case "browser_evaluate":
            return browserEvaluate(args);
        case "browser_press_key":
            return browserPressKey(args);
        case "browser_handle_dialog":
            return browserHandleDialog(args);
        case "browser_screenshot":
            return browserScreenshot(args);
        case "browser_upload_file":
            return browserUploadFile(args);
        case "browser_cdp":
            return browserCdp(args);
        case "browser_get_dev_logs":
            return browserGetDevLogs(args);
        case "browser_get_capabilities":
            return browserGetCapabilities(args);
        case "browser_list_downloads":
            return browserListDownloads(args);
        case "browser_wait_for_download":
            return browserWaitForDownload(args);
        case "browser_close_tab":
            return browserCloseTab(args);
        case "browser_finalize_session":
            return browserFinalizeSession(args);
        case "browser_stop_session":
            return browserStopSession(args);
        default:
            throw new Error(`Unknown browser tool: ${name}`);
    }
}
