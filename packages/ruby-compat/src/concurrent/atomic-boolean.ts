import { rbModConstSet } from "../include.js";
import { Concurrent } from "./map.js";

/**
 * concurrent-ruby's `Concurrent::AtomicBoolean` (not vendored,
 * `concurrent/atomic/mutex_atomic_boolean.rb`): a boolean behind a mutex
 * (`vendor/ruby/v3.3.11/thread_sync.c:697` `rb_mutex_synchronize_m`). A JS
 * turn is never preempted, so the plain field is the whole of it.
 *
 * @noRailsEquivalent PERMANENT
 */
export class AtomicBoolean {
  private _value: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(initial = false) {
    this._value = !!initial;
  }

  /** @noRailsEquivalent PERMANENT */
  get value(): boolean {
    return this._value;
  }

  /** @noRailsEquivalent PERMANENT */
  isTrue(): boolean {
    return this._value;
  }

  /** @noRailsEquivalent PERMANENT */
  isFalse(): boolean {
    return !this._value;
  }

  /** @noRailsEquivalent PERMANENT */
  makeTrue(): boolean {
    const old = this._value;
    this._value = true;
    return !old;
  }

  /** @noRailsEquivalent PERMANENT */
  makeFalse(): boolean {
    const old = this._value;
    this._value = false;
    return old;
  }
}

rbModConstSet(Concurrent, "AtomicBoolean", AtomicBoolean);
