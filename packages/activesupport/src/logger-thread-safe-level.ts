import { ArgumentError } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { NameError } from "./core-ext/name-error.js";
import { LOG_LEVELS, type LogLevel } from "./logger.js";

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/** @internal */
export class LoggerThreadSafeLevel {
  declare protected _level: number;

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
      value = LOG_LEVELS[`:${level.slice(1).toLowerCase()}` as LogLevel];
      if (value === undefined) {
        throw new NameError(
          `uninitialized constant Logger::Severity::${constantName}`,
          constantName,
        );
      }
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

  get level(): number {
    return this.localLevel ?? this._level;
  }

  set level(severity: number | LogLevel | string) {
    this._level = coerce(severity);
  }

  logAt(level: number | LogLevel, fn: () => void): void {
    const oldLocalLevel = this.localLevel;
    this.localLevel = level;
    try {
      fn();
    } finally {
      this.localLevel = oldLocalLevel;
    }
  }
}

function coerce(severity: number | string): number {
  if (typeof severity === "number") return severity;
  const name = severity.startsWith(":") ? severity.slice(1) : severity;
  const level = LOG_LEVELS[`:${name.toLowerCase()}` as LogLevel];
  if (level === undefined) throw new ArgumentError(`invalid log level: ${name}`);
  return level;
}
