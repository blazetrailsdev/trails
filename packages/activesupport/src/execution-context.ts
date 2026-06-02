/**
 * ExecutionContext — per-request key/value store.
 * Mirrors ActiveSupport::ExecutionContext.
 *
 * Note: This uses a process-global Map. In production with concurrent async
 * requests, consider integrating with AsyncLocalStorage for isolation.
 * Rails itself resets ExecutionContext via executor hooks per request.
 */
const _store = new Map<string, unknown>();

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
    saved.set(key, { hadKey: _store.has(key), value: _store.get(key) });
    _store.set(key, attrs[key]);
  }
  return saved;
}

function restore(saved: Map<string, { hadKey: boolean; value: unknown }>): void {
  for (const [key, entry] of saved) {
    if (entry.hadKey) {
      _store.set(key, entry.value);
    } else {
      _store.delete(key);
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
        _store.set(key, attrs[key]);
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
    return _store.get(key);
  },

  setKey(key: string, value: unknown): void {
    _store.set(key, value);
    runAfterChange();
  },

  toH(): Record<string, unknown> {
    return Object.fromEntries(_store);
  },

  // Rails' `clear` does NOT fire after_change (execution_context.rb:43-45) —
  // it is the executor's per-request reset, and the cache it would invalidate
  // (QueryLogs' cached comment) is re-cleared by the next `set`/`setKey`. We
  // match that exactly rather than firing here.
  clear(): void {
    _store.clear();
  },
};
