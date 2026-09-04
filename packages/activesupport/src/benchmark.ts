import { Process } from "@blazetrails/ruby-compat";

export class Benchmark {
  static realtime<T>(unit: string, block: () => T): number;
  static realtime<T>(block: () => T): number;
  static realtime<T>(unit: string | (() => T), block?: () => T): number {
    if (typeof unit === "function") {
      block = unit;
      unit = ":float_second";
    }
    const timeStart = Process.clockGettime(Process.CLOCK_MONOTONIC, unit);
    block!();
    return Process.clockGettime(Process.CLOCK_MONOTONIC, unit) - timeStart;
  }
}
