import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";

let _contextIdCounter = 0;
let _contextStorage: AsyncContext<number> | null = null;

const _exitHooks: ((contextId: string) => void)[] = [];

/** @internal */
export function registerContextExitHook(hook: (contextId: string) => void): void {
  _exitHooks.push(hook);
}

/** @internal */
export function executionContextId(): number {
  if (!_contextStorage) {
    _contextStorage = getAsyncContext().create<number>();
  }
  return _contextStorage.getStore() ?? 0;
}

/**
 * Run a callback in a new isolated execution context.
 * Leases obtained inside will not collide with the outer context.
 * On exit, registered hooks fire with the context id so per-context state
 * (e.g., per-pool query-cache Stores) can be evicted — mirrors Rails' GC of
 * `IsolatedExecutionState.context`.
 */
export function withExecutionContext<T>(fn: () => T): T {
  if (!_contextStorage) {
    _contextStorage = getAsyncContext().create<number>();
  }
  const id = ++_contextIdCounter;
  const runHooks = () => {
    const key = String(id);
    for (const hook of _exitHooks) hook(key);
  };
  return _contextStorage.run(id, () => {
    let result: T;
    try {
      result = fn();
    } catch (err) {
      runHooks();
      throw err;
    }
    if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function") {
      // Wrap via Promise.resolve so bare PromiseLike thenables (which only
      // need to implement `then`) still get a `.finally` to attach the hook.
      return Promise.resolve(result as unknown as PromiseLike<unknown>).finally(
        runHooks,
      ) as unknown as T;
    }
    runHooks();
    return result;
  });
}
