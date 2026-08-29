/**
 * ExecutionContext — per-request key/value store.
 * Mirrors ActiveSupport::ExecutionContext.
 */
import { IsolatedExecutionState } from "./isolated-execution-state.js";

const ACTIVE_SUPPORT_EXECUTION_CONTEXT = "active_support_execution_context";

/** Mirrors ActiveSupport::ExecutionContext.store (execution_context.rb:47-49). @internal */
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
  const s = store();
  for (const key of Object.keys(attrs)) {
    saved.set(key, { hadKey: s.has(key), value: s.get(key) });
    s.set(key, attrs[key]);
  }
  return saved;
}

function restore(saved: Map<string, { hadKey: boolean; value: unknown }>): void {
  const s = store();
  for (const [key, entry] of saved) {
    if (entry.hadKey) {
      s.set(key, entry.value);
    } else {
      s.delete(key);
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

  set<T = void>(options: Record<string, unknown>, fn?: () => T): T | void {
    if (!fn) {
      for (const key of Object.keys(options)) {
        store().set(key, options[key]);
      }
      runAfterChange();
      return;
    }

    const saved = saveAndApply(options);
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
