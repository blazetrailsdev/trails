/**
 * Mirrors: `DateAndTime::Calculations`
 * (`core_ext/date_and_time/calculations.rb`) — the mixin Rails includes into
 * `Date`, `Time` and `DateTime` so one body serves every receiver.
 *
 * Ruby gets that polymorphism from the receiver: `advance`, `to_date`, `wday`
 * and `self.class.current` each resolve against whichever class included the
 * module. A TS free function has no receiver to resolve against, so the four
 * are module-private dispatchers here — `dateOrTime` is a `Temporal.PlainDate`
 * (the `Date` arm, `core-ext/date/calculations.ts`) or a JS `Date` (the `Time`
 * arm, `time-ext.ts`), exactly the two receivers trails carries. The mixin's
 * own bodies below stay line-for-line with the Ruby.
 */

import { Temporal } from "@blazetrails/date";
import * as date from "../date/calculations.js";
import * as time from "../../time-ext.js";
import { current as timeCurrent } from "../../time-zone-config.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { instantFrom } from "../../temporal.js";

/** A receiver of the mixin: the `Date` arm or the `Time` arm. */
export type DateOrTime = Temporal.PlainDate | Date;

/**
 * What `before?` / `after?` accept: Ruby's `date_or_time` is any comparable
 * date/time, which on the trails side includes the zoned receivers.
 */
export type Comparable = DateOrTime | TimeWithZone | Temporal.Instant;

/** What a receiver-returning member answers: a day for a day, an instant for a time. */
export type DateOrInstant = Temporal.PlainDate | Temporal.Instant;

/** Mirrors: `DateAndTime::Calculations::WEEKEND_DAYS` (`:17`) */
export const WEEKEND_DAYS = [6, 0];

function advance(
  dateOrTime: DateOrTime,
  options: { years?: number; months?: number; weeks?: number; days?: number },
): DateOrInstant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date
    ? time.advance(dateOrTime, options)
    : date.advance(dateOrTime, options);
}

function toDate(dateOrTime: DateOrTime): Temporal.PlainDate {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? time.toDate(dateOrTime) : dateOrTime;
}

function wday(dateOrTime: DateOrTime): number {
  // `Temporal.PlainDate#dayOfWeek` is ISO (Monday 1 … Sunday 7); Ruby's `wday`
  // counts from Sunday 0, which is what `WEEKEND_DAYS` is written in.
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getDay() : dateOrTime.dayOfWeek % 7;
}

/** `self.class.current` — `Date.current` for a day, `Time.current` for a time. */
function classCurrent(dateOrTime: DateOrTime): Temporal.PlainDate | TimeWithZone | Date {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? timeCurrent() : date.current();
}

/** `self < other` / `self > other`, across both arms. */
function compare(dateOrTime: Comparable, other: Comparable): number {
  if (dateOrTime instanceof Temporal.PlainDate && other instanceof Temporal.PlainDate) {
    return Temporal.PlainDate.compare(dateOrTime, other);
  }
  return Temporal.Instant.compare(toInstant(dateOrTime), toInstant(other));
}

function toInstant(dateOrTime: Comparable): Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (dateOrTime instanceof Date) return instantFrom(dateOrTime);
  if (dateOrTime instanceof TimeWithZone) return dateOrTime.utc();
  if (dateOrTime instanceof Temporal.Instant) return dateOrTime;
  return dateOrTime.toZonedDateTime("UTC").toInstant();
}

/**
 * Returns a new date/time representing yesterday.
 *
 * Mirrors: `DateAndTime::Calculations#yesterday` (`:20-22`)
 */
export function yesterday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function yesterday(dateOrTime: Date): Temporal.Instant;
export function yesterday(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: -1 });
}

/**
 * Returns a new date/time representing tomorrow.
 *
 * Mirrors: `DateAndTime::Calculations#tomorrow` (`:25-27`)
 */
export function tomorrow(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function tomorrow(dateOrTime: Date): Temporal.Instant;
export function tomorrow(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: 1 });
}

