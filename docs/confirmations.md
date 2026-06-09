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

You can also use the confirmation engine directly:

```js
const [approval] = await browser.policy.pending({ kind: "confirmation" });
const resolved = await browser.policy.resolve({
  approvalId: approval.approvalId,
  decision: "approve",
});
```

For action confirmations and origin approvals, retry the exact failed action
with `resolved.requiredParams`. Pending confirmation approvals include redacted
reason and target summaries when the backend can identify the risky element. For
origin approvals, pending records include a redacted subject summary when
available, such as the raw CDP method/target or page asset download URL,
filename, attribute, and locator summary. For
host approvals, `browser.policy.resolve()` can apply the approved host
allow/deny policy and then the original action can be retried.

The Chrome extension popup also shows pending host, confirmation, and origin
approval requests. For host approvals it exposes the host policy choice instead
of a single approve button: allow for the active session when available, always
allow the host, or deny. For confirmation and origin approvals it shows reasons,
target summaries, and the retry parameters that approval will return. The popup
does not automatically retry the failed action; the agent or caller must retry
with returned params or updated host policy.

When an approval belongs to a controllable tab, the extension also tries to show
an in-page approval banner. The banner resolves the same pending approval as the
SDK and popup, including the same session allow, always allow, and deny choices
for host approvals, reason/target/retry details for confirmation approvals, and
reason/subject/retry details for origin approvals. It is best-effort on
restricted pages and does not automatically retry the failed action. The banner
expires at the approval's `expiresAt` deadline and is also cleared when the
background resolves or expires the approval.

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

Browser/system notifications are not exposed by Formax. The extension does not
request Chrome's `notifications` permission and no browser tool creates,
updates, reads, or clears notifications. Page-visible notification permission
prompts are still permission grants: only click them when the user explicitly
asked for notifications on that site.

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
