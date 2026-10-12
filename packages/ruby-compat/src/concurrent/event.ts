import { rbModConstSet } from "../include.js";
import { CountDownLatch } from "./count-down-latch.js";
import { Concurrent } from "./map.js";

/**
 * concurrent-ruby's `Concurrent::Event` (not vendored,
 * `concurrent/atomic/event.rb`): a flag behind a condition variable
 * (`vendor/ruby/v3.3.11/thread_sync.c:1581` `rb_condvar_wait`). `wait` answers
 * a promise of what Ruby's blocking `wait` returns.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Event {
  private readonly latch = new CountDownLatch();
  private flag = false;

  /** @noRailsEquivalent PERMANENT */
  isSet(): boolean {
    return this.flag;
  }

  /** @noRailsEquivalent PERMANENT */
  set(): boolean {
    this.flag = true;
    return this.latch.countDown();
  }

  /** @noRailsEquivalent PERMANENT */
  wait(timeout: number | null = null): Promise<boolean> {
    return this.latch.wait(timeout);
  }
}

rbModConstSet(Concurrent, "Event", Event);
