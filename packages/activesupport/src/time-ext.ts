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

import { Rational, Temporal, Time as RubyTime } from "@blazetrails/date";
import { instantFrom } from "./temporal.js";
import { ArgumentError } from "./hash-utils.js";
import { zone as timeZone } from "./time-zone-config.js";
import { TimeWithZone } from "./time-with-zone.js";
import { currentTime } from "./time-travel.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayIndex(day: string): number {
  const idx = DAY_NAMES.indexOf(day.toLowerCase());
  if (idx === -1) throw new Error(`Unknown day: ${day}`);
  return idx;
}

function clone(date: Date): Date {
  return new Date(date.getTime());
}

/**
 * Returns `Time.zone.now` when `Time.zone` or `config.time_zone` are set,
 * otherwise just returns `Time.now` — time/calculations.rb:39-41. DateTime's
 * `current` (date_time/calculations.rb:10-12) is that expression plus
 * `to_datetime`, and lives on its own receiver in
 * `core-ext/date-time/calculations.ts`.
 */
export function current(): TimeWithZone | Date {
  const zone = timeZone();
  if (zone) {
    return new TimeWithZone(instantFrom(currentTime()), zone);
  }
  return currentTime();
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

// Rails' `alias`es on the day boundaries — time/calculations.rb:241-243,
// 250-254, 264. DateTime's identical set is on its own receiver
// (core-ext/date-time/calculations.ts).
export { beginningOfDay as midnight };
export { beginningOfDay as atMidnight };
export { beginningOfDay as atBeginningOfDay };
export { middleOfDay as midday };
export { middleOfDay as noon };
export { middleOfDay as atMidday };
export { middleOfDay as atNoon };
export { middleOfDay as atMiddleOfDay };
export { endOfDay as atEndOfDay };

// ---------------------------------------------------------------------------
// Hour boundaries
// ---------------------------------------------------------------------------

export function beginningOfHour(date: Date): Temporal.Instant {
  return change(date, { min: 0 });
}

export function endOfHour(date: Date): Temporal.Instant {
  return change(date, { min: 59, sec: 59, usec: 999999999 / 1000 });
}

// time/calculations.rb:270, 281.
export { beginningOfHour as atBeginningOfHour };
export { endOfHour as atEndOfHour };

// ---------------------------------------------------------------------------
// Minute boundaries
// ---------------------------------------------------------------------------

export function beginningOfMinute(date: Date): Temporal.Instant {
  return change(date, { sec: 0 });
}

export function endOfMinute(date: Date): Temporal.Instant {
  return change(date, { sec: 59, usec: 999999999 / 1000 });
}

// time/calculations.rb:286, 295.
export { beginningOfMinute as atBeginningOfMinute };
export { endOfMinute as atEndOfMinute };

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

/**
 * `Time#seconds_since_midnight` (`core_ext/time/calculations.rb:64-66`). The
 * `DateTime` arm of the same name (`core_ext/date_time/calculations.rb:20-22`)
 * is `sec + (min * 60) + (hour * 3600)` — a whole-second count, with none of
 * this sub-second arithmetic — and lives on its own receiver in
 * `core-ext/date-time/calculations.ts`.
 */
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

export function allWeek(
  date: Date,
  startDay = 1,
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

// ---------------------------------------------------------------------------
// ago / since
// ---------------------------------------------------------------------------

export function ago(date: Date, seconds: number): Temporal.Instant {
  return since(date, -seconds);
}

export function since(date: Date, seconds: number): Temporal.Instant {
  return instantFrom(new Date(date.getTime() + seconds * 1000));
}

// `alias :in :since` — time/calculations.rb:235.
export { since as in };

// ---------------------------------------------------------------------------
// change
// ---------------------------------------------------------------------------

interface ChangeOptions {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  min?: number;
  sec?: number;
  usec?: number;
  nsec?: number;
  /** Ruby's `:offset` takes either a `"+HH:MM"` String or a seconds Integer. */
  offset?: string | number;
}

export function change(
  date: Temporal.ZonedDateTime,
  options: ChangeOptions,
): Temporal.ZonedDateTime;
export function change(date: Date, options: ChangeOptions): Temporal.Instant;
/**
 * A `::Time` receiver answers a `::Time`, as `change` does in Ruby, and takes
 * the same four terminal arms the Ruby body does — `:offset`, `utc?`, `zone`
 * and the trailing `utc_offset` one. The `zone.respond_to?(:utc_to_local)` arm
 * (time/calculations.rb:148-171) selects a receiver whose `zone` is a `TZInfo`
 * zone OBJECT, which no trails `::Time` is; its second-occurrence correction is
 * not lost with it, because `::Time.local`'s `isdst` makes the same choice.
 */
export function change(date: RubyTime, options: ChangeOptions): RubyTime;
export function change(
  date: Date | RubyTime | Temporal.ZonedDateTime,
  options: ChangeOptions,
): Temporal.Instant | RubyTime | Temporal.ZonedDateTime {
  // Ruby reads the components off the receiver; a JS `Date` spells those readers
  // differently, and reads them in the system's local zone, and a `::Time`
  // spells them on its own zone, so widen both to the one shape the arms below
  // share.
  const self =
    date instanceof Date
      ? instantFrom(date).toZonedDateTimeISO(Temporal.Now.timeZoneId())
      : date instanceof RubyTime
        ? date.toTime()
        : date;
  const nsec = self.millisecond * 1_000_000 + self.microsecond * 1_000 + self.nanosecond;

  const newYear = options.year ?? self.year;
  const newMonth = options.month ?? self.month;
  const newDay = options.day ?? self.day;
  const newHour = options.hour ?? self.hour;
  const newMin = options.min ?? (options.hour !== undefined ? 0 : self.minute);
  let newSec =
    options.sec ?? (options.hour !== undefined || options.min !== undefined ? 0 : self.second);
  const newOffset = options.offset ?? null;

  let newUsec: number;
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
    newUsec = newNsec / 1000;
  } else {
    newUsec =
      options.usec ??
      (options.hour !== undefined || options.min !== undefined || options.sec !== undefined
        ? 0
        : nsec / 1000);
  }

  if (newUsec >= 1000000) throw new ArgumentError("argument out of range");

  newSec += newUsec / 1_000_000;

  const secFloor = Math.floor(newSec);
  const newNsecOfSec = Math.round((newSec - secFloor) * 1_000_000_000);
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

  const newSecRational = new Rational(
    BigInt(newComponents.second) * 1_000_000_000n +
      BigInt(
        newComponents.millisecond * 1_000_000 +
          newComponents.microsecond * 1_000 +
          newComponents.nanosecond,
      ),
    1_000_000_000n,
  );

  // `utc?` (time/calculations.rb:147) — a `::Time` carries Ruby's own flag; a
  // JS `Date` carries none and is never `utc?`, even under `TZ=UTC`.
  const isUtc =
    date instanceof RubyTime
      ? date.isUtc()
      : date instanceof Date
        ? false
        : date.timeZoneId === "UTC";

  // `zone` (time/calculations.rb:172) — a `::Time`'s tzdata abbreviation, `nil`
  // when it was built from an offset; a JS `Date`'s is the system's.
  const zone =
    date instanceof RubyTime ? date.zone : date instanceof Date ? Temporal.Now.timeZoneId() : null;

  if (newOffset !== null) {
    // `if new_offset` (time/calculations.rb:145-146). Ruby's `::Time.new` takes
    // the offset as a `"+HH:MM"` String or a seconds Integer; Temporal spells
    // the same fixed-offset zone with the String form only.
    if (date instanceof RubyTime) {
      return new RubyTime(newYear, newMonth, newDay, newHour, newMin, newSecRational, newOffset);
    }
    const timeZone =
      typeof newOffset === "number"
        ? `${newOffset < 0 ? "-" : "+"}${String(Math.floor(Math.abs(newOffset) / 3600)).padStart(2, "0")}:${String(Math.floor((Math.abs(newOffset) % 3600) / 60)).padStart(2, "0")}`
        : newOffset;
    const newTime = Temporal.ZonedDateTime.from({ timeZone, ...newComponents });
    return date instanceof Date ? newTime.toInstant() : newTime;
  }

  if (isUtc) {
    // `elsif utc?` (time/calculations.rb:147-148).
    if (date instanceof RubyTime) {
      return RubyTime.utc(newYear, newMonth, newDay, newHour, newMin, newSecRational);
    }
    return Temporal.ZonedDateTime.from({ timeZone: "UTC", ...newComponents });
  }

  // `elsif zone.respond_to?(:utc_to_local)` (time/calculations.rb:148-171) —
  // only a `Temporal.ZonedDateTime` carries a zone object to reach it.
  if (date instanceof Temporal.ZonedDateTime) {
    let newTime = Temporal.ZonedDateTime.from(
      { timeZone: date.timeZoneId, ...newComponents },
      // Ruby's `Time.new` with a zone object picks the first chronological
      // occurrence of an ambiguous nominal time; `"compatible"` is the same choice.
      { disambiguation: "compatible" },
    );

    // Some versions of Ruby have a bug where Time.new with a zone object and
    // fractional seconds will end up with a broken utc_offset.
    // This is fixed in Ruby 3.3.1 and 3.2.4
    if (!Number.isInteger(newTime.offsetNanoseconds)) {
      newTime = newTime.add({ nanoseconds: 0 });
    }

    // When there are two occurrences of a nominal time due to DST ending,
    // `Time.new` chooses the first chronological occurrence (the one with a
    // larger UTC offset). However, for `change`, we want to choose the
    // occurrence that matches this time's UTC offset.
    //
    // If the new time's UTC offset is larger than this time's UTC offset, the
    // new time might be a first chronological occurrence. So we add the offset
    // difference to fast-forward the new time, and check if the result has the
    // desired UTC offset (i.e. is the second chronological occurrence).
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

  if (zone !== null) {
    // `elsif zone` (time/calculations.rb:172-175) — `::Time.local` in Ruby's
    // reversed component order, `isdst` picking the occurrence of a wall clock a
    // DST fall-back repeats. A JS `Date` has no `isdst` and only milliseconds.
    const newTime = RubyTime.local(
      newSecRational,
      newMin,
      newHour,
      newDay,
      newMonth,
      newYear,
      null,
      null,
      date instanceof RubyTime ? date.isdst : null,
      null,
    );
    return date instanceof Date
      ? Temporal.Instant.fromEpochMilliseconds(newTime.toTime().epochMilliseconds)
      : newTime;
  }

  // `else ::Time.new(..., utc_offset)` (time/calculations.rb:176-177) — a
  // `::Time` built from an offset has no zone to answer.
  return new RubyTime(
    newYear,
    newMonth,
    newDay,
    newHour,
    newMin,
    newSecRational,
    (date as RubyTime).utcOffset,
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
 * secFraction — returns the sub-second fraction of the receiver as a float.
 */
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

// `DateTime#subsec` is `sec_fraction` (date_time/calculations.rb:36-38); the
// Time direction is the mirror image (`Time#sec_fraction` is `subsec`,
// time/calculations.rb:107-109), so one function answers both names.
export { secFraction as subsec };

/**
 * Creates a Time instance from an RFC 3339 string — time/calculations.rb:68-81.
 *
 *   rfc3339("1999-12-31T14:00:00-10:00") // => 2000-01-01 00:00:00 UTC
 *
 * If the time or offset components are missing then an ArgumentError is raised,
 * mirroring Rails' `raise ArgumentError, "invalid date" if parts.empty?` — Ruby's
 * `Date._rfc3339` answers an empty hash for anything that is not a full
 * date-time-with-offset.
 */
export function rfc3339(str: string): Temporal.Instant {
  const parts =
    /^(-?\d{4,})-(\d\d)-(\d\d)[Tt ](\d\d):(\d\d):(\d\d)(\.\d+)?([Zz]|[+-]\d\d:\d\d)$/.exec(str);
  if (!parts) throw new ArgumentError("invalid date");
  const ms = Date.parse(str.replace(" ", "T"));
  if (Number.isNaN(ms)) throw new ArgumentError("invalid date");
  return instantFrom(new Date(ms));
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
