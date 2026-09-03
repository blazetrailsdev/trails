import { IsolatedExecutionState } from "./isolated-execution-state.js";

/** @noRailsEquivalent PERMANENT */
export class ThreadLocalVar<T> {
  private readonly _default: T;

  constructor(defaultValue: T) {
    this._default = defaultValue;
  }

  get value(): T {
    return IsolatedExecutionState.has(this)
      ? (IsolatedExecutionState.get<T>(this) as T)
      : this._default;
  }

  set value(value: T) {
    IsolatedExecutionState.set(this, value);
  }

  bind<R>(value: T, block: () => R): R {
    return IsolatedExecutionState.scope(this, value, block);
  }
}
