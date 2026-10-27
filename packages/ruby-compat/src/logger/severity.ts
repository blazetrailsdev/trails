import { ArgumentError } from "../argument-error.js";
import { symbolToS } from "../symbol.js";

const DEBUG = 0;
const INFO = 1;
const WARN = 2;
const ERROR = 3;
const FATAL = 4;
const UNKNOWN = 5;

const LEVELS: Record<string, number> = {
  debug: DEBUG,
  info: INFO,
  warn: WARN,
  error: ERROR,
  fatal: FATAL,
  unknown: UNKNOWN,
};

/**
 * `Logger::Severity.coerce` (`vendor/ruby/v3.3.11/lib/logger/severity.rb:29`).
 * A Symbol is a `":name"` string here, so its `to_s` drops the colon.
 *
 * @noRailsEquivalent PERMANENT
 */
function coerce(severity: number | string): number {
  if (typeof severity === "number") {
    return severity;
  } else {
    const key = (severity.startsWith(":") ? symbolToS(severity) : severity).toLowerCase();
    const level = Object.hasOwn(LEVELS, key) ? LEVELS[key] : undefined;
    if (level === undefined) {
      throw new ArgumentError(
        `invalid log level: ${severity.startsWith(":") ? symbolToS(severity) : severity}`,
      );
    }
    return level;
  }
}

/**
 * Ruby stdlib `Logger::Severity` (`vendor/ruby/v3.3.11/lib/logger/severity.rb:5`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Severity = { DEBUG, INFO, WARN, ERROR, FATAL, UNKNOWN, coerce } as const;
