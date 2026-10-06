import { ArgumentError } from "./argument-error.js";

type Executor = { post(task: () => unknown): unknown };

const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * @noRailsEquivalent PERMANENT — concurrent-ruby 1.3.6 `Concurrent::ScheduledTask`
 * (`concurrent/scheduled_task.rb:158-330`, not vendored) over `TimerSet#ns_post_task` /
 * `#process_tasks` (`concurrent/executor/timer_set.rb:95-107,146-180`), whose timer thread
 * waits through `rb_mutex_sleep` (`vendor/ruby/v3.3.11/thread_sync.c:626`). The wait here is
 * an unref'd `setTimeout`, re-armed past its 2^31-1 ms ceiling.
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
  constructor(
    delay: number,
    opts: { args?: A; executor: Executor },
    task: (...args: A) => unknown,
  ) {
    if (typeof task !== "function") throw new ArgumentError("no block given");
    if (delay < 0.0) throw new ArgumentError("seconds must be greater than zero");
    this.args = opts.args ?? ([] as unknown as A);
    this.delay = delay;
    this.task = task;
    this.executor = opts.executor;
  }

  /** @noRailsEquivalent PERMANENT */
  static execute<A extends unknown[]>(
    delay: number,
    opts: { args?: A; executor: Executor },
    task: (...args: A) => unknown,
  ): ScheduledTask<A> {
    return new ScheduledTask(delay, opts, task).execute();
  }

  /** @noRailsEquivalent PERMANENT */
  cancel(): boolean {
    if (this.state === "pending" || this.state === "unscheduled") {
      this.state = "cancelled";
      clearTimeout(this.timer);
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

  private processTask(): unknown {
    return this.task(...this.args);
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
