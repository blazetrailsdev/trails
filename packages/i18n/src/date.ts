/**
 * Ruby's stdlib `::Date` and `::DateTime`, as much of them as trails needs.
 * Rails does not define either class — it only reopens them in
 * `core_ext/date/*.rb`, whose calculations live in activesupport's
 * `time-ext.ts` here, over `Temporal.PlainDate`.
 *
 * `Temporal.PlainDate` is trails' `::Date` value (`TimeWithZone#toDate` returns
 * one), but it answers `dayOfWeek`/`month` rather than Ruby's `wday`/`mon` and
 * has no `strftime`, so it cannot be handed to a method that duck-types a Ruby
 * date. `I18n::Backend::Base#localize` is exactly such a method: it asks for
 * `strftime`, `wday` and `mon`, and picks `date.formats` over `time.formats` by
 * the *absence* of `sec` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `./backend/base.ts:245-271`). These wrappers are that duck type, and `Date`'s
 * lack of `sec`/`hour` is the distinction Ruby gets from `Date` not being a
 * `Time`.
 *
 * This lives in `packages/i18n` rather than `packages/activesupport` because
 * `packages/i18n` is a dependency of `packages/activesupport`, and both
 * packages' localization tests drive the same objects.
 */

import { Temporal } from "@js-temporal/polyfill";

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

/**
 * @internal The fields the one C `strftime(3)` behind both `Date#strftime` and
 * `Time#strftime` reads off its receiver. It is not the public surface of
 * either class — `Date` deliberately answers no `hour`/`sec` — so each caller
 * builds one for the call.
 *
 * @noRailsEquivalent PERMANENT — the argument shape of `strftime` below, exported only
 * because TypeScript has no module-private visibility that still reaches
 * `./time.ts`. Not part of the shim's API: nothing outside `date.ts` and
 * `time.ts` constructs one.
 */
export interface StrftimeSubject {
  year: number;
  mon: number;
  day: number;
  wday: number;
  yday: number;
  hour: number;
  min: number;
  sec: number;
  zone: string;
}

/**
 * @internal Ruby routes `Date#strftime` and `Time#strftime` through the same C
 * formatter, so trails has one implementation rather than a copy per class.
 *
 * @noRailsEquivalent PERMANENT — Ruby exposes `strftime` only as a method on `Date`,
 * `DateTime` and `Time`, and so does this shim — `I18n::Backend::Base#localize`
 * calls `object.strftime(format)` and nothing else
 * (i18n/lib/i18n/backend/base.rb:91-92). This free function is the shared
 * implementation those three methods delegate to, exported solely because
 * `./time.ts` is a separate module and TypeScript has no visibility between
 * "module-private" and "exported". Callers use `Date#strftime` /
 * `DateTime#strftime` / `Time#strftime`, never this.
 *
 * Only the directives the i18n format strings and the conformance mixins use
 * are recognised; Ruby leaves an unknown directive in place, and so does this.
 * `%z` is fixed at `+0000` because trails models only the UTC these classes are
 * built in; `%Z` varies, so it comes off the subject.
 */
export function strftime(subject: StrftimeSubject, format: string): string {
  const tokens: Record<string, () => string> = {
    Y: () => String(subject.year),
    y: () => pad2(subject.year % 100),
    m: () => pad2(subject.mon),
    d: () => pad2(subject.day),
    e: () => String(subject.day).padStart(2, " "),
    j: () => String(subject.yday).padStart(3, "0"),
    F: () => `${subject.year}-${pad2(subject.mon)}-${pad2(subject.day)}`,
    A: () => DAY_NAMES[subject.wday],
    a: () => ABBR_DAY_NAMES[subject.wday],
    B: () => MONTH_NAMES[subject.mon - 1],
    b: () => ABBR_MONTH_NAMES[subject.mon - 1],
    h: () => ABBR_MONTH_NAMES[subject.mon - 1],
    H: () => pad2(subject.hour),
    M: () => pad2(subject.min),
    S: () => pad2(subject.sec),
    p: () => (subject.hour < 12 ? "AM" : "PM"),
    P: () => (subject.hour < 12 ? "am" : "pm"),
    x: () => `${pad2(subject.mon)}/${pad2(subject.day)}/${pad2(subject.year % 100)}`,
    z: () => "+0000",
    Z: () => subject.zone,
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
  /** @internal Ruby's `::Date` value, which has no public reader. */
  readonly #plain: Temporal.PlainDate;

  /** Ruby `Date.new(year, month, day)`. */
  constructor(year: number, month: number, day: number) {
    this.#plain = new Temporal.PlainDate(year, month, day);
  }

  /**
   * Ruby `Date.parse`, narrowed to the `y-m-d` the callers use. The month and
   * day are unpadded-tolerant because Ruby's is — `String#to_date` delegates
   * straight to `::Date.parse`
   * (activesupport/lib/active_support/core_ext/string/conversions.rb:47-48),
   * and `i18n_test.rb:9` passes `"2008-7-2"`.
   */
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

  get yday(): number {
    return this.#plain.dayOfYear;
  }

  /**
   * `Date#strftime('%Z')` answers the UTC offset. Ruby's `::Date` has no `zone`
   * reader of its own — only `::DateTime` and `::Time` do — so the value is
   * passed to the formatter rather than exposed as a member.
   */
  strftime(format: string): string {
    return strftime(
      {
        year: this.year,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: 0,
        min: 0,
        sec: 0,
        zone: "+00:00",
      },
      format,
    );
  }
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `::DateTime`, a `::Date` that also
 * answers `hour`, `min` and `sec`. Those are what route a `localize` lookup to
 * `time.formats` (i18n/lib/i18n/backend/base.rb:105-115), while `%Z` keeps
 * `::Date`'s offset spelling rather than `::Time`'s `"UTC"`.
 */
export class DateTime extends Date {
  readonly #hour: number;
  readonly #min: number;
  readonly #sec: number;

  /** Ruby `DateTime.new(year, month, day, hour = 0, minute = 0, second = 0)`. */
  constructor(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
    super(year, month, day);
    this.#hour = hour;
    this.#min = minute;
    this.#sec = second;
  }

  get hour(): number {
    return this.#hour;
  }

  get min(): number {
    return this.#min;
  }

  get sec(): number {
    return this.#sec;
  }

  /** `DateTime#zone` is the UTC offset, where `Time#zone` is `"UTC"`. */
  get zone(): string {
    return "+00:00";
  }

  override strftime(format: string): string {
    return strftime(
      {
        year: this.year,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: this.hour,
        min: this.min,
        sec: this.sec,
        zone: this.zone,
      },
      format,
    );
  }
}
