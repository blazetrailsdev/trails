import { ArgumentError } from "./argument-error.js";
import { Concurrent } from "./concurrent/map.js";
import { rbModConstSet } from "./include.js";
import { StandardError } from "./standard-error.js";
import { Thread } from "./thread.js";

type FallbackPolicy = "abort" | "discard" | "caller_runs";

/**
 * concurrent-ruby's `Concurrent::RejectedExecutionError` (not vendored,
 * `concurrent/errors.rb:42`), what a `:abort` pool raises for a task it will
 * not take (`vendor/ruby/v3.3.11/error.c:3264` `rb_eStandardError`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class RejectedExecutionError extends StandardError {}

/**
 * concurrent-ruby's `Concurrent::ThreadPoolExecutor`, the pool Rails builds for
 * async queries (`activerecord/lib/active_record.rb:286-294`,
 * `connection_adapters/abstract/connection_pool.rb:716-726`). A task beyond
 * `maxThreads` waits in a queue of at most `maxQueue` (0 is unbounded), and one
 * beyond that, or one posted after {@link shutdown}, takes the `fallback_policy`
 * (`:abort` by default, `executor/abstract_executor_service.rb:91-104`
 * `fallback_action`). Each worker
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
  readonly fallbackPolicy: FallbackPolicy;
  /** @noRailsEquivalent PERMANENT */
  readonly name: string | null;
  /** @noRailsEquivalent PERMANENT */
  readonly idletime: number;
  /** @noRailsEquivalent PERMANENT */
  readonly autoTerminate: boolean;
  /** @noRailsEquivalent PERMANENT */
  scheduledTaskCount = 0;
  /** @noRailsEquivalent PERMANENT */
  completedTaskCount = 0;
  private _running = 0;
  private readonly _queue: (() => unknown)[] = [];
  private readonly _ready: ((task: (() => unknown) | undefined) => void)[] = [];
  private _stopped = false;
  private readonly _stoppedEvent: (() => void)[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor({
    name = null,
    minThreads,
    maxThreads,
    maxQueue,
    fallbackPolicy = "abort",
    idletime = 60,
    autoTerminate = true,
  }: {
    name?: string | null;
    minThreads: number;
    maxThreads: number;
    maxQueue: number;
    fallbackPolicy?: FallbackPolicy;
    idletime?: number;
    autoTerminate?: boolean;
  }) {
    this.name = name;
    this.minLength = minThreads;
    this.maxLength = maxThreads;
    this.maxQueue = maxQueue;
    this.fallbackPolicy = fallbackPolicy;
    this.idletime = Math.trunc(idletime);
    this.autoTerminate = autoTerminate;

    if (this.maxLength < 0) throw new ArgumentError("`max_threads` cannot be less than 0");
    if (this.maxLength > 2147483647) {
      throw new ArgumentError("`max_threads` cannot be greater than 2147483647");
    }
    if (this.minLength < 0) throw new ArgumentError("`min_threads` cannot be less than 0");
    if (this.minLength > this.maxLength) {
      throw new ArgumentError("`min_threads` cannot be more than `max_threads`");
    }
  }

  /** @noRailsEquivalent PERMANENT */
  post<A extends unknown[]>(...argsAndTask: [...args: A, task: (...args: A) => unknown]): boolean {
    const args = argsAndTask.slice(0, -1) as A;
    const block = argsAndTask[argsAndTask.length - 1] as ((...args: A) => unknown) | undefined;
    if (typeof block !== "function") throw new ArgumentError("no block given");
    const task = () => block(...args);
    if (!this.isRunning()) {
      return this._fallbackAction(task);
    } else if (this._running >= this.minLength && this._ready.length > 0) {
      this.scheduledTaskCount += 1;
      this._ready.pop()!(task);
    } else if (this._running < this.maxLength) {
      this._running += 1;
      this.scheduledTaskCount += 1;
      queueMicrotask(() => this._runWorker(task));
    } else if (this.maxQueue === 0 || this._queue.length < this.maxQueue) {
      this._queue.push(task);
      this.scheduledTaskCount += 1;
    } else {
      return this._fallbackAction(task);
    }
    return true;
  }

  /** @noRailsEquivalent PERMANENT */
  append(task: () => unknown): this {
    this.post(task);
    return this;
  }

  private isRunning(): boolean {
    return !this._stopped;
  }

  /** @noRailsEquivalent PERMANENT */
  isShuttingdown(): boolean {
    return !(this.isRunning() || this.isShutdown());
  }

  /** @noRailsEquivalent PERMANENT */
  isShutdown(): boolean {
    return this._stopped && this._running === 0;
  }

  private _fallbackAction(task: () => unknown): boolean {
    switch (this.fallbackPolicy) {
      case "abort":
        throw new RejectedExecutionError();
      case "discard":
        return false;
      case "caller_runs":
        task();
        return true;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  shutdown(): true {
    if (this.isRunning()) {
      this._stopped = true;
      for (const ready of this._ready.splice(0)) ready(undefined);
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

  private _runWorker(first: () => unknown): void {
    new Thread(async () => {
      let task: (() => unknown) | undefined = first;
      while (task) {
        await Promise.resolve()
          .then(task)
          .catch(() => null);
        this.completedTaskCount += 1;
        task = this._queue.shift() ?? (await this._nextTask());
      }
      this._running -= 1;
      if (this._stopped && this._running === 0) this._setStoppedEvent();
    });
  }

  private _nextTask(): Promise<(() => unknown) | undefined> {
    if (this._stopped) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const ready = (task: (() => unknown) | undefined) => {
        clearTimeout(timer as ReturnType<typeof setTimeout>);
        resolve(task);
      };
      const timer: unknown = setTimeout(() => {
        if (this._running - this.minLength > 0) {
          this._ready.splice(this._ready.indexOf(ready), 1);
          resolve(undefined);
        }
      }, this.idletime * 1000);
      (timer as { unref?: () => unknown }).unref?.();
      this._ready.push(ready);
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
  constructor({ name = null }: { name?: string | null } = {}) {
    super({ name, minThreads: 0, maxThreads: 2147483647, maxQueue: 0 });
  }
}

let _globalIoExecutor: CachedThreadPool | undefined;

/**
 * `Concurrent.global_io_executor` (not vendored, `concurrent/configuration.rb:73-75`):
 * the one process-wide `CachedThreadPool`, each worker a `Thread.new`
 * (`vendor/ruby/v3.3.11/thread.c:897` `thread_s_new`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function globalIoExecutor(): CachedThreadPool {
  return (_globalIoExecutor ??= new CachedThreadPool({ name: "io" }));
}

Concurrent.globalIoExecutor = globalIoExecutor;
rbModConstSet(Concurrent, "ThreadPoolExecutor", ThreadPoolExecutor);
rbModConstSet(Concurrent, "RejectedExecutionError", RejectedExecutionError);
