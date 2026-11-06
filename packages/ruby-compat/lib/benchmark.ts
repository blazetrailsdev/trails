import { Process } from "./process.js";

/**
 * `Benchmark.realtime` (`vendor/ruby/v3.3.11/lib/benchmark.rb:311`). A block
 * whose work settles in a promise is measured when the promise settles, which
 * is where Ruby's `yield` returns.
 *
 * @noRailsEquivalent PERMANENT
 */
function realtime<T>(block: () => Promise<T>): Promise<number>;
function realtime<T>(block: () => T): number;
function realtime<T>(block: () => T): number | Promise<number> {
  const r0 = Process.clockGettime(Process.CLOCK_MONOTONIC);
  const result = block() as unknown;
  if (typeof (result as PromiseLike<unknown> | null)?.then === "function") {
    return Promise.resolve(result).then(() => Process.clockGettime(Process.CLOCK_MONOTONIC) - r0);
  }
  return Process.clockGettime(Process.CLOCK_MONOTONIC) - r0;
}

/**
 * Ruby stdlib `Benchmark` (`vendor/ruby/v3.3.11/lib/benchmark.rb:122`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Benchmark = { realtime };
