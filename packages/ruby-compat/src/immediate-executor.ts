import { ArgumentError } from "./argument-error.js";

/**
 * concurrent-ruby 1.3.6 `Concurrent::ImmediateExecutor`
 * (`concurrent/executor/immediate_executor.rb:17-65`, not vendored), whose
 * `task.call(*args)` is `rb_proc_call` (`vendor/ruby/v3.3.11/proc.c:990`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class ImmediateExecutor {
  private stopped = false;

  /**
   * @noRailsEquivalent PERMANENT
   * @inventedArm if — PERMANENT
   */
  post<A extends unknown[]>(
    ...argsAndTask: [...args: A, task: (...args: A) => unknown]
  ): boolean | Promise<boolean> {
    const args = argsAndTask.slice(0, -1) as A;
    const task = argsAndTask[argsAndTask.length - 1] as ((...args: A) => unknown) | undefined;
    if (typeof task !== "function") throw new ArgumentError("no block given");
    if (!this.isRunning()) return false;
    const result = task(...args);
    if (result instanceof Promise) return result.then(() => true);
    return true;
  }

  private isRunning(): boolean {
    return !this.isShutdown();
  }

  private isShutdown(): boolean {
    return this.stopped;
  }

  /** @noRailsEquivalent PERMANENT */
  shutdown(): true {
    this.stopped = true;
    return true;
  }
}
