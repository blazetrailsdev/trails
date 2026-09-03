/**
 * Time/Date extension functions following Rails' ActiveSupport::CoreExt::Time
 * and ActiveSupport::CoreExt::Date patterns.
 *
 * @boundary-file: Helpers accept JavaScript `Date` inputs for ergonomic interop
 *   with code that still holds Date values. Period-bound, navigation,
 *   arithmetic, and coercion helpers all return `Temporal.*` types
 *   (`Temporal.Instant` for time-of-day helpers, `Temporal.PlainDate` for
 *   `toDate`). Predicates (`isPast`, `isFuture`) accept `Date | Temporal.Instant`.
 */

import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { advance as timeAdvance, change as timeChange } from "./core-ext/time/calculations.js";
import { instantFrom } from "./temporal.js";
import { ArgumentError } from "./hash-utils.js";
import { zone as timeZone } from "./time-zone-config.js";
import { TimeWithZone } from "./time-with-zone.js";
import { currentTime } from "./time-travel.js";
import {
  DAYS_INTO_WEEK,
  lastWeek,
  nextWeek,
  prevWeek,
} from "./core-ext/date-and-time/calculations.js";
import { beginningOfWeek as beginningOfWeekDefault } from "./core-ext/date/calculations.js";
import { KeyError } from "@blazetrails/ruby-compat";

export { nextWeek, prevWeek, lastWeek };

function dayIndex(day: string): number {
  const idx = DAYS_INTO_WEEK[day.toLowerCase()];
  if (idx === undefined) throw new KeyError(`key not found: :${day}`);
  return idx;
}

function clone(date: Date): Date {
  return new Date(date.getTime());
}

export function current(): TimeWithZone | Date {
  const zone = timeZone();
  if (zone) {
    return new TimeWithZone(instantFrom(currentTime()), zone);
  }
  return currentTime();
}

export function beginningOfDay(date: Date): Temporal.Instant {
  return change(date, { hour: 0 });
}

export function middleOfDay(date: Date): Temporal.Instant {
  return change(date, { hour: 12 });
}

/** @missingRailsArgs change — PERMANENT */
export function endOfDay(date: Date): Temporal.Instant {
  return change(date, { hour: 23, min: 59, sec: 59, usec: new Rational(999999999, 1000) });
}

export { beginningOfDay as midnight };
export { beginningOfDay as atMidnight };
export { beginningOfDay as atBeginningOfDay };
export { middleOfDay as midday };
export { middleOfDay as noon };
export { middleOfDay as atMidday };
export { middleOfDay as atNoon };
export { middleOfDay as atMiddleOfDay };
export { endOfDay as atEndOfDay };

export function beginningOfHour(date: Date): Temporal.Instant {
  return change(date, { min: 0 });
}

/** @missingRailsArgs change — PERMANENT */
export function endOfHour(date: Date): Temporal.Instant {
  return change(date, { min: 59, sec: 59, usec: new Rational(999999999, 1000) });
}

export { beginningOfHour as atBeginningOfHour };
export { endOfHour as atEndOfHour };

export function beginningOfMinute(date: Date): Temporal.Instant {
  return change(date, { sec: 0 });
}

/** @missingRailsArgs change — PERMANENT */
export function endOfMinute(date: Date): Temporal.Instant {
  return change(date, { sec: 59, usec: new Rational(999999999, 1000) });
}

export { beginningOfMinute as atBeginningOfMinute };
export { endOfMinute as atEndOfMinute };

/** @internal */
function _beginningOfWeekDate(date: Date, startDay: string = beginningOfWeekDefault()): Date {
  const d = clone(date);
  const currentDay = d.getDay();
  let diff = currentDay - dayIndex(startDay);
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function beginningOfWeek(
  date: Date,
  startDay: string = beginningOfWeekDefault(),
): Temporal.Instant {
  return instantFrom(_beginningOfWeekDate(date, startDay));
}

export function endOfWeek(
  date: Date,
  startDay: string = beginningOfWeekDefault(),
): Temporal.Instant {
  const d = _beginningOfWeekDate(date, startDay);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return instantFrom(d);
}

export function beginningOfMonth(date: Date): Temporal.Instant {
  const d = clone(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return instantFrom(d);
}

export function endOfMonth(date: Date): Temporal.Instant {
  const d = clone(date);
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() - 1);
  return instantFrom(d);
}

export function beginningOfQuarter(date: Date): Temporal.Instant {
  const d = clone(date);
  const month = d.getMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  d.setMonth(quarterStartMonth, 1);
  d.setHours(0, 0, 0, 0);
  return instantFrom(d);
}

export function endOfQuarter(date: Date): Temporal.Instant {
  const d = clone(date);
  const month = d.getMonth();
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
  d.setMonth(quarterEndMonth + 1, 1);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() - 1);
  return instantFrom(d);
}

