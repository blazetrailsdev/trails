/**
 * Filesystem adapter — mirrors the Rails adapter pattern.
 */

export interface FsStatResult {
  isDirectory(): boolean;
  isFile(): boolean;
  size: number;
  mtime: Date;
}

export interface FsDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface FsAdapter {
  readFileSync(path: string, encoding: "utf-8" | "utf8" | "latin1"): string;
  readFileSync(path: string): Buffer;
  writeFileSync(
    path: string,
    content: string | Buffer | Uint8Array,
    options?: { mode?: number } | string,
  ): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  appendFileSync(path: string, content: string): void;
  unlinkSync(path: string): void;
  readdirSync(path: string): string[];
  readdirSync(path: string, options: { withFileTypes: true }): FsDirent[];
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  rmdirSync(path: string): void;
  statSync(path: string): FsStatResult;
  openSync(path: string, flags: string): number;
  readSync(
    fd: number,
    buffer: Buffer | Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): number;
  closeSync(fd: number): void;
  copyFileSync(src: string, dest: string): void;
}

export interface PathAdapter {
  join(...parts: string[]): string;
  dirname(p: string): string;
  basename(p: string): string;
  resolve(...parts: string[]): string;
  extname(p: string): string;
  sep: string;
}

interface FsRegistration {
  fs: FsAdapter;
  path: PathAdapter;
}

const registry = new Map<string, FsRegistration>();
let currentAdapterName: string | null = null;
let resolved: FsRegistration | null = null;

export function registerFsAdapter(name: string, fs: FsAdapter, path: PathAdapter): void {
  registry.set(name, { fs, path });
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;
let nodeAsyncPromise: Promise<boolean> | null = null;

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
      return false;
    }
    const nodeModule =
      typeof require !== "undefined"
        ? // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("node:module")
        : null;
    if (!nodeModule) return false;
    const req = nodeModule.createRequire(
      typeof __filename !== "undefined" ? __filename : "file:///activesupport",
    );
    const fs = req("node:fs") as FsAdapter;
    const path = req("node:path") as PathAdapter;
    registry.set("node", { fs, path });
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
        const fs = (await import("node:fs")) as unknown as FsAdapter;
        const path = (await import("node:path")) as unknown as PathAdapter;
        registry.set("node", { fs, path });
        return true;
      } catch {
        return false;
      }
    })();
  }
  return nodeAsyncPromise;
}

function resolve(): FsRegistration {
  if (resolved) return resolved;

  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Filesystem adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }

  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }

  throw new Error(
    "No filesystem adapter configured. Set ActiveSupport.fsAdapter or register a custom adapter.",
  );
}

async function resolveAsync(): Promise<FsRegistration> {
  const name = currentAdapterName;
  try {
    return resolve();
  } catch (error) {
    if (name) {
      throw error;
    }
    if (await tryAutoRegisterNodeAsync()) {
      resolved = registry.get("node")!;
      return resolved;
    }
    throw error;
  }
}

export function getFs(): FsAdapter {
  return resolve().fs;
}

export function getPath(): PathAdapter {
  return resolve().path;
}

export async function getFsAsync(): Promise<FsAdapter> {
  return (await resolveAsync()).fs;
}

export async function getPathAsync(): Promise<PathAdapter> {
  return (await resolveAsync()).path;
}

export const fsAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
