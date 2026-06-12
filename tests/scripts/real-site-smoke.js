#!/usr/bin/env node

import {
  browserGetCapabilities,
  browserHealth,
  browserLocatorQuery,
  browserObserve,
  browserOpenUrl,
  browserStartSession,
  browserStopSession,
  browserWaitForLoadState,
  browserWaitForText,
  browserWaitForUrl
} from "../../build/runtime/agent/browserTools.js";

const KEEP_TABS = process.env.KEEP_TABS === "1";
const SIGNED_IN_URL = process.env.FORMAX_REAL_SITE_SIGNED_IN_URL || "";
const DEFAULT_TIMEOUT_MS = Number(process.env.FORMAX_REAL_SITE_TIMEOUT_MS || 20000);

let sessionId = `real-site-${Date.now().toString(36)}`;
const results = [];

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

async function test(name, fn) {
  const startedAt = Date.now();

  try {
    await fn();
    const durationMs = Date.now() - startedAt;
    results.push({ name, ok: true, durationMs });
    console.log(`ok ${name} (${durationMs}ms)`);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    results.push({
      name,
      ok: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error)
    });
    console.error(`not ok ${name} (${durationMs}ms)`);
    console.error(error);
  }
}

function hostFor(url) {
  return new URL(url).host;
}

async function gotoPublicSite(url, options = {}) {
  const opened = (
    await browserOpenUrl({
      sessionId,
      url,
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
    })
  ).result;

  await browserWaitForUrl({
    sessionId,
    urlContains: hostFor(url),
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });

  await browserWaitForLoadState({
    sessionId,
    state: options.loadState || "domcontentloaded",
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });

  return opened;
}

async function observeTextIncludes(needle, label) {
  const observed = (
    await browserObserve({
      sessionId,
      includeAccessibility: true,
      maxAccessibilityNodes: 80
    })
  ).result;
  const serialized = JSON.stringify(observed).toLowerCase();
  assert(serialized.includes(needle.toLowerCase()), `${label} did not include expected text`, {
    needle,
    title: observed.title,
    url: observed.url
  });
  return observed;
}

async function run() {
  const health = (await browserHealth()).result;
  assert(health.nativeConnected === true, "native host is not connected", health);

  await browserStartSession({
    sessionId,
    active: false
  });

  await test("public search page", async () => {
    const query = "formax browser smoke test";
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const opened = await gotoPublicSite(url);
    assert(String(opened.url || "").includes("bing.com"), "search page did not open Bing", opened);
    await observeTextIncludes("formax", "search page observation");
  });

  await test("public docs page", async () => {
    const url = "https://developer.mozilla.org/en-US/docs/Web/HTML";
    await gotoPublicSite(url);
    const wait = (await browserWaitForText({ sessionId, text: "HTML", timeoutMs: DEFAULT_TIMEOUT_MS })).result;
    assert(wait.matched === true, "MDN docs page did not expose HTML text", wait);
    const heading = (await browserLocatorQuery({
      sessionId,
      locator: { kind: "css", selector: "main h1, article h1" },
      kind: "count"
    })).result;
    assert(Number(heading.value) >= 1, "MDN docs page did not expose a primary heading", heading);
  });

  await test("GitHub public repository page", async () => {
    const url = "https://github.com/microsoft/TypeScript";
    await gotoPublicSite(url);
    const observed = await observeTextIncludes("TypeScript", "GitHub repository observation");
    assert(String(observed.url || "").includes("github.com/microsoft/TypeScript"), "GitHub repo URL mismatch", observed);
  });

  await test("npm package page", async () => {
    const url = "https://www.npmjs.com/package/typescript";
    await gotoPublicSite(url);
    const wait = (await browserWaitForText({ sessionId, text: "typescript", timeoutMs: DEFAULT_TIMEOUT_MS })).result;
    assert(wait.matched === true, "npm package page did not expose package name", wait);
  });

  await test("optional signed-in manual smoke", async () => {
    if (!SIGNED_IN_URL) {
      console.log("skip optional signed-in manual smoke; set FORMAX_REAL_SITE_SIGNED_IN_URL to enable");
      return;
    }

    await gotoPublicSite(SIGNED_IN_URL, { timeoutMs: DEFAULT_TIMEOUT_MS });
    const observed = (await browserObserve({ sessionId })).result;
    assert(String(observed.url || "").startsWith(new URL(SIGNED_IN_URL).origin), "signed-in smoke URL origin mismatch", observed);
  });

  await test("real-site capability boundary", async () => {
    const capabilities = (await browserGetCapabilities({ scope: "browser" })).result.capabilities || [];
    assert(
      capabilities.some((capability) => capability.id === "browser.user.bookmarks" && capability.available === false),
      "bookmarks capability boundary missing from real-site runtime",
      capabilities
    );
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
}

const failed = results.filter((result) => !result.ok);
const passed = results.length - failed.length;

console.log(`\n${passed}/${results.length} real-site smoke checks passed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
