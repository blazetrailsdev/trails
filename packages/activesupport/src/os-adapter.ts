/**
 * OS adapter — mirrors the Rails adapter pattern.
 *
 * Exposes the few runtime surfaces higher-level packages need (`tmpdir`,
 * `platform`, `cwd`) so they can avoid importing `node:os` / `process`
 * directly.
 */

export interface OsAdapter {
  tmpdir(): string;
  /** Normalized platform id, e.g. "linux", "darwin", "win32". */
  platform(): string;
  /**
   * Current working directory. On Node this is `process.cwd()`. Adapters
   * for non-Node runtimes should return the logical root they'd like
   * relative paths resolved against.
   */
  cwd(): string;
}

const registry = new Map<string, OsAdapter>();
let currentAdapterName: string | null = null;
let resolved: OsAdapter | null = null;

export function registerOsAdapter(name: string, adapter: OsAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;
let nodeAsyncPromise: Promise<boolean> | null = null;

type NodeOs = { tmpdir: () => string; platform: () => string };

function wrap(os: NodeOs): OsAdapter {
  return {
    tmpdir: () => os.tmpdir(),
    platform: () => os.platform(),
    cwd: () => {
      const proc = (globalThis as { process?: { cwd?: () => string } }).process;
      if (proc && typeof proc.cwd === "function") return proc.cwd();
      throw new Error("process.cwd() is unavailable in this runtime");
    },
  };
}

/**
 * Sync auto-registration of the node implementation.
 *
 * Works under CommonJS. In pure Node ESM the sync path cannot synchronously
 * pull in `node:os` without a top-level static import of `node:module`
 * (which would break browser bundles). Consumers running under ESM should
 * call {@link getOsAsync} instead — it uses dynamic `import("node:os")`
 * and works everywhere.
 */
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
    const req = nodeModule.createRequire(
      typeof __filename !== "undefined" ? __filename : "file:///activesupport",
    );
    const os = req("node:os") as NodeOs;
    registry.set("node", wrap(os));
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
        const os = (await import("node:os")) as unknown as NodeOs;
        registry.set("node", wrap(os));
        return true;
      } catch {
        return false;
      }
    })();
  }
  return nodeAsyncPromise;
}

function resolve(): OsAdapter {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`OS adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }
  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }
  throw new Error(
    "No OS adapter configured. Set ActiveSupport.osAdapter or register a custom adapter.",
  );
}

async function resolveAsync(): Promise<OsAdapter> {
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

export function getOs(): OsAdapter {
  return resolve();
}

export async function getOsAsync(): Promise<OsAdapter> {
  return resolveAsync();
}

export const osAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
