import { ArgumentError } from "../argument-error.js";
import { rbModConstSet } from "../include.js";
import { Concurrent } from "./map.js";

const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * concurrent-ruby's `Concurrent::TimerTask` (not vendored,
 * `concurrent/timer_task.rb:148-358`, concurrent-ruby 1.3.6), with its default
 * `run_now: false` and `interval_type: :fixed_delay`: the first run is one
 * `execution_interval` (seconds) after {@link execute}, and each later one is
 * scheduled when the previous run has settled, so an async block never
 * overlaps itself. A raising block is reported to no one and does not stop the
 * timer (`timer_task.rb:330-345` `execute_task`). The wait is an unref'd
 * `setTimeout`, so a pending run does not hold the process open, where
 * concurrent-ruby's timer thread waits through `rb_mutex_sleep`
 * (`vendor/ruby/v3.3.11/thread_sync.c:626`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class TimerTask {
  /** @noRailsEquivalent PERMANENT */
  readonly executionInterval: number;
  private readonly _task: (task: TimerTask) => unknown;
  private _running = false;
  private _timer: ReturnType<typeof setTimeout> | undefined;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    { executionInterval }: { executionInterval: number },
    task: (task: TimerTask) => unknown,
  ) {
    if (typeof task !== "function") throw new ArgumentError("no block given");
    if (!(executionInterval > 0)) {
      throw new ArgumentError("execution_interval must be greater than zero");
    }
    this.executionInterval = executionInterval;
    this._task = task;
  }

  /** @noRailsEquivalent PERMANENT */
  execute(): this {
    if (!this._running) {
      this._running = true;
      this._scheduleNextTask();
    }
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  shutdown(): true {
    this._running = false;
    clearTimeout(this._timer);
    this._timer = undefined;
    return true;
  }

  private _scheduleNextTask(interval = this.executionInterval): void {
    const timer: unknown = setTimeout(
      () => void this._executeTask(),
      Math.min(interval * 1000, MAX_TIMEOUT),
    );
    this._timer = timer as ReturnType<typeof setTimeout>;
    (timer as { unref?: () => unknown }).unref?.();
  }

  private async _executeTask(): Promise<void> {
    if (!this._running) return;
    await Promise.resolve()
      .then(() => this._task(this))
      .catch(() => null);
    if (this._running) this._scheduleNextTask();
  }
}

rbModConstSet(Concurrent, "TimerTask", TimerTask);
