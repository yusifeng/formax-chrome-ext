import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

export type KernelExecuteResult = {
  result: unknown;
  output: string;
  responseMeta: Record<string, unknown>;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: NodeJS.Timeout;
};

export class NodeReplKernel {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly moduleDirs = new Set<string>();

  async execute(code: string, timeoutMs = 30000): Promise<KernelExecuteResult> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error("timeout_ms must be a positive integer");
    }

    return this.request<KernelExecuteResult>("execute", { code }, timeoutMs);
  }

  async addNodeModuleDir(modulePath: string): Promise<boolean> {
    const resolved = path.resolve(modulePath);
    const added = !this.moduleDirs.has(resolved);

    if (added) {
      this.moduleDirs.add(resolved);
    }

    await this.request("addModuleDir", { path: resolved }, 5000);
    return added;
  }

  async reset(): Promise<void> {
    this.stop();
    this.ensureStarted();
  }

  stop(): void {
    if (!this.child) {
      return;
    }

    const child = this.child;
    this.child = null;
    child.kill();
    this.rejectAll(new Error("Node REPL kernel stopped"));
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
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

  private request<T>(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const child = this.ensureStarted();
    const id = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.stop();
        reject(new Error(`Node REPL kernel timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      });

      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private handleLine(line: string): void {
    let message: {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };

    try {
      message = JSON.parse(line);
    } catch (error) {
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

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    this.pending.clear();
  }
}
