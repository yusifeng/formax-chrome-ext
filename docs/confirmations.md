# Confirmations

Formax separates browser automation from user approval. Some actions can affect
accounts, files, the clipboard, or third-party systems and require explicit
confirmation in the current task.

## Always Confirm

Ask the user before:

- first navigation or interaction with a new website host
- uploading files
- typing sensitive data
- reading or writing the clipboard
- reading browser history
- deleting or modifying third-party records
- sending messages, posts, comments, or emails
- submitting forms with external side effects
- purchasing, paying, subscribing, or changing subscriptions
- granting browser or site permissions
- running raw CDP on arbitrary websites
- running mutating `evaluate` code

Only pass `confirmed: true` or `originApproved: true` after the user approved
that exact action and destination in the current task.

If the MCP client or host UI issues an approval identifier, pass it as
`confirmationId`. The extension records that identifier in the action audit
event without logging action payloads.

When an action fails with `confirmation_required`, inspect recent events for
`browserActionConfirmationRequired`. Present the event's action, host, reasons,
and redacted target summary to the user. If approved, retry the exact action
with the event's `requiredParams`.

## Website Host Approval

The first navigation or interaction with an unknown `http`/`https` host fails
with `requires_host_approval` and emits `hostApprovalRequired`. Present the
event's host, action, and `approvalId` to the user. After approval, call
`browser.updatePolicy()` with one of the event's `suggestedDecisions`, then
retry the original action.

Example:

```js
await browser.updatePolicy({
  decision: "allow",
  host: "example.com",
  sessionId: session.sessionId,
});
```

Use `allow` for the current session, `always_allow` only when the user asked
for persistent access, and `deny` to block future attempts.

## No Persistent Approval For Sensitive Telemetry

Browser history and clipboard access require confirmation every time:

```js
await browser.user.history({
  query: "example",
  limit: 10,
  confirmed: true,
});

await tab.clipboard.readText({ confirmed: true });
```

Do not create an always-allow path for history or clipboard reads.

Bookmarks are not exposed by Formax. The extension does not request Chrome's
`bookmarks` permission and no browser tool returns bookmarks. If a future
feature adds bookmark access, treat it as sensitive browser telemetry with an
explicit per-request confirmation policy before exposing it.

## File Uploads

Before uploading:

1. Confirm the exact local file path.
2. Confirm the destination website or form.
3. Use an absolute path.
4. Keep the file under allowed upload roots when configured.

Example:

```js
await tab.locator('input[type="file"]').setInputFiles("/absolute/path/file.txt", {
  confirmed: true,
});
```

## Sensitive Typing

If the text is a password, token, personal identifier, private message, or other
sensitive value, require confirmation:

```js
await tab.getByLabel("Password").fill(secretValue, {
  sensitive: true,
  confirmed: true,
});
```

Never print the sensitive value in logs or final answers.

## Evaluate And Raw CDP

Read-only extraction can use `mode: "read"`:

```js
await tab.evaluate("document.title", {
  mode: "read",
  reason: "read page title",
});
```

Mutating page state requires confirmation:

```js
await tab.evaluate("document.querySelector('form').submit()", {
  confirmed: true,
  reason: "submit the user-approved form",
});
```

Raw CDP is advanced diagnostic tooling and requires origin approval when policy
requires it:

```js
await tab.rawCdp("Runtime.evaluate", {
  expression: "document.title",
}, {
  originApproved: true,
  reason: "diagnose page title through CDP",
});
```

If raw CDP or page asset download fails with `origin_approval_required`, inspect
recent events for `browserOriginApprovalRequired`. Present the action and origin
to the user. If approved, retry the exact action with the event's
`requiredParams`.

Do not include script bodies, secrets, or bulky CDP params in user-facing error
messages.

## User Handoff Boundaries

Do not automate CAPTCHA or human-verification challenges, password-change final
submission, browser security interstitial bypasses, or paywall bypasses. The
extension emits `userHandoffRequired`, marks the page as `handoff`, and fails
with `user_handoff_required` when a click target appears to cross one of these
boundaries.

## Browser Permission Prompts

Do not grant camera, microphone, location, notification, or other browser/site
permissions unless the user explicitly asked for that permission on that site.
Click targets that look like permission grants, such as "Allow camera access" or
"Enable location", require `confirmed: true` and emit a
`permissionPromptDetected` event for diagnostics.

If a Chrome permission bubble blocks automation, ask the user to make the
browser UI choice. Formax does not control native Chrome UI or OS dialogs.

## Final Answers

When an action required confirmation, report only what was done:

- the approved destination
- the approved action
- the observed result

Do not echo sensitive values, local secret paths beyond what is necessary, raw
clipboard contents, or browser history entries unless the user explicitly asked
for those values.
