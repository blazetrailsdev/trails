import { ArgumentError } from "../argument-error.js";
import { rbModConstSet } from "../include.js";
import { Concurrent } from "./map.js";

/**
 * concurrent-ruby's `Concurrent::CyclicBarrier` (not vendored): on MRI,
 * `concurrent/atomic/cyclic_barrier.rb`, a count behind a condition variable
 * (`vendor/ruby/v3.3.11/thread_sync.c:1581` `rb_condvar_wait`). Ruby blocks the
 * waiting thread; JS has no synchronous await, so `wait` answers a promise of
 * what Ruby's `wait` returns.
 *
 * @noRailsEquivalent PERMANENT
 */
export class CyclicBarrier {
  private readonly parties: number;
  private waiters: Array<() => void> = [];

  /** @noRailsEquivalent PERMANENT */
  constructor(parties: number) {
    if (!(Number.isInteger(parties) && parties >= 1)) {
      throw new ArgumentError("count must be in integer greater than or equal one");
    }
    this.parties = parties;
  }

  /** @noRailsEquivalent PERMANENT */
  wait(timeout: number | null = null): Promise<boolean> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wake = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.waiters.push(wake);
      if (timeout != null) {
        timer = setTimeout(() => {
          const index = this.waiters.indexOf(wake);
          if (index >= 0) this.waiters.splice(index, 1);
          resolve(false);
        }, timeout * 1000);
      }
      if (this.waiters.length === this.parties) {
        const waiters = this.waiters;
        this.waiters = [];
        for (const wake of waiters) wake();
      }
    });
  }
}

rbModConstSet(Concurrent, "CyclicBarrier", CyclicBarrier);