export function beginningOfYear(date: Date): Temporal.Instant {
  const d = clone(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return instantFrom(d);
}

export function endOfYear(date: Date): Temporal.Instant {
  const d = clone(date);
  d.setMonth(11, 31);
  d.setHours(23, 59, 59, 999);
  return instantFrom(d);
}

export function nextMonth(date: Date, months = 1): Temporal.Instant {
  return advance(date, { months: months });
}

export function prevMonth(date: Date, months = 1): Temporal.Instant {
  return advance(date, { months: -months });
}

export function nextYear(date: Date, years = 1): Temporal.Instant {
  return advance(date, { years: years });
}

export function prevYear(date: Date, years = 1): Temporal.Instant {
  return advance(date, { years: -years });
}

export function nextDay(date: Date, days = 1): Temporal.Instant {
  return advance(date, { days: days });
}

export function prevDay(date: Date, days = 1): Temporal.Instant {
  return advance(date, { days: -days });
}

export { nextDay as tomorrow, prevDay as yesterday };

export function nextOccurring(date: Date, day: string): Temporal.Instant {
  const targetDay = dayIndex(day);
  const d = clone(date);
  let diff = targetDay - d.getDay();
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return instantFrom(d);
}

export function prevOccurring(date: Date, day: string): Temporal.Instant {
  const targetDay = dayIndex(day);
  const d = clone(date);
  let diff = d.getDay() - targetDay;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() - diff);
  return instantFrom(d);
}

