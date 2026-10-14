/** @internal */

import { Benchmarkable, Concern, extend, include, Module } from "@blazetrails/activesupport";

export { benchmark, type BenchmarkLogger as LoggerLike } from "@blazetrails/activesupport";

export interface LoggerHost {
  logger?: import("@blazetrails/activesupport").BenchmarkLogger;
}

type LoggerIncludingClass = (new (...args: never[]) => unknown) & {
  configAccessor(...names: string[]): void;
};

export const Logger = new Module((mod) => {
  extend(mod, Concern);

  (
    mod as unknown as { included(base: null, block: (this: LoggerIncludingClass) => void): void }
  ).included(null, function (this: LoggerIncludingClass) {
    this.configAccessor("logger");
    include(this, Benchmarkable);
  });
});
