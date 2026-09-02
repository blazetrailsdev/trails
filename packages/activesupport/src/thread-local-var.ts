/**
 * Port of `Concurrent::ThreadLocalVar` (concurrent-ruby), which Rails uses for
 * `Deprecation`'s per-thread state — `@explicitly_allowed_warnings` and
 * `@silence_counter` (`activesupport/lib/active_support/deprecation.rb:77-78`).
 *
 * Ruby's storage is thread-local; the TypeScript equivalent is
 * {@link IsolatedExecutionState}, which carries state through one logical
 * task's `await` chain without bleeding into concurrent tasks — the same
 * isolation `Thread.current` gives Ruby.
 *
 * @noRailsEquivalent PERMANENT — concurrent-ruby is not vendored, so this class
 * has no counterpart in the compared Rails population; it exists so the bodies
 * that use it can spell `value` and `bind` the way their Ruby counterparts do.
 */
import { IsolatedExecutionState } from "./isolated-execution-state.js";

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

  /**
   * Set `value` for the duration of `block`, restoring the previous value
   * afterwards — `ThreadLocalVar#bind`.
   */
  bind<R>(value: T, block: () => R): R {
    return IsolatedExecutionState.scope(this, value, block);
  }
}
