# Privacy Policy for Formax

Effective date: June 6, 2026

Formax is a Chrome extension that lets a user-controlled local AI agent operate Chrome tabs on the user's behalf through Chrome native messaging.

This policy explains what information the extension can access, how that information is used, and how it is handled.

## Single Purpose

The single purpose of Formax is to connect Chrome to a local agent running on the user's own machine so that the agent can perform user-requested browser automation tasks.

Examples of user-requested tasks include opening a tab, clicking visible page elements, typing text, scrolling, reading page state, waiting for navigation, taking screenshots, observing downloads, and reporting task results back to the local agent.

## Information the Extension Can Access

Depending on the user's request and the page being controlled, the extension may access:

- Browser tab metadata, such as tab ID, URL, title, active state, and tab group state.
- Page content needed for browser automation, such as visible text, DOM structure, accessibility tree information, element attributes, and screenshots.
- User input that the local agent is instructed to type or submit.
- Download metadata when a user-requested task involves downloading a file.
- Local extension state, such as connection status, session metadata, tab ownership information, and temporary element references.

The extension requests broad host access because users may ask their local agent to operate on arbitrary websites they choose. This access is used only to perform user-requested browser automation.

## How Information Is Used

Information accessed by the extension is used to:

- Execute browser actions requested by the user through a local agent.
- Return browser state and action results to the local agent.
- Maintain local session and tab state.
- Diagnose whether the extension is connected to the local native host.
- Report download, navigation, debugger, and page events that are relevant to the active automation task.

The extension does not use browser data for advertising, profiling, or unrelated analytics.

## Local Native Messaging

Formax uses Chrome native messaging to communicate with a native host installed on the user's computer.

The native host acts as a local bridge between the Chrome extension and the user's local agent environment. Communication between the extension and native host occurs on the user's machine.

The extension itself does not send browsing data to a Formax cloud service. If the user connects the local agent to a third-party model provider or other service, that data handling is controlled by the user's local agent configuration and by the third party's terms and privacy policy.

## Data Sharing

Formax does not sell user data.

Formax does not share user data with advertisers or data brokers.

The extension provides browser state and task results to the local native host so that the user's local agent can complete the user's requested browser automation task.

## Data Storage

The extension may store local state in Chrome extension storage, including session metadata, connection status, tab ownership information, and user configuration needed for browser automation.

This data is stored locally in the browser environment. It is not used for advertising or cross-site tracking.

Temporary element references and automation state may be cleared when sessions end, tabs close, the extension is reloaded, or the browser is restarted.

## Sensitive Information

Because the extension can operate on pages chosen by the user, it may technically access sensitive page content if the user directs the local agent to interact with such pages.

Users should not instruct the agent to access, reveal, copy, or submit sensitive information unless they intend to do so.

The extension is designed for user-directed local automation, not background monitoring.

## Permissions

The extension uses the following Chrome permissions:

- `nativeMessaging`: to communicate with the local native host.
- `debugger`: to use Chrome DevTools Protocol for user-requested browser automation, inspection, screenshots, and input dispatch.
- `scripting`: to inject content scripts only when needed for browser automation.
- `tabs`: to create, select, query, update, and close tabs for user-requested tasks.
- `tabGroups`: to organize agent-controlled tabs so users can distinguish them from normal browsing tabs.
- `downloads`: to observe download status when a user-requested task involves downloading files.
- `favicon`: to read page favicons for Codex-like visual tab status badges.
- `storage`: to store local extension state and configuration.
- `alarms`: to perform lightweight maintenance for extension session state.
- Host permissions: to allow the user-controlled local agent to operate on websites selected by the user.

## Remote Code

The extension does not use remote code. All extension JavaScript is packaged with the extension. The extension does not load JavaScript from a CDN, dynamically import remote JavaScript, execute remote strings with `eval`, or load remote WebAssembly.

## Limited Use Disclosure

The use of information received from Chrome extension APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

Information accessed by the extension is limited to providing or improving the extension's single purpose: user-directed local browser automation through a local agent.

## Changes to This Policy

This privacy policy may be updated when the extension changes. The updated version will include a new effective date.

## Contact

For privacy questions or requests, contact:

```text
support@formax.ai
```
