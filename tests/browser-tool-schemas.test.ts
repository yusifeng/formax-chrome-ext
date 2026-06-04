import { describe, expect, it } from "vitest";
import { browserToolSchemas } from "../agent/browserTools.js";

describe("browser tool schemas", () => {
  it("includes the basic backend primitives used by the node_repl browser SDK", () => {
    const names = new Set(browserToolSchemas.map((schema) => schema.name));

    expect(names).toContain("browser_wait_for_event");
    expect(names).toContain("browser_name_session");
    expect(names).toContain("browser_list_tabs");
    expect(names).toContain("browser_get_tab");
    expect(names).toContain("browser_locator_query");
    expect(names).toContain("browser_locator_action");
    expect(names).toContain("browser_locator_wait");
    expect(names).toContain("browser_get_dev_logs");
    expect(names).toContain("browser_get_capabilities");
  });
});
