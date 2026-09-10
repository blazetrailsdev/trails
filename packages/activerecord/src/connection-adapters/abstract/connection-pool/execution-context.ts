import { IsolatedExecutionState } from "@blazetrails/activesupport";

let _contextIdCounter = 0;

const CONTEXT_ID_KEY = Symbol.for("ar_execution_context_id");
const ROOT_CONTEXT = { id: 0 } as const;
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
  return IsolatedExecutionState.get<{ readonly id: number }>(CONTEXT_ID_KEY) ?? ROOT_CONTEXT;
}

/** @noRailsEquivalent PERMANENT */
export function withExecutionContext<T>(fn: () => T): T {
  const id = ++_contextIdCounter;
  const runHooks = () => {
    const key = String(id);
    for (const hook of _exitHooks) hook(key);
  };
  return IsolatedExecutionState.scope(CONTEXT_ID_KEY, { id }, () => {
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
