/**
 * ExecutionContext — per-request key/value store.
 * Mirrors ActiveSupport::ExecutionContext.
 */
import { IsolatedExecutionState } from "./isolated-execution-state.js";

const ACTIVE_SUPPORT_EXECUTION_CONTEXT = "active_support_execution_context";

// Rails' private `store` reader is
// `IsolatedExecutionState[:active_support_execution_context] ||= {}`
// (execution_context.rb:47-49) — the context is per-execution state, not a
// process global.
/** @internal */
function store(): Map<string, unknown> {
  return IsolatedExecutionState.fetch(
    ACTIVE_SUPPORT_EXECUTION_CONTEXT,
    () => new Map<string, unknown>(),
  );
}

// Callbacks fired whenever the context mutates. Mirrors Rails'
// `@after_change_callbacks` (execution_context.rb). ActiveRecord::QueryLogs
// registers one here to invalidate its cached SQL comment on every change.
const _afterChangeCallbacks: Array<() => void> = [];

function runAfterChange(): void {
  for (const cb of _afterChangeCallbacks) {
    cb();
  }
}

function saveAndApply(
  attrs: Record<string, unknown>,
): Map<string, { hadKey: boolean; value: unknown }> {
  const saved = new Map<string, { hadKey: boolean; value: unknown }>();
  for (const key of Object.keys(attrs)) {
    saved.set(key, { hadKey: store().has(key), value: store().get(key) });
    store().set(key, attrs[key]);
  }
  return saved;
}

function restore(saved: Map<string, { hadKey: boolean; value: unknown }>): void {
  for (const [key, entry] of saved) {
    if (entry.hadKey) {
      store().set(key, entry.value);
    } else {
      store().delete(key);
    }
  }
}

export const ExecutionContext = {
  /**
   * Register a callback fired whenever the context changes — after `set` and
   * `setKey`, and again when a block-form `set` restores the previous context.
   * Like Rails, `clear` does not fire.
   * Mirrors: ActiveSupport::ExecutionContext.after_change.
   */
  afterChange(fn: () => void): void {
    _afterChangeCallbacks.push(fn);
  },

  set<T = void>(attrs: Record<string, unknown>, fn?: () => T): T | void {
    if (!fn) {
      for (const key of Object.keys(attrs)) {
        store().set(key, attrs[key]);
      }
      runAfterChange();
      return;
    }

    const saved = saveAndApply(attrs);
    runAfterChange();
    let result: T;
    try {
      result = fn();
    } catch (e) {
      restore(saved);
      runAfterChange();
      throw e;
    }

    if (result && typeof (result as unknown as Promise<unknown>).then === "function") {
      return (result as unknown as Promise<unknown>).then(
        (val) => {
          restore(saved);
          runAfterChange();
          return val;
        },
        (e) => {
          restore(saved);
          runAfterChange();
          throw e;
        },
      ) as unknown as T;
    }

    restore(saved);
    runAfterChange();
    return result;
  },

  get(key: string): unknown {
    return store().get(key);
  },

  setKey(key: string, value: unknown): void {
    store().set(key, value);
    runAfterChange();
  },

  toH(): Record<string, unknown> {
    return Object.fromEntries(store());
  },

  // Rails' `clear` does NOT fire after_change (execution_context.rb:43-45) —
  // it is the executor's per-request reset, and the cache it would invalidate
  // (QueryLogs' cached comment) is re-cleared by the next `set`/`setKey`. We
  // match that exactly rather than firing here.
  clear(): void {
    store().clear();
  },
};
