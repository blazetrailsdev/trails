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
 * Mirrors `ActiveSupport::Benchmarkable#benchmark`. Thin wrapper around
 * the shared `benchmark` helper in `@blazetrails/activesupport` —
 * preserved here so existing actionpack callers don't break.
 */
export function benchmark<T>(logger: LoggerLike | undefined, message: string, block: () => T): T;
export function benchmark<T>(
  logger: LoggerLike | undefined,
  message: string,
  block: () => Promise<T>,
): Promise<T>;
export function benchmark<T>(
  logger: LoggerLike | undefined,
  message: string,
  block: () => T | Promise<T>,
): T | Promise<T> {
  return benchmarkable(logger, message, { logOnError: true }, block) as T | Promise<T>;
}
