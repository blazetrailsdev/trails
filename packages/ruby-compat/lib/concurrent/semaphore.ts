import { constSet } from "../include.js";
import { Thread } from "../thread.js";
import { Concurrent } from "./map.js";

/**
 * concurrent-ruby's `Concurrent::Semaphore` (not vendored): on MRI,
 * `MutexSemaphore` (`concurrent/atomic/mutex_semaphore.rb`), a permit count
 * behind a condition variable (`vendor/ruby/v3.3.11/thread_sync.c:1581`
 * `rb_condvar_wait`). Ruby blocks the acquiring thread; JS has no synchronous
 * await, so `acquire` answers a promise of what Ruby's `acquire` returns.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Semaphore {
  private _free: number;
  private readonly _waiters: { permits: number; wake: (value: null) => void }[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor(count: number) {
    this._free = count;
  }

  /** @noRailsEquivalent PERMANENT */
  acquire(permits: number = 1): Promise<null> {
    if (this._waiters.length === 0 && this._free >= permits) {
      this._free -= permits;
      return Promise.resolve(null);
    }
    return Thread.blockingRegion<null>((wake) => {
      const waiter = { permits, wake };
      this._waiters.push(waiter);
      return () => {
        const i = this._waiters.indexOf(waiter);
        if (i !== -1) this._waiters.splice(i, 1);
      };
    });
  }

  /** @noRailsEquivalent PERMANENT */
  release(permits: number = 1): null {
    this._free += permits;
    while (this._waiters.length > 0 && this._free >= this._waiters[0].permits) {
      const waiter = this._waiters.shift()!;
      this._free -= waiter.permits;
      waiter.wake(null);
    }
    return null;
  }

  /** @noRailsEquivalent PERMANENT */
  availablePermits(): number {
    return this._free;
  }
}

constSet(Concurrent, "Semaphore", Semaphore);
