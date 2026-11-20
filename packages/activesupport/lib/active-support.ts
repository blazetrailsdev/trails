import { deprecator } from "./deprecator.js";
import { ErrorReporter, currentErrorReporter, _setErrorReporter } from "./error-reporter.js";
import { ActiveSupport } from "./namespaces.js";
import { preserveTimezone, setPreserveTimezone } from "./core-ext/date-and-time/compatibility.js";
import "./cache/store.js";

let _testOrder: string | null = null;

export function testOrder(): string | null {
  return _testOrder;
}

export function setTestOrder(value: string | null): void {
  _testOrder = value;
}

let _testParallelizationThreshold = 50;

export function testParallelizationThreshold(): number {
  return _testParallelizationThreshold;
}

export function setTestParallelizationThreshold(value: number): void {
  _testParallelizationThreshold = value;
}

export function cacheFormatVersion(): number {
  return ActiveSupport.Cache.formatVersion;
}

export function setCacheFormatVersion(value: number): void {
  ActiveSupport.Cache.formatVersion = value;
}

export function toTimePreservesTimezone(): boolean | string {
  return preserveTimezone();
}

export function setToTimePreservesTimezone(value: boolean | string | null | undefined): void {
  if (value == null || value === false) {
    deprecator().warn(
      "`to_time` will always preserve the receiver timezone rather than system local time in Rails 8.1. " +
        "To opt in to the new behavior, set `config.active_support.to_time_preserves_timezone = :zone`.",
    );
  } else if (value !== ":zone") {
    deprecator().warn(
      "`to_time` will always preserve the full timezone rather than offset of the receiver in Rails 8.1. " +
        "To opt in to the new behavior, set `config.active_support.to_time_preserves_timezone = :zone`.",
    );
  }

  setPreserveTimezone(value ?? null);
}

Object.defineProperties(ActiveSupport, {
  testOrder: { get: testOrder, set: setTestOrder, configurable: true, enumerable: true },
  testParallelizationThreshold: {
    get: testParallelizationThreshold,
    set: setTestParallelizationThreshold,
    configurable: true,
    enumerable: true,
  },
  errorReporter: {
    get: (): ErrorReporter => currentErrorReporter,
    set: (reporter: ErrorReporter) => _setErrorReporter(reporter),
    configurable: true,
    enumerable: true,
  },
});
Object.assign(ActiveSupport, {
  cacheFormatVersion,
  setCacheFormatVersion,
  toTimePreservesTimezone,
  setToTimePreservesTimezone,
});

export { ActiveSupport };
