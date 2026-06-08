import { browserActionRegistry } from "./action-registry.js";
const BROWSER_BASE_KEYS = [
    "Enter",
    "Tab",
    "Escape",
    "Backspace",
    "Delete",
    "Insert",
    "Space",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Pause",
    "CapsLock",
    "NumLock",
    "ScrollLock",
    "ContextMenu",
    ...Array.from({ length: 12 }, (_value, index) => `F${index + 1}`),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    ..."abcdefghijklmnopqrstuvwxyz".split(""),
    ..."0123456789".split(""),
    "`",
    "-",
    "=",
    "[",
    "]",
    "\\",
    ";",
    "'",
    ",",
    ".",
    "/"
];
const BROWSER_KEY_ALIASES = [
    "Esc",
    "Del",
    "Spacebar",
    "Left",
    "Right",
    "Up",
    "Down",
    "PgUp",
    "PgDown",
    "Return",
    "Apps",
    "Menu"
];
const BROWSER_MODIFIER_KEYS = ["Alt", "Control", "ControlOrMeta", "Meta", "Shift"];
const BROWSER_MODIFIER_ALIASES = ["Ctrl", "Cmd", "Command", "Option"];
const BROWSER_MOUSE_BUTTONS = ["left", "middle", "right", "back", "forward"];
const BROWSER_POINTER_MODIFIERS = BROWSER_MODIFIER_KEYS;
const BROWSER_PRESS_KEY_BASES = [...BROWSER_BASE_KEYS, ...BROWSER_KEY_ALIASES];
const BROWSER_PRESS_KEY_MODIFIERS = [...BROWSER_MODIFIER_KEYS, ...BROWSER_MODIFIER_ALIASES];
const BROWSER_SUPPORTED_KEYS = [
    ...BROWSER_PRESS_KEY_BASES,
    ...BROWSER_PRESS_KEY_MODIFIERS,
    ...BROWSER_PRESS_KEY_MODIFIERS.flatMap((modifier) => BROWSER_PRESS_KEY_BASES.map((key) => `${modifier}+${key}`)),
    ...BROWSER_PRESS_KEY_MODIFIERS.flatMap((first, firstIndex) => BROWSER_PRESS_KEY_MODIFIERS.slice(firstIndex + 1).flatMap((second) => BROWSER_PRESS_KEY_BASES.map((key) => `${first}+${second}+${key}`)))
];
export const browserToolSchemas = [
    {
        name: "browser_health",
        description: "Check whether the browser extension and native host are connected.",
        parameters: {
            type: "object",
            properties: {
                nativeDiagnostics: {
                    type: "object",
                    additionalProperties: true
                }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_reload_extension",
        description: "Ask the extension background to reload itself after the current response returns.",
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
                limit: { type: "number" },
                includeSnapshots: { type: "boolean" },
                snapshotLimit: { type: "number" }
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
                sinceSequence: { type: "number" },
                includeSnapshots: { type: "boolean" }
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
        name: "browser_get_diagnostics",
        description: "Export a bounded diagnostics snapshot with health, recent events, dev logs, sessions, attached debugger tabs, extension metadata, and native manifest metadata.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                eventLimit: { type: "number" },
                devLogLimit: { type: "number" },
                includeSnapshots: { type: "boolean" },
                nativeDiagnostics: {
                    type: "object",
                    additionalProperties: true
                }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_get_policy",
        description: "Read browser-use policy state including per-session allows, persistent allows, and blocked hosts.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_update_policy",
        description: "Update browser-use host policy. Use allow for the current session, always_allow for persistent allow, or deny for blocklist.",
        parameters: {
            type: "object",
            properties: {
                decision: {
                    type: "string",
                    enum: ["allow", "always_allow", "deny"]
                },
                sessionId: { type: "string" },
                host: { type: "string" },
                url: { type: "string" },
                reset: { type: "boolean" }
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
                sessionId: { type: "string" },
                turnId: { type: "string" },
                active: { type: "boolean" },
                initialUrl: { type: "string" },
                name: { type: "string" }
            },
            required: ["sessionId"],
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
        name: "browser_user_open_tabs",
        description: "List user-visible Chrome tabs that can be claimed. Use the returned claimToken with browser_claim_tab instead of guessing tab IDs.",
        parameters: {
            type: "object",
            properties: {
                currentWindow: { type: "boolean" },
                includeControlled: { type: "boolean" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_claim_tab",
        description: "Claim a Chrome tab into a browser control session. Prefer passing claimToken from browser_user_open_tabs; naked tabId claims require allowUnsafeTabIdClaim.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                turnId: { type: "string" },
                claimToken: { type: "string" },
                tabId: { type: "number" },
                active: { type: "boolean" },
                allowUnsafeTabIdClaim: { type: "boolean" }
            },
            required: ["sessionId"],
            additionalProperties: false
        }
    },
    {
        name: "browser_user_history",
        description: "Read Chrome browsing history. Requires explicit per-request confirmation and has no always-allow policy path.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string" },
                from: {
                    type: "number"
                },
                to: {
                    type: "number"
                },
                limit: { type: "number" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_clipboard_read_text",
        description: "Read plain text from the system clipboard through the extension offscreen clipboard backend. Requires explicit per-request confirmation.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_clipboard_write_text",
        description: "Write plain text to the system clipboard through the extension offscreen clipboard backend. Requires explicit per-request confirmation.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                text: { type: "string" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" },
                sensitive: { type: "boolean" }
            },
            required: ["text"],
            additionalProperties: false
        }
    },
    {
        name: "browser_clipboard_read",
        description: "Read typed clipboard items from the system clipboard. Requires explicit per-request confirmation.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_clipboard_write",
        description: "Write typed clipboard items to the system clipboard. Requires explicit per-request confirmation.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            types: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        mimeType: { type: "string" },
                                        text: { type: "string" },
                                        dataBase64: { type: "string" },
                                        size: { type: "number" }
                                    },
                                    required: ["mimeType"],
                                    additionalProperties: false
                                }
                            }
                        },
                        required: ["types"],
                        additionalProperties: false
                    }
                },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" },
                sensitive: { type: "boolean" }
            },
            required: ["items"],
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
                turnId: { type: "string" },
                url: { type: "string" },
                active: { type: "boolean" }
            },
            required: ["sessionId"],
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
                    enum: ["commit", "load", "domcontentloaded", "networkidle"]
                },
                timeoutMs: { type: "number" },
                idleMs: { type: "number" }
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
                waitUntil: {
                    type: "string",
                    enum: ["commit", "load", "domcontentloaded", "networkidle"]
                },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" },
                idleMs: { type: "number" }
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
        name: "browser_element_info",
        description: "Inspect the element at viewport coordinates and return selector candidates, role/name, bounds, and backend DOM node id.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                x: { type: "number" },
                y: { type: "number" },
                includeNonInteractable: { type: "boolean" }
            },
            required: ["x", "y"],
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
                        frameSelectors: { type: "array", items: { type: "string" } },
                        and: { type: "object", additionalProperties: true },
                        or: { type: "object", additionalProperties: true },
                        has: { type: "object", additionalProperties: true },
                        hasNot: { type: "object", additionalProperties: true },
                        hasText: { type: "string" },
                        hasNotText: { type: "string" },
                        visible: { type: "boolean" },
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
                        "inputValue",
                        "isChecked",
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
                        frameSelectors: { type: "array", items: { type: "string" } },
                        and: { type: "object", additionalProperties: true },
                        or: { type: "object", additionalProperties: true },
                        has: { type: "object", additionalProperties: true },
                        hasNot: { type: "object", additionalProperties: true },
                        hasText: { type: "string" },
                        hasNotText: { type: "string" },
                        visible: { type: "boolean" },
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
                        frameSelectors: { type: "array", items: { type: "string" } },
                        and: { type: "object", additionalProperties: true },
                        or: { type: "object", additionalProperties: true },
                        has: { type: "object", additionalProperties: true },
                        hasNot: { type: "object", additionalProperties: true },
                        hasText: { type: "string" },
                        hasNotText: { type: "string" },
                        visible: { type: "boolean" },
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
        name: "browser_resolve_frame",
        description: "Resolve a frameLocator selector path to CDP frame metadata for scoped evaluation.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                frameSelectors: {
                    type: "array",
                    items: { type: "string" }
                },
                targetId: { type: "string" },
                timeoutMs: { type: "number" }
            },
            required: ["frameSelectors"],
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
                    enum: BROWSER_MOUSE_BUTTONS
                },
                clickCount: { type: "number" },
                modifiers: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: BROWSER_POINTER_MODIFIERS
                    }
                },
                waitMs: { type: "number" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_drag",
        description: "Drag the Chrome mouse pointer along viewport coordinates.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                path: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            x: { type: "number" },
                            y: { type: "number" }
                        },
                        required: ["x", "y"],
                        additionalProperties: false
                    }
                },
                button: {
                    type: "string",
                    enum: BROWSER_MOUSE_BUTTONS
                },
                modifiers: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: BROWSER_POINTER_MODIFIERS
                    }
                },
                waitMs: { type: "number" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
            },
            required: ["path"],
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
                modifiers: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: BROWSER_POINTER_MODIFIERS
                    }
                },
                waitForArrival: { type: "boolean" },
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
                modifiers: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: BROWSER_POINTER_MODIFIERS
                    }
                },
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
                waitMs: { type: "number" },
                sensitive: { type: "boolean" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
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
                targetId: { type: "string" },
                frameId: { type: "string" },
                script: { type: "string" },
                awaitPromise: { type: "boolean" },
                timeoutMs: { type: "number" },
                mode: {
                    type: "string",
                    enum: ["read", "write"]
                },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" },
                reason: { type: "string" }
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
                    enum: BROWSER_SUPPORTED_KEYS
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
                },
                fullPage: { type: "boolean" },
                clip: {
                    type: "object",
                    properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        height: { type: "number" }
                    },
                    required: ["x", "y", "width", "height"],
                    additionalProperties: false
                },
                highlight: { type: "boolean" },
                highlightColor: { type: "string" },
                highlightDurationMs: { type: "number" },
                highlightClip: {
                    type: "object",
                    properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        height: { type: "number" }
                    },
                    required: ["x", "y", "width", "height"],
                    additionalProperties: false
                }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_wait_for_file_chooser",
        description: "Wait for a controlled click to open an input[type=file] chooser and return its background-owned file chooser id.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" },
                sinceSequence: { type: "number" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_set_file_chooser_files",
        description: "Set local files on a previously opened file chooser id.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                fileChooserId: { type: "string" },
                file_chooser_id: { type: "string" },
                files: {
                    type: "array",
                    items: { type: "string" }
                },
                filePath: { type: "string" },
                filePaths: {
                    type: "array",
                    items: { type: "string" }
                },
                timeoutMs: { type: "number" },
                waitMs: { type: "number" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
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
                        frameSelectors: { type: "array", items: { type: "string" } },
                        and: { type: "object", additionalProperties: true },
                        or: { type: "object", additionalProperties: true },
                        has: { type: "object", additionalProperties: true },
                        hasNot: { type: "object", additionalProperties: true },
                        hasText: { type: "string" },
                        hasNotText: { type: "string" },
                        visible: { type: "boolean" },
                        exact: { type: "boolean" },
                        index: { type: "number" },
                        strict: { type: "boolean" }
                    },
                    required: ["kind"],
                    additionalProperties: false
                },
                filePath: { type: "string" },
                filePaths: {
                    type: "array",
                    items: { type: "string" }
                },
                waitMs: { type: "number" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
            },
            additionalProperties: false
        }
    },
    {
        name: "browser_download_media",
        description: "Download a media/page asset resolved from a locator after origin policy approval.",
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
                        frameSelectors: { type: "array", items: { type: "string" } },
                        and: { type: "object", additionalProperties: true },
                        or: { type: "object", additionalProperties: true },
                        has: { type: "object", additionalProperties: true },
                        hasNot: { type: "object", additionalProperties: true },
                        hasText: { type: "string" },
                        hasNotText: { type: "string" },
                        visible: { type: "boolean" },
                        exact: { type: "boolean" },
                        index: { type: "number" },
                        strict: { type: "boolean" }
                    },
                    required: ["kind"],
                    additionalProperties: false
                },
                attribute: {
                    type: "string",
                    enum: ["auto", "src", "href", "poster", "backgroundImage"]
                },
                filename: { type: "string" },
                conflictAction: {
                    type: "string",
                    enum: ["uniquify", "overwrite", "prompt"]
                },
                saveAs: { type: "boolean" },
                waitForCompletion: { type: "boolean" },
                timeoutMs: { type: "number" },
                pollMs: { type: "number" },
                fallbackFetch: { type: "boolean" },
                fallbackMaxBytes: { type: "number" },
                originApproved: { type: "boolean" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" }
            },
            required: ["locator"],
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
                targetId: { type: "string" },
                method: { type: "string" },
                params: {
                    type: "object",
                    additionalProperties: true
                },
                timeoutMs: { type: "number" },
                originApproved: { type: "boolean" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" },
                reason: { type: "string" }
            },
            required: ["method"],
            additionalProperties: false
        }
    },
    {
        name: "browser_attach_target",
        description: "Attach Chrome debugger control to a DevTools target under a controlled tab.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                targetId: { type: "string" },
                originApproved: { type: "boolean" },
                confirmed: { type: "boolean" },
                confirmationId: { type: "string" },
                reason: { type: "string" }
            },
            required: ["targetId"],
            additionalProperties: false
        }
    },
    {
        name: "browser_detach_target",
        description: "Detach Chrome debugger control from a previously attached DevTools target.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                tabId: { type: "number" },
                targetId: { type: "string" },
                reason: { type: "string" }
            },
            required: ["targetId"],
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
                levels: {
                    type: "array",
                    items: { type: "string" }
                },
                filter: { type: "string" },
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
                sessionId: { type: "string" },
                tabId: { type: "number" },
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
                sessionId: { type: "string" },
                tabId: { type: "number" },
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
        description: "Finalize a browser control session. Handoff tabs stay controlled for the next turn; deliverable tabs remain open but are released from agent control.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                keepTabIds: {
                    type: "array",
                    items: { type: "number" }
                },
                handoffTabIds: {
                    type: "array",
                    items: { type: "number" }
                },
                deliverableTabIds: {
                    type: "array",
                    items: { type: "number" }
                },
                turnId: { type: "string" },
                closeRest: { type: "boolean" }
            },
            required: ["sessionId"],
            additionalProperties: false
        }
    },
    {
        name: "browser_end_turn",
        description: "End one browser-control turn and release active leases for that turn. Use browser_finalize_session first to hand off tabs that should remain controlled.",
        parameters: {
            type: "object",
            properties: {
                sessionId: { type: "string" },
                turnId: { type: "string" }
            },
            required: ["sessionId", "turnId"],
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
export const browserActionParameterSchemas = Object.fromEntries(browserActionRegistry.map((entry) => {
    const toolSchema = browserToolSchemas.find((schema) => schema.name === entry.toolName);
    if (!toolSchema) {
        throw new Error(`No browser tool schema registered for action: ${entry.action}`);
    }
    return [entry.action, toolSchema.parameters];
}));
export function getBrowserActionParameterSchema(action) {
    const schema = browserActionParameterSchemas[action];
    if (!schema) {
        throw new Error(`No browser action parameter schema registered for action: ${action}`);
    }
    return schema;
}
export function validateBrowserActionParams(action, params) {
    const schemaResult = validateJsonSchema(getBrowserActionParameterSchema(action), params ?? {}, "$", true);
    if (!schemaResult.ok) {
        return schemaResult;
    }
    if (action === "uploadFile" || action === "setFileChooserFiles") {
        const uploadResult = validateUploadFilePathParams(params ?? {});
        if (!uploadResult.ok || action !== "setFileChooserFiles") {
            return uploadResult;
        }
        return validateFileChooserIdParams(params ?? {});
    }
    return { ok: true };
}
function validateFileChooserIdParams(params) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
        return invalid("$", "must be an object");
    }
    const source = params;
    const hasFileChooserId = (typeof source.fileChooserId === "string" && source.fileChooserId.trim().length > 0) ||
        (typeof source.file_chooser_id === "string" && source.file_chooser_id.trim().length > 0);
    if (!hasFileChooserId) {
        return invalid("$.fileChooserId", "or $.file_chooser_id is required");
    }
    return { ok: true };
}
function validateUploadFilePathParams(params) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
        return invalid("$", "must be an object");
    }
    const source = params;
    const hasFilePath = typeof source.filePath === "string" && source.filePath.trim().length > 0;
    const hasFiles = Array.isArray(source.files) &&
        source.files.some((item) => typeof item === "string" && item.trim().length > 0);
    const hasFilePaths = Array.isArray(source.filePaths) &&
        source.filePaths.some((item) => typeof item === "string" && item.trim().length > 0);
    if (!hasFilePath && !hasFiles && !hasFilePaths) {
        return invalid("$.files", "or $.filePath / $.filePaths is required");
    }
    return { ok: true };
}
function validateJsonSchema(schema, value, path, allowUndefined = false) {
    if (value === undefined) {
        return allowUndefined ? { ok: true } : invalid(path, "is required");
    }
    if (schema.enum && !schema.enum.includes(value)) {
        return invalid(path, `must be one of: ${schema.enum.map(String).join(", ")}`);
    }
    if (!schema.type) {
        return { ok: true };
    }
    if (schema.type === "array") {
        if (!Array.isArray(value)) {
            return invalid(path, "must be an array");
        }
        if (schema.items) {
            for (let index = 0; index < value.length; index += 1) {
                const result = validateJsonSchema(schema.items, value[index], `${path}[${index}]`);
                if (!result.ok) {
                    return result;
                }
            }
        }
        return { ok: true };
    }
    if (schema.type === "object") {
        if (!isPlainObject(value)) {
            return invalid(path, "must be an object");
        }
        const objectValue = value;
        const properties = schema.properties ?? {};
        for (const key of schema.required ?? []) {
            if (!(key in objectValue)) {
                return invalid(`${path}.${key}`, "is required");
            }
        }
        for (const [key, item] of Object.entries(objectValue)) {
            const propertySchema = properties[key];
            if (!propertySchema) {
                if (schema.additionalProperties === false) {
                    return invalid(`${path}.${key}`, "is not allowed");
                }
                if (typeof schema.additionalProperties === "object") {
                    const result = validateJsonSchema(schema.additionalProperties, item, `${path}.${key}`);
                    if (!result.ok) {
                        return result;
                    }
                }
                continue;
            }
            const result = validateJsonSchema(propertySchema, item, `${path}.${key}`);
            if (!result.ok) {
                return result;
            }
        }
        return { ok: true };
    }
    if (schema.type === "number") {
        return typeof value === "number" && Number.isFinite(value)
            ? { ok: true }
            : invalid(path, "must be a finite number");
    }
    if (schema.type === "string") {
        return typeof value === "string" ? { ok: true } : invalid(path, "must be a string");
    }
    if (schema.type === "boolean") {
        return typeof value === "boolean" ? { ok: true } : invalid(path, "must be a boolean");
    }
    return { ok: true };
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalid(path, reason) {
    return {
        ok: false,
        code: "invalid_params",
        message: `${path} ${reason}`,
        path
    };
}
