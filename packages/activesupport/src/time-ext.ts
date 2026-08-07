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

import { Temporal } from "@blazetrails/date";
import { instantFrom } from "./temporal.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayIndex(day: string): number {
  const idx = DAY_NAMES.indexOf(day.toLowerCase());
  if (idx === -1) throw new Error(`Unknown day: ${day}`);
  return idx;
}

function clone(date: Date): Date {
  return new Date(date.getTime());
}

// ---------------------------------------------------------------------------
// Day boundaries
// ---------------------------------------------------------------------------

export function beginningOfDay(date: Date): Temporal.Instant {
  return change(date, { hour: 0 });
}

export function middleOfDay(date: Date): Temporal.Instant {
  return change(date, { hour: 12 });
}

export function endOfDay(date: Date): Temporal.Instant {
  return change(date, { hour: 23, min: 59, sec: 59, usec: 999999999 / 1000 });
}

// ---------------------------------------------------------------------------
// Hour boundaries
// ---------------------------------------------------------------------------

export function beginningOfHour(date: Date): Temporal.Instant {
  return change(date, { min: 0 });
}

export function endOfHour(date: Date): Temporal.Instant {
  return change(date, { min: 59, sec: 59, usec: 999999999 / 1000 });
}

// ---------------------------------------------------------------------------
// Minute boundaries
// ---------------------------------------------------------------------------

export function beginningOfMinute(date: Date): Temporal.Instant {
  return change(date, { sec: 0 });
}

export function endOfMinute(date: Date): Temporal.Instant {
  return change(date, { sec: 59, usec: 999999999 / 1000 });
}

// ---------------------------------------------------------------------------
// Week boundaries
// startDay: 0 = Sunday, 1 = Monday (default Rails)
// ---------------------------------------------------------------------------

/** @internal */
function _beginningOfWeekDate(date: Date, startDay = 1): Date {
  const d = clone(date);
  const currentDay = d.getDay();
  let diff = currentDay - startDay;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function beginningOfWeek(date: Date, startDay = 1): Temporal.Instant {
  return instantFrom(_beginningOfWeekDate(date, startDay));
}

export function endOfWeek(date: Date, startDay = 1): Temporal.Instant {
  const d = _beginningOfWeekDate(date, startDay);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return instantFrom(d);
}

// ---------------------------------------------------------------------------
// Month boundaries
// ---------------------------------------------------------------------------

export function beginningOfMonth(date: Date): Temporal.Instant {
  const d = clone(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return instantFrom(d);
}

export function endOfMonth(date: Date): Temporal.Instant {
  const d = clone(date);
  // First day of next month, then go back 1ms
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() - 1);
  return instantFrom(d);
}

// ---------------------------------------------------------------------------
// Quarter boundaries
// ---------------------------------------------------------------------------

export function beginningOfQuarter(date: Date): Temporal.Instant {
  const d = clone(date);
  const month = d.getMonth(); // 0-11
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

// ---------------------------------------------------------------------------
// Year boundaries
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// next/prev Week/Month/Year/Day
// ---------------------------------------------------------------------------

export function nextWeek(date: Date, day = "monday"): Temporal.Instant {
  const targetDay = dayIndex(day);
  const d = clone(date);
  d.setDate(d.getDate() + 7);
  const bow = _beginningOfWeekDate(d, 1); // Monday-based
  const diff = (targetDay - 1 + 7) % 7; // offset from Monday
  bow.setDate(bow.getDate() + diff);
  bow.setHours(0, 0, 0, 0);
  return instantFrom(bow);
}

export function prevWeek(date: Date, day = "monday"): Temporal.Instant {
  const targetDay = dayIndex(day);
  const d = clone(date);
  d.setDate(d.getDate() - 7);
  const bow = _beginningOfWeekDate(d, 1);
  const diff = (targetDay - 1 + 7) % 7;
  bow.setDate(bow.getDate() + diff);
  bow.setHours(0, 0, 0, 0);
  return instantFrom(bow);
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

// Alias used in Rails
export { nextDay as tomorrow, prevDay as yesterday };

// ---------------------------------------------------------------------------
// next/prev occurring
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// advance
// ---------------------------------------------------------------------------

/**
 * Rails' `Time#advance` (time/calculations.rb:194-217) writes the normalised
 * `:weeks` / `:days` back into the caller's hash, but `Date#advance`
 * (date/calculations.rb:127-136) reads it only — and Rails asserts that
 * difference (`test_date_advance_should_not_change_passed_options_hash`,
 * date_ext_test.rb:367-371). One TS function stands in for both reopenings, so
 * it takes the non-mutating arm and normalises into a copy.
 */
export function advance(
  date: Date,
  options: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  },
): Temporal.Instant {
  options = { ...options };

  if (options.weeks != null) {
    const partialWeeks = options.weeks - Math.trunc(options.weeks);
    options.weeks = Math.trunc(options.weeks);
    options.days = (options.days ?? 0) + 7 * partialWeeks;
  }

  if (options.days != null) {
    const partialDays = options.days - Math.trunc(options.days);
    options.days = Math.trunc(options.days);
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
    return since(new Date(timeAdvancedByDate.epochMilliseconds), secondsToAdvance);
  }
}

// ---------------------------------------------------------------------------
// Seconds calculations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Days/year helpers
// ---------------------------------------------------------------------------

export function leapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number): number {
  // month is 1-indexed
  return new Date(year, month, 0).getDate();
}

export function daysInYear(year: number): number {
  return daysInMonth(2, year) + 337;
}

// ---------------------------------------------------------------------------
// all* ranges
// ---------------------------------------------------------------------------

export function allDay(date: Date): { start: Temporal.Instant; end: Temporal.Instant } {
  return { start: beginningOfDay(date), end: endOfDay(date) };
}

export function allWeek(date: Date): { start: Temporal.Instant; end: Temporal.Instant } {
  return { start: beginningOfWeek(date), end: endOfWeek(date) };
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

// ---------------------------------------------------------------------------
// ago / since
// ---------------------------------------------------------------------------

export function ago(date: Date, seconds: number): Temporal.Instant {
  return since(date, -seconds);
}

export function since(date: Date, seconds: number): Temporal.Instant {
  return instantFrom(new Date(date.getTime() + seconds * 1000));
}

// ---------------------------------------------------------------------------
// change
// ---------------------------------------------------------------------------

export function change(
  date: Date,
  options: {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    min?: number;
    sec?: number;
    usec?: number;
  },
): Temporal.Instant {
  const newYear = options.year ?? date.getFullYear();
  const newMonth = options.month ?? date.getMonth() + 1; // 1-indexed
  const newDay = options.day ?? date.getDate();
  const newHour = options.hour ?? date.getHours();
  const newMin = options.min ?? (options.hour !== undefined ? 0 : date.getMinutes());
  const newSec =
    options.sec ??
    (options.hour !== undefined || options.min !== undefined ? 0 : date.getSeconds());
  const newUsec =
    options.usec ??
    (options.hour !== undefined || options.min !== undefined || options.sec !== undefined
      ? 0
      : date.getMilliseconds() * 1000);

  return instantFrom(
    new Date(newYear, newMonth - 1, newDay, newHour, newMin, newSec, Math.floor(newUsec / 1000)),
  );
}

// ---------------------------------------------------------------------------
// Boolean predicates
// ---------------------------------------------------------------------------

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

/**
 * floor — rounds time down to nearest multiple of ms.
 */
export function floor(date: Date, ms: number): Temporal.Instant {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError(`floor: ms must be a positive finite number, got ${ms}`);
  }
  return instantFrom(new Date(Math.floor(date.getTime() / ms) * ms));
}

/**
 * ceil — rounds time up to nearest multiple of ms.
 */
export function ceil(date: Date, ms: number): Temporal.Instant {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError(`ceil: ms must be a positive finite number, got ${ms}`);
  }
  return instantFrom(new Date(Math.ceil(date.getTime() / ms) * ms));
}

