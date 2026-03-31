/**
 * ExecutionContext — per-request key/value store.
 * Mirrors ActiveSupport::ExecutionContext.
 *
 * Note: This uses a process-global Map. In production with concurrent async
 * requests, consider integrating with AsyncLocalStorage for isolation.
 * Rails itself resets ExecutionContext via executor hooks per request.
 */
const _store = new Map<string, unknown>();

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
  set<T = void>(attrs: Record<string, unknown>, fn?: () => T): T | void {
    if (!fn) {
      for (const key of Object.keys(attrs)) {
        _store.set(key, attrs[key]);
      }
      return;
    }

    const saved = saveAndApply(attrs);
    let result: T;
    try {
      result = fn();
    } catch (e) {
      restore(saved);
      throw e;
    }

    if (result && typeof (result as unknown as Promise<unknown>).then === "function") {
      return (result as unknown as Promise<unknown>).then(
        (val) => {
          restore(saved);
          return val;
        },
        (e) => {
          restore(saved);
          throw e;
        },
      ) as unknown as T;
    }

    restore(saved);
    return result;
  },

  get(key: string): unknown {
    return _store.get(key);
  },

  setKey(key: string, value: unknown): void {
    _store.set(key, value);
  },

  toH(): Record<string, unknown> {
    return Object.fromEntries(_store);
  },

  clear(): void {
    _store.clear();
  },
};
