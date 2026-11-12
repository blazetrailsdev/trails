import { ArgumentError, Logger } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { NameError } from "./core-ext/name-error.js";
import type { LogLevel } from "./logger.js";

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/** @internal */
export class LoggerThreadSafeLevel {
  declare private _localLevelKey?: symbol;

  /** @internal */
  protected get localLevelKey(): symbol {
    return (this._localLevelKey ??= Symbol("loggerThreadSafeLevel"));
  }

  get localLevel(): number | null {
    return IsolatedExecutionState.get<number>(this.localLevelKey) ?? null;
  }

  set localLevel(level: number | LogLevel | null) {
    let value: number | null;
    if (typeof level === "number") {
      value = level;
    } else if (typeof level === "string" && level.startsWith(":")) {
      const constantName = level.slice(1).toUpperCase();
      const severity = (Logger.Severity as unknown as Record<string, number | undefined>)[
        constantName
      ];
      if (severity === undefined) {
        throw new NameError(
          `uninitialized constant Logger::Severity::${constantName}`,
          constantName,
        );
      }
      value = severity;
    } else if (level == null) {
      value = null;
    } else {
      throw new ArgumentError(`Invalid log level: ${inspect(level)}`);
    }

    if (value === null) {
      IsolatedExecutionState.delete(this.localLevelKey);
    } else {
      IsolatedExecutionState.set(this.localLevelKey, value);
    }
  }

  logAt<T>(level: number | LogLevel, fn: () => T): T {
    const oldLocalLevel = this.localLevel;
    this.localLevel = level;
    let async = false;
    try {
      const result = fn();
      if (typeof (result as PromiseLike<unknown> | null)?.then === "function") {
        async = true;
        return Promise.resolve(result).finally(() => (this.localLevel = oldLocalLevel)) as T;
      }
      return result;
    } finally {
      if (!async) this.localLevel = oldLocalLevel;
    }
  }
}