/**
 * secFraction — returns the sub-second fraction of a Date as a float.
 */
export function secFraction(date: Date): number {
  return date.getMilliseconds() / 1000;
}

/**
 * toFs — formats a Date as a string using various named formats.
 */
export function toFs(date: Date, format: string = "default"): string {
  switch (format) {
    case "db":
      return date
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, "");
    case "long":
      return (
        date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
        " " +
        date.toTimeString().slice(0, 8)
      );
    case "short":
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " +
        date.toTimeString().slice(0, 5)
      );
    case "rfc822":
    case "rfc2822":
      return date.toUTCString();
    case "iso8601":
    case "xmlschema":
      return date.toISOString();
    case "inspect":
      return date.toISOString();
    default:
      return (
        date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
        " " +
        date.toTimeString().slice(0, 8)
      );
  }
}

/**
 * xmlschema — returns ISO 8601 representation.
 */
export function xmlschema(date: Date): string {
  return date.toISOString();
}

/**
 * lastWeek — returns the start of last week.
 */
export function lastWeek(date: Date, startDay = "monday"): Temporal.Instant {
  return prevWeek(date, startDay);
}

/**
 * toDate — Rails `Time#to_date`. Returns the calendar date in local time.
 */
export function toDate(date: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

/**
 * toTime — Rails `Time#to_time`. Returns the instant the Date refers to.
 */
export function toTime(date: Date): Temporal.Instant {
  return instantFrom(date);
}

/**
 * instantToS — Rails `Time#to_s` for a UTC `Temporal.Instant`.
 * Returns `"YYYY-MM-DD HH:MM:SS UTC"` — the default Ruby format for UTC times.
 * @internal
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

/**
 * formattedOffset — returns the UTC offset formatted as ±HH:MM.
 */
export function formattedOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const h = String(Math.floor(absMin / 60)).padStart(2, "0");
  const m = String(absMin % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}
