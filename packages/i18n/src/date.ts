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
 * @internal The alternations `date_parse.c` builds its patterns from
 * (ruby/date, `date_parse.c` `ABBR_MONTHS` / `ABBR_DAYS`). Ruby matches the
 * abbreviation and lets the rest of the name run off the end of the token, so
 * `"Jul"`, `"July"` and `"JULY"` all land on the same month.
 */
const ABBR_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const ABBR_DAYS = "sun|mon|tue|wed|thu|fri|sat";

/**
 * @internal The `:year`/`:mon`/`:mday` of the Hash `Date._parse` answers — any
 * of them absent when the string named only a fragment — plus the `:_comp`
 * `date_parse.c` sets when the year token is completable and deletes again
 * before answering.
 */
interface DateParts {
  year?: number;
  mon?: number;
  mday?: number;
  _comp?: boolean;
}

/** @internal `date_parse.c` `comp_year69`: `69` is 1969, `68` is 2068. */
function compYear69(y: number): number {
  return y >= 69 ? y + 1900 : y + 2000;
}

/** @internal `date_parse.c` `mon_num`: an abbreviation, or the head of a full name. */
function monNum(str: string): number {
  return ABBR_MONTH_NAMES.findIndex((m) => m.toLowerCase() === str.slice(0, 3).toLowerCase()) + 1;
}

/**
 * @internal `date_parse.c` `s3e`, which decides which of a match's numeric
 * tokens is the year: a token of more than two digits is one, a shorter one is
 * a month or a day. That is why `"01/01/2012".to_date` is 1 Jan 2012 while
 * `"12/13/2012".to_date` raises
 * (activesupport/lib/active_support/core_ext/string/conversions.rb:38-41), and
 * why `"07/08"` names no year at all.
 *
 * A signed year is never completable (`date_parse.c:172-181`, `:250-251`), so
 * `"-08-07-02"` is year -8 rather than 1992.
 */
function s3e(y: string | null, m: string, d: string | null): DateParts {
  if (y === null && d !== null && d.length > 2) {
    y = d;
    d = null;
  }
  if (y !== null && d === null) {
    if (y.replace(/^[-+]/, "").length > 2) return { year: Number(y), mon: Number(m), _comp: false };
    if (m.length > 2) return { year: Number(m), mon: Number(y), _comp: false };
    return { mon: Number(y), mday: Number(m) };
  }
  if (y === null) return { mon: Number(m), mday: Number(d) };
  if (y.replace(/^[-+]/, "").length < 3 && d !== null && d.length > 2) {
    [y, d] = [d, y];
  }
  return {
    year: Number(y),
    mon: Number(m),
    mday: Number(d),
    _comp: /^\d{1,2}$/.test(y),
  };
}

/** @internal `date_parse.c` `parse_day`: a leading day name is not a date field. */
function parseDay(str: string): string {
  return str.replace(new RegExp(`\\b(${ABBR_DAYS})[^-\\d\\s]*`, "i"), " ");
}

/** @internal `date_parse.c` `parse_eu`: `2nd July 2008`, `2 Jul 2008`, `3 Feb`. */
function parseEu(str: string): DateParts | null {
  const m = new RegExp(
    `'?(\\d+)[^-\\d\\s]*[-,.\\s]*(${ABBR_MONTHS})[^-\\d\\s]*(?:[,.\\s]+'?([-+]?\\d+)|[-,.\\s]*'?(\\d+))?`,
    "i",
  ).exec(str);
  return m ? s3e(m[3] ?? m[4] ?? null, String(monNum(m[2])), m[1]) : null;
}

/** @internal `date_parse.c` `parse_us`: `Jul 2 2008`, `July 2nd, 2008`, `Feb 2008`. */
function parseUs(str: string): DateParts | null {
  const m = new RegExp(
    `\\b(${ABBR_MONTHS})[^-\\d\\s]*[-,.\\s]+'?(\\d+)[^-\\d\\s]*(?:[,.\\s]+'?([-+]?\\d+)|[-,.\\s]*'?(\\d+))?`,
    "i",
  ).exec(str);
  return m ? s3e(m[3] ?? m[4] ?? null, String(monNum(m[1])), m[2]) : null;
}

/** @internal `date_parse.c` `parse_iso`: `2008-07-02`, and the unpadded `2008-7-2`. */
function parseIso(str: string): DateParts | null {
  const m = /([-+]?\d+)-(\d+)-(-?\d+)/.exec(str);
  return m ? s3e(m[1], m[2], m[3]) : null;
}

/** @internal `date_parse.c` `parse_sla`: `2012/12/13`, `01/01/2012`, `2008/07`. */
function parseSla(str: string): DateParts | null {
  const m = /([-+]?\d+)\/\s*(\d+)(?:\D\s*(-?\d+))?/.exec(str);
  return m ? s3e(m[1], m[2], m[3] ?? null) : null;
}

