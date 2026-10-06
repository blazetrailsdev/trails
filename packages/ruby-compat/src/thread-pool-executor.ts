import { Thread } from "./thread.js";

/**
 * concurrent-ruby's `Concurrent::ThreadPoolExecutor`, the pool Rails builds for
 * async queries (`activerecord/lib/active_record.rb:286-294`,
 * `connection_adapters/abstract/connection_pool.rb:716-726`). A task beyond
 * `maxThreads` waits in a queue of at most `maxQueue` (0 is unbounded), and one
 * beyond that runs on the caller (`fallback_policy: :caller_runs`). Each worker
 * is a `Thread.new` (`vendor/ruby/v3.3.11/thread.c:897` `thread_s_new`).
 *
 * @noRailsEquivalent PERMANENT — concurrent-ruby `Concurrent::ThreadPoolExecutor`
 * (`vendor/ruby/v3.3.11/thread.c:897`).
 */
export class ThreadPoolExecutor {
  private readonly minThreads: number;
  private readonly maxThreads: number;
  private readonly maxQueue: number;
  private readonly fallbackPolicy: "caller_runs";
  private _running = 0;
  private readonly _queue: (() => unknown)[] = [];
  private readonly _terminated: (() => void)[] = [];
  /** @noRailsEquivalent PERMANENT */
  readonly scheduledTasks = new Set<{ cancel(): boolean }>();

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
  post<A extends unknown[]>(...argsAndTask: [...args: A, task: (...args: A) => unknown]): void {
    const args = argsAndTask.slice(0, -1) as A;
    const block = argsAndTask[argsAndTask.length - 1] as (...args: A) => unknown;
    const task = () => block(...args);
    if (this._running < this.maxThreads) {
      this._running += 1;
      queueMicrotask(() => this._runWorker(task));
    } else if (this.maxQueue === 0 || this._queue.length < this.maxQueue) {
      this._queue.push(task);
    } else {
      task();
    }
  }

  /** @noRailsEquivalent PERMANENT */
  shutdown(): void {
    for (const scheduledTask of [...this.scheduledTasks]) scheduledTask.cancel();
  }

  /** @noRailsEquivalent PERMANENT */
  waitForTermination(): Promise<boolean> {
    if (this._running === 0) return Promise.resolve(true);
    return new Promise((resolve) => this._terminated.push(() => resolve(true)));
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
      if (this._running === 0) for (const terminated of this._terminated.splice(0)) terminated();
    });
  }
}
