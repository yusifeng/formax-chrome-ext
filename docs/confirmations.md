# Confirmations

Formax separates browser automation from user approval. Some actions can affect
accounts, files, the clipboard, or third-party systems and require explicit
confirmation in the current task.

## Always Confirm

Ask the user before:

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

Do not include script bodies, secrets, or bulky CDP params in user-facing error
messages.

## Browser Permission Prompts

Do not grant camera, microphone, location, notification, or other browser/site
permissions unless the user explicitly asked for that permission on that site.

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
