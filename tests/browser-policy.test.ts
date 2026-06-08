import { describe, expect, it } from "vitest";
import {
  applyHostAccessDecision,
  assertAllowedNavigationUrl,
  assertHostAccessAllowed,
  classifyBrowserAction,
  createDefaultBrowserPolicyState,
  evaluateHostAccess,
  normalizeKey,
  redactPasswordValue,
  redactSensitiveUrl,
  redactSecretPatterns
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
    expect(normalizeKey("ControlOrMeta+Shift+Space")).toEqual({
      key: " ",
      code: "Space",
      keyCode: 32
    });
    expect(normalizeKey("Esc")).toEqual({
      key: "Escape",
      code: "Escape",
      keyCode: 27
    });
    expect(normalizeKey("Control+A")).toEqual({
      key: "A",
      code: "KeyA",
      keyCode: 65
    });
    expect(normalizeKey("F5")).toEqual({
      key: "F5",
      code: "F5",
      keyCode: 116
    });
    expect(normalizeKey("/")).toEqual({
      key: "/",
      code: "Slash",
      keyCode: 191
    });
  });

  it("rejects unsupported keys", () => {
    expect(() => normalizeKey("BadKey")).toThrow("Unsupported key");
  });

  it("redacts password values", () => {
    expect(redactPasswordValue("password", "secret")).toBe("[password field]");
    expect(redactPasswordValue("text", "hello")).toBe("hello");
  });

  it("requires host approval before first interaction with a new host", () => {
    const state = createDefaultBrowserPolicyState();
    const decision = evaluateHostAccess(state, {
      action: "navigate",
      sessionId: "session-a",
      url: "https://example.com/path"
    });

    expect(decision).toMatchObject({
      allowed: false,
      requiresApproval: true,
      code: "requires_host_approval",
      host: "example.com"
    });
    expect(() => assertHostAccessAllowed(state, {
      action: "navigate",
      sessionId: "session-a",
      url: "https://example.com/path"
    })).toThrow("requires approval");
  });

  it("stores per-session allows, persistent allows, and denies", () => {
    const state = createDefaultBrowserPolicyState();

    applyHostAccessDecision(state, {
      decision: "allow",
      sessionId: "session-a",
      host: "example.com"
    });
    expect(evaluateHostAccess(state, {
      action: "click",
      sessionId: "session-a",
      url: "https://example.com/button"
    })).toMatchObject({ allowed: true, scope: "session" });
    expect(evaluateHostAccess(state, {
      action: "click",
      sessionId: "session-b",
      url: "https://example.com/button"
    })).toMatchObject({ allowed: false, requiresApproval: true });

    applyHostAccessDecision(state, {
      decision: "always_allow",
      host: "docs.example"
    });
    expect(evaluateHostAccess(state, {
      action: "evaluate",
      sessionId: "session-b",
      url: "https://docs.example/page"
    })).toMatchObject({ allowed: true, scope: "persistent" });

    applyHostAccessDecision(state, {
      decision: "deny",
      sessionId: "session-a",
      host: "example.com"
    });
    expect(evaluateHostAccess(state, {
      action: "type",
      sessionId: "session-a",
      url: "https://example.com/form"
    })).toMatchObject({
      allowed: false,
      requiresApproval: false,
      code: "host_blocked"
    });
  });

  it("classifies browser actions that require confirmation", () => {
    expect(classifyBrowserAction({
      action: "upload",
      url: "https://example.com/upload",
      filePath: "/tmp/report.pdf"
    })).toMatchObject({
      requiresConfirmation: true,
      reasons: expect.arrayContaining(["file_upload"])
    });
    expect(classifyBrowserAction({
      action: "type",
      url: "https://example.com/login",
      text: "p@ssw0rd",
      sensitive: true
    })).toMatchObject({
      requiresConfirmation: true,
      reasons: expect.arrayContaining(["sensitive_input"])
    });
    expect(classifyBrowserAction({
      action: "click",
      url: "https://example.com/settings",
      label: "Delete account"
    })).toMatchObject({
      requiresConfirmation: true,
      reasons: expect.arrayContaining(["destructive_action"])
    });
    expect(classifyBrowserAction({
      action: "click",
      url: "https://example.com/checkout",
      label: "Pay now"
    })).toMatchObject({
      requiresConfirmation: true,
      reasons: expect.arrayContaining(["external_side_effect"])
    });
    expect(classifyBrowserAction({
      action: "click",
      url: "https://example.com/meeting",
      label: "Allow camera access"
    })).toMatchObject({
      requiresConfirmation: true,
      reasons: expect.arrayContaining(["browser_permission"])
    });
    expect(classifyBrowserAction({
      action: "download",
      url: "https://example.com/photo.png"
    })).toMatchObject({
      requiresConfirmation: false,
      requiresOriginApproval: true,
      reasons: []
    });
    expect(classifyBrowserAction({
      action: "download",
      url: "https://example.com/installer.dmg"
    })).toMatchObject({
      requiresConfirmation: true,
      requiresOriginApproval: true,
      reasons: expect.arrayContaining(["download_run_or_install"])
    });
    expect(classifyBrowserAction({
      action: "history"
    })).toMatchObject({
      requiresConfirmation: true,
      reasons: expect.arrayContaining(["browser_history"])
    });
    expect(classifyBrowserAction({
      action: "clipboard"
    })).toMatchObject({
      requiresConfirmation: true,
      reasons: expect.arrayContaining(["clipboard"])
    });
  });

  it("classifies raw CDP and evaluate governance", () => {
    expect(classifyBrowserAction({
      action: "rawCdp",
      url: "https://example.com",
      method: "Runtime.evaluate"
    })).toMatchObject({
      requiresConfirmation: true,
      requiresOriginApproval: true,
      reasons: expect.arrayContaining(["raw_cdp"])
    });
    expect(classifyBrowserAction({
      action: "evaluate",
      url: "https://example.com",
      script: "document.title",
      mode: "read"
    })).toMatchObject({
      requiresConfirmation: false,
      readOnly: true
    });
    expect(classifyBrowserAction({
      action: "evaluate",
      url: "https://example.com",
      script: "document.cookie",
      mode: "read"
    })).toMatchObject({
      requiresConfirmation: true,
      readOnly: true,
      reasons: expect.arrayContaining(["sensitive_browser_state"])
    });
    expect(classifyBrowserAction({
      action: "rawCdp",
      url: "https://example.com",
      method: "Runtime.evaluate",
      params: {
        expression: "localStorage.getItem('auth_token')"
      }
    })).toMatchObject({
      requiresConfirmation: true,
      requiresOriginApproval: true,
      reasons: expect.arrayContaining(["raw_cdp", "sensitive_browser_state"])
    });
    expect(classifyBrowserAction({
      action: "evaluate",
      url: "https://example.com",
      script: "document.querySelector('button').click()"
    })).toMatchObject({
      requiresConfirmation: true,
      readOnly: false,
      reasons: expect.arrayContaining(["mutating_evaluate"])
    });
    expect(classifyBrowserAction({
      action: "evaluate",
      url: "https://example.com",
      script: "document.querySelector('button').click()",
      mode: "read"
    })).toMatchObject({
      requiresConfirmation: true,
      readOnly: false,
      reasons: expect.arrayContaining(["mutating_evaluate"])
    });
  });

  it("redacts common secret patterns", () => {
    expect(redactSecretPatterns("token=abc123 password: hunter2 api_key=\"sk-test\"")).toBe(
      "token=[redacted] password: [redacted] api_key=\"[redacted]\""
    );
  });

  it("redacts sensitive browser history URL parameters", () => {
    expect(
      redactSensitiveUrl("https://example.test/callback?code=abc&next=/home&access_token=secret#token=frag")
    ).toEqual({
      url: "https://example.test/callback?code=%5Bredacted%5D&next=%2Fhome&access_token=%5Bredacted%5D#[redacted]",
      redacted: true,
      reasons: ["sensitive_query_param", "sensitive_fragment"]
    });
  });
});
