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
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./values/time-zone.js";
import { ArgumentError, findZoneBang, getZone } from "./time-zone-config.js";

/**
 * Mirrors: `DateAndTime::Calculations::DAYS_INTO_WEEK`
 * (`core_ext/date_and_time/calculations.rb:8-16`) — the week-start day names
 * `Date.beginning_of_week=` validates against.
 */
const DAYS_INTO_WEEK: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
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

/**
 * Mirrors: `Date.beginning_of_week` (`date/calculations.rb:19-21`)
 *
 * @missingRailsCall find_beginning_of_week! — the writer `beginning_of_week=`
 * (`:27-29`) is what calls it, and it is ported as {@link setBeginningOfWeek};
 * the comparator offers the bare accessor before `set*` for a Ruby writer, so
 * both Ruby names resolve to this reader.
 */
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

/**
 * Mirrors: `DateAndTime::Zones#in_time_zone` (`date_and_time/zones.rb:20-28`)
 * for the `Date` receiver (`core_ext/date/zones.rb` mixes it in). A Date never
 * `acts_like?(:time)`, so Rails' `time` local is always nil here and
 * `time_with_zone` takes its `TimeWithZone.new(nil, zone, to_time(:utc))` arm —
 * the day's midnight read in `zone`.
 *
 * The `else` arm is Ruby's `to_time`, a bare `Time` at local midnight. trails
 * has no bare-Time receiver carrying the `since`/`middle_of_day`/`end_of_day`
 * this method's five callers delegate to (`time-ext.ts` is a free-function
 * module over JS `Date`), so the fallback is the same instant expressed in the
 * system zone — `to_time`'s value under a TimeWithZone receiver.
 */
export function inTimeZone(date: Temporal.PlainDate, zone: unknown = getZone()): TimeWithZone {
  const timeZone = findZoneBang(zone);
  if (timeZone) {
    return timeWithZone(date, timeZone);
  }
  return timeWithZone(date, TimeZone.find(Temporal.Now.timeZoneId()));
}

/** Mirrors: `DateAndTime::Zones#time_with_zone` (`date_and_time/zones.rb:32-38`) */
function timeWithZone(date: Temporal.PlainDate, zone: TimeZone): TimeWithZone {
  return zone.local(date.year, date.month, date.day);
}

/** Mirrors: `Date#ago` (`date/calculations.rb:55-57`) */
export function ago(date: Temporal.PlainDate, seconds: number): TimeWithZone {
  return inTimeZone(date).since(-seconds);
}

/** Mirrors: `Date#since` (`date/calculations.rb:61-63`) */
export function since(date: Temporal.PlainDate, seconds: number): TimeWithZone {
  return inTimeZone(date).since(seconds);
}

/** Mirrors: `Date#beginning_of_day` (`date/calculations.rb:67-69`) */
export function beginningOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date);
}

/** Mirrors: `Date#middle_of_day` (`date/calculations.rb:75-77`) */
export function middleOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date).middleOfDay();
}

/** Mirrors: `Date#end_of_day` (`date/calculations.rb:85-87`) */
export function endOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date).endOfDay();
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
