#!/usr/bin/env node

import http from "node:http";
import { fileURLToPath } from "node:url";
import { createBrowserClient } from "../mcp-node-repl/browser-client.js";
import {
  browserClearEvents,
  browserClick,
  browserCdp,
  browserEvaluate,
  browserGetCapabilities,
  browserGetDevLogs,
  browserGetEvents,
  browserGetTab,
  browserGoBack,
  browserGoForward,
  browserHandleDialog,
  browserHealth,
  browserListTabs,
  browserLocatorAction,
  browserLocatorQuery,
  browserLocatorWait,
  browserMoveMouse,
  browserNameSession,
  browserObserve,
  browserOpenUrl,
  browserPressKey,
  browserReload,
  browserReloadExtension,
  browserScreenshot,
  browserScroll,
  browserStartSession,
  browserStopSession,
  browserTypeText,
  browserUploadFile,
  browserWaitForDownload,
  browserWaitForEvent,
  browserWaitForLoadState,
  browserWaitForSelector,
  browserWaitForText,
  browserWaitForUrl
} from "../agent/browserTools.js";

const KEEP_TABS = process.env.KEEP_TABS === "1";
const HOST = "127.0.0.1";
const uploadFixturePath = fileURLToPath(
  new URL("../fixtures/red-test.png", import.meta.url)
);

let server;
let baseUrl;
let sessionId;

const results = [];

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function test(name, fn) {
  const startedAt = Date.now();

  try {
    await fn();
    const durationMs = Date.now() - startedAt;
    results.push({ name, ok: true, durationMs });
    console.log(`PASS ${name} (${durationMs}ms)`);
    return true;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    results.push({
      name,
      ok: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error)
    });
    console.error(`FAIL ${name} (${durationMs}ms)`);
    console.error(error instanceof Error ? error.stack || error.message : error);
    return false;
  }
}

function isUnknownActionFailure(action) {
  return results.at(-1)?.error === `Unknown action: ${action}`;
}

function healthIsCurrent(health) {
  return (
    health?.ok === true &&
    health.nativeConnected === true &&
    Array.isArray(health.supportedActions) &&
    health.backendRevision >= 3 &&
    health.supportedActions.includes("reloadExtension") &&
    health.supportedActions.includes("nameSession") &&
    health.supportedActions.includes("locatorQuery") &&
    health.supportedActions.includes("getDevLogs")
  );
}

async function readHealthOrNull() {
  try {
    return (await browserHealth()).result;
  } catch {
    return null;
  }
}

async function reloadExtensionAndWaitForCurrentHealth() {
  try {
    await browserReloadExtension();
  } catch (error) {
    console.error("WARN automatic extension reload failed:", error);
    return null;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < 8000) {
    await delay(300);
    const health = await readHealthOrNull();

    if (healthIsCurrent(health)) {
      return health;
    }
  }

  return await readHealthOrNull();
}

function appPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Formax Real Browser Fixture</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        margin: 32px;
        line-height: 1.45;
      }

      section {
        margin: 24px 0;
      }

      .spacer {
        height: 1200px;
        background: linear-gradient(#f8fafc, #dcfce7);
      }
    </style>
  </head>
  <body>
    <h1>Formax Real Browser Fixture</h1>
    <p id="intro">Ready for browser tool verification.</p>

    <section>
      <button id="count-button" type="button">Count click</button>
      <span id="count-result">Clicks: 0</span>
      <button class="multi-button" type="button" data-button-index="0">First multi</button>
      <button class="multi-button" type="button" data-button-index="1">Second multi</button>
      <span id="multi-result">Multi: none</span>
    </section>

    <section>
      <form id="search-form">
        <label for="name-input">
          Name
        </label>
        <input id="name-input" name="name" placeholder="Type a test name">
        <button id="submit-button" type="submit" data-testid="submit-name">Submit</button>
      </form>
      <div id="submit-result">No submission yet</div>
    </section>

    <section>
      <input id="upload-input" type="file" aria-label="upload-fixture">
      <div id="upload-result">No file uploaded</div>
    </section>

    <section>
      <button id="alert-button" type="button">Open alert</button>
      <a id="download-link" href="/download">Download fixture</a>
      <a id="second-link" href="/second">Go second</a>
    </section>

    <section id="delayed-host"></section>
    <div class="spacer">Scroll target area</div>

    <script>
      window.testState = { clicks: 0, submissions: [] };

      document.getElementById("count-button").addEventListener("click", () => {
        window.testState.clicks += 1;
        document.getElementById("count-result").textContent =
          "Clicks: " + window.testState.clicks;
      });

      document.querySelectorAll(".multi-button").forEach((button) => {
        button.addEventListener("click", () => {
          document.getElementById("multi-result").textContent =
            "Multi: " + button.getAttribute("data-button-index");
        });
      });

      document.getElementById("search-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const value = document.getElementById("name-input").value;
        window.testState.submissions.push(value);
        document.getElementById("submit-result").textContent =
          "Submitted: " + value;
        history.pushState(null, "", "/submitted?name=" + encodeURIComponent(value));
      });

      document.getElementById("upload-input").addEventListener("change", (event) => {
        const file = event.target.files && event.target.files[0];
        document.getElementById("upload-result").textContent =
          file ? "Uploaded: " + file.name : "No file uploaded";
      });

      document.getElementById("alert-button").addEventListener("click", () => {
        alert("Codex alert fixture");
      });

      setTimeout(() => {
        const delayed = document.createElement("div");
        delayed.id = "delayed-ready";
        delayed.textContent = "Delayed fixture ready";
        document.getElementById("delayed-host").appendChild(delayed);
      }, 300);
    </script>
  </body>
</html>`;
}

function secondPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Formax Second Fixture</title>
  </head>
  <body>
    <h1>Second fixture page</h1>
    <p id="second-text">Navigation target reached.</p>
  </body>
</html>`;
}

function startFixtureServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${HOST}`);

      if (url.pathname === "/download") {
        const body = "codex real browser download fixture\n";
        res.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": 'attachment; filename="codex-real-download.txt"',
          "content-length": Buffer.byteLength(body)
        });
        res.end(body);
        return;
      }

      if (url.pathname === "/second") {
        sendHtml(res, secondPage());
        return;
      }

      sendHtml(res, appPage());
    });

    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      baseUrl = `http://${HOST}:${address.port}`;
      resolve();
    });
  });
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html)
  });
  res.end(html);
}

async function stopFixtureServer() {
  if (!server) {
    return;
  }

  server.closeIdleConnections?.();
  server.closeAllConnections?.();

  await Promise.race([
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
    delay(2000)
  ]);

  server = null;
}

