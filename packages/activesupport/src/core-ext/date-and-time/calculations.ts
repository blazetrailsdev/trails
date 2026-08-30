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
import { TimeWithZone } from "../../time-with-zone.js";
import { instantFrom } from "../../temporal.js";
import { cmp, fetch, Range } from "@blazetrails/ruby-compat";
import { Object } from "../object/acts-like.js";

/** A receiver of the mixin: the `Date` arm or the `Time` arm. */
export type DateOrTime = Temporal.PlainDate | Date;

/**
 * What `before?` / `after?` accept: Ruby's `date_or_time` is any comparable
 * date/time, which on the trails side includes the zoned receivers.
 */
export type Comparable = DateOrTime | TimeWithZone | Temporal.Instant;

/** What a receiver-returning member answers: a day for a day, an instant for a time. */
export type DateOrInstant = Temporal.PlainDate | Temporal.Instant;

/** Mirrors: `DateAndTime::Calculations::DAYS_INTO_WEEK` (`:8-16`) */
export const DAYS_INTO_WEEK: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Mirrors: `DateAndTime::Calculations::WEEKEND_DAYS` (`:17`) */
export const WEEKEND_DAYS = [6, 0];

function advance(
  dateOrTime: DateOrTime | Temporal.Instant,
  options: { years?: number; months?: number; weeks?: number; days?: number },
): DateOrInstant {
  dateOrTime = receiver(dateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date
    ? time.advance(dateOrTime, options)
    : date.advance(dateOrTime, options);
}

function toDate(dateOrTime: DateOrTime): Temporal.PlainDate {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? time.toDate(dateOrTime) : dateOrTime;
}

function wday(dateOrTime: DateOrTime | Temporal.Instant): number {
  dateOrTime = receiver(dateOrTime);
  // `Temporal.PlainDate#dayOfWeek` is ISO (Monday 1 … Sunday 7); Ruby's `wday`
  // counts from Sunday 0, which is what `WEEKEND_DAYS` is written in.
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getDay() : dateOrTime.dayOfWeek % 7;
}

/** `self.class.current` — `Date.current` for a day, `Time.current` for a time. */
function classCurrent(dateOrTime: DateOrTime): Temporal.PlainDate | TimeWithZone | Date {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? time.current() : date.current();
}

/**
 * `self <=> other`, across both arms — Ruby's `<=>` (`cmp`) over the reading
 * each receiver orders by. `Temporal.Instant` carries no JS relational
 * operators, so each side is handed to `cmp` as its epoch nanoseconds; a day
 * reads as its UTC midnight, which is the ordering `Temporal.PlainDate.compare`
 * gives. Never nil here: both sides are instants.
 */
function compare(dateOrTime: Comparable, other: Comparable): number {
  return cmp(toInstant(dateOrTime).epochNanoseconds, toInstant(other).epochNanoseconds)!;
}

function toInstant(dateOrTime: Comparable): Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (dateOrTime instanceof Date) return instantFrom(dateOrTime);
  if (dateOrTime instanceof TimeWithZone) return dateOrTime.utc().toTime().toInstant();
  if (dateOrTime instanceof Temporal.Instant) return dateOrTime;
  return dateOrTime.toZonedDateTime("UTC").toInstant();
}

/**
 * `self.change(...)` — the `Date` arm ignores the time-of-day keys, exactly as
 * `Date#change` (`date/calculations.rb:143-149`) does.
 */
