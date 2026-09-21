import { Benchmark as ActiveSupportBenchmark } from "../benchmark.js";
import { deprecator } from "../deprecator.js";

/** @deprecated */
function ms<T>(block: () => T): number {
  deprecator().warn(
    "`Benchmark.ms` is deprecated and will be removed in Rails 8.1 without replacement.\n",
  );
  return ActiveSupportBenchmark.realtime(":float_millisecond", block);
}

export const Benchmark = { ms };
