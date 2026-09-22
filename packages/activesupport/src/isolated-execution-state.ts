import { ArgumentError, Fiber, Thread } from "@blazetrails/ruby-compat";

type IsolatedKey = string | symbol | object;

type Store = Map<IsolatedKey, unknown>;

type IsolationLevel = "thread" | "fiber";

declare module "@blazetrails/ruby-compat" {
  interface Thread {
    activeSupportExecutionState(): Store | null;
    setActiveSupportExecutionState(value: Store | null): Store | null;
  }
  interface Fiber {
    activeSupportExecutionState(): Store | null;
    setActiveSupportExecutionState(value: Store | null): Store | null;
  }
}

const _activeSupportExecutionState = new WeakMap<Thread | Fiber, Store | null>();

export function activeSupportExecutionState(this: Thread | Fiber): Store | null {
  return _activeSupportExecutionState.get(this) ?? null;
}

export function setActiveSupportExecutionState(
  this: Thread | Fiber,
  value: Store | null,
): Store | null {
  _activeSupportExecutionState.set(this, value);
  return value;
}

Thread.prototype.activeSupportExecutionState = activeSupportExecutionState;
Thread.prototype.setActiveSupportExecutionState = setActiveSupportExecutionState;
Fiber.prototype.activeSupportExecutionState = activeSupportExecutionState;
Fiber.prototype.setActiveSupportExecutionState = setActiveSupportExecutionState;

let _isolationLevel: IsolationLevel | null = null;
let _scope: typeof Thread | typeof Fiber;

/** @internal */
function state(): Store {
  const context = IsolatedExecutionState.context();
  return (
    context.activeSupportExecutionState() ?? context.setActiveSupportExecutionState(new Map())!
  );
}

export const IsolatedExecutionState = {
  get isolationLevel(): IsolationLevel | null {
    return _isolationLevel;
  },
  get scope(): typeof Thread | typeof Fiber {
    return _scope;
  },
  set isolationLevel(level: IsolationLevel) {
    if (level === _isolationLevel) return;

    if (!["thread", "fiber"].includes(level)) {
      throw new ArgumentError(
        `isolation_level must be \`:thread\` or \`:fiber\`, got: \`:${String(level)}\``,
      );
    }

    if (_isolationLevel != null) IsolatedExecutionState.clear();

    switch (level) {
      case "thread":
        _scope = Thread;
        break;
      case "fiber":
        _scope = Fiber;
        break;
    }

    _isolationLevel = level;
  },
  uniqueId(): object {
    return (
      IsolatedExecutionState.get<object>("__id__") ??
      IsolatedExecutionState.set("__id__", new Object())
    );
  },
  get<T = unknown>(key: IsolatedKey): T | undefined {
    return state().get(key) as T | undefined;
  },
  set<T>(key: IsolatedKey, value: T): T {
    state().set(key, value);
    return value;
  },
  isKey(key: IsolatedKey): boolean {
    return state().has(key);
  },
  delete<T = unknown>(key: IsolatedKey): T | undefined {
    const s = state();
    const value = s.get(key) as T | undefined;
    s.delete(key);
    return value;
  },
  clear(): void {
    state().clear();
  },
  context(): Thread | Fiber {
    return IsolatedExecutionState.scope.current();
  },
  shareWith(other: Thread | Fiber): void {
    const otherState = other.activeSupportExecutionState();
    IsolatedExecutionState.context().setActiveSupportExecutionState(
      otherState ? new Map(otherState) : null,
    );
  },
};

IsolatedExecutionState.isolationLevel = "thread";
