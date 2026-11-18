/** @internal */

import { Benchmarkable, Concern, extend, include } from "@blazetrails/activesupport";

export { benchmark, type BenchmarkLogger as LoggerLike } from "@blazetrails/activesupport";

export interface LoggerHost {
  logger?: import("@blazetrails/activesupport").BenchmarkLogger;
}

type LoggerIncludingClass = (new (...args: never[]) => unknown) & {
  configAccessor(...names: string[]): void;
};

export const Logger = {};
extend(Logger, Concern);
Concern.included.call(Logger, null, function (this: LoggerIncludingClass) {
  this.configAccessor("logger");
  include(this, Benchmarkable);
});
