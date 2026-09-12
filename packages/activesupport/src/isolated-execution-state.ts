import { Thread } from "@blazetrails/ruby-compat";

type IsolatedKey = string | symbol | object;

type Store = Map<IsolatedKey, unknown>;

const _states = new WeakMap<Thread, Store>();

function store(): Store {
  const context = IsolatedExecutionState.context();
  let state = _states.get(context);
  if (!state) {
    state = new Map();
    _states.set(context, state);
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
  context(): Thread {
    return Thread.current();
  },
  shareWith(other: Thread): void {
    _states.set(IsolatedExecutionState.context(), new Map(_states.get(other)));
  },
  run<R>(fn: () => R): R {
    return new Thread(fn).value();
  },
};
