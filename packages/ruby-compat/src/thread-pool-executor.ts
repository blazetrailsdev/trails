import { ArgumentError } from "./argument-error.js";
import { Thread } from "./thread.js";

/**
 * concurrent-ruby's `Concurrent::ThreadPoolExecutor`, the pool Rails builds for
 * async queries (`activerecord/lib/active_record.rb:286-294`,
 * `connection_adapters/abstract/connection_pool.rb:716-726`). A task beyond
 * `maxThreads` waits in a queue of at most `maxQueue` (0 is unbounded), and one
 * beyond that runs on the caller (`fallback_policy: :caller_runs`). Each worker
 * is a `Thread.new` (`vendor/ruby/v3.3.11/thread.c:897` `thread_s_new`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class ThreadPoolExecutor {
  private readonly minThreads: number;
  private readonly maxThreads: number;
  private readonly maxQueue: number;
  private readonly fallbackPolicy: "caller_runs";
  private _running = 0;
  private readonly _queue: (() => unknown)[] = [];
  private _stopped = false;
  private readonly _stoppedEvent: (() => void)[] = [];

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
    const block = argsAndTask[argsAndTask.length - 1] as ((...args: A) => unknown) | undefined;
    if (typeof block !== "function") throw new ArgumentError("no block given");
    const task = () => block(...args);
    if (!this.isRunning()) {
      task();
    } else if (this._running < this.maxThreads) {
      this._running += 1;
      queueMicrotask(() => this._runWorker(task));
    } else if (this.maxQueue === 0 || this._queue.length < this.maxQueue) {
      this._queue.push(task);
    } else {
      task();
    }
  }

  private isRunning(): boolean {
    return !this._stopped;
  }

  /** @noRailsEquivalent PERMANENT */
  shutdown(): true {
    if (this.isRunning()) {
      this._stopped = true;
      if (this._running === 0) this._setStoppedEvent();
    }
    return true;
  }

  /** @noRailsEquivalent PERMANENT */
  waitForTermination(timeout: number | null = null): Promise<boolean> {
    if (this._stopped && this._running === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const set = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this._stoppedEvent.push(set);
      if (timeout != null) {
        timer = setTimeout(() => {
          this._stoppedEvent.splice(this._stoppedEvent.indexOf(set), 1);
          resolve(false);
        }, timeout * 1000);
      }
    });
  }

  private _setStoppedEvent(): void {
    for (const set of this._stoppedEvent.splice(0)) set();
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
      if (this._stopped && this._running === 0) this._setStoppedEvent();
    });
  }
}
