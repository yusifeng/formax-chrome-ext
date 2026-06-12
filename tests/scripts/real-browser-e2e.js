#!/usr/bin/env node

import http from "node:http";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { createBrowserClient } from "../../build/runtime/mcp-node-repl/browser-client.js";
import {
  browserClearEvents,
  browserClick,
  browserCdp,
  browserEvaluate,
  browserDrag,
  browserElementInfo,
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
  browserResolveFrame,
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
} from "../../build/runtime/agent/browserTools.js";

const KEEP_TABS = process.env.KEEP_TABS === "1";
const HOST = "127.0.0.1";
const CROSS_ORIGIN_HOST = "localhost";
const uploadFixturePath = fileURLToPath(
  new URL("../fixtures/red-test.png", import.meta.url)
);
const secondUploadFixturePath = fileURLToPath(
  new URL("../fixtures/second-upload.txt", import.meta.url)
);

let server;
let baseUrl;
let crossOriginServer;
let crossOriginBaseUrl;
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

function decodePng(dataBase64) {
  const bytes = Buffer.from(dataBase64, "base64");
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "invalid PNG signature");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > bytes.length) {
      throw new Error(`truncated PNG chunk ${type}`);
    }

    if (type === "IHDR") {
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
    } else if (type === "IDAT") {
      idatChunks.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG color format bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const raw = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + rowBytes));
    sourceOffset += rowBytes;
    const row = Buffer.alloc(rowBytes);

    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] ?? 0 : 0;

      if (filter === 0) {
        row[x] = raw[x];
      } else if (filter === 1) {
        row[x] = (raw[x] + left) & 0xff;
      } else if (filter === 2) {
        row[x] = (raw[x] + up) & 0xff;
      } else if (filter === 3) {
        row[x] = (raw[x] + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        row[x] = (raw[x] + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      rgba[target] = row[source];
      rgba[target + 1] = row[source + 1];
      rgba[target + 2] = row[source + 2];
      rgba[target + 3] = channels === 4 ? row[source + 3] : 255;
    }

    previous = row;
  }

  return { width, height, rgba };
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function colorAt(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return {
    r: png.rgba[offset],
    g: png.rgba[offset + 1],
    b: png.rgba[offset + 2],
    a: png.rgba[offset + 3]
  };
}

function hasVisualVariation(png) {
  const colors = new Set();
  const xStep = Math.max(1, Math.floor(png.width / 20));
  const yStep = Math.max(1, Math.floor(png.height / 20));

  for (let y = 0; y < png.height; y += yStep) {
    for (let x = 0; x < png.width; x += xStep) {
      const color = colorAt(png, x, y);
      colors.add(`${color.r >> 4},${color.g >> 4},${color.b >> 4},${color.a >> 4}`);
      if (colors.size >= 4) {
        return true;
      }
    }
  }

  return false;
}

function countMatchingPixels(png, predicate, step = 4) {
  let matches = 0;

  for (let y = 0; y < png.height; y += step) {
    for (let x = 0; x < png.width; x += step) {
      if (predicate(colorAt(png, x, y))) {
        matches += 1;
      }
    }
  }

  return matches;
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
    const details = error && typeof error === "object" && error.details && typeof error.details === "object"
      ? error.details
      : undefined;
    results.push({
      name,
      ok: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      ...(details ? { details } : {})
    });
    console.error(`FAIL ${name} (${durationMs}ms)`);
    console.error(error instanceof Error ? error.stack || error.message : error);
    if (details) {
      console.error("Structured error details:", JSON.stringify(details, null, 2));
    }
    return false;
  }
}

function isUnknownActionFailure(action) {
  return results.at(-1)?.error === `Unknown action: ${action}`;
}

async function expectBrowserActionFailure(action, pattern) {
  let message = "";
  let caughtError = null;

  try {
    await action();
  } catch (error) {
    caughtError = error;
    message = String(error?.message || error);
  }

  const code = typeof caughtError?.code === "string" ? caughtError.code : "";
  const actionabilityCode =
    typeof caughtError?.details?.actionabilityCode === "string"
      ? caughtError.details.actionabilityCode
      : "";
  const diagnosticText = [message, code, actionabilityCode].filter(Boolean).join("\n");

  assert(diagnosticText && pattern.test(diagnosticText), "browser action failed with unexpected error", {
    message,
    code,
    actionabilityCode,
    expected: String(pattern)
  });
  return {
    message,
    code,
    details: caughtError?.details
  };
}

