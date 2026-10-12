import { rbModConstSet } from "../include.js";
import { Concurrent } from "./map.js";

/**
 * concurrent-ruby's `Concurrent::CountDownLatch` (not vendored): on MRI,
 * `MutexCountDownLatch` (`concurrent/atomic/mutex_count_down_latch.rb`), a
 * count behind a condition variable (`vendor/ruby/v3.3.11/thread_sync.c:1581`
 * `rb_condvar_wait`). Ruby blocks the waiting thread; JS has no synchronous
 * await, so `wait` answers a promise of what Ruby's `wait` returns.
 *
 * @noRailsEquivalent PERMANENT
 */
export class CountDownLatch {
  private count: number;
  private readonly waiters = new Set<() => void>();

  /** @noRailsEquivalent PERMANENT */
  constructor(count: number = 1) {
    this.count = count;
  }

  /** @noRailsEquivalent PERMANENT */
  wait(timeout: number | null = null): Promise<boolean> {
    if (this.count === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wake = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.waiters.add(wake);
      if (timeout != null) {
        timer = setTimeout(() => {
          this.waiters.delete(wake);
          resolve(false);
        }, timeout * 1000);
      }
    });
  }

  /** @noRailsEquivalent PERMANENT */
  countDown(): void {
    if (this.count > 0) this.count -= 1;
    if (this.count === 0) {
      for (const wake of this.waiters) wake();
      this.waiters.clear();
    }
  }
}

rbModConstSet(Concurrent, "CountDownLatch", CountDownLatch);
