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
  /** @noRailsEquivalent PERMANENT */
  readonly minLength: number;
  /** @noRailsEquivalent PERMANENT */
  readonly maxLength: number;
  /** @noRailsEquivalent PERMANENT */
  readonly maxQueue: number;
  /** @noRailsEquivalent PERMANENT */
  readonly fallbackPolicy: "caller_runs";
  /** @noRailsEquivalent PERMANENT */
  scheduledTaskCount = 0;
  /** @noRailsEquivalent PERMANENT */
  completedTaskCount = 0;
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
    this.minLength = minThreads;
    this.maxLength = maxThreads;
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
    } else if (this._running < this.maxLength) {
      this._running += 1;
      this.scheduledTaskCount += 1;
      queueMicrotask(() => this._runWorker(task));
    } else if (this.maxQueue === 0 || this._queue.length < this.maxQueue) {
      this._queue.push(task);
      this.scheduledTaskCount += 1;
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
      try {
        await task();
      } catch {
        return;
      }
    });
    void Promise.resolve(thread.value()).then(() => {
      this.completedTaskCount += 1;
      const next = this._queue.shift();
      if (next) this._runWorker(next);
      else this._running -= 1;
      if (this._stopped && this._running === 0) this._setStoppedEvent();
    });
  }
}

/**
 * concurrent-ruby's `Concurrent::CachedThreadPool`, the pool
 * `ActionController::Live.live_thread_pool_executor` builds
 * (`actionpack/lib/action_controller/metal/live.rb:391`): a
 * `ThreadPoolExecutor` with no minimum, no bound on its threads and no queue,
 * so its `fallback_policy` (concurrent-ruby's default is `:abort`) is never
 * reached. `name:` is the option concurrent-ruby stores as the pool's `@name`.
 * As concurrent-ruby's worker does, a task's exception is rescued on the worker
 * thread, which therefore does not die of it.
 * Each worker is a `Thread.new` (`vendor/ruby/v3.3.11/thread.c:897` `thread_s_new`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class CachedThreadPool extends ThreadPoolExecutor {
  /** @noRailsEquivalent PERMANENT */
  readonly name: string | null;

  /** @noRailsEquivalent PERMANENT */
  constructor({ name = null }: { name?: string | null } = {}) {
    super({ minThreads: 0, maxThreads: 2147483647, maxQueue: 0, fallbackPolicy: "caller_runs" });
    this.name = name;
  }
}
