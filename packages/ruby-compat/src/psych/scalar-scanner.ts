import { ArgumentError } from "../argument-error.js";
import { rbPathToClass } from "../variable.js";

type TimeClass = { parse(date: string): unknown };
type DateClass = { GREGORIAN: number; strptime(str: string, fmt: string, sg: number): unknown };

const TIME =
  /^-?\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|\s+)\d{1,2}:\d\d:\d\d(?:\.\d*)?(?:\s*(?:Z|[-+]\d{1,2}:?(?:\d\d)?))?$/;

/**
 * `Psych::ScalarScanner#tokenize` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/scalar_scanner.rb:37`).
 * Its classes come from `ClassLoader#date` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/class_loader.rb:36-43`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function tokenize(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    if (TIME.test(value)) return (rbPathToClass("Time") as TimeClass).parse(value);
    if (/^\d{4}-(?:1[012]|0\d|\d)-(?:[12]\d|3[01]|0\d|\d)$/.test(value)) {
      const date = rbPathToClass("Date") as DateClass;
      return date.strptime(value, "%F", date.GREGORIAN);
    }
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
  }
  return value;
}
