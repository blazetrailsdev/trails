import { assertValidKeys } from "./hash-utils.js";

export interface BenchmarkLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  fatal(message: string): void;
  silence?(tempLevel?: number, fn?: () => void): void;
}

export interface BenchmarkOptions {
  level?: "debug" | "info" | "warn" | "error";
  silence?: boolean;
}

export interface Benchmarkable {
  logger?: BenchmarkLogger | null;
}

const monotonicNow = (): number => globalThis.performance?.now() ?? Date.now();

export function benchmark<T>(
  this: Benchmarkable,
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
  message: string,
  block: () => T | Promise<T>,
): T | Promise<Awaited<T>>;
export function benchmark<T>(
  this: Benchmarkable,
  messageOrBlock: string | (() => T | Promise<T>) = "Benchmarking",
  optionsOrBlock?: BenchmarkOptions | (() => T | Promise<T>),
  maybeBlock?: () => T | Promise<T>,
): T | Promise<Awaited<T>> {
  const message = typeof messageOrBlock === "function" ? "Benchmarking" : messageOrBlock;
  const block = (
    typeof messageOrBlock === "function"
      ? messageOrBlock
      : typeof optionsOrBlock === "function"
        ? optionsOrBlock
        : maybeBlock!
  ) as () => T | Promise<T>;
  const options: BenchmarkOptions =
    typeof optionsOrBlock === "function" || typeof optionsOrBlock === "undefined"
      ? {}
      : optionsOrBlock;

  const logger = this?.logger;
  if (logger) {
    assertValidKeys(options as Record<string, unknown>, ["level", "silence"]);
    options.level ||= "info";

    let result: T | Promise<T>;
    const start = monotonicNow();
    const finish = (): T | Promise<Awaited<T>> => {
      const ms = monotonicNow() - start;
      logger[options.level!](`${message} (${ms.toFixed(1)}ms)`);
      return result as Awaited<T>;
    };

    if (options.silence && typeof logger.silence === "function") {
      logger.silence(undefined, () => {
        result = block();
      });
    } else {
      result = block();
    }

    if (result! instanceof Promise) {
      return (result as Promise<Awaited<T>>).then((val) => {
        result = val as T;
        finish();
        return val;
      });
    }
    return finish();
  } else {
    return block() as T | Promise<Awaited<T>>;
  }
}
