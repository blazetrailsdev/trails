import { ArgumentError, NotImplementedError, Thread } from "@blazetrails/ruby-compat";

type IsolatedKey = string | symbol | object;

type Store = Map<IsolatedKey, unknown>;

type IsolationLevel = "thread" | "fiber";

declare module "@blazetrails/ruby-compat" {
  interface Thread {
    activeSupportExecutionState?: Store;
  }
}

let _isolationLevel: IsolationLevel | null = null;
let _scope: typeof Thread;

/** @internal */
function state(): Store {
  const context = IsolatedExecutionState.context();
  return (context.activeSupportExecutionState ??= new Map());
}

export const IsolatedExecutionState = {
  get isolationLevel(): IsolationLevel | null {
    return _isolationLevel;
  },
  get scope(): typeof Thread {
    return _scope;
  },
  set isolationLevel(level: IsolationLevel) {
    if (level === _isolationLevel) return;

    if (!["thread", "fiber"].includes(level)) {
      throw new ArgumentError(
        `isolation_level must be \`:thread\` or \`:fiber\`, got: \`:${String(level)}\``,
      );
    }

    if (level === "fiber")
      // @nie disposition=TODO
      throw new NotImplementedError("Fiber");

    if (_isolationLevel != null) IsolatedExecutionState.clear();

    switch (level) {
      case "thread":
        _scope = Thread;
        break;
      case "fiber":
        // @nie disposition=TODO
        throw new NotImplementedError("Fiber");
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
  has(key: IsolatedKey): boolean {
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
  context(): Thread {
    return IsolatedExecutionState.scope.current();
  },
  shareWith(other: Thread): void {
    const otherState = other.activeSupportExecutionState;
    IsolatedExecutionState.context().activeSupportExecutionState = otherState
      ? new Map(otherState)
      : undefined;
  },
};

IsolatedExecutionState.isolationLevel = "thread";
