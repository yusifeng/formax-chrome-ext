import {
  browserOpenUrl,
  browserPressKey,
  browserStartSession,
  browserTypeText
} from "./browserTools.js";
import type { BrowserElement, BrowserObservation } from "../shared/types.js";

function print(title: string, value: unknown): void {
  console.log(`\n# ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

function findSearchInput(elements: BrowserElement[]): BrowserElement {
  const input =
    elements.find((element) => element.role.startsWith("input")) ??
    elements.find((element) => element.tagName === "textarea");

  if (!input) {
    throw new Error("Could not find a search input on Baidu");
  }

  return input;
}

const sessionEnvelope = await browserStartSession({
  sessionId: `baidu-search-${Date.now().toString(36)}`,
  active: true
});
const session = sessionEnvelope.result;
print("session", session);

const openedEnvelope = await browserOpenUrl({
  sessionId: session.sessionId,
  url: "https://www.baidu.com"
});
const opened = openedEnvelope.result as BrowserObservation;
print("opened", {
  url: opened.url,
  title: opened.title,
  elements: opened.elements.slice(0, 10)
});

const searchInput = findSearchInput(opened.elements);
print("searchInput", searchInput);

const typedEnvelope = await browserTypeText({
  sessionId: session.sessionId,
  ref: searchInput.ref,
  text: "123",
  clear: true,
  waitMs: 500
});
print("typed", {
  url: typedEnvelope.result.url,
  title: typedEnvelope.result.title
});

const submittedEnvelope = await browserPressKey({
  sessionId: session.sessionId,
  key: "Enter",
  waitMs: 1500
});
const submitted = submittedEnvelope.result as BrowserObservation;
print("submitted", {
  url: submitted.url,
  title: submitted.title,
  text: submitted.text.slice(0, 500)
});
