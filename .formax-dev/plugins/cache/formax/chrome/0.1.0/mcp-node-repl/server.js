#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { NodeReplKernel } from "./kernel.js";
const kernel = new NodeReplKernel();
const server = new McpServer({
    name: "formax-node-repl",
    version: "0.1.0"
});
function textResult(value) {
    return {
        content: [
            {
                type: "text",
                text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
            }
        ]
    };
}
server.registerTool("js", {
    title: "JavaScript REPL",
    description: [
        "Run JavaScript in a persistent Node-backed kernel with top-level await.",
        "State stored on globalThis persists until js_reset.",
        "Use nodeRepl.write(text) for exact text output.",
        "Use dynamic import(...) for modules; add custom node_modules roots with js_add_node_module_dir."
    ].join(" "),
    inputSchema: {
        code: z.string().describe("JavaScript source to execute."),
        timeout_ms: z
            .number()
            .int()
            .min(1)
            .default(30000)
            .describe("Execution timeout in milliseconds."),
        title: z
            .string()
            .min(1)
            .max(80)
            .optional()
            .describe("Short user-facing description of this execution.")
    }
}, async ({ code, timeout_ms }) => textResult(await kernel.execute(code, timeout_ms)));
server.registerTool("js_add_node_module_dir", {
    title: "Add Node Module Directory",
    description: "Add an absolute node_modules directory to the kernel module search roots.",
    inputSchema: {
        path: z.string().min(1)
    }
}, async ({ path }) => textResult(await kernel.addNodeModuleDir(path)));
server.registerTool("js_reset", {
    title: "Reset JavaScript REPL",
    description: "Reset the persistent JavaScript kernel and clear prior global state.",
    inputSchema: {}
}, async () => {
    await kernel.reset();
    return textResult({ ok: true });
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("formax-node-repl MCP server running on stdio");
}
process.on("SIGINT", () => {
    kernel.stop();
    process.exit(130);
});
process.on("SIGTERM", () => {
    kernel.stop();
    process.exit(143);
});
main().catch((error) => {
    console.error("MCP server error:", error);
    kernel.stop();
    process.exit(1);
});
