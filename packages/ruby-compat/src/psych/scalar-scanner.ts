import { ArgumentError } from "../argument-error.js";
import { kernelFloat } from "../kernel-float.js";
import { kernelInteger } from "../kernel-integer.js";
import { rational, type Rational } from "../rational.js";
import { rbStrToF, rbStrToI } from "../string/convert.js";
import { stringDelete } from "../string/delete.js";
import { stringSplit } from "../string/split.js";
import { strlen } from "../string/support.js";
import type { ClassLoader } from "./class-loader.js";

type TimeInstance = { toI(): number };
type TimeClass = {
  new (
    year: number,
    month: number,
    day: number,
    hour: number,
    min: number,
    sec: Rational,
    zone: number,
  ): TimeInstance;
  utc(
    year: number,
    month: number,
    day: number,
    hour: number,
    min: number,
    sec: number,
    usec: Rational | number,
  ): TimeInstance;
  at(time: number, subsec: Rational | number): TimeInstance;
};
type DateClass = { GREGORIAN: number; strptime(str: string, fmt: string, sg: number): unknown };

/**
 * `Psych::ScalarScanner` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/scalar_scanner.rb:6`).
 * Ruby's `^` and `$` are line anchors, so each pattern carries `m`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class ScalarScanner {
  /** @noRailsEquivalent PERMANENT */
  static readonly TIME =
    /^-?\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|[ \t\r\n\f\v]+)\d{1,2}:\d\d:\d\d(?:\.\d*)?(?:[ \t\r\n\f\v]*(?:Z|[-+]\d{1,2}:?(?:\d\d)?))?$/m;

  /** @noRailsEquivalent PERMANENT */
  static readonly FLOAT = /^(?:[-+]?([0-9][0-9_,]*)?\.[0-9]*([eE][-+][0-9]+)?)$/m;

  /** @noRailsEquivalent PERMANENT */
  static readonly INTEGER_STRICT =
    /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+)$/m;

  /** @noRailsEquivalent PERMANENT */
  static readonly INTEGER_LEGACY =
    /^(?:[-+]?0b[0-1_,]+|[-+]?0[0-7_,]+|[-+]?(?:0|[1-9](?:[0-9]|,[0-9]|_[0-9])*)|[-+]?0x[0-9a-fA-F_,]+)$/m;

  /** @noRailsEquivalent PERMANENT */
  readonly classLoader: ClassLoader;

  private readonly symbolCache = new Map<string, string>();
  private readonly strictInteger: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    classLoader: ClassLoader,
    { strictInteger = false }: { strictInteger?: boolean } = {},
  ) {
    this.classLoader = classLoader;
    this.strictInteger = strictInteger;
  }

  /** @noRailsEquivalent PERMANENT */
  tokenize(string: string): unknown {
    if (string === "") return null;
    if (this.symbolCache.has(string)) return this.symbolCache.get(string);
    const integerRegex = this.strictInteger
      ? ScalarScanner.INTEGER_STRICT
      : ScalarScanner.INTEGER_LEGACY;
    if (
      /^[^\d.:-]?[\p{Alphabetic}_ \t\r\n\f\v!@#$%^&*(){}<>|/\\~;=]+/mu.test(string) ||
      /\n/.test(string)
    ) {
      if (strlen(string) > 5) return string;

      if (/^[^ytonf~]/im.test(string)) {
        return string;
      } else if (string === "~" || /^null$/im.test(string)) {
        return null;
      } else if (/^(yes|true|on)$/im.test(string)) {
        return true;
      } else if (/^(no|false|off)$/im.test(string)) {
        return false;
      } else {
        return string;
      }
    } else if (ScalarScanner.TIME.test(string)) {
      try {
        return this.parseTime(string);
      } catch (error) {
        if (!(error instanceof ArgumentError)) throw error;
        return string;
      }
    } else if (/^\d{4}-(?:1[012]|0\d|\d)-(?:[12]\d|3[01]|0\d|\d)$/m.test(string)) {
      try {
        const date = this.classLoader.date() as DateClass;
        return date.strptime(string, "%F", date.GREGORIAN);
      } catch (error) {
        if (!(error instanceof ArgumentError)) throw error;
        return string;
      }
    } else if (/^\+?\.inf$/im.test(string)) {
      return Infinity;
    } else if (/^-\.inf$/im.test(string)) {
      return -Infinity;
    } else if (/^\.nan$/im.test(string)) {
      return NaN;
    } else if (/^:./m.test(string)) {
      const match = /^:(["'])(.*)\1/m.exec(string);
      if (match !== null) {
        this.symbolCache.set(string, this.classLoader.symbolize(match[2].replace(/^:/m, "")));
        return this.symbolCache.get(string);
      } else {
        this.symbolCache.set(string, this.classLoader.symbolize(string.replace(/^:/m, "")));
        return this.symbolCache.get(string);
      }
    } else if (/^[-+]?[0-9][0-9_]*(:[0-5]?[0-9]){1,2}$/m.test(string)) {
      let i = 0;
      string.split(":").forEach((n, e) => {
        i += Number(rbStrToI(n)) * 60 ** Math.abs(e - 2);
      });
      return i;
    } else if (/^[-+]?[0-9][0-9_]*(:[0-5]?[0-9]){1,2}\.[0-9_]*$/m.test(string)) {
      let i = 0;
      string.split(":").forEach((n, e) => {
        i += rbStrToF(n) * 60 ** Math.abs(e - 2);
      });
      return i;
    } else if (ScalarScanner.FLOAT.test(string)) {
      if (/^[-+]?\.\n?$/.test(string)) {
        return string;
      } else {
        return kernelFloat(stringDelete(string, ",_").replace(/\.([Ee]|$)/gm, "$1"));
      }
    } else if (integerRegex.test(string)) {
      return this.parseInt(string);
    } else {
      return string;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  parseInt(string: string): number {
    return kernelInteger(stringDelete(string, ",_"));
  }

  /**
   * @missingRailsArgs Rational — CONVERGEABLE kernel-rational-string-arm
   * @noRailsEquivalent PERMANENT
   */
  parseTime(string: string): unknown {
    const klass = this.classLoader.load("Time") as TimeClass;

    const split = stringSplit(string, /[ tT]/, 2);
    const date = split[0];
    let time: string | TimeInstance = split[1];
    const [yy, m, dd] = /^(-?\d{4})-(\d{1,2})-(\d{1,2})/m
      .exec(date)!
      .slice(1)
      .map((x) => Number(rbStrToI(x)));
    const md = /(\d+:\d+:\d+)(?:\.(\d*))?[ \t\r\n\f\v]*(Z|[-+]\d+(:\d\d)?)?/.exec(time)!;

    const [hh, mm, ss] = md[1].split(":").map((x) => Number(rbStrToI(x)));
    const us =
      md[2] != null ? rational(BigInt(`0${md[2]}`), 10n ** BigInt(md[2].length)).mul(1000000) : 0;

    time = klass.utc(yy, m, dd, hh, mm, ss, us);

    if ("Z" === md[3]) return time;
    if (md[3] == null) return klass.at(time.toI(), us);

    const tz = /^([+-]?\d{1,2}):?(\d{1,2})?$/m
      .exec(md[3])!
      .slice(1)
      .filter((digit) => digit != null)
      .map((digit) => kernelInteger(digit, 10));
    let offset = tz[0] * 3600;

    if (offset < 0) {
      offset -= (tz[1] ?? 0) * 60;
    } else {
      offset += (tz[1] ?? 0) * 60;
    }

    return new klass(yy, m, dd, hh, mm, rational(ss).add(rational(us, 1000000)), offset);
  }
}
