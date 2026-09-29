/** @internal */

import { Benchmarkable, include, included } from "@blazetrails/activesupport";

export { benchmark, type BenchmarkLogger as LoggerLike } from "@blazetrails/activesupport";

export interface LoggerHost {
  logger?: import("@blazetrails/activesupport").BenchmarkLogger;
}

/** @internal */
export type LoggerIncludingClass = (new (...args: never[]) => unknown) & {
  configAccessor(...names: string[]): void;
};

export class Logger {
  static [included](base: LoggerIncludingClass): void {
    base.configAccessor("logger");
    include(base, Benchmarkable);
  }
}