/** @internal `date_parse.c` `parse_dot`: `2012.12.13`, `01.01.2012`. */
function parseDot(str: string): DateParts | null {
  const m = /([-+]?\d+)\.\s*(\d+)\.\s*(-?\d+)/.exec(str);
  return m ? s3e(m[1], m[2], m[3]) : null;
}

/**
 * @internal `date_parse.c` `parse_ddd`: an all-digit run, read by its width.
 *
 * @missingRailsCall The two- and three-digit widths (a bare `:mday`, and the
 * `:yday` of `"102"`) are not read. They are only reachable once `parse_time`
 * has taken the time-of-day text out of the string, and `parse_time` is not
 * ported — without it trails would read the minutes of `"07.2008"`, which Ruby
 * rejects, as a day of the month. Raising is the safe side of that gap.
 */
function parseDdd(str: string): DateParts | null {
  const m = /([-+]?)(\d{4,14})/.exec(str);
  if (!m) return null;
  const sign = m[1] === "-" ? "-" : "";
  const digits = m[2];
  if (digits.length === 8) {
    return s3e(sign + digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8));
  }
  if (digits.length === 6) {
    return s3e(sign + digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6));
  }
  if (digits.length === 4) {
    return { mon: Number(digits.slice(0, 2)), mday: Number(digits.slice(2, 4)) };
  }
  return null;
}

/**
 * @internal `date_core.c` `rt_complete_frags` (`date_core.c:4021-4036`), which
 * fills the fields the string left out: the ones above the highest it named
 * come from `Date.today`, the ones below it are `1`. `"Feb 3rd".to_date` is
 * this year's 3 February — the case Rails tests at
 * `activesupport/test/core_ext/string_ext_test.rb:775`.
 */
function completeFrags(parts: DateParts): void {
  const today = Temporal.Now.plainDateISO();
  if (parts.year === undefined) {
    parts.year = today.year;
    if (parts.mon === undefined) parts.mon = today.month;
  }
  parts.mon ??= 1;
  parts.mday ??= 1;
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
   * Ruby `Date.parse(str, comp = true)`, which runs `Date._parse` and then
   * builds the date from the `:year`/`:mon`/`:mday` it found (ruby/date,
   * `date_core.c` `date_s_parse` → `date__parse` in `date_parse.c`).
   * `String#to_date` delegates straight to it
   * (activesupport/lib/active_support/core_ext/string/conversions.rb:47-48),
   * so every spelling its doc example lists — `"1-1-2012"`, `"01/01/2012"`,
   * `"2012-12-13"` — reaches here, and `activesupport/test/i18n_test.rb:9`
   * passes the unpadded `"2008-7-2"`.
   *
   * `comp` completes a two-digit year, which is why `"080702"` is 2008 here
   * and 0008 through Rails' `::Date.parse(self, false)`.
   */
  static parse(str: string, comp = true): Date {
    const parts = Date._parse(str, comp);
    // Ruby raises `Date::Error`, a subclass of `ArgumentError` that a nested
    // TS class cannot spell; the superclass is what callers rescue.
    if (!parts) throw new ArgumentError("invalid date");
    completeFrags(parts);
    try {
      return new Date(parts.year as number, parts.mon as number, parts.mday as number);
    } catch {
      throw new ArgumentError("invalid date");
    }
  }

  /**
   * Ruby `Date._parse(str, comp = true)` (ruby/date, `date_parse.c`
   * `date__parse`), which runs its sub-parsers in a fixed order and stops at
   * the first that matches: the alphabetic pair first, then the numeric ones.
   * Ruby answers a Hash of whatever fields it found, which is why a fragment
   * such as `"Feb 3rd"` comes back without a `:year`; `null` is the Hash no
   * sub-parser filled at all.
   *
   * @missingRailsCall `parse_time`, `parse_jis`, `parse_vms`, `parse_iso2`,
   * `parse_year`, `parse_mon`, `parse_mday` and `parse_bc` are not ported: they
   * read a time of day, which `::Date` discards, or a calendar Rails never
   * round-trips.
   */
  static _parse(str: string, comp = true): DateParts | null {
    str = parseDay(str);
    let parts: DateParts | null = null;
    if (/[a-z]/i.test(str)) {
      parts = parseEu(str) ?? parseUs(str);
    }
    parts ??= parseIso(str) ?? parseSla(str) ?? parseDot(str) ?? parseDdd(str);
    if (parts === null) return null;
    if (comp && parts._comp === true && parts.year !== undefined) {
      parts.year = compYear69(parts.year);
    }
    delete parts._comp;
    return parts;
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