/**
 * Returns true if the date/time is today.
 *
 * Mirrors: `DateAndTime::Calculations#today?` (`:30-32`)
 */
export function isToday(dateOrTime: DateOrTime): boolean {
  return toDate(dateOrTime).equals(date.current());
}

/**
 * Returns true if the date/time is tomorrow.
 *
 * Mirrors: `DateAndTime::Calculations#tomorrow?` (`:35-37`)
 */
export function isTomorrow(dateOrTime: DateOrTime): boolean {
  return toDate(dateOrTime).equals(tomorrow(date.current()));
}

/** Mirrors: `alias :next_day? :tomorrow?` (`:38`) */
export const isNextDay = isTomorrow;

/**
 * Returns true if the date/time is yesterday.
 *
 * Mirrors: `DateAndTime::Calculations#yesterday?` (`:41-43`)
 */
export function isYesterday(dateOrTime: DateOrTime): boolean {
  return toDate(dateOrTime).equals(yesterday(date.current()));
}

/** Mirrors: `alias :prev_day? :yesterday?` (`:44`) */
export const isPrevDay = isYesterday;

/**
 * Returns true if the date/time is in the past.
 *
 * Mirrors: `DateAndTime::Calculations#past?` (`:47-49`)
 */
export function isPast(dateOrTime: DateOrTime): boolean {
  return compare(dateOrTime, classCurrent(dateOrTime)) < 0;
}

/**
 * Returns true if the date/time is in the future.
 *
 * Mirrors: `DateAndTime::Calculations#future?` (`:52-54`)
 */
export function isFuture(dateOrTime: DateOrTime): boolean {
  return compare(dateOrTime, classCurrent(dateOrTime)) > 0;
}

/**
 * Returns true if the date/time falls on a Saturday or Sunday.
 *
 * Mirrors: `DateAndTime::Calculations#on_weekend?` (`:57-59`)
 */
export function isOnWeekend(dateOrTime: DateOrTime): boolean {
  return WEEKEND_DAYS.includes(wday(dateOrTime));
}

/**
 * Returns true if the date/time does not fall on a Saturday or Sunday.
 *
 * Mirrors: `DateAndTime::Calculations#on_weekday?` (`:62-64`)
 */
export function isOnWeekday(dateOrTime: DateOrTime): boolean {
  return !WEEKEND_DAYS.includes(wday(dateOrTime));
}

/**
 * Returns true if the date/time falls before `dateOrTime`.
 *
 * Mirrors: `DateAndTime::Calculations#before?` (`:67-69`)
 */
export function isBefore(self: DateOrTime, dateOrTime: Comparable): boolean {
  return compare(self, dateOrTime) < 0;
}

/**
 * Returns true if the date/time falls after `dateOrTime`.
 *
 * Mirrors: `DateAndTime::Calculations#after?` (`:72-74`)
 */
export function isAfter(self: DateOrTime, dateOrTime: Comparable): boolean {
  return compare(self, dateOrTime) > 0;
}

/**
 * Returns a new date/time the specified number of days ago.
 *
 * Mirrors: `DateAndTime::Calculations#days_ago` (`:77-79`)
 */
export function daysAgo(dateOrTime: Temporal.PlainDate, days: number): Temporal.PlainDate;
export function daysAgo(dateOrTime: Date, days: number): Temporal.Instant;
export function daysAgo(dateOrTime: DateOrTime, days: number): DateOrInstant {
  return advance(dateOrTime, { days: -days });
}

/**
 * Returns a new date/time the specified number of days in the future.
 *
 * Mirrors: `DateAndTime::Calculations#days_since` (`:82-84`)
 */
export function daysSince(dateOrTime: Temporal.PlainDate, days: number): Temporal.PlainDate;
export function daysSince(dateOrTime: Date, days: number): Temporal.Instant;
export function daysSince(dateOrTime: DateOrTime, days: number): DateOrInstant {
  return advance(dateOrTime, { days: days });
}
