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
    const oldValue = this.value;
    this.value = value;
    const restore = () => {
      this.value = oldValue;
    };
    let result: R;
    try {
      result = block();
    } catch (error) {
      restore();
      throw error;
    }
    if (result != null && typeof (result as unknown as PromiseLike<unknown>).then === "function") {
      return Promise.resolve(result as unknown).finally(restore) as R;
    }
    restore();
    return result;
  }
}