async function run() {
  await startFixtureServer();
  console.log(`Fixture server: ${baseUrl}`);

  const hasCurrentExtension = await test("native host health and extension action registry", async () => {
    let health = (await browserHealth()).result;

    if (!healthIsCurrent(health) && health.supportedActions?.includes("reloadExtension")) {
      console.error("Extension background is stale; attempting automatic reload...");
      health = await reloadExtensionAndWaitForCurrentHealth();
    }

    assert(health && health.ok === true, "health.ok should be true", health);
    assert(
      health.nativeConnected === true,
      "extension must be connected to native host",
      health
    );
    assert(
      healthIsCurrent(health),
      "extension background is stale; reload the unpacked extension in chrome://extensions",
      {
        extensionId: health.extensionId,
        version: health.version,
        backendRevision: health.backendRevision,
        supportedActions: health.supportedActions
      }
    );
  });

  if (!hasCurrentExtension) {
    console.error(
      "The Chrome extension background does not include the new backend primitives yet. " +
        "Reload the unpacked extension in chrome://extensions, then run npm run test:real again."
    );
    return;
  }

  await test("start session and open local fixture", async () => {
    const session = (await browserStartSession({ active: true })).result;
    sessionId = session.sessionId;
    assert(typeof sessionId === "string", "sessionId should be returned", session);

    const opened = (
      await browserOpenUrl({
        sessionId,
        url: `${baseUrl}/`,
        active: true,
        timeoutMs: 15000
      })
    ).result;

    assert(opened.title === "Formax Real Browser Fixture", "fixture title mismatch", {
      title: opened.title,
      url: opened.url
    });
    assert(opened.text.includes("Ready for browser tool verification"), "fixture text missing");
  });

  const hasBackendPrimitives = await test("basic backend primitives for tabs, capabilities, and events", async () => {
    const named = (
      await browserNameSession({
        sessionId,
        name: "Formax real e2e"
      })
    ).result;
    assert(named.session?.name === "Formax real e2e", "session was not named", named);

    const tabs = (await browserListTabs({ sessionId })).result;
    assert(tabs.tabs.length >= 1, "session tabs should include active tab", tabs);
    assert(tabs.tabs.some((tab) => tab.controlled === true), "controlled tab marker missing", tabs);

    const tab = (await browserGetTab({ sessionId })).result;
    assert(tab.tab.controlled === true, "getTab should identify controlled tab", tab);

    const capabilities = (await browserGetCapabilities({ scope: "tab" })).result;
    assert(
      capabilities.capabilities.some((capability) => capability.id === "tab.locator.css"),
      "tab locator capability missing",
      capabilities
    );

    const before = (await browserGetEvents({ sessionId, limit: 1 })).result;
    const sinceSequence = before.events.at(-1)?.sequence;
    await browserReload({ sessionId, waitForLoad: true, timeoutMs: 5000 });
    const event = (
      await browserWaitForEvent({
        sessionId,
        name: "cdpEvent",
        sinceSequence,
        timeoutMs: 3000
      })
    ).result;
    assert(event.matched === true, "waitForEvent should see reload CDP event", event);
  });

  if (!hasBackendPrimitives && isUnknownActionFailure("nameSession")) {
    console.error(
      "The Chrome extension background does not include the new backend primitives yet. " +
        "Reload the unpacked extension in chrome://extensions, then run npm run test:real again."
    );
    return;
  }

  await test("wait for load, selector, and text", async () => {
    const load = (await browserWaitForLoadState({ sessionId, state: "load" })).result;
    assert(
      load.reason === "already_satisfied" || load.reason === "Page.loadEventFired",
      "load state did not settle",
      load
    );

    const selector = (
      await browserWaitForSelector({
        sessionId,
        selector: "#delayed-ready",
        state: "visible",
        timeoutMs: 3000
      })
    ).result;
    assert(selector.matched === true, "delayed selector did not become visible", selector);

    const text = (
      await browserWaitForText({
        sessionId,
        text: "Delayed fixture ready",
        timeoutMs: 3000
      })
    ).result;
    assert(text.found === true, "delayed text was not found", text);
  });

  await test("observe with accessibility tree and DOM snapshot", async () => {
    const observation = (
      await browserObserve({
        sessionId,
        includeAccessibility: true,
        maxAccessibilityNodes: 80,
        includeDomSnapshot: true
      })
    ).result;

    assert(Array.isArray(observation.elements), "observation elements missing");
    assert(observation.elements.length > 0, "observation should expose elements");
    assert(
      Array.isArray(observation.accessibilityTree) &&
        observation.accessibilityTree.length > 0,
      "accessibility tree missing"
    );
    assert(observation.domSnapshot && typeof observation.domSnapshot === "object", "DOM snapshot missing");
  });

  await test("CSS locator query, action, and wait primitives", async () => {
    const count = (
      await browserLocatorQuery({
        sessionId,
        locator: {
          kind: "css",
          selector: "#count-button"
        },
        kind: "count"
      })
    ).result;
    assert(count.value === 1, "locator count should be 1", count);

    const visible = (
      await browserLocatorQuery({
        sessionId,
        locator: {
          kind: "css",
          selector: "#count-button"
        },
        kind: "isVisible"
      })
    ).result;
    assert(visible.value === true, "locator should be visible", visible);

    const wait = (
      await browserLocatorWait({
        sessionId,
        locator: {
          kind: "css",
          selector: "#name-input"
        },
        state: "visible",
        timeoutMs: 3000
      })
    ).result;
    assert(wait.matched === true, "locator wait should match visible input", wait);

    const filled = (
      await browserLocatorAction({
        sessionId,
        locator: {
          kind: "css",
          selector: "#name-input"
        },
        kind: "fill",
        args: {
          value: "Locator User"
        },
        waitMs: 150
      })
    ).result;
    assert(filled.elements.some((element) => element.ref), "locator fill should return an observation", filled);

    const filledValue = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("name-input").value`
      })
    ).result.value;
    assert(filledValue === "Locator User", "locator fill should update input value", {
      filledValue
    });
  });

  await test("click, type, press key, wait for URL", async () => {
    const clicked = (
      await browserClick({
        sessionId,
        selector: "#count-button",
        waitMs: 150
      })
    ).result;
    assert(clicked.text.includes("Clicks: 1"), "click did not update page text");

    await browserTypeText({
      sessionId,
      selector: "#name-input",
      text: "Codex Real Test",
      clear: true,
      waitMs: 100
    });
    const submitted = (
      await browserPressKey({
        sessionId,
        key: "Enter",
        waitMs: 150
      })
    ).result;
    assert(
      submitted.text.includes("Submitted: Codex Real Test"),
      "press Enter did not submit form"
    );

    const url = (
      await browserWaitForUrl({
        sessionId,
        urlContains: "/submitted?name=Codex%20Real%20Test",
        timeoutMs: 3000
      })
    ).result;
    assert(url.matched === true, "submitted URL did not match", url);
  });

  await test("object facade: tabs, locator, waits, and evaluate", async () => {
    const objectBrowser = createBrowserClient();
    const tab = await objectBrowser.tabs.new(`${baseUrl}/`, { active: true });

    try {
      await tab.waitForLoadState("load");
      await tab.getByPlaceholder("Type a test name").fill("Facade User", { waitMs: 100 });
      await tab.getByRole("button", { name: "Submit" }).click({ waitMs: 150 });
      await tab.waitForUrl({ urlContains: "/submitted?name=Facade%20User", timeoutMs: 3000 });

      const submitted = await tab.evaluate(
        `document.getElementById("submit-result").textContent`
      );
      assert(submitted === "Submitted: Facade User", "facade submit result mismatch", {
        submitted
      });

      assert(await tab.getByTestId("submit-name").isVisible(), "getByTestId should locate submit button");

      await tab.getByText("Count click", { exact: true }).click({ waitMs: 150 });
      await tab.waitForText("Clicks: 1", { timeoutMs: 3000 });

      await tab.locator("#upload-input").setInputFiles(uploadFixturePath, { waitMs: 300 });
      const uploadedName = await tab.evaluate(
        `document.getElementById("upload-input").files[0]?.name || ""`
      );
      assert(uploadedName === "red-test.png", "facade locator upload mismatch", {
        uploadedName
      });
    } finally {
      await objectBrowser.stop({ closeTabs: true });
    }
  });

  await test("object facade edge cases: tab isolation, labels, indexes, and soft waits", async () => {
    const objectBrowser = createBrowserClient();
    const tabA = await objectBrowser.tabs.new(`${baseUrl}/`, { active: true });
    const tabB = await objectBrowser.tabs.new(`${baseUrl}/second`, { active: true });

    try {
      await tabA.getByLabel("Name", { exact: true }).fill("Label User", { waitMs: 100 });
      const labelValue = await tabA.evaluate(
        `document.getElementById("name-input").value`
      );
      assert(labelValue === "Label User", "getByLabel fill mismatch", {
        labelValue
      });

      await tabA.locator(".multi-button").nth(1).click({ waitMs: 100 });
      await tabA.waitForText("Multi: 1", { timeoutMs: 3000 });

      const lastMulti = await tabA.locator(".multi-button").last();
      await lastMulti.click({ waitMs: 100 });
      await tabA.waitForText("Multi: 1", { timeoutMs: 3000 });

      let threw = false;
      try {
        await tabA.waitForSelector("#definitely-missing", { timeoutMs: 300 });
      } catch {
        threw = true;
      }
      assert(threw, "missing selector should throw by default");

      const softWait = await tabA.waitForSelector("#definitely-missing", {
        timeoutMs: 300,
        soft: true
      });
      assert(
        softWait.matched === false && softWait.timedOut === true,
        "soft wait should return timeout payload",
        softWait
      );

      const tabBTitle = await tabB.evaluate("document.title");
      assert(tabBTitle === "Formax Second Fixture", "tabB identity was polluted", {
        tabBTitle
      });
      const tabBUrl = await tabB.evaluate("location.href");
      assert(String(tabBUrl).includes("/second"), "tabB URL mismatch", {
        tabBUrl
      });
    } finally {
      await objectBrowser.stop({ closeTabs: true });
    }
  });

  await test("evaluate and raw CDP", async () => {
    const evaluated = (
      await browserEvaluate({
        sessionId,
        script: `({
          title: document.title,
          href: location.href,
          clicks: window.testState.clicks,
          submitted: document.getElementById("submit-result").textContent
        })`
      })
    ).result.value;

    assert(evaluated.title === "Formax Real Browser Fixture", "evaluate title mismatch", evaluated);
    assert(evaluated.clicks === 1, "evaluate click count mismatch", evaluated);

    const cdp = (
      await browserCdp({
        sessionId,
        method: "Runtime.evaluate",
        params: {
          expression: "document.title",
          returnByValue: true
        }
      })
    ).result;

    assert(
      cdp.result?.result?.value === "Formax Real Browser Fixture",
      "raw CDP Runtime.evaluate returned unexpected value",
      cdp
    );
  });

  await test("move mouse, content script overlay, scroll, and screenshot", async () => {
    const moved = (
      await browserMoveMouse({
        sessionId,
        x: 220,
        y: 180,
        waitMs: 150
      })
    ).result;
    assert(moved.x === 220 && moved.y === 180, "moveMouse returned wrong coordinates", moved);

    const overlay = (
      await browserEvaluate({
        sessionId,
        script: `Boolean(document.getElementById("agent-browser-controller-cursor"))`
      })
    ).result.value;
    assert(overlay === true, "content script cursor overlay was not injected");

    await browserScroll({
      sessionId,
      deltaY: 600,
      waitMs: 200
    });
    const scrollY = (
      await browserEvaluate({
        sessionId,
        script: "window.scrollY"
      })
    ).result.value;
    assert(typeof scrollY === "number" && scrollY > 0, "scrollY did not change", {
      scrollY
    });

    const screenshot = (
      await browserScreenshot({
        sessionId,
        format: "png"
      })
    ).result;
    assert(screenshot.dataBase64.startsWith("iVBOR"), "screenshot is not a PNG");
    assert(screenshot.dataBase64.length > 1000, "screenshot data is unexpectedly small");
  });

  await test("upload file through input[type=file]", async () => {
    const observation = (await browserObserve({ sessionId })).result;
    const fileInput = observation.elements.find(
      (element) => element.role === "input:file" || element.label === "upload-fixture"
    );
    assert(fileInput, "file input was not observed", observation.elements);

    await browserUploadFile({
      sessionId,
      ref: fileInput.ref,
      filePath: uploadFixturePath,
      waitMs: 300
    });

    const uploadedName = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("upload-input").files[0]?.name || ""`
      })
    ).result.value;
    assert(uploadedName === "red-test.png", "uploaded file name mismatch", {
      uploadedName
    });
  });

  await test("JavaScript dialog events and handler", async () => {
    await browserClearEvents({ sessionId });
    await browserEvaluate({
      sessionId,
      script: `setTimeout(() => alert("Codex alert fixture"), 50); "scheduled";`
    });
    await delay(300);

    const openingEvents = (
      await browserGetEvents({
        name: "cdpEvent",
        limit: 20
      })
    ).result.events.filter((event) => event.method === "Page.javascriptDialogOpening");
    assert(openingEvents.length > 0, "dialog opening event was not buffered");

    const handled = (
      await browserHandleDialog({
        sessionId,
        accept: true
      })
    ).result;
    assert(handled.accepted === true, "dialog was not accepted", handled);

    await browserEvaluate({
      sessionId,
      script: "console.error('formax dev log fixture')",
      awaitPromise: true
    });
    const logs = (await browserGetDevLogs({ sessionId, level: "error", limit: 20 })).result;
    assert(
      logs.logs.some((entry) => String(entry.text || "").includes("formax dev log fixture")),
      "expected dev log entry",
      logs
    );
  });

  await test("download event, wait, and list", async () => {
    await browserClearEvents({});
    const startedAfter = Date.now() - 1000;

    await browserClick({
      sessionId,
      selector: "#download-link",
      waitMs: 300
    });

    const download = (
      await browserWaitForDownload({
        filenameContains: "codex-real-download",
        state: "complete",
        startedAfter,
        timeoutMs: 10000,
        pollMs: 250
      })
    ).result;

    assert(download.matched === true, "download did not complete", download);

    const events = (
      await browserGetEvents({
        limit: 50
      })
    ).result.events;
    assert(
      events.some((event) => event.name === "downloadCreated") ||
        events.some((event) => event.name === "downloadChanged"),
      "download events were not buffered",
      events
    );
  });

  await test("link navigation, back, forward, and reload", async () => {
    await browserClick({
      sessionId,
      selector: "#second-link",
      waitMs: 300
    });

    const secondUrl = (
      await browserWaitForUrl({
        sessionId,
        urlContains: "/second",
        timeoutMs: 3000
      })
    ).result;
    assert(secondUrl.matched === true, "link navigation did not reach /second", secondUrl);

    const back = (
      await browserGoBack({
        sessionId,
        waitForLoad: true,
        timeoutMs: 5000
      })
    ).result;
    assert(back.navigated === true, "goBack did not navigate", back);
    assert(back.title === "Formax Real Browser Fixture", "goBack did not return to fixture page", {
      title: back.title,
      url: back.url
    });

    const forward = (
      await browserGoForward({
        sessionId,
        waitForLoad: true,
        timeoutMs: 5000
      })
    ).result;
    assert(forward.navigated === true, "goForward did not navigate", forward);
    assert(forward.title === "Formax Second Fixture", "goForward did not return to second page", {
      title: forward.title,
      url: forward.url
    });

    const reloaded = (
      await browserReload({
        sessionId,
        ignoreCache: true,
        waitForLoad: true,
        timeoutMs: 5000
      })
    ).result;
    assert(reloaded.title === "Formax Second Fixture", "reload returned unexpected page", {
      title: reloaded.title,
      url: reloaded.url
    });
  });
}

try {
  await run();
} finally {
  if (sessionId && !KEEP_TABS) {
    try {
      await browserStopSession({
        sessionId,
        closeTabs: true
      });
    } catch (error) {
      console.error("WARN failed to stop browser session:", error);
    }
  }

  await stopFixtureServer();
}

const failed = results.filter((result) => !result.ok);
const passed = results.length - failed.length;

console.log(`\n${passed}/${results.length} real browser checks passed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
