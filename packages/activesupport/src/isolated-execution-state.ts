/**
 * Per-execution-context key/value store, mirroring Rails'
 * `ActiveSupport::IsolatedExecutionState`. Rails uses Thread/Fiber-local
 * storage; the TS equivalent is AsyncLocalStorage (via
 * {@link getAsyncContext}), which carries state through the `await` chain
 * of a single logical task without bleeding into concurrent tasks.
 *
 * When no scope has been opened (e.g. at module top-level), reads/writes
 * fall back to a process-global Map — matches the practical behavior of
 * Rails' main thread before any request wrapper runs.
 *
 * Mirrors: ActiveSupport::IsolatedExecutionState
 */

import { getAsyncContext } from "./async-context-adapter.js";
import type { AsyncContext, AsyncContextAdapter } from "./async-context-adapter.js";

type Store = Map<string | symbol, unknown>;

let _ctx: AsyncContext<Store> | null = null;
let _adapter: AsyncContextAdapter | null = null;
const _fallback: Store = new Map();

function ctx(): AsyncContext<Store> {
  const adapter = getAsyncContext();
  if (!_ctx || _adapter !== adapter) {
    _adapter = adapter;
    _ctx = adapter.create<Store>();
  }
  return _ctx;
}

function store(): Store {
  return ctx().getStore() ?? _fallback;
}

export const IsolatedExecutionState = {
  get<T = unknown>(key: string | symbol): T | undefined {
    return store().get(key) as T | undefined;
  },
  set<T>(key: string | symbol, value: T): T {
    store().set(key, value);
    return value;
  },
  has(key: string | symbol): boolean {
    return store().has(key);
  },
  delete(key: string | symbol): boolean {
    return store().delete(key);
  },
  clear(): void {
    store().clear();
  },
  /**
   * Read `key`; if absent, call `init()`, store the result, and return it.
   * Mirrors Rails' `IsolatedExecutionState[key] ||= ...` idiom used for
   * per-context singletons (ExplainRegistry, ScopeRegistry, etc.).
   */
  fetch<T>(key: string | symbol, init: () => T): T {
    const s = store();
    // `has`-then-`get` (rather than checking `get() !== undefined`) so a
    // caller that intentionally cached `undefined` doesn't re-run `init()`.
    if (s.has(key)) return s.get(key) as T;
    const value = init();
    s.set(key, value);
    return value;
  },
  /**
   * Run `fn` inside a fresh, isolated state Map. State written inside is
   * invisible to outer/parallel contexts. Used for per-request isolation.
   */
  run<R>(fn: () => R): R {
    return ctx().run(new Map(), fn);
  },
  /**
   * Run `fn` inside a forked state Map where `key` is set to `value`.
   * The outer context's value for `key` is restored when `fn` returns.
   * Other keys are inherited via snapshot (the forked Map is a shallow copy).
   */
  scope<T, R>(key: string | symbol, value: T, fn: () => R): R {
    const forked = new Map(store());
    forked.set(key, value);
    return ctx().run(forked, fn);
  },
};
