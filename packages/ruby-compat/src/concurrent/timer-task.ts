import { ArgumentError } from "../argument-error.js";
import { constSet } from "../include.js";
import { globalIoExecutor, type ThreadPoolExecutor } from "../thread-pool-executor.js";
import { Concurrent } from "./map.js";

const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * concurrent-ruby's `Concurrent::TimerTask` (not vendored,
 * `concurrent/timer_task.rb:148-358`, concurrent-ruby 1.3.6), with its default
 * `run_now: false` and `interval_type: :fixed_delay`: the first run is one
 * `execution_interval` (seconds) after {@link execute}, and each later one is
 * scheduled when the previous run has settled, so an async block never
 * overlaps itself. A raising block does not stop the timer, and each run's
 * `(time, result, error)` goes to the observers {@link addObserver} registered
 * (`timer_task.rb:330-345` `execute_task`). The wait is an unref'd
 * `setTimeout`, so a pending run does not hold the process open, where
 * concurrent-ruby's timer thread waits through `rb_mutex_sleep`
 * (`vendor/ruby/v3.3.11/thread_sync.c:626`). Each run is posted to `executor`,
 * by default {@link globalIoExecutor} (`timer_task.rb:312`, `:334`), so it owns
 * a pool `Thread` rather than the one that called {@link execute}.
 *
 * @noRailsEquivalent PERMANENT
 */
export class TimerTask {
  /** @noRailsEquivalent PERMANENT */
  readonly executionInterval: number;
  private readonly _runNow: boolean;
  private readonly _executor: Pick<ThreadPoolExecutor, "post">;
  private readonly _task: (task: TimerTask) => unknown;
  private _running = false;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _generation = 0;
  private _inFlight: Promise<unknown> | null = null;
  private readonly _observers: ((time: Date, result: unknown, error: unknown) => unknown)[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor(
    {
      executionInterval,
      runNow = false,
      executor,
    }: {
      executionInterval: number;
      runNow?: boolean;
      executor?: Pick<ThreadPoolExecutor, "post">;
    },
    task: (task: TimerTask) => unknown,
  ) {
    if (typeof task !== "function") throw new ArgumentError("no block given");
    if (!(executionInterval > 0)) {
      throw new ArgumentError("execution_interval must be greater than zero");
    }
    this.executionInterval = executionInterval;
    this._runNow = runNow;
    this._executor = executor ?? globalIoExecutor();
    this._task = task;
  }

  /** @noRailsEquivalent PERMANENT */
  execute(): this {
    if (!this._running) {
      this._running = true;
      const generation = this._generation;
      if (this._inFlight) {
        void this._inFlight.then(() => {
          if (generation === this._generation) this._scheduleNextTask();
        });
      } else {
        this._scheduleNextTask(this._runNow ? 0 : this.executionInterval);
      }
    }
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  addObserver<O extends (time: Date, result: unknown, error: unknown) => unknown>(observer: O): O {
    this._observers.push(observer);
    return observer;
  }

  /** @noRailsEquivalent PERMANENT */
  shutdown(): true {
    this._running = false;
    this._generation += 1;
    clearTimeout(this._timer);
    this._timer = undefined;
    return true;
  }

  private _scheduleNextTask(interval = this.executionInterval): void {
    const generation = this._generation;
    const timer: unknown = setTimeout(
      () => this._executor.post(() => this._executeTask(generation)),
      Math.min(interval * 1000, MAX_TIMEOUT),
    );
    this._timer = timer as ReturnType<typeof setTimeout>;
    (timer as { unref?: () => unknown }).unref?.();
  }

  private _notifyObservers(result: unknown, error: unknown): void {
    const time = new Date();
    for (const observer of this._observers) observer(time, result, error);
  }

  private async _executeTask(generation: number): Promise<void> {
    if (!this._running || generation !== this._generation) return;
    this._inFlight = Promise.resolve()
      .then(() => this._task(this))
      .then(
        (result) => this._notifyObservers(result, null),
        (error: unknown) => this._notifyObservers(null, error),
      )
      .catch(() => null);
    await this._inFlight;
    this._inFlight = null;
    if (this._running && generation === this._generation) this._scheduleNextTask();
  }
}

constSet(Concurrent, "TimerTask", TimerTask);
