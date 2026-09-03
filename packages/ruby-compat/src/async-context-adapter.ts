export interface AsyncContext<T> {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
}

export interface AsyncContextAdapter {
  create<T>(): AsyncContext<T>;
}

type NodeAsyncHooks = {
  AsyncLocalStorage?: new <T>() => AsyncContext<T>;
};

function wrapNodeAsyncHooks(asyncHooks: NodeAsyncHooks): AsyncContextAdapter {
  return {
    create<T>(): AsyncContext<T> {
      return new asyncHooks.AsyncLocalStorage!<T>();
    },
  };
}

function createFallbackAdapter(): AsyncContextAdapter {
  return {
    create<T>(): AsyncContext<T> {
      let current: T | undefined;
      return {
        getStore(): T | undefined {
          return current;
        },
        run<R>(store: T, fn: () => R): R {
          const prev = current;
          current = store;
          try {
            const result = fn();
            if (result && typeof (result as unknown as Promise<unknown>).then === "function") {
              return (result as unknown as Promise<unknown>).then(
                (val) => {
                  current = prev;
                  return val;
                },
                (err) => {
                  current = prev;
                  throw err;
                },
              ) as unknown as R;
            }
            current = prev;
            return result;
          } catch (e) {
            current = prev;
            throw e;
          }
        },
      };
    },
  };
}

const registry = new Map<string, AsyncContextAdapter>();
let currentAdapterName: string | null = null;
let resolved: AsyncContextAdapter | null = null;

/** @noRailsEquivalent PERMANENT */
export function registerAsyncContextAdapter(name: string, adapter: AsyncContextAdapter): void {
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
    const asyncHooks = req("node:async_hooks") as NodeAsyncHooks;
    if (asyncHooks.AsyncLocalStorage) {
      registry.set("node", wrapNodeAsyncHooks(asyncHooks));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function resolve(): AsyncContextAdapter {
  if (resolved) return resolved;

  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Async context adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }

  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }

  resolved = createFallbackAdapter();
  return resolved;
}

/** @noRailsEquivalent PERMANENT */
export function getAsyncContext(): AsyncContextAdapter {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export const asyncContextAdapterConfig = {
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
