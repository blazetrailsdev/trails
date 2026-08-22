/**
 * `AbstractController::Logger` — config slot for a per-controller logger.
 * Rails' `included do ... include ActiveSupport::Benchmarkable end`
 * (logger.rb:11-14) is spelled here as a re-export of the mixin, which the
 * controller class assigns to itself; `benchmark` then reads the
 * controller's own `logger` reader (benchmarkable.rb:38).
 *
 * @internal
 */

export { benchmark, type BenchmarkLogger as LoggerLike } from "@blazetrails/activesupport";

export interface LoggerHost {
  logger?: import("@blazetrails/activesupport").BenchmarkLogger;
}