async function latestEventSequence(sessionId) {
  const events = (await browserGetEvents({ sessionId, limit: 1 })).result.events;
  return events.at(-1)?.sequence;
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

      .card-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .result-card,
      dialog,
      [role="status"] {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 12px;
      }

      #toast {
        display: none;
        background: #ecfdf5;
      }

      #toast.visible {
        display: block;
      }

      .filter-card[hidden] {
        display: none;
      }

      #editor {
        min-height: 48px;
        border: 1px solid #94a3b8;
        border-radius: 6px;
        padding: 8px;
      }

      #shadow-host {
        display: block;
        max-width: 320px;
      }

      #drag-row {
        display: flex;
        align-items: center;
        gap: 24px;
      }

      #drag-source,
      #drag-dropzone {
        align-items: center;
        border: 2px solid #0f766e;
        border-radius: 8px;
        display: flex;
        height: 72px;
        justify-content: center;
        user-select: none;
        width: 144px;
      }

      #drag-source {
        background: #ccfbf1;
        cursor: grab;
      }

      #drag-dropzone {
        background: #f0fdfa;
        border-style: dashed;
      }

      #virtual-list {
        border: 1px solid #64748b;
        border-radius: 8px;
        height: 168px;
        overflow-y: auto;
        position: relative;
        width: 340px;
      }

      #virtual-list-spacer {
        position: relative;
      }

      .virtual-row {
        align-items: center;
        border-bottom: 1px solid #e2e8f0;
        box-sizing: border-box;
        display: flex;
        height: 42px;
        justify-content: space-between;
        left: 0;
        padding: 0 10px;
        position: absolute;
        right: 0;
      }

      #actionability-fixture {
        display: grid;
        gap: 12px;
        max-width: 360px;
      }

      #hidden-actionability-button {
        display: none;
      }

      #occlusion-fixture,
      #pointer-events-pass-through-fixture {
        height: 48px;
        position: relative;
        width: 200px;
      }

      #occluded-actionability-button,
      #occluding-panel,
      #pass-through-actionability-button,
      #pass-through-panel {
        border-radius: 6px;
        box-sizing: border-box;
        height: 44px;
        left: 0;
        position: absolute;
        top: 0;
        width: 180px;
      }

      #occluding-panel {
        align-items: center;
        background: rgba(15, 23, 42, 0.84);
        color: white;
        display: flex;
        justify-content: center;
        pointer-events: auto;
        z-index: 2;
      }

      #pass-through-panel {
        align-items: center;
        background: rgba(20, 184, 166, 0.32);
        border: 1px dashed #0f766e;
        color: #0f172a;
        display: flex;
        justify-content: center;
        pointer-events: none;
        z-index: 2;
      }

      #nested-scroll-occlusion-fixture {
        border: 1px solid #94a3b8;
        height: 96px;
        overflow: auto;
        position: relative;
        width: 240px;
      }

      #nested-scroll-cover {
        align-items: center;
        background: rgba(127, 29, 29, 0.88);
        color: white;
        display: flex;
        height: 80px;
        justify-content: center;
        left: 0;
        position: sticky;
        right: 0;
        top: 0;
        z-index: 2;
      }

      #nested-scroll-target {
        display: block;
        height: 44px;
        margin-top: 140px;
        width: 200px;
      }
    </style>
  </head>
  <body>
    <h1>Formax Real Browser Fixture</h1>
    <p id="intro">Ready for browser tool verification.</p>
    <p id="long-body-copy">${"Fixture exploratory body filler. ".repeat(160)}DO_NOT_RETURN_LARGE_BODY_SENTINEL</p>

    <section>
      <button id="count-button" type="button">Count click</button>
      <span id="count-result">Clicks: 0</span>
      <div class="card-grid" aria-label="Repeated result cards">
        <article class="result-card">
          <h2>Result Alpha</h2>
          <button class="multi-button" type="button" data-button-index="0">Open details</button>
        </article>
        <article class="result-card">
          <h2>Result Beta</h2>
          <button class="multi-button" type="button" data-button-index="1">Open details</button>
        </article>
      </div>
      <span id="multi-result">Multi: none</span>
      <div aria-label="Filter cards">
        <article class="filter-card">Filter Alpha Active <span class="filter-badge">Ready badge</span></article>
        <article class="filter-card">Filter Beta Archived <span class="filter-badge archived">Archived badge</span></article>
        <article class="filter-card" hidden>Filter Alpha Hidden <span class="filter-badge">Ready badge</span></article>
      </div>
    </section>

    <section>
      <form id="search-form">
        <label for="name-input">
          Name
        </label>
        <input id="name-input" name="name" placeholder="Type a test name">
        <button id="submit-button" type="submit" data-testid="submit-name">Submit</button>
        <label for="readonly-input">Readonly code</label>
        <input id="readonly-input" name="readonlyCode" value="LOCKED" readonly>
        <label for="disabled-input">Disabled code</label>
        <input id="disabled-input" name="disabledCode" value="DISABLED" disabled>
        <label for="secret-input">Password</label>
        <input id="secret-input" name="password" type="password" value="super-secret-fixture-password">
        <input id="hidden-token" type="hidden" name="csrfToken" value="hidden-token-fixture-value">
        <label for="fruit-select">Fruit</label>
        <select id="fruit-select" name="fruit">
          <option value="apple">Apple</option>
          <option value="banana">Banana</option>
        </select>
        <textarea id="notes-input" name="notes">Initial notes</textarea>
      </form>
      <div id="submit-result">No submission yet</div>
      <div id="fruit-result">Fruit: apple</div>
    </section>

    <section aria-label="Accessible name fixtures">
      <span id="labelled-prefix">Aria</span>
      <span id="labelled-action">Labelled Action</span>
      <button id="aria-labelledby-button" type="button" aria-labelledby="labelled-prefix labelled-action"></button>
      <button id="aria-label-button" type="button" aria-label="Aria Label Button"></button>
      <label for="native-label-input">Native association</label>
      <input id="native-label-input" value="">
      <img id="alt-image" alt="Image Alt Target" tabindex="0"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect width='24' height='24' fill='%230f766e'/%3E%3C/svg%3E">
      <input id="input-value-button" type="submit" value="Input Value Action">
      <svg id="svg-title-target" role="img" tabindex="0" width="24" height="24" viewBox="0 0 24 24">
        <title>Vector Title Target</title>
        <circle cx="12" cy="12" r="10" fill="#2563eb"></circle>
      </svg>
      <button id="hidden-subtree-button" type="button">
        <span aria-hidden="true">Hidden Noise</span>
        <span>Visible Clean Name</span>
      </button>
      <div id="accessible-result">Accessible: idle</div>
    </section>

    <section>
      <div id="editor" contenteditable="true" aria-label="Rich text editor">Draft text</div>
      <div id="editor-result">Editor: Draft text</div>
    </section>

    <section>
      <div id="shadow-host"></div>
      <closed-widget id="closed-shadow-host" role="button" tabindex="0" aria-label="Closed shadow host"></closed-widget>
      <div id="shadow-result">Shadow: idle</div>
    </section>

    <section>
      <iframe id="fixture-frame" title="Fixture frame"></iframe>
      <div id="frame-result">Frame: idle</div>
    </section>

    <section>
      <iframe id="cross-origin-frame" title="Cross origin fixture frame" src="${crossOriginBaseUrl}/cross-origin-frame"></iframe>
      <div id="cross-origin-frame-result">Cross-origin frame: idle</div>
    </section>

    <section>
      <canvas id="visual-canvas" width="240" height="120" aria-label="Visual canvas target"></canvas>
      <div id="canvas-result">Canvas: idle</div>
    </section>

    <section aria-label="Drag fixture">
      <div id="drag-row">
        <div id="drag-source" role="button" tabindex="0">Drag token</div>
        <div id="drag-dropzone">Drop target</div>
      </div>
      <div id="drag-result">Drag: idle</div>
    </section>

    <section aria-label="Virtualized list fixture">
      <div id="virtual-list" role="listbox" aria-label="Virtualized results">
        <div id="virtual-list-spacer"></div>
      </div>
      <div id="virtual-result">Virtual: none</div>
    </section>

    <section aria-label="Risky action fixtures">
      <button id="delete-account-button" type="button">Delete account</button>
      <button id="allow-camera-button" type="button">Allow camera access</button>
      <button id="captcha-button" type="button">Verify you are human</button>
      <div id="risk-result">Risk: idle</div>
    </section>

    <section>
      <label id="upload-label" for="upload-input">Choose upload files</label>
      <input id="upload-input" type="file" aria-label="upload-fixture" multiple>
      <div id="upload-result">No file uploaded</div>
    </section>

    <section>
      <button id="alert-button" type="button">Open alert</button>
      <button id="confirm-button" type="button">Open confirm</button>
      <button id="prompt-button" type="button">Open prompt</button>
      <button id="open-modal" type="button">Open modal</button>
      <button id="show-toast" type="button">Show toast</button>
      <button id="run-network" type="button">Run network request</button>
      <a id="download-link" href="/download">Download fixture</a>
      <a id="download-broken-link" href="/download-broken">Broken download fixture</a>
      <a id="second-link" href="/second">Go second</a>
      <dialog id="fixture-modal" aria-label="Fixture modal">
        <p>Modal fixture content</p>
        <button id="close-modal" type="button">Close modal</button>
      </dialog>
      <div id="toast" role="status" aria-live="polite">Toast confirmation saved</div>
      <div id="network-result">Network: idle</div>
    </section>

    <section>
      <div id="actionability-fixture" aria-label="Actionability failure fixtures">
        <button class="strict-duplicate-button" type="button">Duplicate strict action</button>
        <button class="strict-duplicate-button" type="button">Duplicate strict action</button>
        <button id="hidden-actionability-button" type="button">Hidden actionability target</button>
        <div id="occlusion-fixture">
          <button id="occluded-actionability-button" type="button">Covered action</button>
          <div id="occluding-panel" aria-hidden="true">Covering panel</div>
        </div>
        <div id="pointer-events-pass-through-fixture">
          <button id="pass-through-actionability-button" type="button">Pass through action</button>
          <div id="pass-through-panel" aria-hidden="true">Pointer transparent panel</div>
        </div>
        <div id="nested-scroll-occlusion-fixture">
          <div id="nested-scroll-cover" aria-hidden="true">Sticky cover</div>
          <button id="nested-scroll-target" type="button">Nested scroll target</button>
          <div style="height: 160px"></div>
        </div>
        <span id="actionability-result">Actionability: idle</span>
      </div>
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
        const files = Array.from(event.target.files || []);
        document.getElementById("upload-result").textContent =
          files.length > 0 ? "Uploaded: " + files.map((file) => file.name).join(", ") : "No file uploaded";
      });

      document.getElementById("fruit-select").addEventListener("change", (event) => {
        document.getElementById("fruit-result").textContent =
          "Fruit: " + event.target.value;
      });

      for (const id of [
        "aria-labelledby-button",
        "aria-label-button",
        "input-value-button",
        "hidden-subtree-button"
      ]) {
        document.getElementById(id).addEventListener("click", () => {
          document.getElementById("accessible-result").textContent = "Accessible: " + id;
        });
      }

      document.getElementById("editor").addEventListener("input", (event) => {
        document.getElementById("editor-result").textContent =
          "Editor: " + event.target.textContent;
      });

      const shadowHost = document.getElementById("shadow-host");
      const shadowRoot = shadowHost.attachShadow({ mode: "open" });
      shadowRoot.innerHTML = \`
        <style>
          button {
            border: 0;
            border-radius: 999px;
            background: #0f172a;
            color: white;
            padding: 8px 14px;
          }

          input {
            margin-left: 8px;
          }
        </style>
        <button id="shadow-button" type="button" data-testid="shadow-action">Shadow action</button>
        <label for="shadow-input">Shadow label</label>
        <input id="shadow-input" aria-label="Shadow input" value="inside shadow">
      \`;
      shadowRoot.getElementById("shadow-button").addEventListener("click", () => {
        document.getElementById("shadow-result").textContent = "Shadow: clicked";
      });

      customElements.define("closed-widget", class extends HTMLElement {
        constructor() {
          super();
          const root = this.attachShadow({ mode: "closed" });
          root.innerHTML = \`<button id="closed-shadow-button" type="button">Closed internals</button>\`;
        }
      });

      const fixtureFrame = document.getElementById("fixture-frame");
      fixtureFrame.addEventListener("load", () => {
        const frameDocument = fixtureFrame.contentDocument;
        frameDocument.getElementById("frame-button").addEventListener("click", () => {
          document.getElementById("frame-result").textContent = "Frame: clicked";
        });
      });
      fixtureFrame.srcdoc = \`
        <!doctype html>
        <html>
          <body>
            <button id="frame-button" type="button">Frame action</button>
            <label for="frame-input">Frame name</label>
            <input id="frame-input">
            <iframe id="nested-frame" title="Nested fixture frame" srcdoc="&lt;button id=&quot;nested-button&quot; type=&quot;button&quot; onclick=&quot;parent.parent.document.getElementById('frame-result').textContent = 'Frame: nested clicked'&quot;&gt;Nested frame action&lt;/button&gt;"></iframe>
          </body>
        </html>
      \`;

      const canvas = document.getElementById("visual-canvas");
      const context = canvas.getContext("2d");
      context.fillStyle = "#0f766e";
      context.fillRect(60, 30, 120, 60);
      context.fillStyle = "#ffffff";
      context.fillText("Click target", 82, 64);
      canvas.addEventListener("click", (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (x >= 60 && x <= 180 && y >= 30 && y <= 90) {
          document.getElementById("canvas-result").textContent = "Canvas: clicked";
        }
      });

      const dragSource = document.getElementById("drag-source");
      const dragDropzone = document.getElementById("drag-dropzone");
      let dragActive = false;
      dragSource.addEventListener("mousedown", () => {
        dragActive = true;
        document.getElementById("drag-result").textContent = "Drag: started";
      });
      document.addEventListener("mousemove", (event) => {
        if (!dragActive) return;
        const rect = dragDropzone.getBoundingClientRect();
        const overDropzone =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (overDropzone) {
          document.getElementById("drag-result").textContent = "Drag: over dropzone";
        }
      });
      document.addEventListener("mouseup", (event) => {
        if (!dragActive) return;
        dragActive = false;
        const rect = dragDropzone.getBoundingClientRect();
        const dropped =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        document.getElementById("drag-result").textContent = dropped ? "Drag: dropped" : "Drag: missed";
      });

      const virtualList = document.getElementById("virtual-list");
      const virtualSpacer = document.getElementById("virtual-list-spacer");
      const virtualRowHeight = 42;
      const virtualItemCount = 100;
      const virtualWindowSize = 8;
      virtualSpacer.style.height = (virtualItemCount * virtualRowHeight) + "px";
      const renderVirtualList = () => {
        const first = Math.max(0, Math.min(
          virtualItemCount - virtualWindowSize,
          Math.floor(virtualList.scrollTop / virtualRowHeight)
        ));
        virtualSpacer.replaceChildren();

        for (let offset = 0; offset < virtualWindowSize; offset += 1) {
          const index = first + offset;
          const row = document.createElement("button");
          row.type = "button";
          row.className = "virtual-row";
          row.dataset.index = String(index);
          row.style.top = (index * virtualRowHeight) + "px";
          row.textContent = "Virtual item " + String(index).padStart(2, "0");
          row.addEventListener("click", () => {
            document.getElementById("virtual-result").textContent =
              "Virtual: " + index;
          });
          virtualSpacer.appendChild(row);
        }
      };
      virtualList.addEventListener("scroll", renderVirtualList);
      renderVirtualList();

      document.getElementById("delete-account-button").addEventListener("click", () => {
        document.getElementById("risk-result").textContent = "Risk: deleted";
      });
      document.getElementById("occluded-actionability-button").addEventListener("click", () => {
        document.getElementById("actionability-result").textContent = "Actionability: clicked";
      });
      document.getElementById("pass-through-actionability-button").addEventListener("click", () => {
        document.getElementById("actionability-result").textContent = "Actionability: pass-through clicked";
      });
      document.getElementById("nested-scroll-target").addEventListener("click", () => {
        document.getElementById("actionability-result").textContent = "Actionability: nested scroll clicked";
      });
      document.getElementById("allow-camera-button").addEventListener("click", () => {
        document.getElementById("risk-result").textContent = "Risk: camera allowed";
      });
      document.getElementById("captcha-button").addEventListener("click", () => {
        document.getElementById("risk-result").textContent = "Risk: captcha bypassed";
      });

      document.getElementById("alert-button").addEventListener("click", () => {
        alert("Codex alert fixture");
      });

      document.getElementById("confirm-button").addEventListener("click", () => {
        const accepted = confirm("Codex confirm fixture");
        document.getElementById("submit-result").textContent =
          accepted ? "Confirm: accepted" : "Confirm: dismissed";
      });

      document.getElementById("prompt-button").addEventListener("click", () => {
        const value = prompt("Codex prompt fixture", "default");
        document.getElementById("submit-result").textContent =
          "Prompt: " + String(value);
      });

      document.getElementById("open-modal").addEventListener("click", () => {
        document.getElementById("fixture-modal").showModal();
      });

      document.getElementById("close-modal").addEventListener("click", () => {
        document.getElementById("fixture-modal").close();
      });

      document.getElementById("show-toast").addEventListener("click", () => {
        document.getElementById("toast").classList.add("visible");
      });

      document.getElementById("run-network").addEventListener("click", async () => {
        document.getElementById("network-result").textContent = "Network: loading";
        const response = await fetch("/slow-network?cacheBust=" + Date.now());
        const text = await response.text();
        document.getElementById("network-result").textContent = "Network: " + text;
      });

      setTimeout(() => {
        const delayed = document.createElement("div");
        delayed.id = "delayed-ready";
        delayed.textContent = "Delayed fixture ready";
        document.getElementById("delayed-host").appendChild(delayed);
      }, 300);
    </script>
    <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"hydrationToken":"hidden-hydration-token-value","records":["${"hydration-record,".repeat(120)}"]}}}
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

function crossOriginFramePage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Cross Origin Fixture</title>
  </head>
  <body>
    <button id="cross-origin-button" type="button">Cross origin action</button>
    <p id="cross-origin-text">Cross origin fixture ready</p>
    <iframe id="cross-origin-nested-frame" title="Nested cross origin child"></iframe>
    <script>
      document.getElementById("cross-origin-button").addEventListener("click", () => {
        document.getElementById("cross-origin-text").textContent = "Cross origin action clicked";
      });
      document.getElementById("cross-origin-nested-frame").srcdoc = \`
        <!doctype html>
        <html>
          <body>
            <button id="cross-origin-nested-button" type="button">Nested cross origin action</button>
          </body>
        </html>
      \`;
    </script>
  </body>
</html>`;
}

