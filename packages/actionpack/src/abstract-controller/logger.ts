/**
 * `AbstractController::Logger` — config slot for a per-controller
 * logger. Rails additionally mixes in `ActiveSupport::Benchmarkable`
 * (`benchmark(message, &block)`); we expose a small standalone
 * `benchmark` helper that the same callers can reuse.
 *
 * @internal
 */

export interface LoggerLike {
  info?(message: string): void;
  debug?(message: string): void;
  warn?(message: string): void;
}

export interface LoggerHost {
  logger?: LoggerLike;
}

/** Install the `logger` config slot on `cls` with an `undefined` default. */
export function applyLogger(cls: object): void {
  const host = cls as Record<string, unknown>;
  if (!Object.hasOwn(host, "logger")) host.logger = undefined;
}

/**
 * Mirrors `ActiveSupport::Benchmarkable#benchmark`. Logs the elapsed
 * milliseconds for `block` to `logger.info`, returning whatever the
 * block returns. If no logger is attached the block still runs.
 */
export function benchmark<T>(logger: LoggerLike | undefined, message: string, block: () => T): T {
  if (!logger?.info) return block();
  const start = Date.now();
  const result = block();
  const ms = Date.now() - start;
  logger.info(`${message} (${ms}ms)`);
  return result;
}
