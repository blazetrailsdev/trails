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
    this.parties = parties;
  }

  /** @noRailsEquivalent PERMANENT */
  wait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.waiters.push(() => resolve(true));
      if (this.waiters.length === this.parties) {
        const waiters = this.waiters;
        this.waiters = [];
        for (const wake of waiters) wake();
      }
    });
  }
}

rbModConstSet(Concurrent, "CyclicBarrier", CyclicBarrier);
