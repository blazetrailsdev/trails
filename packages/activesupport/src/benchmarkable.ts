/**
 * `ActiveSupport::Benchmarkable` — mixed into `AbstractController::Logger`
 * and `ActiveRecord::Base` exactly as Rails' `include Benchmarkable` does
 * (benchmarkable.rb:4-52). `benchmark` reads the host's `logger` reader
 * (benchmarkable.rb:38,44,46) rather than taking it as a parameter.
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
  /**
   * If true, log the elapsed time even when the block raises/rejects.
   * Rails' `ActiveSupport::Benchmarkable` does NOT do this — exceptions
   * propagate without a trailing log line — so this is opt-in. The
   * actionpack `benchmark()` wrapper enables it for partial-failure
   * visibility; `ActiveRecord::Base.benchmark` keeps Rails-strict
   * behavior.
   */
  logOnError?: boolean;
}

// Matches `ActiveSupport::Logger::ERROR` — the level raised by `silence` so
// in-block info/debug calls are suppressed.
const ERROR_LEVEL = 3;

const monotonicNow = (): number => globalThis.performance?.now() ?? Date.now();

/** The host of `include ActiveSupport::Benchmarkable` — supplies `logger`. */
export interface Benchmarkable {
  logger?: BenchmarkLogger | null;
}

export function benchmark<T>(
  this: Benchmarkable,
  message: string,
  block: () => T | Promise<T>,
): T | Promise<Awaited<T>>;
export function benchmark<T>(
  this: Benchmarkable,
  message: string,
  options: BenchmarkOptions,
  block: () => T | Promise<T>,
): T | Promise<Awaited<T>>;
export function benchmark<T>(
  this: Benchmarkable,
  message = "Benchmarking",
  optionsOrBlock?: BenchmarkOptions | (() => T | Promise<T>),
  maybeBlock?: () => T | Promise<T>,
): T | Promise<Awaited<T>> {
  const block = (typeof optionsOrBlock === "function" ? optionsOrBlock : maybeBlock!) as () =>
    | T
    | Promise<T>;
  const options: BenchmarkOptions =
    typeof optionsOrBlock === "function" ? {} : (optionsOrBlock ?? {});
  const level = options.level ?? "info";

  const logger = this?.logger;
  if (!logger) return block() as T | Promise<Awaited<T>>;
  const start = monotonicNow();
  const log = (): void => {
    const fn = (logger as Record<string, unknown>)[level];
    if (typeof fn !== "function") return;
    const ms = monotonicNow() - start;
    (fn as (msg: string) => void).call(logger, `${message} (${ms.toFixed(1)}ms)`);
  };

  const runBlock = (): T | Promise<T> => {
    if (options.silence && typeof logger.silence === "function") {
      // `Logger#silence` is synchronous; raising the level only suppresses
      // log calls dispatched before the block returns. Async continuations
      // inside `block` log normally — matches Rails' Ruby behavior.
      let inner: T | Promise<T>;
      logger.silence(ERROR_LEVEL, () => {
        inner = block();
      });
      return inner!;
    }
    return block();
  };

  // Rails' Benchmarkable does not log on raise — exceptions propagate
  // without a trailing log line. `logOnError: true` opts back into the
  // log-on-throw contract that the actionpack helper has historically
  // promised so callers can see partial timings of failing operations.
  let result: T | Promise<T>;
  try {
    result = runBlock();
  } catch (err) {
    if (options.logOnError) log();
    throw err;
  }

  if (result! instanceof Promise) {
    return (result as Promise<Awaited<T>>).then(
      (val) => {
        log();
        return val;
      },
      (err) => {
        if (options.logOnError) log();
        throw err;
      },
    );
  }
  log();
  return result as Awaited<T>;
}
