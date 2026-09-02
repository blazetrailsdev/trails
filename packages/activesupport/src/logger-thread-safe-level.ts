import { ArgumentError } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { NameError } from "./core-ext/name-error.js";
import { LOG_LEVELS, type LogLevel } from "./logger.js";

/**
 * Ruby's `Object#inspect` for the values `local_level=`'s ArgumentError can
 * carry (`logger_thread_safe_level.rb:21`): a String renders quoted, every
 * other value through `to_s`. Same shape as class-attribute.ts's.
 */
function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/**
 * ActiveSupport::LoggerThreadSafeLevel
 * (`activesupport/lib/active_support/logger_thread_safe_level.rb`)
 *
 * Mixed into {@link Logger} by `include LoggerThreadSafeLevel`
 * (`logger.rb:11`).
 * @internal
 */
export class LoggerThreadSafeLevel {
  /** `::Logger`'s `@level`, the `super` that `level` falls through to. */
  declare protected _level: number;

  /**
   * `logger_thread_safe_level.rb:38` — `:"logger_thread_safe_level_#{object_id}"`.
   * A JS Symbol is the private per-instance key here, exactly as Ruby's
   * per-object_id Symbol is: it is never a Ruby Symbol *value*.
   */
  declare private _localLevelKey?: symbol;

  /** `logger_thread_safe_level.rb:38-40` — private. @internal */
  protected get localLevelKey(): symbol {
    return (this._localLevelKey ??= Symbol("loggerThreadSafeLevel"));
  }

  /** `logger_thread_safe_level.rb:26-28`. */
  get localLevel(): number | null {
    return IsolatedExecutionState.get<number>(this.localLevelKey) ?? null;
  }

  /** `logger_thread_safe_level.rb:11-24`. */
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

  /** `logger_thread_safe_level.rb:30-32` — `local_level || super`. */
  get level(): number {
    return this.localLevel ?? this._level;
  }

  /**
   * `::Logger#level=`. It rides in this module rather than in `logger.ts`
   * because a JS property cannot take its `get` from one object and its `set`
   * from another — the single-descriptor shortcoming CLAUDE.md's "Generated
   * attribute readers are properties" section ratifies repo-wide.
   */
  set level(severity: number | LogLevel | string) {
    this._level = coerce(severity);
  }

  /** `logger_thread_safe_level.rb:34-39` — change the local level for the block. */
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
