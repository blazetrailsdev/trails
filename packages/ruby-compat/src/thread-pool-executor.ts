import { Thread } from "./thread.js";

/**
 * concurrent-ruby's `Concurrent::ThreadPoolExecutor`, the pool Rails builds for
 * async queries (`activerecord/lib/active_record.rb:286-294`,
 * `connection_adapters/abstract/connection_pool.rb:716-726`). A task beyond
 * `maxThreads` waits in a queue of at most `maxQueue` (0 is unbounded), and one
 * beyond that runs on the caller (`fallback_policy: :caller_runs`). Each worker
 * is a `Thread.new` (`vendor/ruby/thread.c:897` `thread_s_new`).
 *
 * @noRailsEquivalent PERMANENT — concurrent-ruby `Concurrent::ThreadPoolExecutor`
 * (`vendor/ruby/thread.c:897`).
 */
export class ThreadPoolExecutor {
  private readonly minThreads: number;
  private readonly maxThreads: number;
  private readonly maxQueue: number;
  private readonly fallbackPolicy: "caller_runs";
  private _running = 0;
  private readonly _queue: (() => unknown)[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor({
    minThreads,
    maxThreads,
    maxQueue,
    fallbackPolicy,
  }: {
    minThreads: number;
    maxThreads: number;
    maxQueue: number;
    fallbackPolicy: "caller_runs";
  }) {
    this.minThreads = minThreads;
    this.maxThreads = maxThreads;
    this.maxQueue = maxQueue;
    this.fallbackPolicy = fallbackPolicy;
  }

  /** @noRailsEquivalent PERMANENT */
  post(task: () => unknown): void {
    if (this._running < this.maxThreads) {
      this._running += 1;
      queueMicrotask(() => this._runWorker(task));
    } else if (this.maxQueue === 0 || this._queue.length < this.maxQueue) {
      this._queue.push(task);
    } else {
      task();
    }
  }

  private _runWorker(task: () => unknown): void {
    const thread = new Thread(async () => {
      await task();
    });
    const settled = Promise.resolve()
      .then(() => thread.value())
      .catch(() => undefined);
    void settled.then(() => {
      const next = this._queue.shift();
      if (next) this._runWorker(next);
      else this._running -= 1;
    });
  }
}
