import { ArgumentError } from "./argument-error.js";

type Executor<A extends unknown[]> = {
  post(...argsAndTask: [...args: A, task: (...args: A) => unknown]): unknown;
  scheduledTasks?: Set<{ cancel(): boolean }>;
};

/**
 * @noRailsEquivalent PERMANENT — concurrent-ruby `Concurrent::ScheduledTask`
 * (`vendor/ruby/v3.3.11/thread.c:1404`).
 */
export class ScheduledTask<A extends unknown[] = unknown[]> {
  private state: "unscheduled" | "pending" | "processing" | "cancelled" = "unscheduled";
  private readonly args: A;
  private readonly delay: number;
  private readonly task: (...args: A) => unknown;
  private readonly executor: Executor<A>;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    delay: number,
    opts: { args?: A; executor: Executor<A> },
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
    opts: { args?: A; executor: Executor<A> },
    task: (...args: A) => unknown,
  ): ScheduledTask<A> {
    return new ScheduledTask(delay, opts, task).execute();
  }

  /** @noRailsEquivalent PERMANENT */
  execute(): this {
    if (this.state === "unscheduled") {
      this.state = "pending";
      const timer: unknown = setTimeout(() => this.processTask(), this.delay * 1000);
      this.timer = timer as ReturnType<typeof setTimeout>;
      (timer as { unref?: () => unknown }).unref?.();
      this.executor.scheduledTasks?.add(this);
    }
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  cancel(): boolean {
    if (this.state === "pending" || this.state === "unscheduled") {
      this.state = "cancelled";
      clearTimeout(this.timer);
      this.executor.scheduledTasks?.delete(this);
      return true;
    } else {
      return false;
    }
  }

  private processTask(): void {
    this.state = "processing";
    this.executor.scheduledTasks?.delete(this);
    this.executor.post(...this.args, this.task);
  }
}