function change(
  dateOrTime: DateOrTime | Temporal.Instant,
  options: {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    min?: number;
    sec?: number;
    nsec?: number;
  },
): DateOrInstant {
  dateOrTime = receiver(dateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date
    ? time.change(dateOrTime, options)
    : date.change(dateOrTime, options);
}

/**
 * Normalizes a value one of the mixin's members answered back to the receiver
 * representation the arm dispatch is keyed on. Ruby's members return the
 * receiver's own class, so a chained call needs no conversion; the `Time` arm
 * here answers a `Temporal.Instant` while its receiver is a JS `Date`, so the
 * arm boundary — never the chained call site — converts back.
 */
function receiver(dateOrTime: DateOrTime | Temporal.Instant): DateOrTime {
  // boundary: the `Time` arm's receiver is a JS `Date`, which is what this rebuilds.
  return dateOrTime instanceof Temporal.Instant
    ? new Date(dateOrTime.epochMilliseconds)
    : dateOrTime;
}

/** `self.year` / `self.month` / `self.day`, across both arms. */
function year(dateOrTime: DateOrTime | Temporal.Instant): number {
  dateOrTime = receiver(dateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getFullYear() : dateOrTime.year;
}

function month(dateOrTime: DateOrTime | Temporal.Instant): number {
  dateOrTime = receiver(dateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getMonth() + 1 : dateOrTime.month;
}

function day(dateOrTime: DateOrTime | Temporal.Instant): number {
  dateOrTime = receiver(dateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getDate() : dateOrTime.day;
}

/**
 * `self.hour` / `min` / `sec` / `try(:nsec)`. Ruby's `Date` answers 0 for the
 * three time-of-day readers (they are `Date`'s private `hour`/`min`/`sec`,
 * reachable through `copy_time_to`'s implicit receiver) and does not respond to
 * `nsec` at all, which is why Rails guards that one with `try`.
 */
function hour(dateOrTime: DateOrTime): number {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getHours() : 0;
}

function min(dateOrTime: DateOrTime): number {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getMinutes() : 0;
}

function sec(dateOrTime: DateOrTime): number {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getSeconds() : 0;
}

function nsec(dateOrTime: DateOrTime): number | undefined {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getMilliseconds() * 1_000_000 : undefined;
}

/** `self.next_day` / `self.prev_day` — `advance` on either receiver. */
function nextDay(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: 1 });
}

function prevDay(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: -1 });
}

/** `self.beginning_of_day` / `self.end_of_day` — a moment on either arm. */
function beginningOfDay(dateOrTime: DateOrTime): TimeWithZone | Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date
    ? time.beginningOfDay(dateOrTime)
    : date.beginningOfDay(dateOrTime);
}

