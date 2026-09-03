import { getAsyncContext } from "./async-context-adapter.js";
import type { AsyncContext, AsyncContextAdapter } from "./async-context-adapter.js";

type IsolatedKey = string | symbol | object;

type Store = Map<IsolatedKey, unknown>;

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
  get<T = unknown>(key: IsolatedKey): T | undefined {
    return store().get(key) as T | undefined;
  },
  set<T>(key: IsolatedKey, value: T): T {
    store().set(key, value);
    return value;
  },
  has(key: IsolatedKey): boolean {
    return store().has(key);
  },
  delete<T = unknown>(key: IsolatedKey): T | undefined {
    const s = store();
    const value = s.get(key) as T | undefined;
    s.delete(key);
    return value;
  },
  clear(): void {
    store().clear();
  },
  fetch<T>(key: IsolatedKey, init: () => T): T {
    const s = store();
    if (s.has(key)) return s.get(key) as T;
    const value = init();
    s.set(key, value);
    return value;
  },
  run<R>(fn: () => R): R {
    return ctx().run(new Map(), fn);
  },
  scope<T, R>(key: IsolatedKey, value: T, fn: () => R): R {
    const forked = new Map(store());
    forked.set(key, value);
    return ctx().run(forked, fn);
  },
};
