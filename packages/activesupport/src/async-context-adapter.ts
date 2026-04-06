/**
 * Async context adapter — wraps AsyncLocalStorage for browser compatibility.
 *
 * In Node, auto-registers using async_hooks. In browsers, a custom adapter
 * can be registered (or the fallback single-context implementation is used).
 */

export interface AsyncContext<T> {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
}

export interface AsyncContextAdapter {
  create<T>(): AsyncContext<T>;
}

function wrapNodeAsyncHooks(asyncHooks: typeof import("async_hooks")): AsyncContextAdapter {
  return {
    create<T>(): AsyncContext<T> {
      return new asyncHooks.AsyncLocalStorage<T>();
    },
  };
}

/**
 * Fallback adapter for environments without AsyncLocalStorage.
 * Uses a simple stack — safe for sequential async but not for truly
 * concurrent async contexts (e.g. multiple in-flight requests).
 */
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

export function registerAsyncContextAdapter(name: string, adapter: AsyncContextAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

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
    const asyncHooks = req("async_hooks") as typeof import("async_hooks");
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

  // Fallback: single-context (no true async isolation)
  resolved = createFallbackAdapter();
  return resolved;
}

export function getAsyncContext(): AsyncContextAdapter {
  return resolve();
}

export const asyncContextAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