interface AdvanceOptions {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export function advance(date: Date, options: AdvanceOptions): Temporal.Instant;
export function advance(date: RubyTime, options: AdvanceOptions): RubyTime;
export function advance(
  date: Date | RubyTime,
  options: AdvanceOptions,
): Temporal.Instant | RubyTime {
  if (date instanceof RubyTime) return timeAdvance.call(date, options);

  options = { ...options };

  if (options.weeks != null) {
    const partialWeeks = options.weeks - Math.floor(options.weeks);
    options.weeks = Math.floor(options.weeks);
    options.days = (options.days ?? 0) + 7 * partialWeeks;
  }

  if (options.days != null) {
    const partialDays = options.days - Math.floor(options.days);
    options.days = Math.floor(options.days);
    options.hours = (options.hours ?? 0) + 24 * partialDays;
  }

  let d = toDate(date);
  if (options.years) d = d.add({ months: options.years * 12 });
  if (options.months) d = d.add({ months: options.months });
  if (options.weeks) d = d.add({ days: options.weeks * 7 });
  if (options.days) d = d.add({ days: options.days });

  const timeAdvancedByDate = change(date, { year: d.year, month: d.month, day: d.day });
  const secondsToAdvance =
    (options.seconds ?? 0) + (options.minutes ?? 0) * 60 + (options.hours ?? 0) * 3600;

  if (secondsToAdvance === 0) {
    return timeAdvancedByDate;
  } else {
    return since(timeAdvancedByDate, secondsToAdvance);
  }
}

export function secondsSinceMidnight(date: Date): number {
  return (
    Math.floor(date.getTime() / 1000) -
    Math.floor(change(date, { hour: 0 }).epochMilliseconds / 1000) +
    (date.getMilliseconds() * 1000) / 1.0e6
  );
}

export function secondsUntilEndOfDay(date: Date): number {
  return Math.floor(endOfDay(date).epochMilliseconds / 1000) - Math.floor(date.getTime() / 1000);
}

export function leapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function daysInYear(year: number): number {
  return daysInMonth(2, year) + 337;
}

export function allDay(date: Date): { start: Temporal.Instant; end: Temporal.Instant } {
  return { start: beginningOfDay(date), end: endOfDay(date) };
}

export function allWeek(
  date: Date,
  startDay: string = beginningOfWeekDefault(),
): { start: Temporal.Instant; end: Temporal.Instant } {
  return { start: beginningOfWeek(date, startDay), end: endOfWeek(date, startDay) };
}

export function allMonth(date: Date): { start: Temporal.Instant; end: Temporal.Instant } {
  return { start: beginningOfMonth(date), end: endOfMonth(date) };
}

export function allQuarter(date: Date): { start: Temporal.Instant; end: Temporal.Instant } {
  return { start: beginningOfQuarter(date), end: endOfQuarter(date) };
}

export function allYear(date: Date): { start: Temporal.Instant; end: Temporal.Instant } {
  return { start: beginningOfYear(date), end: endOfYear(date) };
}

export function ago(date: Date, seconds: number): Temporal.Instant {
  return since(date, -seconds);
}

export function since(date: Date | Temporal.Instant, seconds: number): Temporal.Instant {
  // boundary: the `Time` arm's receiver is a JS `Date`, and a chained call — as
  const epochMilliseconds = date instanceof Date ? date.getTime() : date.epochMilliseconds;
  return instantFrom(new Date(epochMilliseconds + seconds * 1000));
}

export { since as in };

interface ChangeOptions {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  min?: number;
  sec?: number;
  usec?: number | Rational;
  nsec?: number;
  offset?: string | number;
}

export function change(
  date: Temporal.ZonedDateTime,
  options: ChangeOptions,
): Temporal.ZonedDateTime;
export function change(date: Date, options: ChangeOptions): Temporal.Instant;
export function change(date: RubyTime, options: ChangeOptions): RubyTime;
export function change(
  date: Date | RubyTime | Temporal.ZonedDateTime,
  options: ChangeOptions,
): Temporal.Instant | RubyTime | Temporal.ZonedDateTime {
  if (date instanceof RubyTime) return timeChange.call(date, options);

  const self =
    date instanceof Date ? instantFrom(date).toZonedDateTimeISO(Temporal.Now.timeZoneId()) : date;
  const nsec = self.millisecond * 1_000_000 + self.microsecond * 1_000 + self.nanosecond;

  const newYear = options.year ?? self.year;
  const newMonth = options.month ?? self.month;
  const newDay = options.day ?? self.day;
  const newHour = options.hour ?? self.hour;
  const newMin = options.min ?? (options.hour !== undefined ? 0 : self.minute);
  let newSec = new Rational(
    options.sec ?? (options.hour !== undefined || options.min !== undefined ? 0 : self.second),
    1,
  );
  const newOffset = options.offset ?? null;

  let newUsec: Rational;
  const newNsec = options.nsec;
  if (newNsec !== undefined) {
    if (options.usec !== undefined) {
      throw new ArgumentError(
        `Can't change both :nsec and :usec at the same time: {${Object.entries(options)
          .map(
            ([key, value]) => `${key}: ${typeof value === "string" ? `"${value}"` : String(value)}`,
          )
          .join(", ")}}`,
      );
    }
    newUsec = new Rational(newNsec, 1000);
  } else {
    const usec = options.usec;
    newUsec =
      usec !== undefined
        ? usec instanceof Rational
          ? usec
          : new Rational(usec, 1)
        : options.hour !== undefined || options.min !== undefined || options.sec !== undefined
          ? new Rational(0, 1)
          : new Rational(nsec, 1000);
  }

  if (newUsec.cmp(1000000) >= 0) throw new ArgumentError("argument out of range");

  newSec = newSec.add(newUsec.quo(1_000_000));

  const secFloor = newSec.div(1);
  const newNsecOfSec = newSec.add(-secFloor).mul(1_000_000_000).toI();
  const newComponents = {
    year: newYear,
    month: newMonth,
    day: newDay,
    hour: newHour,
    minute: newMin,
    second: secFloor,
    millisecond: Math.floor(newNsecOfSec / 1_000_000),
    microsecond: Math.floor(newNsecOfSec / 1_000) % 1_000,
    nanosecond: newNsecOfSec % 1_000,
  };

  const isUtc = date instanceof Date ? false : date.timeZoneId === "UTC";

  if (newOffset !== null) {
    const timeZone =
      typeof newOffset === "number"
        ? `${newOffset < 0 ? "-" : "+"}${String(Math.floor(Math.abs(newOffset) / 3600)).padStart(2, "0")}:${String(Math.floor((Math.abs(newOffset) % 3600) / 60)).padStart(2, "0")}`
        : newOffset;
    const newTime = Temporal.ZonedDateTime.from({ timeZone, ...newComponents });
    return date instanceof Date ? newTime.toInstant() : newTime;
  }

  if (isUtc) {
    return Temporal.ZonedDateTime.from({ timeZone: "UTC", ...newComponents });
  }

  if (date instanceof Temporal.ZonedDateTime) {
    let newTime = Temporal.ZonedDateTime.from(
      { timeZone: date.timeZoneId, ...newComponents },
      { disambiguation: "compatible" },
    );

    if (!Number.isInteger(newTime.offsetNanoseconds)) {
      newTime = newTime.add({ nanoseconds: 0 });
    }

    const offsetDifference = newTime.offsetNanoseconds - date.offsetNanoseconds;
    let newTime2: Temporal.ZonedDateTime;
    if (
      offsetDifference > 0 &&
      (newTime2 = newTime.add({ nanoseconds: offsetDifference })).offsetNanoseconds ===
        date.offsetNanoseconds
    ) {
      return newTime2;
    } else {
      return newTime;
    }
  }

  const newTime = RubyTime.local(
    newSec,
    newMin,
    newHour,
    newDay,
    newMonth,
    newYear,
    null,
    null,
    null,
    null,
  );
  return Temporal.Instant.fromEpochMilliseconds(newTime.toTime().epochMilliseconds);
}

export function onWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function onWeekend(date: Date): boolean {
  return !onWeekday(date);
}

export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function isTomorrow(date: Date): boolean {
  const tomorrow = new Date(nextDay(new Date()).epochMilliseconds);
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  );
}

