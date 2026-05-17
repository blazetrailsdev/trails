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
  error?(message: string): void;
  fatal?(message: string): void;
}

export interface LoggerHost {
  logger?: LoggerLike;
}

/**
 * Marks a host class as conforming to the `LoggerHost` slot contract.
 * No-op at runtime — see `applyAssetPaths` for the rationale. JS static
 * inheritance gives Rails-style propagation of `logger` for free.
 */
export function applyLogger<T extends new (...args: never[]) => unknown>(
  _cls: T & Partial<LoggerHost>,
): void {
  // Intentionally empty — see asset-paths.ts docstring. The
  // `Partial<LoggerHost>` bound surfaces the slot contract at call
  // sites without requiring the host to pre-declare the slot.
}

/**
 * Mirrors `ActiveSupport::Benchmarkable#benchmark` (and the
 * `ActiveRecord::Base.benchmark` shape used elsewhere in trails). Logs
 * the elapsed milliseconds for `block` to `logger.info` and returns
 * whatever the block returns.
 *
 * - Synchronous: logs immediately, then returns the result.
 * - Promise-returning: logs after the promise settles (resolve OR
 *   reject), and rejections propagate to the caller.
 * - Throwing sync block: logs the elapsed time, then rethrows.
 * - No logger attached: block runs unchanged; no timing.
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
  if (typeof logger?.info !== "function") return block();
  // Monotonic timing where available — `Date.now()` is wall-clock and
  // can jump under NTP adjustments. The fallback matches the pattern
  // used by `ActiveRecord::Base.benchmark`.
  const now = () => globalThis.performance?.now() ?? Date.now();
  const start = now();
  const log = (): void => {
    const ms = (now() - start).toFixed(1);
    logger.info!(`${message} (${ms}ms)`);
  };
  try {
    const result = block();
    if (result instanceof Promise) {
      // `.finally` fires on both resolve and reject, and the rejection
      // still propagates to callers.
      return result.finally(log);
    }
    log();
    return result;
  } catch (err) {
    log();
    throw err;
  }
}
