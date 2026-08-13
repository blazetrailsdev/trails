/**
 * The `Date` arm of ActiveSupport's calculations reopenings
 * (`core_ext/date/calculations.rb`). Rails keeps `Date` and `Time` as separate
 * receivers: a `Date` is a calendar day with no time-of-day and no zone, so its
 * time-of-day calculations first widen the day into a zoned `Time` through
 * `in_time_zone` and then delegate to the `Time` arm. `time-ext.ts` takes a JS
 * `Date` — always an instant — and is that `Time` arm; this file is the `Date`
 * one, keyed on `Temporal.PlainDate`, the calendar-day analogue.
 *
 * Mirrors: `class Date` (`core_ext/date/calculations.rb`)
 */

import { Temporal } from "@blazetrails/date";
import { Duration } from "../../duration.js";
import { IsolatedExecutionState } from "../../isolated-execution-state.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { ArgumentError, getZone } from "../../time-zone-config.js";
// `core_ext/date/zones.rb` — `Date.include DateAndTime::Zones`; the Date arm's
// `in_time_zone` is that mixin's, not a Date-local method.
import { inTimeZone } from "../date-and-time/zones.js";

/**
 * Mirrors: `DateAndTime::Calculations::DAYS_INTO_WEEK`
 * (`core_ext/date_and_time/calculations.rb:8-16`) — the week-start day names
 * `Date.beginning_of_week=` validates against.
 */
const DAYS_INTO_WEEK: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const BEGINNING_OF_WEEK = "beginning_of_week";

let _beginningOfWeekDefault: string | null = null;

/** Mirrors: `Date.beginning_of_week_default` (`date/calculations.rb:14`) */
export function beginningOfWeekDefault(): string | null {
  return _beginningOfWeekDefault;
}

/** Mirrors: `Date.beginning_of_week_default=` (`date/calculations.rb:14`) */
export function setBeginningOfWeekDefault(weekStart: string | null): void {
  _beginningOfWeekDefault = weekStart;
}

/** Mirrors: `Date.beginning_of_week` (`date/calculations.rb:19-21`) */
export function beginningOfWeek(): string {
  return (
    IsolatedExecutionState.get<string>(BEGINNING_OF_WEEK) ?? beginningOfWeekDefault() ?? "monday"
  );
}

/** Mirrors: `Date.beginning_of_week=` (`date/calculations.rb:27-29`) */
export function setBeginningOfWeek(weekStart: string): void {
  IsolatedExecutionState.set(BEGINNING_OF_WEEK, findBeginningOfWeekBang(weekStart));
}

/** Mirrors: `Date.find_beginning_of_week!` (`date/calculations.rb:32-35`) */
export function findBeginningOfWeekBang(weekStart: string): string {
  if (!Object.prototype.hasOwnProperty.call(DAYS_INTO_WEEK, weekStart)) {
    throw new ArgumentError(`Invalid beginning of week: ${weekStart}`);
  }
  return weekStart;
}

/** Mirrors: `Date.yesterday` (`date/calculations.rb:38-40`) */
export function yesterday(): Temporal.PlainDate {
  return advance(current(), { days: -1 });
}

/** Mirrors: `Date.tomorrow` (`date/calculations.rb:43-45`) */
export function tomorrow(): Temporal.PlainDate {
  return advance(current(), { days: 1 });
}

/** Mirrors: `Date.current` (`date/calculations.rb:48-50`) */
export function current(): Temporal.PlainDate {
  const zone = getZone();
  if (zone) {
    const today = zone.today();
    return new Temporal.PlainDate(today.year, today.month, today.day);
  }
  return Temporal.Now.plainDateISO();
}

/** Mirrors: `Date#ago` (`date/calculations.rb:55-57`) */
export function ago(date: Temporal.PlainDate, seconds: number): TimeWithZone {
  return inTimeZone(date).since(-seconds);
}

/** Mirrors: `Date#since` (`date/calculations.rb:61-63`) */
export function since(date: Temporal.PlainDate, seconds: number): TimeWithZone {
  return inTimeZone(date).since(seconds);
}

/**
 * Mirrors: `alias :in :since` (`date/calculations.rb:64`). `in` is a reserved
 * word, so it cannot be a binding name; the export name can be one, and that
 * is the name importers and the comparator see.
 */
export { since as in };

/** Mirrors: `Date#beginning_of_day` (`date/calculations.rb:67-69`) */
export function beginningOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date);
}

/** Mirrors: `alias :midnight :beginning_of_day` (`date/calculations.rb:70`) */
export const midnight = beginningOfDay;

/** Mirrors: `alias :at_midnight :beginning_of_day` (`date/calculations.rb:71`) */
export const atMidnight = beginningOfDay;

/** Mirrors: `alias :at_beginning_of_day :beginning_of_day` (`date/calculations.rb:72`) */
export const atBeginningOfDay = beginningOfDay;

/** Mirrors: `Date#middle_of_day` (`date/calculations.rb:75-77`) */
export function middleOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date).middleOfDay();
}

/** Mirrors: `alias :midday :middle_of_day` (`date/calculations.rb:78`) */
export const midday = middleOfDay;

/** Mirrors: `alias :noon :middle_of_day` (`date/calculations.rb:79`) */
export const noon = middleOfDay;

