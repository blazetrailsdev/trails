import { IsolatedExecutionState } from "@blazetrails/activesupport";

let _contextIdCounter = 0;

const CONTEXT_ID_KEY = Symbol.for("ar_execution_context_id");
const _exitHooks: ((contextId: string) => void)[] = [];

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function registerContextExitHook(hook: (contextId: string) => void): void {
  _exitHooks.push(hook);
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function executionContextId(): number {
  return executionContext().id;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function executionContext(): { readonly id: number } {
  return IsolatedExecutionState.context();
}

/** @noRailsEquivalent PERMANENT */
export function withExecutionContext<T>(fn: () => T): T {
  const id = ++_contextIdCounter;
  const runHooks = () => {
    const key = String(id);
    for (const hook of _exitHooks) hook(key);
  };
  const context = { id, toString: () => `#<Thread:${id} run>` };
  return IsolatedExecutionState.scope(CONTEXT_ID_KEY, context, () => {
    let result: T;
    try {
      result = fn();
    } catch (err) {
      runHooks();
      throw err;
    }
    if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function") {
      return Promise.resolve(result as unknown as PromiseLike<unknown>).finally(
        runHooks,
      ) as unknown as T;
    }
    runHooks();
    return result;
  });
}
