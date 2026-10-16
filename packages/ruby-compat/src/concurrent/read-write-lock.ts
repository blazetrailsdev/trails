import { rbModConstSet } from "../include.js";
import { Concurrent } from "./map.js";

/**
 * concurrent-ruby's `Concurrent::ReadWriteLock` (not vendored,
 * `concurrent/atomic/read_write_lock.rb`): any number of readers or one
 * writer, and a waiting writer holds off new readers, over a mutex and
 * condition variable (`vendor/ruby/v3.3.11/thread_sync.c:1581`
 * `rb_condvar_wait`). A block that answers a promise holds its lock until the
 * promise settles, across every `await` inside it.
 *
 * @noRailsEquivalent PERMANENT
 */
export class ReadWriteLock {
  private readers = 0;
  private writer = false;
  private waitingWriters = 0;
  private queue: Array<() => void> = [];

  /** @noRailsEquivalent PERMANENT */
  withReadLock<T>(block: () => T): T | Promise<Awaited<T>> {
    if (this.writer || this.waitingWriters > 0) {
      return new Promise<void>((resolve) => this.queue.push(resolve)).then(() =>
        this.withReadLock(block),
      ) as Promise<Awaited<T>>;
    }
    this.readers++;
    return this.hold(block, () => this.readers--);
  }

  /** @noRailsEquivalent PERMANENT */
  async withWriteLock<T>(block: () => T): Promise<Awaited<T>> {
    this.waitingWriters++;
    while (this.writer || this.readers > 0) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.waitingWriters--;
    this.writer = true;
    return await this.hold(block, () => (this.writer = false));
  }

  private hold<T>(block: () => T, release: () => void): T | Promise<Awaited<T>> {
    let result: T;
    try {
      result = block();
    } catch (error) {
      this.release(release);
      throw error;
    }
    if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function") {
      return Promise.resolve(result).finally(() => this.release(release)) as Promise<Awaited<T>>;
    }
    this.release(release);
    return result;
  }

  private release(release: () => void): void {
    release();
    const waiting = this.queue;
    this.queue = [];
    for (const resolve of waiting) resolve();
  }
}

rbModConstSet(Concurrent, "ReadWriteLock", ReadWriteLock);
