/**
 * Shared benchmark helper, mirroring `ActiveSupport::Benchmarkable#benchmark`.
 * Used by both `ActionController::Logger`/`AbstractController` and
 * `ActiveRecord::Base.benchmark` so the two stay in lock-step.
 */

export interface BenchmarkLogger {
  debug?(message: string): void;
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
  fatal?(message: string): void;
  silence?(tempLevel?: number, fn?: () => void): void;
}

export interface BenchmarkOptions {
  level?: "debug" | "info" | "warn" | "error";
  silence?: boolean;
}

// Matches `ActiveSupport::Logger::ERROR` — the level raised by `silence` so
// in-block info/debug calls are suppressed.
const ERROR_LEVEL = 3;

const monotonicNow = (): number => globalThis.performance?.now() ?? Date.now();

export function benchmark<T>(
  logger: BenchmarkLogger | null | undefined,
  message: string,
  block: () => T | Promise<T>,
): T | Promise<Awaited<T>>;
export function benchmark<T>(
  logger: BenchmarkLogger | null | undefined,
  message: string,
  options: BenchmarkOptions,
  block: () => T | Promise<T>,
): T | Promise<Awaited<T>>;
export function benchmark<T>(
  logger: BenchmarkLogger | null | undefined,
  message: string,
  optionsOrBlock: BenchmarkOptions | (() => T | Promise<T>),
  maybeBlock?: () => T | Promise<T>,
): T | Promise<Awaited<T>> {
  const block = (typeof optionsOrBlock === "function" ? optionsOrBlock : maybeBlock!) as () =>
    | T
    | Promise<T>;
  const options: BenchmarkOptions =
    typeof optionsOrBlock === "function" ? {} : (optionsOrBlock ?? {});
  const level = options.level ?? "info";

  if (!logger) return block() as T | Promise<Awaited<T>>;

  const start = monotonicNow();
  const log = (): void => {
    const fn = (logger as Record<string, unknown>)[level];
    if (typeof fn !== "function") return;
    const ms = monotonicNow() - start;
    (fn as (msg: string) => void).call(logger, `${message} (${ms.toFixed(1)}ms)`);
  };

  let result: T | Promise<T>;
  try {
    if (options.silence && typeof logger.silence === "function") {
      // `Logger#silence` is synchronous; raising the level only suppresses
      // log calls dispatched before the block returns. Async continuations
      // inside `block` log normally — matches Rails' Ruby behavior.
      logger.silence(ERROR_LEVEL, () => {
        result = block();
      });
    } else {
      result = block();
    }
  } catch (err) {
    // Rails' Benchmarkable suppresses the trailing log on raise, but the
    // pre-existing trails actionpack helper logged on throw so callers
    // could see partial timings of failing operations — kept here to
    // preserve that contract across both consumers.
    log();
    throw err;
  }

  if (result! instanceof Promise) {
    return (result as Promise<Awaited<T>>).finally(log) as Promise<Awaited<T>>;
  }
  log();
  return result! as Awaited<T>;
}