/** Mirrors: `alias :at_midday :middle_of_day` (`date/calculations.rb:80`) */
export const atMidday = middleOfDay;

/** Mirrors: `alias :at_noon :middle_of_day` (`date/calculations.rb:81`) */
export const atNoon = middleOfDay;

/** Mirrors: `alias :at_middle_of_day :middle_of_day` (`date/calculations.rb:82`) */
export const atMiddleOfDay = middleOfDay;

/** Mirrors: `Date#end_of_day` (`date/calculations.rb:85-87`) */
export function endOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date).endOfDay();
}

/** Mirrors: `alias :at_end_of_day :end_of_day` (`date/calculations.rb:88`) */
export const atEndOfDay = endOfDay;

/** Mirrors: `Date#plus_with_duration` (`date/calculations.rb:90-96`) */
export function plusWithDuration(
  date: Temporal.PlainDate,
  other: Duration | number,
): Temporal.PlainDate | TimeWithZone {
  if (other instanceof Duration) {
    return other.since(date);
  } else {
    return plusWithoutDuration(date, other);
  }
}

/**
 * Mirrors: `alias_method :plus_without_duration, :+` (`date/calculations.rb:97`)
 * — ruby/date's own `Date#+`, which answers the day `other` days later
 * (`date_core.c` `d_lite_plus`).
 */
export function plusWithoutDuration(date: Temporal.PlainDate, other: number): Temporal.PlainDate {
  return date.add({ days: other });
}

/** Mirrors: `Date#minus_with_duration` (`date/calculations.rb:100-106`) */
export function minusWithDuration(
  date: Temporal.PlainDate,
  other: Duration | number | Temporal.PlainDate,
): Temporal.PlainDate | TimeWithZone | number {
  if (other instanceof Duration) {
    return plusWithDuration(date, other.negate());
  } else {
    return minusWithoutDuration(date, other);
  }
}

/**
 * Mirrors: `alias_method :minus_without_duration, :-` (`date/calculations.rb:107`)
 * — ruby/date's own `Date#-`, which answers a day count against another Date
 * and the day `other` days earlier against a number (`date_core.c`
 * `d_lite_minus`).
 */
export function minusWithoutDuration(
  date: Temporal.PlainDate,
  other: number | Temporal.PlainDate,
): Temporal.PlainDate | number {
  if (other instanceof Temporal.PlainDate) {
    return date.since(other, { largestUnit: "day" }).days;
  }
  return date.subtract({ days: other });
}

/** Mirrors: `Date#advance` (`date/calculations.rb:127-135`) */
export function advance(
  date: Temporal.PlainDate,
  options: { years?: number; months?: number; weeks?: number; days?: number },
): Temporal.PlainDate {
  let d = date;

  if (options.years != null) d = d.add({ months: options.years * 12 });
  if (options.months != null) d = d.add({ months: options.months });
  if (options.weeks != null) d = d.add({ days: options.weeks * 7 });
  if (options.days != null) d = d.add({ days: options.days });

  return d;
}

/** Mirrors: `Date#change` (`date/calculations.rb:143-149`) */
export function change(
  date: Temporal.PlainDate,
  options: { year?: number; month?: number; day?: number },
): Temporal.PlainDate {
  // `Hash#fetch` yields the stored value whenever the key is present, `nil` included.
  return new Temporal.PlainDate(
    "year" in options ? options.year! : date.year,
    "month" in options ? options.month! : date.month,
    "day" in options ? options.day! : date.day,
  );
}

/**
 * Mirrors: `Date#compare_with_coercion` (`date/calculations.rb:152-158`).
 *
 * Ruby's `is_a?(Time)` arm is every trails receiver that carries a moment
 * rather than a calendar day — a JS `Date` (a timestamp), a `Temporal.Instant`
 * and a `TimeWithZone`; trails has no bare-`Time` class to key on. The day is
 * widened by ruby/date's own `to_datetime` (`date_core.c`
 * `d_lite_to_datetime`), which is midnight at offset 0 — `date_ext_test.rb:80`
 * asserts that — not midnight in `Time.zone`.
 */
export function compareWithCoercion(
  date: Temporal.PlainDate,
  other: Temporal.PlainDate | Date | Temporal.Instant | TimeWithZone,
): number {
  // boundary: a JS `Date` is one of trails' moment receivers, and this arm is
  // keyed on being one.
  if (other instanceof Date || other instanceof Temporal.Instant || other instanceof TimeWithZone) {
    const toDatetime = date.toZonedDateTime("UTC").toInstant();
    const instant =
      other instanceof Temporal.Instant
        ? other
        : other instanceof TimeWithZone
          ? other.utc()
          : Temporal.Instant.fromEpochMilliseconds(other.getTime());
    return Temporal.Instant.compare(toDatetime, instant);
  } else {
    return compareWithoutCoercion(date, other);
  }
}

/**
 * Mirrors: `alias_method :compare_without_coercion, :<=>`
 * (`date/calculations.rb:159`) — ruby/date's own `Date#<=>`
 * (`date_core.c` `d_lite_cmp`).
 */
export function compareWithoutCoercion(
  date: Temporal.PlainDate,
  other: Temporal.PlainDate,
): number {
  return Temporal.PlainDate.compare(date, other);
}