export function isYesterday(date: Date): boolean {
  const yesterday = new Date(prevDay(new Date()).epochMilliseconds);
  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  );
}

export function isPast(date: Date | Temporal.Instant): boolean {
  const instant = date instanceof Date ? instantFrom(date) : date;
  return Temporal.Instant.compare(instant, Temporal.Now.instant()) < 0;
}

export function isFuture(date: Date | Temporal.Instant): boolean {
  const instant = date instanceof Date ? instantFrom(date) : date;
  return Temporal.Instant.compare(instant, Temporal.Now.instant()) > 0;
}

export function floor(date: Date, ms: number): Temporal.Instant {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError(`floor: ms must be a positive finite number, got ${ms}`);
  }
  return instantFrom(new Date(Math.floor(date.getTime() / ms) * ms));
}

export function ceil(date: Date, ms: number): Temporal.Instant {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError(`ceil: ms must be a positive finite number, got ${ms}`);
  }
  return instantFrom(new Date(Math.ceil(date.getTime() / ms) * ms));
}

export function secFraction(datetime: Temporal.PlainDateTime | Temporal.ZonedDateTime): number;
export function secFraction(date: Date): number;
export function secFraction(
  receiver: Date | Temporal.PlainDateTime | Temporal.ZonedDateTime,
): number {
  if (!(receiver instanceof Date)) {
    return (
      receiver.millisecond / 1_000 +
      receiver.microsecond / 1_000_000 +
      receiver.nanosecond / 1_000_000_000
    );
  }
  return receiver.getMilliseconds() / 1000;
}

export { secFraction as subsec };

export function rfc3339(str: string): Temporal.Instant {
  const parts =
    /^(-?\d{4,})-(\d\d)-(\d\d)[Tt ](\d\d):(\d\d):(\d\d)(\.\d+)?([Zz]|[+-]\d\d:\d\d)$/.exec(str);
  if (!parts) throw new ArgumentError("invalid date");
  const ms = Date.parse(str.replace(" ", "T"));
  if (Number.isNaN(ms)) throw new ArgumentError("invalid date");
  return instantFrom(new Date(ms));
}

export function toDate(date: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function instantToS(instant: Temporal.Instant): string {
  const zdt = instant.toZonedDateTimeISO("UTC");
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const year = String(zdt.year).padStart(4, "0");
  return (
    `${year}-${pad2(zdt.month)}-${pad2(zdt.day)} ` +
    `${pad2(zdt.hour)}:${pad2(zdt.minute)}:${pad2(zdt.second)} UTC`
  );
}
