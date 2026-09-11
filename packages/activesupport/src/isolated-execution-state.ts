import { getAsyncContext, Thread } from "@blazetrails/ruby-compat";
import type { AsyncContext, AsyncContextAdapter } from "@blazetrails/ruby-compat";

type IsolatedKey = string | symbol | object;

type Store = Map<IsolatedKey, unknown>;

type Scoped = { thread: Thread; state: Store };

let _ctx: AsyncContext<Scoped> | null = null;
let _adapter: AsyncContextAdapter | null = null;
const _states = new WeakMap<Thread, Store>();

function ctx(): AsyncContext<Scoped> {
  const adapter = getAsyncContext();
  if (!_ctx || _adapter !== adapter) {
    _adapter = adapter;
    _ctx = adapter.create<Scoped>();
  }
  return _ctx;
}

function store(): Store {
  const thread = Thread.current();
  const scoped = ctx().getStore();
  if (scoped && scoped.thread === thread) return scoped.state;
  let state = _states.get(thread);
  if (!state) {
    state = new Map();
    _states.set(thread, state);
  }
  return state;
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
  /** @missingRailsCall scope — PERMANENT */
  context(): { readonly id: number } {
    return Thread.current();
  },
  shareWith(other: Thread): void {
    const scoped = ctx().getStore();
    const state = scoped && scoped.thread === other ? scoped.state : _states.get(other);
    _states.set(Thread.current(), new Map(state));
  },
  run<R>(fn: () => R): R {
    return new Thread(fn).value();
  },
  scope<T, R>(key: IsolatedKey, value: T, fn: () => R): R {
    const forked = new Map(store());
    forked.set(key, value);
    return ctx().run({ thread: Thread.current(), state: forked }, fn);
  },
};
