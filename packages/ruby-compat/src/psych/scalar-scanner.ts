import { ArgumentError } from "../argument-error.js";
import type { ClassLoader } from "./class-loader.js";

type TimeClass = { parse(date: string): unknown };
type DateClass = { GREGORIAN: number; strptime(str: string, fmt: string, sg: number): unknown };

const TIME =
  /^-?\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|\s+)\d{1,2}:\d\d:\d\d(?:\.\d*)?(?:\s*(?:Z|[-+]\d{1,2}:?(?:\d\d)?))?$/;

/**
 * `Psych::ScalarScanner` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/scalar_scanner.rb:7`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class ScalarScanner {
  /** @noRailsEquivalent PERMANENT */
  readonly classLoader: ClassLoader;
  private strictInteger: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(classLoader: ClassLoader, { strictInteger = false } = {}) {
    this.classLoader = classLoader;
    this.strictInteger = strictInteger;
  }

  /**
   * `Psych::ScalarScanner#tokenize` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/scalar_scanner.rb:37`).
   *
   * @missingRailsCall parse_int — CONVERGEABLE psych-scalar-scanner-tokenize
   * @noRailsEquivalent PERMANENT
   */
  tokenize(string: unknown): unknown {
    if (typeof string !== "string") return string;
    if (string === "") return null;
    if (TIME.test(string)) {
      try {
        return this.parseTime(string);
      } catch (error) {
        if (!(error instanceof ArgumentError)) throw error;
        return string;
      }
    } else if (/^\d{4}-(?:1[012]|0\d|\d)-(?:[12]\d|3[01]|0\d|\d)$/.test(string)) {
      try {
        const date = this.classLoader.date() as DateClass;
        return date.strptime(string, "%F", date.GREGORIAN);
      } catch (error) {
        if (!(error instanceof ArgumentError)) throw error;
        return string;
      }
    } else {
      return string;
    }
  }

  /** `vendor/ruby/v3.3.11/ext/psych/lib/psych/scalar_scanner.rb:115`. */
  private parseTime(string: string): unknown {
    const klass = this.classLoader.load("Time") as TimeClass;

    return klass.parse(string);
  }
}
