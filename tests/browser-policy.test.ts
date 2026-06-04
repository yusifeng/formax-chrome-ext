import { describe, expect, it } from "vitest";
import {
  assertAllowedNavigationUrl,
  normalizeKey,
  redactPasswordValue
} from "../shared/browser-policy.js";

describe("browser policy", () => {
  it("allows http and https urls", () => {
    expect(() => assertAllowedNavigationUrl("https://example.com")).not.toThrow();
    expect(() => assertAllowedNavigationUrl("http://127.0.0.1:3000")).not.toThrow();
  });

  it("blocks non-http navigation", () => {
    expect(() => assertAllowedNavigationUrl("chrome://extensions")).toThrow(
      "Only http/https"
    );
    expect(() => assertAllowedNavigationUrl("file:///tmp/index.html")).toThrow(
      "Only http/https"
    );
  });

  it("normalizes supported keys", () => {
    expect(normalizeKey("Enter")).toEqual({
      key: "Enter",
      code: "Enter",
      keyCode: 13
    });
  });

  it("rejects unsupported keys", () => {
    expect(() => normalizeKey("Meta")).toThrow("Unsupported key");
  });

  it("redacts password values", () => {
    expect(redactPasswordValue("password", "secret")).toBe("[password field]");
    expect(redactPasswordValue("text", "hello")).toBe("hello");
  });
});
