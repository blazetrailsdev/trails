import { env as processEnv } from "@blazetrails/ruby-compat";
import { File } from "@blazetrails/ruby-compat";

export interface SpawnSyncOptions {
  input?: string | Uint8Array;
  env?: NodeJS.ProcessEnv;
  encoding?: "utf8" | "utf-8";
  cwd?: string;
  out?: string;
  in?: string;
}

export interface SpawnSyncResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface ChildProcessAdapter {
  spawnSync(cmd: string, args: string[], options?: SpawnSyncOptions): SpawnSyncResult;
}

const registry = new Map<string, ChildProcessAdapter>();
let currentAdapterName: string | null = null;
let resolved: ChildProcessAdapter | null = null;

export function registerChildProcessAdapter(name: string, adapter: ChildProcessAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;
let nodeAsyncPromise: Promise<boolean> | null = null;

type NodeSpawnSyncResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: unknown;
  stderr: unknown;
  error?: Error;
};

type NodeChildProcess = {
  spawnSync: (cmd: string, args: string[], opts?: unknown) => NodeSpawnSyncResult;
};

function wrap(cp: NodeChildProcess): ChildProcessAdapter {
  return {
    spawnSync(cmd, args, options) {
      const outFile = options?.out != null ? File.open(options.out, "w") : null;
      const inFile = options?.in != null ? File.open(options.in, "r") : null;
      let result: NodeSpawnSyncResult;
      try {
        result = cp.spawnSync(cmd, args, {
          input: options?.input,
          env: options?.env ?? ({ ...processEnv } as NodeJS.ProcessEnv),
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
  };
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
      return false;
    }
    if (typeof require === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeModule = require("node:module") as {
      createRequire: (from: string | URL) => NodeRequire;
    };
    const req = nodeModule.createRequire("file:///activesupport");
    const cp = req("node:child_process") as unknown as NodeChildProcess;
    registry.set("node", wrap(cp));
    return true;
  } catch {
    return false;
  }
}

function tryAutoRegisterNodeAsync(): Promise<boolean> {
  if (registry.has("node")) return Promise.resolve(true);
  if (!nodeAsyncPromise) {
    nodeAsyncPromise = (async () => {
      try {
        if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
          return false;
        }
        const cp = (await import("node:child_process")) as unknown as NodeChildProcess;
        registry.set("node", wrap(cp));
        return true;
      } catch {
        return false;
      }
    })();
  }
  return nodeAsyncPromise;
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

async function resolveAsync(): Promise<ChildProcessAdapter> {
  const name = currentAdapterName;
  try {
    return resolve();
  } catch (error) {
    if (name) throw error;
    if (await tryAutoRegisterNodeAsync()) {
      resolved = registry.get("node")!;
      return resolved;
    }
    throw error;
  }
}

export function getChildProcess(): ChildProcessAdapter {
  return resolve();
}

export async function getChildProcessAsync(): Promise<ChildProcessAdapter> {
  return resolveAsync();
}

export const childProcessAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
