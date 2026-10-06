import { ArgumentError } from "./argument-error.js";

/**
 * @noRailsEquivalent PERMANENT — concurrent-ruby `Concurrent::ImmediateExecutor`
 * (`vendor/ruby/v3.3.11/proc.c:990`).
 */
export class ImmediateExecutor {
  /** @noRailsEquivalent PERMANENT */
  post<A extends unknown[]>(
    ...argsAndTask: [...args: A, task: (...args: A) => unknown]
  ): true | Promise<true> {
    const args = argsAndTask.slice(0, -1) as A;
    const task = argsAndTask[argsAndTask.length - 1] as ((...args: A) => unknown) | undefined;
    if (typeof task !== "function") throw new ArgumentError("no block given");
    const result = task(...args);
    if (result instanceof Promise) return result.then(() => true as const);
    return true;
  }
}
