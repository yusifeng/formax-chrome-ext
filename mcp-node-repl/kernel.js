import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
export class NodeReplKernel {
    child = null;
    nextId = 1;
    pending = new Map();
    moduleDirs = new Set();
    async execute(code, timeoutMs = 30000) {
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
            throw new Error("timeout_ms must be a positive integer");
        }
        return this.request("execute", { code }, timeoutMs);
    }
    async addNodeModuleDir(modulePath) {
        const resolved = path.resolve(modulePath);
        const added = !this.moduleDirs.has(resolved);
        if (added) {
            this.moduleDirs.add(resolved);
        }
        await this.request("addModuleDir", { path: resolved }, 5000);
        return added;
    }
    async reset() {
        this.stop();
        this.ensureStarted();
    }
    stop() {
        if (!this.child) {
            return;
        }
        const child = this.child;
        this.child = null;
        child.kill();
        this.rejectAll(new Error("Node REPL kernel stopped"));
    }
    ensureStarted() {
        if (this.child) {
            return this.child;
        }
        const dirname = path.dirname(fileURLToPath(import.meta.url));
        const childPath = path.join(dirname, "kernel-child.js");
        const child = spawn(process.execPath, ["--experimental-vm-modules", childPath], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_REPL_NODE_MODULE_DIRS: Array.from(this.moduleDirs).join(path.delimiter)
            },
            stdio: ["pipe", "pipe", "pipe"]
        });
        this.child = child;
        const stdout = readline.createInterface({ input: child.stdout });
        stdout.on("line", (line) => this.handleLine(line));
        child.stderr.on("data", (chunk) => {
            process.stderr.write(`[node-repl-kernel] ${chunk}`);
        });
        child.on("exit", (code, signal) => {
            if (this.child !== child) {
                return;
            }
            this.child = null;
            this.rejectAll(new Error(`Node REPL kernel exited with code=${code ?? "null"} signal=${signal ?? "null"}`));
        });
        return child;
    }
    request(method, params, timeoutMs) {
        const child = this.ensureStarted();
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                this.stop();
                reject(new Error(`Node REPL kernel timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pending.set(id, {
                resolve: resolve,
                reject,
                timer
            });
            child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
        });
    }
    handleLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch (error) {
            process.stderr.write(`[node-repl-kernel] invalid json: ${String(error)}\n`);
            return;
        }
        if (typeof message.id !== "number") {
            return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) {
            return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) {
            pending.reject(new Error(message.error.message || "Node REPL kernel error"));
            return;
        }
        pending.resolve(message.result);
    }
    rejectAll(error) {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }
}
