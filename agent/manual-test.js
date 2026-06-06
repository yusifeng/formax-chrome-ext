import { browserClick, browserHealth, browserOpenUrl, browserStartSession, browserStopSession } from "./browserTools.js";
function print(title, value) {
    console.log(`\n# ${title}`);
    console.log(JSON.stringify(value, null, 2));
}
const health = await browserHealth();
print("health", health);
const sessionEnvelope = await browserStartSession({
    sessionId: `manual-${Date.now().toString(36)}`,
    active: true
});
const session = sessionEnvelope.result;
print("session", session);
const openedEnvelope = await browserOpenUrl({
    sessionId: session.sessionId,
    url: "https://example.com"
});
const opened = openedEnvelope.result;
print("opened", opened);
const shouldClick = process.env.CLICK_FIRST_ELEMENT === "1";
if (shouldClick && opened.elements?.[0]) {
    const clicked = await browserClick({
        sessionId: session.sessionId,
        ref: opened.elements[0].ref
    });
    print("clicked", clicked);
}
if (process.env.CLOSE_TABS === "1") {
    await browserStopSession({
        sessionId: session.sessionId,
        closeTabs: true
    });
}
else {
    console.log(`\n# kept open\nSession ${session.sessionId} is still open. Run CLOSE_TABS=1 node agent/manual-test.js to close tabs during cleanup.`);
}
