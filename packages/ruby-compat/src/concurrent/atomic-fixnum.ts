import { rbModConstSet } from "../include.js";
import { Concurrent } from "./map.js";

/**
 * concurrent-ruby's `Concurrent::AtomicFixnum` (not vendored,
 * `concurrent/atomic/mutex_atomic_fixnum.rb:9-75`, concurrent-ruby 1.3.6): an
 * Integer behind a mutex (`vendor/ruby/v3.3.11/thread_sync.c:697`
 * `rb_mutex_synchronize_m`). A JS turn is never preempted, so the plain field
 * is the whole of it.
 *
 * @noRailsEquivalent PERMANENT
 */
export class AtomicFixnum {
  private _value: number;

  /** @noRailsEquivalent PERMANENT */
  constructor(initial = 0) {
    this._value = initial;
  }

  /** @noRailsEquivalent PERMANENT */
  get value(): number {
    return this._value;
  }

  /** @noRailsEquivalent PERMANENT */
  increment(delta = 1): number {
    return (this._value += delta);
  }

  /** @noRailsEquivalent PERMANENT */
  decrement(delta = 1): number {
    return (this._value -= delta);
  }
}

rbModConstSet(Concurrent, "AtomicFixnum", AtomicFixnum);
