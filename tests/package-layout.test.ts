import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(filePath: string) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

describe("package layout", () => {
  it("declares a Formax plugin manifest for the packaged runtime", () => {
    const manifest = JSON.parse(read(".formax-plugin/plugin.json"));

    expect(manifest.name).toBe("formax-chrome");
    expect(manifest.runtime.browserClient).toBe("scripts/browser-client.mjs");
    expect(manifest.runtime.mcpServer).toBe("mcp-node-repl/server.js");
    expect(manifest.runtime.nativeHost).toBe("extension-host/<platform>/<arch>/extension-host");
    expect(manifest.skills).toEqual([
      {
        name: "control-chrome",
        path: "skills/control-chrome/SKILL.md",
      },
    ]);
    expect(manifest.docs).toBe("docs");
  });

  it("exposes the stable packaged browser client entrypoint", async () => {
    const moduleUrl = pathToFileURL(path.join(root, "scripts/browser-client.mjs")).href;
    const browserClient = await import(moduleUrl);

    expect(browserClient.setupBrowserRuntime).toEqual(expect.any(Function));
  });

  it("keeps package and install scripts aligned with the plugin-like layout", () => {
    const packageDist = read("scripts/package-dist.js");
    const installer = read("scripts/install-formax-runtime.js");

    for (const artifact of [
      ".formax-plugin",
      "docs",
      "scripts/browser-client.mjs",
      "scripts/formax-doctor.js",
      "scripts/formax-uninstall.js",
      "skills/control-chrome/SKILL.md",
    ]) {
      expect(packageDist).toContain(artifact);
    }

    for (const artifact of [
      ".formax-plugin",
      "docs",
      "scripts/browser-client.mjs",
      "scripts/formax-doctor.js",
      "scripts/formax-uninstall.js",
      "skills",
    ]) {
      expect(installer).toContain(artifact);
    }

    expect(installer).toContain("formax-browser-mcp");
    expect(installer).toContain("formax-doctor");
    expect(installer).toContain("formax-uninstall");
  });
});
