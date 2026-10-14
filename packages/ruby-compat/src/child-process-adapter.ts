import { env as processEnv } from "./process-adapter.js";
import { File } from "./file.js";

export interface SpawnSyncOptions {
  input?: string | Uint8Array;
  env?: Record<string, string | undefined>;
  encoding?: "utf8" | "utf-8";
  cwd?: string;
  out?: string;
  in?: string;
}

export interface SpawnSyncResult {
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

/**
 * What `waitpid(2)` reports for a child (`rb_process_status_wait`,
 * `vendor/ruby/v3.3.11/process.c:1198`): `pid` is `null` when the child was
 * never spawned, `status` its exit status and `null` when it did not exit, and
 * `error` what the spawn failed with.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface WaitStatus {
  pid: number | null;
  status: number | null;
  signal: string | null;
  error?: Error;
}

export interface ChildProcessAdapter {
  spawnSync(cmd: string, args: string[], options?: SpawnSyncOptions): SpawnSyncResult;
  /**
   * Runs the child with the parent's stdio and resolves once it is waited for.
   * With no `args`, `command` is a command line for `/bin/sh -c` (`proc_exec_sh`,
   * `vendor/ruby/v3.3.11/process.c:1788`); with `args` it is the program, exec'd
   * with that argv and no shell (`proc_exec_cmd`, `process.c:1741`). `options.out`
   * is `out: filename`: stdout opened on that file, truncated (`process.c:1985`).
   */
  system?(
    command: string,
    env: Record<string, string | undefined>,
    args?: string[] | null,
    options?: { out?: string },
  ): Promise<WaitStatus>;
  /**
   * Runs `command` through `/bin/sh -c` with stdout and stderr on one pipe,
   * as `Open3.popen2e` wires them (`vendor/ruby/v3.3.11/lib/open3.rb:508-523`),
   * and a stdin pipe closed at once (`open3.rb:928`), and resolves with what
   * it wrote.
   */
  capture2e?(
    command: string,
    env: Record<string, string | undefined>,
  ): Promise<[output: string, status: WaitStatus]>;
}

const registry = new Map<string, ChildProcessAdapter>();
let currentAdapterName: string | null = null;
let resolved: ChildProcessAdapter | null = null;

/** @noRailsEquivalent PERMANENT */
export function registerChildProcessAdapter(name: string, adapter: ChildProcessAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

/** @noRailsEquivalent PERMANENT */
interface NodeProcess {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = nodeProcess();
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  return nodeModule.createRequire("file:///ruby-compat");
}

type NodeSpawnSyncResult = {
  status: number | null;
  signal: string | null;
  stdout: unknown;
  stderr: unknown;
  error?: Error;
};

type NodeReadable = {
  setEncoding(encoding: string): void;
  on(event: "data", listener: (chunk: string) => void): void;
};

type NodeChild = {
  pid?: number;
  stdin: { end(): void } | null;
  stdout: NodeReadable | null;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
};

type NodeChildProcess = {
  spawnSync: (cmd: string, args: string[], opts?: unknown) => NodeSpawnSyncResult;
  spawn: (cmd: string, args: string[], opts?: unknown) => NodeChild;
};

function spawnChild(
  cp: NodeChildProcess,
  file: string,
  args: string[],
  env: Record<string, string | undefined>,
  stdio: unknown,
  read: (chunk: string) => void,
): Promise<WaitStatus> {
  return new Promise((resolve) => {
    const child = cp.spawn(file, args, { env, stdio });
    child.stdin?.end();
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", read);
    child.on("error", (error) =>
      resolve({ pid: child.pid ?? null, status: null, signal: null, error }),
    );
    child.on("close", (status, signal) => resolve({ pid: child.pid ?? null, status, signal }));
  });
}

function wrap(cp: NodeChildProcess): ChildProcessAdapter {
  return {
    spawnSync(cmd, args, options) {
      const outFile = options?.out != null ? File.open(options.out, "w") : null;
      const inFile = options?.in != null ? File.open(options.in, "r") : null;
      let result: NodeSpawnSyncResult;
      try {
        result = cp.spawnSync(cmd, args, {
          input: options?.input,
          env: options?.env ?? { ...processEnv },
          encoding: options?.encoding ?? "utf8",
          cwd: options?.cwd,
          ...(outFile !== null || inFile !== null
            ? { stdio: [inFile?.fileno() ?? "pipe", outFile?.fileno() ?? "pipe", "pipe"] }
            : {}),
        });
      } finally {
        outFile?.close();
        inFile?.close();
      }
      return {
        status: result.status,
        signal: result.signal,
        stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout ?? ""),
        stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? ""),
        error: result.error,
      };
    },
    system(command, env, args, options) {
      const outFile = options?.out != null ? File.open(options.out, "w") : null;
      const stdio = outFile === null ? "inherit" : ["inherit", outFile.fileno(), "inherit"];
      const status =
        args == null
          ? spawnChild(cp, "/bin/sh", ["-c", command], env, stdio, () => {})
          : spawnChild(cp, command, args, env, stdio, () => {});
      return status.finally(() => outFile?.close());
    },
    async capture2e(command, env) {
      let output = "";
      const args = ["-c", 'exec 2>&1; eval "$1"', "sh", command];
      const status = await spawnChild(
        cp,
        "/bin/sh",
        args,
        env,
        ["pipe", "pipe", "ignore"],
        (chunk) => {
          output += chunk;
        },
      );
      return [output, status];
    },
  };
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = nodeProcess();
    if (proc === undefined || !proc.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    registry.set("node", wrap(req("node:child_process") as NodeChildProcess));
    return true;
  } catch {
    return false;
  }
}

function resolve(): ChildProcessAdapter {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Child-process adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }
  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }
  throw new Error(
    "No child-process adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.childProcessAdapter or register a custom adapter.",
  );
}

/** @noRailsEquivalent PERMANENT */
export function getChildProcess(): ChildProcessAdapter {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export async function getChildProcessAsync(): Promise<ChildProcessAdapter> {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export const childProcessAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
