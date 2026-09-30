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

export interface ChildProcessAdapter {
  spawnSync(cmd: string, args: string[], options?: SpawnSyncOptions): SpawnSyncResult;
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
