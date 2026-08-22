/**
 * `AbstractController::Logger` — config slot for a per-controller
 * logger. Rails additionally mixes in `ActiveSupport::Benchmarkable`
 * (`benchmark(message, &block)`); the shared helper lives in
 * `@blazetrails/activesupport` and is re-exported here so the
 * abstract-controller surface keeps the same callable shape.
 *
 * @internal
 */

import { benchmark as benchmarkable, type BenchmarkLogger } from "@blazetrails/activesupport";

export type LoggerLike = BenchmarkLogger;

export interface LoggerHost {
  logger?: LoggerLike;
}

/**
 * Mirrors `ActiveSupport::Benchmarkable#benchmark`, mixed in the way Rails'
 * `include ActiveSupport::Benchmarkable` mixes it into
 * `AbstractController::Logger` (logger.rb:13) — `this` is the controller, and
 * the logger comes from its own `logger` reader (benchmarkable.rb:38).
 */
export function benchmark<T>(this: LoggerHost, message: string, block: () => T): T {
  return benchmarkable.call(this, message, { logOnError: true }, block) as T;
}