function endOfDay(dateOrTime: DateOrTime): TimeWithZone | Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? time.endOfDay(dateOrTime) : date.endOfDay(dateOrTime);
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
export function isOnWeekend(dateOrTime: DateOrTime | Temporal.Instant): boolean {
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
export function daysSince(dateOrTime: DateOrInstant, days: number): DateOrInstant;
export function daysSince(dateOrTime: DateOrTime | Temporal.Instant, days: number): DateOrInstant {
  return advance(dateOrTime, { days: days });
}

/** Mirrors: `DateAndTime::Calculations#weeks_ago` (`:87-89`) */
export function weeksAgo(dateOrTime: Temporal.PlainDate, weeks: number): Temporal.PlainDate;
export function weeksAgo(dateOrTime: Date, weeks: number): Temporal.Instant;
export function weeksAgo(dateOrTime: DateOrTime, weeks: number): DateOrInstant {
  return advance(dateOrTime, { weeks: -weeks });
}

/** Mirrors: `DateAndTime::Calculations#weeks_since` (`:92-94`) */
export function weeksSince(dateOrTime: Temporal.PlainDate, weeks: number): Temporal.PlainDate;
export function weeksSince(dateOrTime: Date, weeks: number): Temporal.Instant;
export function weeksSince(dateOrTime: DateOrTime, weeks: number): DateOrInstant {
  return advance(dateOrTime, { weeks: weeks });
}

/** Mirrors: `DateAndTime::Calculations#months_ago` (`:97-99`) */
export function monthsAgo(dateOrTime: Temporal.PlainDate, months: number): Temporal.PlainDate;
export function monthsAgo(dateOrTime: Date, months: number): Temporal.Instant;
export function monthsAgo(dateOrTime: DateOrTime, months: number): DateOrInstant {
  return advance(dateOrTime, { months: -months });
}

/** Mirrors: `DateAndTime::Calculations#months_since` (`:102-104`) */
export function monthsSince(dateOrTime: Temporal.PlainDate, months: number): Temporal.PlainDate;
export function monthsSince(dateOrTime: Date, months: number): Temporal.Instant;
export function monthsSince(dateOrTime: DateOrTime, months: number): DateOrInstant {
  return advance(dateOrTime, { months: months });
}

/** Mirrors: `DateAndTime::Calculations#years_ago` (`:107-109`) */
export function yearsAgo(dateOrTime: Temporal.PlainDate, years: number): Temporal.PlainDate;
export function yearsAgo(dateOrTime: Date, years: number): Temporal.Instant;
export function yearsAgo(dateOrTime: DateOrTime, years: number): DateOrInstant {
  return advance(dateOrTime, { years: -years });
}

/** Mirrors: `DateAndTime::Calculations#years_since` (`:112-114`) */
export function yearsSince(dateOrTime: Temporal.PlainDate, years: number): Temporal.PlainDate;
export function yearsSince(dateOrTime: Date, years: number): Temporal.Instant;
export function yearsSince(dateOrTime: DateOrTime, years: number): DateOrInstant {
  return advance(dateOrTime, { years: years });
}

/** Mirrors: `DateAndTime::Calculations#beginning_of_month` (`:125-127`) */
export function beginningOfMonth(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function beginningOfMonth(dateOrTime: Date): Temporal.Instant;
export function beginningOfMonth(dateOrTime: DateOrInstant): DateOrInstant;
export function beginningOfMonth(dateOrTime: DateOrTime | Temporal.Instant): DateOrInstant {
  return firstHour(change(dateOrTime, { day: 1 }));
}

/** Mirrors: `alias :at_beginning_of_month :beginning_of_month` (`:128`) */
export const atBeginningOfMonth = beginningOfMonth;

/** Mirrors: `DateAndTime::Calculations#beginning_of_quarter` (`:139-142`) */
export function beginningOfQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function beginningOfQuarter(dateOrTime: Date): Temporal.Instant;
export function beginningOfQuarter(dateOrTime: DateOrTime): DateOrInstant {
  const firstQuarterMonth = month(dateOrTime) - ((2 + month(dateOrTime)) % 3);
  return change(beginningOfMonth(dateOrTime as Date), { month: firstQuarterMonth });
}

/** Mirrors: `alias :at_beginning_of_quarter :beginning_of_quarter` (`:143`) */
export const atBeginningOfQuarter = beginningOfQuarter;

/** Mirrors: `DateAndTime::Calculations#end_of_quarter` (`:154-157`) */
export function endOfQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function endOfQuarter(dateOrTime: Date): Temporal.Instant;
export function endOfQuarter(dateOrTime: DateOrTime): DateOrInstant {
  const lastQuarterMonth = month(dateOrTime) + ((12 - month(dateOrTime)) % 3);
  return endOfMonth(change(beginningOfMonth(dateOrTime as Date), { month: lastQuarterMonth }));
}

/** Mirrors: `alias :at_end_of_quarter :end_of_quarter` (`:158`) */
export const atEndOfQuarter = endOfQuarter;

/** Mirrors: `DateAndTime::Calculations#quarter` (`:166-168`) */
export function quarter(dateOrTime: DateOrTime): number {
  return Math.ceil(month(dateOrTime) / 3.0);
}

/** Mirrors: `DateAndTime::Calculations#beginning_of_year` (`:179-181`) */
export function beginningOfYear(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function beginningOfYear(dateOrTime: Date): Temporal.Instant;
export function beginningOfYear(dateOrTime: DateOrTime): DateOrInstant {
  return beginningOfMonth(change(dateOrTime, { month: 1 }));
}

/** Mirrors: `alias :at_beginning_of_year :beginning_of_year` (`:182`) */
export const atBeginningOfYear = beginningOfYear;

/** Mirrors: `DateAndTime::Calculations#next_week` (`:200-203`) */
export function nextWeek(
  dateOrTime: Temporal.PlainDate,
  givenDayInNextWeek?: string,
  options?: { sameTime?: boolean },
): Temporal.PlainDate;
export function nextWeek(
  dateOrTime: Date,
  givenDayInNextWeek?: string,
  options?: { sameTime?: boolean },
): Temporal.Instant;
export function nextWeek(
  dateOrTime: DateOrTime,
  givenDayInNextWeek: string = date.beginningOfWeek(),
  { sameTime = false }: { sameTime?: boolean } = {},
): DateOrInstant {
  const result = firstHour(
    daysSince(beginningOfWeek(weeksSince(dateOrTime as Date, 1)), daysSpan(givenDayInNextWeek)),
  );
  return sameTime ? copyTimeTo(dateOrTime, result) : result;
}

/** Mirrors: `DateAndTime::Calculations#next_weekday` (`:206-212`) */
export function nextWeekday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function nextWeekday(dateOrTime: Date): Temporal.Instant;
export function nextWeekday(dateOrTime: DateOrTime): DateOrInstant {
  if (isOnWeekend(nextDay(dateOrTime))) {
    return nextWeek(dateOrTime as Date, "monday", { sameTime: true });
  } else {
    return nextDay(dateOrTime);
  }
}

/** Mirrors: `DateAndTime::Calculations#next_quarter` (`:215-217`) */
export function nextQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function nextQuarter(dateOrTime: Date): Temporal.Instant;
export function nextQuarter(dateOrTime: DateOrTime): DateOrInstant {
  return monthsSince(dateOrTime as Date, 3);
}

/** Mirrors: `DateAndTime::Calculations#prev_week` (`:223-226`) */
export function prevWeek(
  dateOrTime: Temporal.PlainDate,
  startDay?: string,
  options?: { sameTime?: boolean },
): Temporal.PlainDate;
export function prevWeek(
  dateOrTime: Date,
  startDay?: string,
  options?: { sameTime?: boolean },
): Temporal.Instant;
export function prevWeek(
  dateOrTime: DateOrTime,
  startDay: string = date.beginningOfWeek(),
  { sameTime = false }: { sameTime?: boolean } = {},
): DateOrInstant {
  const result = firstHour(
    daysSince(beginningOfWeek(weeksAgo(dateOrTime as Date, 1)), daysSpan(startDay)),
  );
  return sameTime ? copyTimeTo(dateOrTime, result) : result;
}

/** Mirrors: `alias_method :last_week, :prev_week` (`:227`) */
export const lastWeek = prevWeek;

/** Mirrors: `DateAndTime::Calculations#prev_weekday` (`:230-236`) */
export function prevWeekday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function prevWeekday(dateOrTime: Date): Temporal.Instant;
export function prevWeekday(dateOrTime: DateOrTime): DateOrInstant {
  if (isOnWeekend(prevDay(dateOrTime))) {
    return copyTimeTo(dateOrTime, beginningOfWeek(dateOrTime as Date, "friday"));
  } else {
    return prevDay(dateOrTime);
  }
}

/** Mirrors: `alias_method :last_weekday, :prev_weekday` (`:237`) */
export const lastWeekday = prevWeekday;

/** Mirrors: `DateAndTime::Calculations#last_month` (`:240-242`) */
export function lastMonth(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function lastMonth(dateOrTime: Date): Temporal.Instant;
export function lastMonth(dateOrTime: DateOrTime): DateOrInstant {
  return monthsAgo(dateOrTime as Date, 1);
}

/** Mirrors: `DateAndTime::Calculations#prev_quarter` (`:245-247`) */
export function prevQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function prevQuarter(dateOrTime: Date): Temporal.Instant;
export function prevQuarter(dateOrTime: DateOrTime): DateOrInstant {
  return monthsAgo(dateOrTime as Date, 3);
}

/** Mirrors: `alias_method :last_quarter, :prev_quarter` (`:248`) */
export const lastQuarter = prevQuarter;

/** Mirrors: `DateAndTime::Calculations#last_year` (`:251-253`) */
export function lastYear(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function lastYear(dateOrTime: Date): Temporal.Instant;
export function lastYear(dateOrTime: DateOrTime): DateOrInstant {
  return yearsAgo(dateOrTime as Date, 1);
}

/** Mirrors: `DateAndTime::Calculations#days_to_week_start` (`:258-261`) */
export function daysToWeekStart(
  dateOrTime: DateOrTime | Temporal.Instant,
  startDay: string = date.beginningOfWeek(),
): number {
  const startDayNumber = fetch<number>(DAYS_INTO_WEEK, startDay);
  return (((wday(dateOrTime) - startDayNumber) % 7) + 7) % 7;
}

/** Mirrors: `DateAndTime::Calculations#beginning_of_week` (`:267-270`) */
export function beginningOfWeek(
  dateOrTime: Temporal.PlainDate,
  startDay?: string,
): Temporal.PlainDate;
export function beginningOfWeek(dateOrTime: Date, startDay?: string): Temporal.Instant;
export function beginningOfWeek(dateOrTime: DateOrInstant, startDay?: string): DateOrInstant;
export function beginningOfWeek(
  dateOrTime: DateOrTime | Temporal.Instant,
  startDay: string = date.beginningOfWeek(),
): DateOrInstant {
  const result = daysAgo(dateOrTime as Date, daysToWeekStart(dateOrTime, startDay));
  return Object.actsLike(dateOrTime, "time") ? time.midnight(receiver(result) as Date) : result;
}

/** Mirrors: `alias :at_beginning_of_week :beginning_of_week` (`:271`) */
export const atBeginningOfWeek = beginningOfWeek;

/** Mirrors: `DateAndTime::Calculations#monday` (`:275-277`) */
export function monday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function monday(dateOrTime: Date): Temporal.Instant;
export function monday(dateOrTime: DateOrTime): DateOrInstant {
  return beginningOfWeek(dateOrTime as Date, "monday");
}

/** Mirrors: `DateAndTime::Calculations#end_of_week` (`:283-285`) */
export function endOfWeek(dateOrTime: Temporal.PlainDate, startDay?: string): Temporal.PlainDate;
export function endOfWeek(dateOrTime: Date, startDay?: string): Temporal.Instant;
export function endOfWeek(
  dateOrTime: DateOrTime,
  startDay: string = date.beginningOfWeek(),
): DateOrInstant {
  return lastHour(daysSince(dateOrTime as Date, 6 - daysToWeekStart(dateOrTime, startDay)));
}

/** Mirrors: `alias :at_end_of_week :end_of_week` (`:286`) */
export const atEndOfWeek = endOfWeek;

/** Mirrors: `DateAndTime::Calculations#sunday` (`:290-292`) */
export function sunday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function sunday(dateOrTime: Date): Temporal.Instant;
export function sunday(dateOrTime: DateOrTime): DateOrInstant {
  return endOfWeek(dateOrTime as Date, "monday");
}

/** Mirrors: `DateAndTime::Calculations#end_of_month` (`:296-299`) */
export function endOfMonth(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function endOfMonth(dateOrTime: Date): Temporal.Instant;
export function endOfMonth(dateOrTime: DateOrInstant): DateOrInstant;
export function endOfMonth(dateOrTime: DateOrTime | Temporal.Instant): DateOrInstant {
  const lastDay = time.daysInMonth(month(dateOrTime), year(dateOrTime));
  return lastHour(daysSince(dateOrTime as Date, lastDay - day(dateOrTime)));
}

/** Mirrors: `alias :at_end_of_month :end_of_month` (`:300`) */
export const atEndOfMonth = endOfMonth;

/** Mirrors: `DateAndTime::Calculations#end_of_year` (`:304-306`) */
export function endOfYear(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function endOfYear(dateOrTime: Date): Temporal.Instant;
export function endOfYear(dateOrTime: DateOrTime): DateOrInstant {
  return endOfMonth(change(dateOrTime, { month: 12 }));
}

/** Mirrors: `alias :at_end_of_year :end_of_year` (`:307`) */
export const atEndOfYear = endOfYear;

/** Mirrors: `DateAndTime::Calculations#all_day` (`:310-312`) */
export function allDay(dateOrTime: DateOrTime): Range<TimeWithZone | Temporal.Instant> {
  return new Range(beginningOfDay(dateOrTime), endOfDay(dateOrTime));
}

/** Mirrors: `DateAndTime::Calculations#all_week` (`:316-318`) */
export function allWeek(
  dateOrTime: DateOrTime,
  startDay: string = date.beginningOfWeek(),
): Range<DateOrInstant> {
  return new Range(
    beginningOfWeek(dateOrTime as Date, startDay),
    endOfWeek(dateOrTime as Date, startDay),
  );
}

/** Mirrors: `DateAndTime::Calculations#all_month` (`:321-323`) */
export function allMonth(dateOrTime: DateOrTime): Range<DateOrInstant> {
  return new Range(beginningOfMonth(dateOrTime as Date), endOfMonth(dateOrTime as Date));
}

/** Mirrors: `DateAndTime::Calculations#all_quarter` (`:326-328`) */
export function allQuarter(dateOrTime: DateOrTime): Range<DateOrInstant> {
  return new Range(beginningOfQuarter(dateOrTime as Date), endOfQuarter(dateOrTime as Date));
}

/** Mirrors: `DateAndTime::Calculations#all_year` (`:331-333`) */
export function allYear(dateOrTime: DateOrTime): Range<DateOrInstant> {
  return new Range(beginningOfYear(dateOrTime as Date), endOfYear(dateOrTime as Date));
}

/** Mirrors: `DateAndTime::Calculations#next_occurring` (`:340-344`) */
export function nextOccurring(
  dateOrTime: Temporal.PlainDate,
  dayOfWeek: string,
): Temporal.PlainDate;
export function nextOccurring(dateOrTime: Date, dayOfWeek: string): Temporal.Instant;
export function nextOccurring(dateOrTime: DateOrTime, dayOfWeek: string): DateOrInstant {
  let fromNow = fetch<number>(DAYS_INTO_WEEK, dayOfWeek) - wday(dateOrTime);
  if (!(fromNow > 0)) fromNow += 7;
  return advance(dateOrTime, { days: fromNow });
}

/** Mirrors: `DateAndTime::Calculations#prev_occurring` (`:351-355`) */
export function prevOccurring(
  dateOrTime: Temporal.PlainDate,
  dayOfWeek: string,
): Temporal.PlainDate;
export function prevOccurring(dateOrTime: Date, dayOfWeek: string): Temporal.Instant;
export function prevOccurring(dateOrTime: DateOrTime, dayOfWeek: string): DateOrInstant {
  let ago = wday(dateOrTime) - fetch<number>(DAYS_INTO_WEEK, dayOfWeek);
  if (!(ago > 0)) ago += 7;
  return advance(dateOrTime, { days: -ago });
}

/** Mirrors: `DateAndTime::Calculations#first_hour` (`:358-360`) @internal */
function firstHour(dateOrTime: DateOrInstant): DateOrInstant {
  return Object.actsLike(dateOrTime, "time")
    ? time.beginningOfDay(receiver(dateOrTime) as Date)
    : dateOrTime;
}

/** Mirrors: `DateAndTime::Calculations#last_hour` (`:362-364`) @internal */
function lastHour(dateOrTime: DateOrInstant): DateOrInstant {
  return Object.actsLike(dateOrTime, "time")
    ? time.endOfDay(receiver(dateOrTime) as Date)
    : dateOrTime;
}

/** Mirrors: `DateAndTime::Calculations#days_span` (`:366-368`) @internal */
function daysSpan(day: string): number {
  return (
    (((fetch<number>(DAYS_INTO_WEEK, day) - fetch<number>(DAYS_INTO_WEEK, date.beginningOfWeek())) %
      7) +
      7) %
    7
  );
}

/** Mirrors: `DateAndTime::Calculations#copy_time_to` (`:370-372`) @internal */
function copyTimeTo(self: DateOrTime, other: DateOrInstant): DateOrInstant {
  return change(other, {
    hour: hour(self),
    min: min(self),
    sec: sec(self),
    nsec: nsec(self),
  });
}
