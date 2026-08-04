/**
 * Ruby's stdlib `::Date`, as much of it as trails needs. Rails does not define
 * the class — it only reopens it in `core_ext/date/*.rb`, whose calculations
 * live in `time-ext.ts` here, over `Temporal.PlainDate`.
 *
 * `Temporal.PlainDate` is trails' `::Date` value (`TimeWithZone#toDate` returns
 * one), but it answers `dayOfWeek`/`month` rather than Ruby's `wday`/`mon` and
 * has no `strftime`, so it cannot be handed to a method that duck-types a Ruby
 * date. `I18n::Backend::Base#localize` is exactly such a method: it asks for
 * `strftime`, `wday` and `mon`, and picks `date.formats` over `time.formats` by
 * the *absence* of `sec` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `packages/i18n/src/backend/base.ts:245-271`). This wrapper is that duck type,
 * and its lack of `sec`/`hour` is the distinction Ruby gets from `Date` not
 * being a `Time`.
 */

import { Temporal } from "./temporal.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ABBR_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const ABBR_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `::Date`. Rails never defines the
 * class, only reopens it, so there is no Rails counterpart for a port to
 * converge on; JS has no stdlib equivalent either (`Temporal.PlainDate` answers
 * `dayOfWeek`/`month`, not `wday`/`mon`, and has no `strftime`). trails carries
 * only the members a caller duck-types.
 */
export class Date {
  readonly #plain: Temporal.PlainDate;

  /** Ruby `Date.new(year, month, day)`. */
  constructor(year: number, month: number, day: number) {
    this.#plain = new Temporal.PlainDate(year, month, day);
  }

  /** Ruby `Date.parse`, narrowed to the ISO-ish `y-m-d` the callers use. */
  static parse(str: string): Date {
    const match = /^(-?\d{4,})-(\d{1,2})-(\d{1,2})$/.exec(str);
    // Ruby raises `Date::Error`, a subclass of `ArgumentError` that a nested
    // TS class cannot spell; the superclass is what callers rescue.
    if (!match) throw new ArgumentError("invalid date");
    return new Date(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  get year(): number {
    return this.#plain.year;
  }

  get mon(): number {
    return this.#plain.month;
  }

  get month(): number {
    return this.#plain.month;
  }

  get day(): number {
    return this.#plain.day;
  }

  /** Ruby counts Sunday as 0; `Temporal.PlainDate#dayOfWeek` counts Monday as 1. */
  get wday(): number {
    return this.#plain.dayOfWeek % 7;
  }

  strftime(format: string): string {
    const tokens: Record<string, () => string> = {
      Y: () => String(this.year),
      y: () => pad2(this.year % 100),
      m: () => pad2(this.mon),
      d: () => pad2(this.day),
      e: () => String(this.day).padStart(2, " "),
      j: () => String(this.#plain.dayOfYear).padStart(3, "0"),
      F: () => `${this.year}-${pad2(this.mon)}-${pad2(this.day)}`,
      A: () => DAY_NAMES[this.wday],
      a: () => ABBR_DAY_NAMES[this.wday],
      B: () => MONTH_NAMES[this.mon - 1],
      b: () => ABBR_MONTH_NAMES[this.mon - 1],
      h: () => ABBR_MONTH_NAMES[this.mon - 1],
      "%": () => "%",
    };

    return format.replace(/%(-?)([A-Za-z%])/g, (match, flag, spec) => {
      const fn = tokens[spec];
      if (!fn) return match;
      let result = fn();
      if (flag === "-") result = result.replace(/^[0 ]+/, "") || "0";
      return result;
    });
  }
}
