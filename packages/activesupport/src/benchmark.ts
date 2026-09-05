import { Process } from "@blazetrails/ruby-compat";

export class Benchmark {
  static realtime<T>(unit: string, block: () => Promise<T>): Promise<number>;
  static realtime<T>(unit: string, block: () => T): number;
  static realtime<T>(block: () => Promise<T>): Promise<number>;
  static realtime<T>(block: () => T): number;
  /**
   * The `Promise`-returning overloads have no Ruby counterpart because Ruby has
   * no async boundary: `yield` in `benchmark.rb:17` returns when the work is
   * done. A block whose work is deferred to a promise measures zero unless the
   * clock is read again when that promise settles, which is what the thenable
   * arm below does — the same measurement, moved to where the work actually
   * finishes.
   */
  static realtime<T>(unit: string | (() => T), block?: () => T): number | Promise<number> {
    if (typeof unit === "function") {
      block = unit;
      unit = ":float_second";
    }
    const timeStart = Process.clockGettime(Process.CLOCK_MONOTONIC, unit);
    const result = block!() as unknown;
    if (typeof (result as PromiseLike<unknown> | null)?.then === "function") {
      return Promise.resolve(result).then(
        () => Process.clockGettime(Process.CLOCK_MONOTONIC, unit) - timeStart,
      );
    }
    return Process.clockGettime(Process.CLOCK_MONOTONIC, unit) - timeStart;
  }
}
