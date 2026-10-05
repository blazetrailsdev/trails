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
 *
 * @noRailsEquivalent PERMANENT
 */
export class ScalarScanner {
  /** @noRailsEquivalent PERMANENT */
  static readonly TIME =
    /(?<![^\n])-?\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|[ \t\r\n\f\v]+)\d{1,2}:\d\d:\d\d(?:\.\d*)?(?:[ \t\r\n\f\v]*(?:Z|[-+]\d{1,2}:?(?:\d\d)?))?(?![^\n])/;

  /** @noRailsEquivalent PERMANENT */
  static readonly FLOAT = /(?<![^\n])(?:[-+]?([0-9][0-9_,]*)?\.[0-9]*([eE][-+][0-9]+)?)(?![^\n])/;

  /** @noRailsEquivalent PERMANENT */
  static readonly INTEGER_STRICT =
    /(?<![^\n])(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+)(?![^\n])/;

  /** @noRailsEquivalent PERMANENT */
  static readonly INTEGER_LEGACY =
    /(?<![^\n])(?:[-+]?0b[0-1_,]+|[-+]?0[0-7_,]+|[-+]?(?:0|[1-9](?:[0-9]|,[0-9]|_[0-9])*)|[-+]?0x[0-9a-fA-F_,]+)(?![^\n])/;

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
      /(?<![^\n])[^\d.:-]?[\p{Alphabetic}_ \t\r\n\f\v!@#$%^&*(){}<>|/\\~;=]+/u.test(string) ||
      /\n/.test(string)
    ) {
      if (strlen(string) > 5) return string;

      if (/(?<![^\n])[^ytonf~]/i.test(string)) {
        return string;
      } else if (string === "~" || /(?<![^\n])null(?![^\n])/i.test(string)) {
        return null;
      } else if (/(?<![^\n])(yes|true|on)(?![^\n])/i.test(string)) {
        return true;
      } else if (/(?<![^\n])(no|false|off)(?![^\n])/i.test(string)) {
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
    } else if (/(?<![^\n])\d{4}-(?:1[012]|0\d|\d)-(?:[12]\d|3[01]|0\d|\d)(?![^\n])/.test(string)) {
      try {
        const date = this.classLoader.date() as DateClass;
        return date.strptime(string, "%F", date.GREGORIAN);
      } catch (error) {
        if (!(error instanceof ArgumentError)) throw error;
        return string;
      }
    } else if (/(?<![^\n])\+?\.inf(?![^\n])/i.test(string)) {
      return Infinity;
    } else if (/(?<![^\n])-\.inf(?![^\n])/i.test(string)) {
      return -Infinity;
    } else if (/(?<![^\n])\.nan(?![^\n])/i.test(string)) {
      return NaN;
    } else if (/(?<![^\n]):[^\n]/.test(string)) {
      const match = /(?<![^\n]):(["'])([^\n]*)\1/.exec(string);
      if (match !== null) {
        this.symbolCache.set(
          string,
          this.classLoader.symbolize(match[2].replace(/(?<![^\n]):/, "")),
        );
        return this.symbolCache.get(string);
      } else {
        this.symbolCache.set(string, this.classLoader.symbolize(string.replace(/(?<![^\n]):/, "")));
        return this.symbolCache.get(string);
      }
    } else if (/(?<![^\n])[-+]?[0-9][0-9_]*(:[0-5]?[0-9]){1,2}(?![^\n])/.test(string)) {
      let i = 0;
      string.split(":").forEach((n, e) => {
        i += Number(rbStrToI(n)) * 60 ** Math.abs(e - 2);
      });
      return i;
    } else if (/(?<![^\n])[-+]?[0-9][0-9_]*(:[0-5]?[0-9]){1,2}\.[0-9_]*(?![^\n])/.test(string)) {
      let i = 0;
      string.split(":").forEach((n, e) => {
        i += rbStrToF(n) * 60 ** Math.abs(e - 2);
      });
      return i;
    } else if (ScalarScanner.FLOAT.test(string)) {
      if (/^[-+]?\.\n?$/.test(string)) {
        return string;
      } else {
        return kernelFloat(stringDelete(string, ",_").replace(/\.([Ee]|(?![^\n]))/g, "$1"));
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
    const [yy, m, dd] = /(?<![^\n])(-?\d{4})-(\d{1,2})-(\d{1,2})/
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

    const tz = /(?<![^\n])([+-]?\d{1,2}):?(\d{1,2})?(?![^\n])/
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

    return new klass(yy, m, dd, hh, mm, rational(ss).add(rational(us).quo(1000000)), offset);
  }
}