function listenOnEphemeralPort(nextServer, bindHost = HOST, urlHost = bindHost) {
  return new Promise((resolve, reject) => {
    nextServer.on("error", reject);
    nextServer.listen(0, bindHost, () => {
      const address = nextServer.address();
      resolve(`http://${urlHost}:${address.port}`);
    });
  });
}

async function startFixtureServer() {
  crossOriginServer = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${HOST}`);

    if (url.pathname === "/cross-origin-frame") {
      sendHtml(res, crossOriginFramePage());
      return;
    }

    sendHtml(res, crossOriginFramePage());
  });
  crossOriginBaseUrl = await listenOnEphemeralPort(crossOriginServer, HOST, CROSS_ORIGIN_HOST);

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

    if (url.pathname === "/download-broken") {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="codex-broken-download.bin"',
        "content-length": 1048576
      });
      res.write(Buffer.alloc(1024, 7));
      setTimeout(() => {
        res.socket?.destroy();
      }, 100);
      return;
    }

    if (url.pathname === "/slow-network") {
      const body = "done";
      setTimeout(() => {
        res.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "content-length": Buffer.byteLength(body)
        });
        res.end(body);
      }, 350);
      return;
    }

    if (url.pathname === "/second") {
      sendHtml(res, secondPage());
      return;
    }

    sendHtml(res, appPage());
  });
  baseUrl = await listenOnEphemeralPort(server);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html)
  });
  res.end(html);
}

async function closeServer(nextServer) {
  if (!nextServer) {
    return;
  }

  nextServer.closeIdleConnections?.();
  nextServer.closeAllConnections?.();

  await Promise.race([
    new Promise((resolve, reject) => {
      nextServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
    delay(2000)
  ]);
}

async function stopFixtureServer() {
  await closeServer(server);
  await closeServer(crossOriginServer);
  server = null;
  crossOriginServer = null;
  baseUrl = null;
  crossOriginBaseUrl = null;
}

async function resetFixturePage() {
  await browserOpenUrl({
    sessionId,
    url: `${baseUrl}/`,
    active: true,
    timeoutMs: 15000
  });
  await browserWaitForLoadState({
    sessionId,
    state: "load",
    timeoutMs: 5000
  });
  await browserEvaluate({
    sessionId,
    script: `window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0;`
  });
}

async function scrollActionabilityFixtureIntoView() {
  await browserEvaluate({
    sessionId,
    script: `document.getElementById("actionability-fixture").scrollIntoView({ block: "center", inline: "nearest" });`
  });
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
    const session = (await browserStartSession({
      sessionId: `real-e2e-${Date.now().toString(36)}`,
      active: true
    })).result;
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
    const urlCommitPromise = browserWaitForUrl({
      sessionId,
      urlContains: "/second",
      waitUntil: "commit",
      timeoutMs: 5000
    });
    const commitPromise = browserWaitForLoadState({
      sessionId,
      state: "commit",
      timeoutMs: 5000
    });
    await browserOpenUrl({
      sessionId,
      url: `${baseUrl}/second`,
      active: true,
      timeoutMs: 15000
    });
    const urlCommit = (await urlCommitPromise).result;
    assert(
      urlCommit.matched === true &&
        urlCommit.waitUntil === "commit" &&
        urlCommit.loadReason === "url_matched",
      "waitForUrl commit state did not observe navigation URL",
      urlCommit
    );
    const commit = (await commitPromise).result;
    assert(commit.reason === "Page.frameNavigated", "commit state did not observe navigation", commit);
    await browserOpenUrl({
      sessionId,
      url: `${baseUrl}/`,
      active: true,
      timeoutMs: 15000
    });
    const rootUrl = (
      await browserWaitForUrl({
        sessionId,
        url: `${baseUrl}/`,
        waitUntil: "load",
        timeoutMs: 5000
      })
    ).result;
    assert(
      rootUrl.matched === true &&
        rootUrl.waitUntil === "load" &&
        (rootUrl.loadReason === "already_satisfied" ||
          rootUrl.loadReason === "Page.loadEventFired"),
      "waitForUrl load state did not settle",
      rootUrl
    );

    const load = (await browserWaitForLoadState({ sessionId, state: "load" })).result;
    assert(
      load.reason === "already_satisfied" || load.reason === "Page.loadEventFired",
      "load state did not settle",
      load
    );

    await browserClick({
      sessionId,
      selector: "#run-network",
      waitMs: 0
    });
    const networkIdle = (
      await browserWaitForLoadState({
        sessionId,
        state: "networkidle",
        timeoutMs: 5000,
        idleMs: 200
      })
    ).result;
    assert(networkIdle.reason === "networkidle", "networkidle state did not settle", networkIdle);
    const networkResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("network-result").textContent`
      })
    ).result.value;
    assert(networkResult === "Network: done", "network fixture did not finish", {
      networkResult
    });

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
    await resetFixturePage();
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
    assert(observation.text.includes("Ready for browser tool verification"), "observation summary lost intro text", {
      text: observation.text,
      truncation: observation.truncation
    });
    assert(!observation.text.includes("DO_NOT_RETURN_LARGE_BODY_SENTINEL"), "large body.innerText leaked into observation summary", {
      text: observation.text,
      truncation: observation.truncation
    });
    assert(observation.truncation?.textSummarized === true, "large observation should report summarized text", observation.truncation);
    assert(observation.truncation?.bodyTextLength > observation.text.length, "body text length metadata missing", observation.truncation);
    const serializedObservation = JSON.stringify(observation);
    assert(!serializedObservation.includes("super-secret-fixture-password"), "password value leaked in DOM snapshot observation");
    assert(!serializedObservation.includes("hidden-token-fixture-value"), "hidden token leaked in DOM snapshot observation");
    assert(!serializedObservation.includes("hidden-hydration-token-value"), "hydration token leaked in DOM snapshot observation");
    assert(!serializedObservation.includes("hydration-record,hydration-record,hydration-record"), "large hydration JSON leaked in DOM snapshot observation");
    assert(observation.frameTree?.source === "cdp", "CDP frame tree missing from observation", observation.frameTree);
    assert(observation.frameTree?.frameCount >= 3, "CDP frame tree did not include nested fixture frames", observation.frameTree);
    assert(
      observation.frameTree?.root?.childFrames?.some((frame) =>
        Array.isArray(frame.childFrames) && frame.childFrames.length > 0
      ),
      "CDP frame tree did not expose child frame hierarchy",
      observation.frameTree
    );

    const frameInput = observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === "#frame-input"
    ));
    const nestedButton = observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === "#nested-button"
    ));
    assert(
      JSON.stringify(frameInput?.frameSelectors) === JSON.stringify(["iframe#fixture-frame"]),
      "same-origin iframe element did not include frameSelectors",
      frameInput
    );
    assert(
      JSON.stringify(nestedButton?.frameSelectors) === JSON.stringify(["iframe#fixture-frame", "iframe#nested-frame"]),
      "nested iframe element did not include frame selector path",
      nestedButton
    );
  });

  await test("cross-origin frame resolve exposes partial OOPIF diagnostics", async () => {
    await resetFixturePage();
    const iframe = (
      await browserWaitForSelector({
        sessionId,
        selector: "#cross-origin-frame",
        state: "visible",
        timeoutMs: 3000
      })
    ).result;
    assert(iframe.matched === true, "cross-origin iframe fixture was not visible", iframe);

    const resolved = (
      await browserResolveFrame({
        sessionId,
        frameSelectors: ["#cross-origin-frame"],
        timeoutMs: 5000
      })
    ).result;

    assert(
      JSON.stringify(resolved.frameSelectors) === JSON.stringify(["#cross-origin-frame"]),
      "cross-origin frame selector path was not preserved",
      resolved
    );
    assert(resolved.resolvedSelectorCount === 1, "cross-origin frame selector did not resolve", resolved);
    assert(
      Array.isArray(resolved.unresolvedFrameSelectors) &&
        resolved.unresolvedFrameSelectors.length === 0,
      "cross-origin frame left unresolved selectors",
      resolved
    );
    assert(resolved.path?.[0]?.accessible === false, "cross-origin iframe should not be DOM-accessible from the parent", resolved);
    assert(
      String(resolved.path?.[0]?.src || resolved.path?.[0]?.url || "").includes("/cross-origin-frame"),
      "cross-origin frame path did not include fixture URL",
      resolved
    );
    assert(
      Array.isArray(resolved.targetCandidates),
      "cross-origin frame resolve did not expose OOPIF target diagnostics",
      resolved
    );

    if (!resolved.targetId) {
      return;
    }
    assert(resolved.frameId, "cross-origin frame target did not include a frameId", resolved);

    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "role",
        role: "button",
        name: "Cross origin action",
        frameSelectors: ["#cross-origin-frame"]
      },
      kind: "click",
      waitMs: 100
    });
    const crossOriginText = (
      await browserEvaluate({
        sessionId,
        targetId: resolved.targetId,
        frameId: resolved.frameId,
        script: `document.getElementById("cross-origin-text").textContent`,
        mode: "read",
        reason: "verify cross-origin locator action"
      })
    ).result.value;
    assert(crossOriginText === "Cross origin action clicked", "cross-origin locator click did not execute in the OOPIF target", {
      crossOriginText,
      resolved
    });

    await delay(300);
    const nested = (
      await browserResolveFrame({
        sessionId,
        frameSelectors: ["#cross-origin-frame", "#cross-origin-nested-frame"],
        timeoutMs: 5000
      })
    ).result;

    assert(nested.targetId === resolved.targetId, "nested cross-origin continuation used a different target", {
      parent: resolved,
      nested
    });
    assert(nested.matched === true, "nested cross-origin frame path did not match a CDP frame", nested);
    assert(nested.accessible === true, "nested cross-origin final frame should be accessible inside the OOPIF target", nested);
    assert(nested.resolvedSelectorCount === 2, "nested cross-origin frame selectors did not fully resolve", nested);
    assert(
      Array.isArray(nested.unresolvedFrameSelectors) &&
        nested.unresolvedFrameSelectors.length === 0,
      "nested cross-origin continuation left unresolved selectors",
      nested
    );
    assert(
      nested.path?.[0]?.accessible === false &&
        nested.path?.[1]?.selector === "#cross-origin-nested-frame" &&
        nested.path?.[1]?.accessible === true,
      "nested cross-origin continuation did not preserve parent and target-local path metadata",
      nested
    );
  });

  await test("form control states and sensitive field redaction", async () => {
    await resetFixturePage();
    const observation = (await browserObserve({ sessionId })).result;
    const readonly = observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === "#readonly-input"
    ));
    const disabled = observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === "#disabled-input"
    ));
    const password = observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === "#secret-input"
    ));

    assert(readonly?.readOnly === true, "readonly input state was not observed", readonly);
    assert(disabled?.disabled === true, "disabled input state was not observed", disabled);
    assert(password?.sensitive === true, "password input was not marked sensitive", password);
    assert(password.label === "[password field]", "password label was not redacted", password);

    const serialized = JSON.stringify(observation);
    assert(!serialized.includes("super-secret-fixture-password"), "password value leaked in observation");
    assert(!serialized.includes("hidden-token-fixture-value"), "hidden token leaked in observation");

    for (const [selector, pattern] of [
      ["#disabled-input", /disabled/],
      ["#readonly-input", /not editable/]
    ]) {
      let rejected = false;
      let message = "";
      try {
        await browserLocatorAction({
          sessionId,
          locator: { kind: "css", selector },
          kind: "fill",
          args: { value: "should not change" },
          waitMs: 50
        });
      } catch (error) {
        rejected = true;
        message = String(error?.message || error);
      }

      assert(rejected, `${selector} unexpectedly accepted fill`);
      assert(pattern.test(message), `${selector} failed with unexpected error`, { message });
    }
  });

  await test("stale observed refs are rejected after navigation", async () => {
    await resetFixturePage();
    const observation = (await browserObserve({ sessionId })).result;
    const countButton = observation.elements.find(
      (element) => element.label === "Count click" || element.selectorCandidates?.some(
        (candidate) => candidate.selector === "#count-button"
      )
    );
    assert(countButton?.ref, "count button ref missing from observation", observation.elements);
    assert(/^r[a-zA-Z0-9_-]+-e\d+$/.test(countButton.ref), "observed ref should include a scoped prefix", {
      ref: countButton.ref
    });

    await browserOpenUrl({
      sessionId,
      url: `${baseUrl}/second`,
      timeoutMs: 5000
    });
    await browserWaitForLoadState({
      sessionId,
      state: "load",
      timeoutMs: 5000
    });

    let rejected = false;
    let message = "";
    try {
      await browserClick({
        sessionId,
        ref: countButton.ref,
        waitMs: 50
      });
    } catch (error) {
      rejected = true;
      message = String(error?.message || error);
    }

    assert(rejected, "stale ref unexpectedly resolved after navigation", {
      ref: countButton.ref
    });
    assert(/Element target not found|Unable to locate element/.test(message), "stale ref failed with unexpected error", {
      message
    });

    await browserOpenUrl({
      sessionId,
      url: `${baseUrl}/`,
      timeoutMs: 5000
    });
    await browserWaitForLoadState({
      sessionId,
      state: "load",
      timeoutMs: 5000
    });
  });

  await test("CSS locator query, action, and wait primitives", async () => {
    await resetFixturePage();
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

  await test("real-browser locator failures surface stable structured codes", async () => {
    await resetFixturePage();
    await scrollActionabilityFixtureIntoView();
    const clicksBeforeTrial = (
      await browserEvaluate({
        sessionId,
        script: `window.testState.clicks`
      })
    ).result.value;
    const trial = (
      await browserLocatorAction({
        sessionId,
        locator: {
          kind: "css",
          selector: "#count-button"
        },
        kind: "click",
        args: {
          trial: true
        },
        waitMs: 50
      })
    ).result;
    assert(trial.trial === true, "locator trial did not return trial payload", trial);
    assert(trial.kind === "click", "locator trial did not preserve action kind", trial);
    assert(
      typeof trial.x === "number" &&
        typeof trial.y === "number" &&
        trial.rect &&
        typeof trial.rect.width === "number",
      "locator trial did not include resolved target geometry",
      trial
    );
    const clicksAfterTrial = (
      await browserEvaluate({
        sessionId,
        script: `window.testState.clicks`
      })
    ).result.value;
    assert(clicksAfterTrial === clicksBeforeTrial, "locator trial unexpectedly changed page state", {
      clicksBeforeTrial,
      clicksAfterTrial,
      trial
    });

    const strictFailure = await expectBrowserActionFailure(
      () => browserLocatorAction({
        sessionId,
        locator: {
          kind: "css",
          selector: ".strict-duplicate-button",
          strict: true
        },
        kind: "click",
        waitMs: 50
      }),
      /strict_mode_violation/
    );
    assert(strictFailure.code === "strict_mode_violation", "strict failure did not preserve code", strictFailure);
    assert(strictFailure.details?.count === 2, "strict failure did not include element count", strictFailure);

    const missingFailure = await expectBrowserActionFailure(
      () => browserLocatorAction({
        sessionId,
        locator: {
          kind: "css",
          selector: "#missing-real-browser-target"
        },
        kind: "click",
        waitMs: 50
      }),
      /locator_not_found|Element target not found|Unable to resolve locator/
    );
    assert(missingFailure.code === "locator_not_found", "missing locator did not preserve code", missingFailure);

    const hiddenFailure = await expectBrowserActionFailure(
      () => browserLocatorAction({
        sessionId,
        locator: {
          kind: "css",
          selector: "#hidden-actionability-button"
        },
        kind: "click",
        waitMs: 50
      }),
      /locator_actionability|not visible|not_visible/
    );
    assert(hiddenFailure.code === "locator_actionability", "hidden locator did not map to actionability", hiddenFailure);
    assert(
      hiddenFailure.details?.actionabilityCode === "not_visible",
      "hidden locator did not preserve not_visible actionability code",
      hiddenFailure
    );

    const occludedFailure = await expectBrowserActionFailure(
      () => browserLocatorAction({
        sessionId,
        locator: {
          kind: "css",
          selector: "#occluded-actionability-button"
        },
        kind: "click",
        waitMs: 50
      }),
      /locator_actionability|occluded|does not receive pointer/
    );
    assert(occludedFailure.code === "locator_actionability", "occluded locator did not map to actionability", occludedFailure);
    assert(
      occludedFailure.details?.actionabilityCode === "occluded",
      "occluded locator did not preserve occluded actionability code",
      occludedFailure
    );

    const actionabilityResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("actionability-result").textContent`
      })
    ).result.value;
    assert(actionabilityResult === "Actionability: idle", "failed occluded click still changed page state", {
      actionabilityResult
    });

    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "css",
        selector: "#pass-through-actionability-button"
      },
      kind: "click",
      waitMs: 150
    });
    const passThroughResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("actionability-result").textContent`
      })
    ).result.value;
    assert(
      passThroughResult === "Actionability: pass-through clicked",
      "pointer-events none overlay should not block locator click",
      {
        actionabilityResult,
        passThroughResult
      }
    );

    await browserEvaluate({
      sessionId,
      script: `
        document.getElementById("actionability-result").textContent = "Actionability: idle";
        document.getElementById("nested-scroll-occlusion-fixture").scrollTop = 144;
      `,
      mode: "write",
      reason: "reset actionability fixture state"
    });
    const nestedScrollFailure = await expectBrowserActionFailure(
      () => browserLocatorAction({
        sessionId,
        locator: {
          kind: "css",
          selector: "#nested-scroll-target"
        },
        kind: "click",
        waitMs: 50
      }),
      /locator_actionability|occluded|does not receive pointer/
    );
    assert(
      nestedScrollFailure.code === "locator_actionability",
      "nested scroll occlusion did not map to actionability",
      nestedScrollFailure
    );
    assert(
      nestedScrollFailure.details?.actionabilityCode === "occluded",
      "nested scroll occlusion did not preserve occluded actionability code",
      nestedScrollFailure
    );
    const nestedScrollResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("actionability-result").textContent`
      })
    ).result.value;
    assert(nestedScrollResult === "Actionability: idle", "failed nested scroll click still changed page state", {
      nestedScrollFailure,
      nestedScrollResult
    });
  });

  await test("local fixture controls: repeated cards, dropdown, contenteditable, modal, and toast", async () => {
    await resetFixturePage();
    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "css",
        selector: ".multi-button",
        index: 1
      },
      kind: "click",
      waitMs: 150
    });
    const repeatedCardResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("multi-result").textContent`
      })
    ).result.value;
    assert(repeatedCardResult === "Multi: 1", "second repeated card button was not selected", {
      repeatedCardResult
    });

    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "css",
        selector: "#fruit-select"
      },
      kind: "selectOption",
      args: { value: "banana" },
      waitMs: 100
    });
    const fruit = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("fruit-result").textContent`
      })
    ).result.value;
    assert(fruit === "Fruit: banana", "select dropdown did not change", { fruit });

    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "css",
        selector: "#editor"
      },
      kind: "fill",
      args: { value: "Edited rich text" },
      waitMs: 150
    });
    const editor = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("editor-result").textContent`
      })
    ).result.value;
    assert(editor === "Editor: Edited rich text", "contenteditable editor did not update", {
      editor
    });

    const canvasPoint = (
      await browserEvaluate({
        sessionId,
        script: `(() => {
          const canvas = document.getElementById("visual-canvas");
          canvas.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
          const rect = canvas.getBoundingClientRect();
          return { x: rect.left + 120, y: rect.top + 60 };
        })()`
      })
    ).result.value;
    await browserClick({
      sessionId,
      x: canvasPoint.x,
      y: canvasPoint.y,
      waitMs: 150
    });
    const canvas = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("canvas-result").textContent`
      })
    ).result.value;
    assert(canvas === "Canvas: clicked", "canvas visual target did not receive coordinate click", {
      canvas,
      canvasPoint
    });

    const dragPath = (
      await browserEvaluate({
        sessionId,
        script: `(() => {
          const center = (selector) => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          };
          const source = center("#drag-source");
          const target = center("#drag-dropzone");
          return [
            source,
            { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 },
            target
          ];
        })()`
      })
    ).result.value;
    await browserDrag({
      sessionId,
      path: dragPath,
      waitMs: 150
    });
    const dragResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("drag-result").textContent`
      })
    ).result.value;
    assert(dragResult === "Drag: dropped", "CUA drag did not drop on the fixture target", {
      dragResult,
      dragPath
    });

    await browserClick({
      sessionId,
      selector: "#open-modal",
      waitMs: 150
    });
    const modalObservation = (await browserObserve({ sessionId })).result;
    assert(modalObservation.modalState?.hasModal === true, "modal state was not detected", modalObservation.modalState);
    assert(
      modalObservation.modalState.dialogs.some((dialog) => String(dialog.text || "").includes("Modal fixture content")),
      "modal text was not captured",
      modalObservation.modalState
    );
    await browserEvaluate({
      sessionId,
      script: `document.getElementById("fixture-modal").close()`
    });

    await browserClick({
      sessionId,
      selector: "#show-toast",
      waitMs: 100
    });
    const toast = (
      await browserWaitForText({
        sessionId,
        text: "Toast confirmation saved",
        timeoutMs: 3000
      })
    ).result;
    assert(toast.found === true, "toast confirmation was not observed", toast);
  });

  await test("accessible names cover labels, alt text, values, svg title, and hidden subtree rules", async () => {
    await resetFixturePage();
    const observation = (await browserObserve({ sessionId })).result;
    const bySelector = (selector) => observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === selector
    ));

    assert(bySelector("#aria-labelledby-button")?.label === "Aria Labelled Action", "aria-labelledby name mismatch", {
      element: bySelector("#aria-labelledby-button")
    });
    assert(bySelector("#aria-label-button")?.label === "Aria Label Button", "aria-label name mismatch", {
      element: bySelector("#aria-label-button")
    });
    assert(bySelector("#native-label-input")?.label === "Native association", "native label name mismatch", {
      element: bySelector("#native-label-input")
    });
    assert(bySelector("#alt-image")?.label === "Image Alt Target", "image alt name mismatch", {
      element: bySelector("#alt-image")
    });
    assert(bySelector("#input-value-button")?.label === "Input Value Action", "input button value name mismatch", {
      element: bySelector("#input-value-button")
    });
    assert(bySelector("#svg-title-target")?.label === "Vector Title Target", "svg title name mismatch", {
      element: bySelector("#svg-title-target")
    });
    assert(
      bySelector("#hidden-subtree-button")?.label === "Visible Clean Name",
      "hidden subtree text should not contribute to accessible name",
      { element: bySelector("#hidden-subtree-button") }
    );

    for (const [role, name, expected] of [
      ["button", "Aria Labelled Action", 1],
      ["button", "Aria Label Button", 1],
      ["img", "Image Alt Target", 1],
      ["button", "Input Value Action", 1],
      ["img", "Vector Title Target", 1],
      ["button", "Hidden Noise", 0]
    ]) {
      const count = (
        await browserLocatorQuery({
          sessionId,
          locator: {
            kind: "role",
            role,
            name,
            exact: true
          },
          kind: "count"
        })
      ).result;
      assert(count.value === expected, `role locator count mismatch for ${role} ${name}`, {
        count,
        expected
      });
    }

    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "label",
        text: "Native association",
        exact: true
      },
      kind: "fill",
      args: { value: "Native Label User" },
      waitMs: 100
    });
    const nativeLabelValue = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("native-label-input").value`
      })
    ).result.value;
    assert(nativeLabelValue === "Native Label User", "native label locator did not fill input", {
      nativeLabelValue
    });

    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "role",
        role: "button",
        name: "Aria Labelled Action",
        exact: true
      },
      kind: "click",
      waitMs: 100
    });
    const labelledClick = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("accessible-result").textContent`
      })
    ).result.value;
    assert(labelledClick === "Accessible: aria-labelledby-button", "aria-labelledby role locator did not click", {
      labelledClick
    });

    const svgPoint = (
      await browserEvaluate({
        sessionId,
        script: `(() => {
          const rect = document.getElementById("svg-title-target").getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`
      })
    ).result.value;
    const inspected = (
      await browserElementInfo({
        sessionId,
        x: svgPoint.x,
        y: svgPoint.y
      })
    ).result;
    assert(inspected.name === "Vector Title Target", "elementInfo did not use SVG title fallback", inspected);
    assert(inspected.role === "img", "elementInfo did not preserve explicit ARIA role", inspected);
  });

  await test("open shadow DOM is observable and reachable by locators", async () => {
    await resetFixturePage();
    const observation = (await browserObserve({ sessionId })).result;
    const shadowButton = observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === "#shadow-button"
    ));

    assert(shadowButton, "open shadow button was not included in observe elements", observation.elements);
    assert(shadowButton.shadowRoot === "open", "open shadow element did not include a shadow marker", shadowButton);
    assert(
      shadowButton.shadowHostSelector === "div#shadow-host",
      "open shadow element did not include its host selector",
      shadowButton
    );

    const count = (
      await browserLocatorQuery({
        sessionId,
        locator: {
          kind: "css",
          selector: "#shadow-button"
        },
        kind: "count"
      })
    ).result;
    assert(count.value === 1, "CSS locator did not pierce open shadow root", count);

    const text = (
      await browserLocatorQuery({
        sessionId,
        locator: {
          kind: "testId",
          testId: "shadow-action"
        },
        kind: "innerText"
      })
    ).result;
    assert(text.value === "Shadow action", "test id locator did not pierce open shadow root", text);

    await browserLocatorAction({
      sessionId,
      locator: {
        kind: "role",
        role: "button",
        name: "Shadow action"
      },
      kind: "click",
      waitMs: 150
    });
    const shadowResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("shadow-result").textContent`
      })
    ).result.value;
    assert(shadowResult === "Shadow: clicked", "role locator did not click open shadow button", {
      shadowResult
    });

    const point = (
      await browserEvaluate({
        sessionId,
        script: `(() => {
          const button = document.getElementById("shadow-host").shadowRoot.getElementById("shadow-button");
          const rect = button.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`
      })
    ).result.value;
    const info = (
      await browserEvaluate({
        sessionId,
        script: `document.elementFromPoint(${point.x}, ${point.y}).id`
      })
    ).result.value;
    assert(info === "shadow-host" || info === "shadow-button", "fixture point did not hit shadow host/button", {
      info,
      point
    });

    const element = (
      await browserEvaluate({
        sessionId,
        script: `(() => {
          const root = document.getElementById("shadow-host").shadowRoot;
          return root.elementFromPoint(${point.x}, ${point.y}).id;
        })()`
      })
    ).result.value;
    assert(element === "shadow-button", "fixture shadow root did not hit shadow button", {
      element,
      point
    });

    const inspected = (
      await browserElementInfo({
        sessionId,
        x: point.x,
        y: point.y
      })
    ).result;
    assert(inspected.found === true, "elementInfo did not find shadow button", inspected);
    assert(inspected.shadowRoot === "open", "elementInfo did not report open shadow marker", inspected);
    assert(inspected.name === "Shadow action", "elementInfo did not inspect shadow button", inspected);
  });

  await test("closed shadow DOM hosts are reported as unsupported", async () => {
    await resetFixturePage();
    const observation = (await browserObserve({ sessionId })).result;
    const closedHost = observation.elements.find((element) => element.tagName === "closed-widget");
    const leakedClosedButton = observation.elements.find((element) => element.selectorCandidates?.some(
      (candidate) => candidate.selector === "#closed-shadow-button"
    ));

    assert(closedHost, "closed shadow host was not included in observe elements", observation.elements);
    assert(
      closedHost.shadowRoot === "closed_unsupported",
      "closed shadow host did not report unsupported closed shadow marker",
      closedHost
    );
    assert(
      closedHost.shadowUnsupportedReason === "custom_element_shadow_root_not_accessible",
      "closed shadow host did not include unsupported reason",
      closedHost
    );
    assert(!leakedClosedButton, "closed shadow internals leaked into observe elements", leakedClosedButton);
  });

  await test("virtualized list updates observable rows after container scroll", async () => {
    await resetFixturePage();
    const initialObservation = (await browserObserve({ sessionId })).result;
    const initialVirtualRows = initialObservation.elements.filter((element) =>
      String(element.label || "").startsWith("Virtual item ")
    );
    assert(
      initialVirtualRows.some((row) => row.label === "Virtual item 00"),
      "initial virtualized row was not observed",
      initialVirtualRows
    );
    assert(
      !initialVirtualRows.some((row) => row.label === "Virtual item 42"),
      "far virtualized row should not be in the initial DOM window",
      initialVirtualRows
    );

    const missingBeforeScroll = (
      await browserLocatorQuery({
        sessionId,
        locator: { kind: "text", text: "Virtual item 42", exact: true },
        kind: "count"
      })
    ).result;
    assert(missingBeforeScroll.value === 0, "far virtualized item was present before scrolling", missingBeforeScroll);

    const point = (
      await browserEvaluate({
        sessionId,
        script: `(() => {
          const rect = document.getElementById("virtual-list").getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`
      })
    ).result.value;
    await browserScroll({
      sessionId,
      x: point.x,
      y: point.y,
      deltaY: 42 * 42,
      waitMs: 250
    });

    const visibleAfterScroll = (
      await browserLocatorQuery({
        sessionId,
        locator: { kind: "text", text: "Virtual item 42", exact: true },
        kind: "count"
      })
    ).result;
    assert(visibleAfterScroll.value === 1, "far virtualized item was not materialized after scrolling", visibleAfterScroll);

    await browserLocatorAction({
      sessionId,
      locator: { kind: "text", text: "Virtual item 42", exact: true },
      kind: "click",
      waitMs: 150
    });
    const virtualResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("virtual-result").textContent`
      })
    ).result.value;
    assert(virtualResult === "Virtual: 42", "virtualized row click did not hit the materialized item", {
      virtualResult
    });
  });

  await test("risky clicks and handoff boundaries emit events", async () => {
    await resetFixturePage();
    await browserClick({
      sessionId,
      selector: "#delete-account-button",
      waitMs: 100
    });
    let riskResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("risk-result").textContent`
      })
    ).result.value;
    assert(riskResult === "Risk: deleted", "destructive click did not run", { riskResult });

    await browserClick({
      sessionId,
      selector: "#allow-camera-button",
      waitMs: 50
    });
    riskResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("risk-result").textContent`
      })
    ).result.value;
    assert(riskResult === "Risk: camera allowed", "camera-permission fixture click did not run", {
      riskResult
    });

    await expectBrowserActionFailure(
      () => browserClick({
        sessionId,
        selector: "#captcha-button",
        waitMs: 50
      }),
      /user_handoff_required/
    );
    const handoffEvents = (
      await browserGetEvents({
        sessionId,
        name: "userHandoffRequired",
        limit: 10
      })
    ).result.events;
    assert(
      handoffEvents.some((event) => event.category === "captcha" && event.target?.label === "Verify you are human"),
      "userHandoffRequired event for CAPTCHA was not buffered",
      handoffEvents
    );
    riskResult = (
      await browserEvaluate({
        sessionId,
        script: `document.getElementById("risk-result").textContent`
      })
    ).result.value;
    assert(riskResult !== "Risk: captcha bypassed", "CAPTCHA handoff boundary was clicked", { riskResult });
  });

  await test("click, type, press key, wait for URL", async () => {
    await resetFixturePage();
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

      const chooserPromise = tab.playwright.waitForEvent("filechooser", { timeoutMs: 3000 });
      await tab.locator("#upload-label").click({ waitMs: 100 });
      const chooser = await chooserPromise;
      assert(chooser.isMultiple() === true, "filechooser should report multiple upload input");
      await chooser.setFiles([uploadFixturePath, secondUploadFixturePath], { waitMs: 300 });

      const chooserUpload = await tab.evaluate(
        `({
          count: document.getElementById("upload-input").files.length,
          names: Array.from(document.getElementById("upload-input").files).map((file) => file.name)
        })`
      );
      assert(chooserUpload.count === 2, "filechooser setFiles upload count mismatch", chooserUpload);
      assert(
        chooserUpload.names.includes("red-test.png") && chooserUpload.names.includes("second-upload.txt"),
        "filechooser setFiles upload names mismatch",
        chooserUpload
      );
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

      const alphaCards = await tabA.locator(".filter-card", { hasText: "Alpha" }).count();
      assert(alphaCards === 2, "locator hasText filter count mismatch", { alphaCards });

      const visibleAlphaCards = await tabA.locator(".filter-card", { hasText: "Alpha" })
        .filter({ visible: true })
        .count();
      assert(visibleAlphaCards === 1, "locator visible filter count mismatch", {
        visibleAlphaCards
      });

      const notArchivedCards = await tabA.locator(".filter-card")
        .filter({ hasNotText: "Archived", visible: true })
        .allTextContents();
      assert(
        notArchivedCards.length === 1 && notArchivedCards[0].includes("Filter Alpha Active"),
        "locator hasNotText filter mismatch",
        { notArchivedCards }
      );

      const cardsWithReadyBadge = await tabA.locator(".filter-card", {
        has: tabA.locator(".filter-badge", { hasText: "Ready badge" }),
        visible: true
      }).count();
      assert(cardsWithReadyBadge === 1, "locator has nested filter mismatch", {
        cardsWithReadyBadge
      });

      const cardsWithoutArchivedBadge = await tabA.locator(".filter-card")
        .filter({
          hasNot: tabA.locator(".filter-badge", { hasText: "Archived badge" }),
          visible: true
        })
        .count();
      assert(cardsWithoutArchivedBadge === 1, "locator hasNot nested filter mismatch", {
        cardsWithoutArchivedBadge
      });

      const archivedCards = await tabA.locator(".filter-card")
        .and(tabA.locator(".filter-card", { hasText: "Archived" }))
        .count();
      assert(archivedCards === 1, "locator and() combinator mismatch", {
        archivedCards
      });

      const cardsOrCountButton = await tabA.locator(".filter-card[hidden]")
        .or(tabA.locator("#count-button"))
        .count();
      assert(cardsOrCountButton === 2, "locator or() combinator mismatch", {
        cardsOrCountButton
      });

      const frame = tabA.frameLocator("#fixture-frame");
      await frame.getByLabel("Frame name").fill("Frame User", { waitMs: 100 });
      const frameValue = await tabA.evaluate(
        `document.getElementById("fixture-frame").contentDocument.getElementById("frame-input").value`
      );
      assert(frameValue === "Frame User", "frame locator fill mismatch", { frameValue });

      await frame.getByRole("button", { name: "Frame action" }).click({ waitMs: 100 });
      const frameClicked = await tabA.evaluate(
        `document.getElementById("frame-result").textContent`
      );
      assert(frameClicked === "Frame: clicked", "frame locator click mismatch", { frameClicked });

      await frame.frameLocator("#nested-frame")
        .getByRole("button", { name: "Nested frame action" })
        .click({ waitMs: 100 });
      const nestedClicked = await tabA.evaluate(
        `document.getElementById("frame-result").textContent`
      );
      assert(nestedClicked === "Frame: nested clicked", "nested frame locator click mismatch", {
        nestedClicked
      });

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

    const viewport = (
      await browserEvaluate({
        sessionId,
        script: `({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        })`
      })
    ).result.value;

    const screenshot = (
      await browserScreenshot({
        sessionId,
        format: "png"
      })
    ).result;
    assert(screenshot.dataBase64.startsWith("iVBOR"), "screenshot is not a PNG");
    assert(screenshot.dataBase64.length > 1000, "screenshot data is unexpectedly small");
    const viewportPng = decodePng(screenshot.dataBase64);
    assert(
      viewportPng.width >= Math.floor(viewport.width * 0.9) &&
        viewportPng.height >= Math.floor(viewport.height * 0.9),
      "viewport screenshot dimensions are smaller than the viewport",
      { image: viewportPng, viewport }
    );
    assert(hasVisualVariation(viewportPng), "viewport screenshot appears blank or uniform", {
      width: viewportPng.width,
      height: viewportPng.height
    });

    const fullPage = (
      await browserScreenshot({
        sessionId,
        format: "png",
        fullPage: true
      })
    ).result;
    assert(fullPage.fullPage === true, "full-page screenshot flag missing", fullPage);
    assert(fullPage.dataBase64.startsWith("iVBOR"), "full-page screenshot is not a PNG");
    const fullPagePng = decodePng(fullPage.dataBase64);
    assert(
      fullPagePng.height > viewportPng.height + 500,
      "full-page screenshot did not include below-the-fold content",
      { fullPageHeight: fullPagePng.height, viewportHeight: viewportPng.height }
    );
    assert(
      countMatchingPixels(
        fullPagePng,
        (color) => color.g > 230 && color.g - color.r > 15 && color.g - color.b > 10
      ) > 10,
      "full-page screenshot did not include the green below-the-fold spacer",
      { width: fullPagePng.width, height: fullPagePng.height }
    );

    const clip = (
      await browserScreenshot({
        sessionId,
        format: "png",
        clip: { x: 0, y: 0, width: 240, height: 160 }
      })
    ).result;
    assert(clip.clip?.width === 240 && clip.clip?.height === 160, "clip screenshot metadata mismatch", clip);
    assert(clip.dataBase64.startsWith("iVBOR"), "clip screenshot is not a PNG");
    const clipPng = decodePng(clip.dataBase64);
    assert(clipPng.width === 240 && clipPng.height === 160, "clip screenshot dimensions mismatch", {
      width: clipPng.width,
      height: clipPng.height
    });

    const scaledClip = (
      await browserScreenshot({
        sessionId,
        format: "png",
        clip: { x: 0, y: 0, width: 120, height: 80, scale: 2 }
      })
    ).result;
    const scaledClipPng = decodePng(scaledClip.dataBase64);
    assert(
      scaledClip.clip?.scale === 2 &&
        scaledClipPng.width === 240 &&
        scaledClipPng.height === 160,
      "scaled clip screenshot did not honor clip.scale",
      {
        metadata: scaledClip.clip,
        width: scaledClipPng.width,
        height: scaledClipPng.height
      }
    );
  });

  await test("upload file through a visible label target", async () => {
    await browserUploadFile({
      sessionId,
      selector: "#upload-label",
      filePath: uploadFixturePath,
      waitMs: 300
    });

    const uploaded = (
      await browserEvaluate({
        sessionId,
        script: `({
          count: document.getElementById("upload-input").files.length,
          names: Array.from(document.getElementById("upload-input").files).map((file) => file.name),
          result: document.getElementById("upload-result").textContent
        })`
      })
    ).result.value;
    assert(uploaded.count === 1, "upload count mismatch", uploaded);
    assert(uploaded.names.includes("red-test.png"), "uploaded file name mismatch", uploaded);
    assert(uploaded.result.includes("red-test.png"), "upload label did not update result", {
      uploaded
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
      script: `setTimeout(() => confirm("Codex confirm fixture"), 50); "confirm scheduled";`
    });
    await delay(300);
    const confirmHandled = (
      await browserHandleDialog({
        sessionId,
        accept: false
      })
    ).result;
    assert(confirmHandled.accepted === false, "confirm dialog was not dismissed", confirmHandled);

    await browserEvaluate({
      sessionId,
      script: `setTimeout(() => prompt("Codex prompt fixture", "default"), 50); "prompt scheduled";`
    });
    await delay(300);
    const promptHandled = (
      await browserHandleDialog({
        sessionId,
        accept: true,
        promptText: "typed prompt"
      })
    ).result;
    assert(promptHandled.accepted === true, "prompt dialog was not accepted", promptHandled);

    await browserEvaluate({
      sessionId,
      script: "console.error('formax dev log fixture')",
      awaitPromise: true
    });
    await browserEvaluate({
      sessionId,
      script: "console.error('formax secret dev log password: hunter2 token=abc123')",
      awaitPromise: true
    });
    const logs = (await browserGetDevLogs({ sessionId, level: "error", limit: 20 })).result;
    assert(
      logs.logs.some((entry) => String(entry.text || "").includes("formax dev log fixture")),
      "expected dev log entry",
      logs
    );
    const serializedLogs = JSON.stringify(logs);
    assert(!serializedLogs.includes("hunter2"), "password value leaked in dev logs", logs);
    assert(!serializedLogs.includes("abc123"), "token value leaked in dev logs", logs);
    assert(
      logs.logs.some((entry) => entry.redacted === true && String(entry.text || "").includes("[redacted]")),
      "expected redacted dev log entry",
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

    const interruptedStartedAfter = Date.now() - 1000;
    await browserClick({
      sessionId,
      selector: "#download-broken-link",
      waitMs: 300
    });

    const interrupted = (
      await browserWaitForDownload({
        filenameContains: "codex-broken-download",
        state: "interrupted",
        startedAfter: interruptedStartedAfter,
        timeoutMs: 10000,
        pollMs: 250
      })
    ).result;
    assert(interrupted.matched === true, "interrupted download was not observed", interrupted);
    assert(interrupted.download?.state === "interrupted", "download state was not interrupted", interrupted);
    assert(interrupted.download?.error, "interrupted download did not include an error", interrupted);
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
