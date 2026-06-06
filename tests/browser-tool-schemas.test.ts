import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { browserToolSchemas } from "../agent/browserTools.js";
import {
  actionForToolName,
  browserActionRegistry,
  browserActions,
  browserToolNames
} from "../shared/action-registry.js";

describe("browser tool schemas", () => {
  it("includes the basic backend primitives used by the node_repl browser SDK", () => {
    const names = new Set(browserToolSchemas.map((schema) => schema.name));

    expect(names).toContain("browser_wait_for_event");
    expect(names).toContain("browser_name_session");
    expect(names).toContain("browser_user_open_tabs");
    expect(names).toContain("browser_list_tabs");
    expect(names).toContain("browser_get_tab");
    expect(names).toContain("browser_locator_query");
    expect(names).toContain("browser_locator_action");
    expect(names).toContain("browser_locator_wait");
    expect(names).toContain("browser_get_dev_logs");
    expect(names).toContain("browser_get_capabilities");
  });

  it("keeps browser tool schemas aligned with the shared action registry", () => {
    const schemaNames = browserToolSchemas.map((schema) => schema.name);

    expect(new Set(schemaNames)).toEqual(new Set(browserToolNames));
    expect(new Set(schemaNames.map((name) => actionForToolName(name)))).toEqual(
      new Set(browserActions)
    );
  });

  it("keeps extension SUPPORTED_ACTIONS aligned with the shared action registry", () => {
    const background = readFileSync("extension/background.ts", "utf8");
    const match = background.match(/const SUPPORTED_ACTIONS = \[([\s\S]*?)\];/);

    expect(match).not.toBeNull();

    const supportedActions = Array.from(
      match?.[1].matchAll(/"([^"]+)"/g) ?? [],
      (item) => item[1]
    );

    expect(supportedActions).toEqual(browserActionRegistry.map((entry) => entry.action));
  });
});
