import { ArgumentError } from "./argument-error.js";
import { StandardError } from "./standard-error.js";
import { globalIoExecutor } from "./thread-pool-executor.js";

type Executor = { post(task: () => unknown): unknown };

const MAX_TIMEOUT = 2 ** 31 - 1;

type Observer = (time: Date, value: unknown, reason: unknown) => unknown;

/**
 * concurrent-ruby 1.3.6 `Concurrent::CancelledOperationError`
 * (`concurrent/errors.rb:21`, not vendored), a subclass of `StandardError`
 * (`vendor/ruby/v3.3.11/error.c:3321`), which `ScheduledTask#cancel` hands its
 * observers.
 *
 * @noRailsEquivalent PERMANENT
 */
export class CancelledOperationError extends StandardError {}

/**
 * concurrent-ruby 1.3.6 `Concurrent::ScheduledTask`
 * (`concurrent/scheduled_task.rb:158-330`, not vendored) over
 * `TimerSet#ns_post_task` / `#process_tasks`
 * (`concurrent/executor/timer_set.rb:95-107,146-180`), whose timer thread waits
 * through `rb_mutex_sleep` (`vendor/ruby/v3.3.11/thread_sync.c:626`). The wait
 * here is an unref'd `setTimeout`, re-armed past its 2^31-1 ms ceiling.
 *
 * @noRailsEquivalent PERMANENT
 */
export class ScheduledTask<A extends unknown[] = unknown[]> {
  private state: "unscheduled" | "pending" | "processing" | "cancelled" = "unscheduled";
  private readonly args: A;
  private delay: number;
  private readonly task: (...args: A) => unknown;
  private time: number | null = null;
  private readonly executor: Executor;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** @noRailsEquivalent PERMANENT */
  readonly observers: Observer[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor(
    delay: number,
    opts: { args?: A; executor?: Executor },
    task: (...args: A) => unknown,
  ) {
    if (typeof task !== "function") throw new ArgumentError("no block given");
    if (delay < 0.0) throw new ArgumentError("seconds must be greater than zero");
    this.args = opts.args ?? ([] as unknown as A);
    this.delay = delay;
    this.task = task;
    this.executor = opts.executor ?? globalIoExecutor();
  }

  /** @noRailsEquivalent PERMANENT */
  static execute<A extends unknown[]>(
    delay: number,
    opts: { args?: A; executor?: Executor },
    task: (...args: A) => unknown,
  ): ScheduledTask<A> {
    return new ScheduledTask(delay, opts, task).execute();
  }

  /** @noRailsEquivalent PERMANENT */
  cancel(): boolean {
    if (this.state === "pending" || this.state === "unscheduled") {
      this.state = "cancelled";
      clearTimeout(this.timer);
      const reason = new CancelledOperationError();
      for (const observer of this.observers) observer(new Date(), null, reason);
      return true;
    } else {
      return false;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  execute(): this {
    if (this.state === "unscheduled") {
      this.state = "pending";
      this.nsSchedule(this.delay);
    }
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  addObserver(block: Observer): Observer {
    this.observers.push(block);
    return block;
  }

  private async processTask(): Promise<void> {
    let value: unknown = null;
    let reason: unknown = null;
    try {
      value = await this.task(...this.args);
    } catch (error) {
      reason = error;
    }
    for (const observer of this.observers) observer(new Date(), value, reason);
  }

  private nsSchedule(delay: number): void {
    this.delay = delay;
    this.time = performance.now() / 1000 + this.delay;
    if (this.delay <= 0.01) {
      this.state = "processing";
      this.executor.post(() => this.processTask());
    } else {
      this.processTasks();
    }
  }

  private processTasks(): void {
    const diff = this.time! - performance.now() / 1000;
    if (diff <= 0) {
      this.state = "processing";
      this.executor.post(() => this.processTask());
    } else {
      const timer: unknown = setTimeout(
        () => this.processTasks(),
        Math.min(diff * 1000, MAX_TIMEOUT),
      );
      this.timer = timer as ReturnType<typeof setTimeout>;
      (timer as { unref?: () => unknown }).unref?.();
    }
  }
}
