import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";

let _contextIdCounter = 0;
let _contextStorage: AsyncContext<number> | null = null;

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
 */
export function withExecutionContext<T>(fn: () => T): T {
  if (!_contextStorage) {
    _contextStorage = getAsyncContext().create<number>();
  }
  return _contextStorage.run(++_contextIdCounter, fn);
}
