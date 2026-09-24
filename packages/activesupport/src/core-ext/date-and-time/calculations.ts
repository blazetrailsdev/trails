import { Temporal, Date as RubyDate, Time as RubyTime } from "@blazetrails/date";
import * as date from "../date/calculations.js";
import * as dateTime from "../date-time/calculations.js";
import * as time from "../../time-ext.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { instantFrom } from "../../temporal.js";
import { cmp, fetch, include, Range, type Included } from "@blazetrails/ruby-compat";
import { Object } from "../object/acts-like.js";
import * as DateAndTimeCalculations from "./calculations.js";

export type DateOrTime = Temporal.PlainDate | RubyDate | Date;

export type Comparable = DateOrTime | DateTime | TimeWithZone | Temporal.Instant;

type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;

export type DateOrInstant = Temporal.PlainDate | RubyDate | Temporal.Instant;

type Receiver = DateOrTime | DateTime | Temporal.Instant | RubyTime;

type Result = DateOrInstant | DateTime | RubyTime;

export const DAYS_INTO_WEEK: Record<string, number> = {
  ":sunday": 0,
  ":monday": 1,
  ":tuesday": 2,
  ":wednesday": 3,
  ":thursday": 4,
  ":friday": 5,
  ":saturday": 6,
};

export const WEEKEND_DAYS = [6, 0];

function advance(
  this: Receiver,
  options: { years?: number; months?: number; weeks?: number; days?: number },
): Result {
  // boundary: once Time includes this module (time/calculations.rb:12) `advance` is Time's own (core_ext/time/calculations.rb:194), so a RubyTime receiver answers it itself and returns a RubyTime, the way Ruby's method resolution does.
  if (this instanceof RubyTime) {
    return (this as unknown as { advance(options: unknown): RubyTime }).advance(options);
  }
  if (this instanceof Temporal.PlainDateTime || this instanceof Temporal.ZonedDateTime)
    return dateTime.advance(this, options);
  const self = receiver(this);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return self instanceof Date ? time.advance(self, options) : date.advance(self, options);
}

function toDate(this: Receiver): Temporal.PlainDate {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (this instanceof Date) return time.toDate(this);
  if (this instanceof Temporal.PlainDateTime || this instanceof Temporal.ZonedDateTime) {
    return this.toPlainDate();
  }
  return this instanceof RubyDate || this instanceof RubyTime
    ? this.toDate()
    : (this as Temporal.PlainDate);
}

function wday(this: Receiver): number {
  const self = receiver(this);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (self instanceof Date) return self.getDay();
  return self instanceof RubyDate ? self.wday : self.dayOfWeek % 7;
}

function classCurrent(this: Receiver): Comparable {
  if (this instanceof Temporal.PlainDateTime || this instanceof Temporal.ZonedDateTime) {
    return dateTime.current();
  }
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return this instanceof Date ? time.current() : date.current();
}

function compare(this: Receiver, other: Comparable | RubyTime): number {
  return cmp(toInstant(this).epochNanoseconds, toInstant(other).epochNanoseconds)!;
}

function toInstant(dateOrTime: Comparable | RubyTime): Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (dateOrTime instanceof Date) return instantFrom(dateOrTime);
  if (dateOrTime instanceof TimeWithZone) return dateOrTime.utc().toTime().toInstant();
  if (dateOrTime instanceof Temporal.Instant) return dateOrTime;
  if (dateOrTime instanceof Temporal.PlainDateTime)
    return dateOrTime.toZonedDateTime("UTC").toInstant();
  if (dateOrTime instanceof Temporal.ZonedDateTime) return dateOrTime.toInstant();
  return toDate.call(dateOrTime).toZonedDateTime("UTC").toInstant();
}

function change(
  this: Receiver,
  options: {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    min?: number;
    sec?: number;
    nsec?: number;
  },
): Result {
  if (this instanceof Temporal.PlainDateTime || this instanceof Temporal.ZonedDateTime)
    return dateTime.change(this, options);
  const self = receiver(this);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return self instanceof Date ? time.change(self, options) : date.change(self, options);
}

function receiver(dateOrTime: Receiver): DateOrTime {
  if (dateOrTime instanceof RubyTime) return receiver(dateOrTime.toTime().toInstant());
  // boundary: the `Time` arm's receiver is a JS `Date`, which is what this rebuilds.
  return dateOrTime instanceof Temporal.Instant
    ? new Date(dateOrTime.epochMilliseconds)
    : (dateOrTime as DateOrTime);
}

function year(this: Receiver): number {
  const self = receiver(this);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return self instanceof Date ? self.getFullYear() : Number(self.year);
}

function month(this: Receiver): number {
  const self = receiver(this);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return self instanceof Date ? self.getMonth() + 1 : self.month;
}

function day(this: Receiver): number {
  const self = receiver(this);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return self instanceof Date ? self.getDate() : self.day;
}

function hour(this: Receiver): number {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return this instanceof Date ? this.getHours() : 0;
}

function min(this: Receiver): number {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return this instanceof Date ? this.getMinutes() : 0;
}

function sec(this: Receiver): number {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return this instanceof Date ? this.getSeconds() : 0;
}

function nsec(this: Receiver): number | undefined {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return this instanceof Date ? this.getMilliseconds() * 1_000_000 : undefined;
}

function nextDay(this: Receiver): Result {
  return advance.call(this, { days: 1 });
}

function prevDay(this: Receiver): Result {
  return advance.call(this, { days: -1 });
}

function beginningOfDay(this: Receiver): TimeWithZone | Temporal.Instant | RubyTime {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return this instanceof Date ? time.beginningOfDay(this) : date.beginningOfDay(toDate.call(this));
}

function endOfDay(this: Receiver): TimeWithZone | Temporal.Instant | RubyTime {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return this instanceof Date ? time.endOfDay(this) : date.endOfDay(toDate.call(this));
}

export function yesterday(this: Receiver): Result {
  return advance.call(this, { days: -1 });
}

export function tomorrow(this: Receiver): Result {
  return advance.call(this, { days: 1 });
}

export function isToday(this: Receiver): boolean {
  return toDate.call(this).equals(date.current());
}

export function isTomorrow(this: Receiver): boolean {
  return toDate.call(this).equals(tomorrow.call(date.current()) as Temporal.PlainDate);
}

export const isNextDay = isTomorrow;

export function isYesterday(this: Receiver): boolean {
  return toDate.call(this).equals(yesterday.call(date.current()) as Temporal.PlainDate);
}

export const isPrevDay = isYesterday;

export function isPast(this: Receiver): boolean {
  return compare.call(this, classCurrent.call(this)) < 0;
}

export function isFuture(this: Receiver): boolean {
  return compare.call(this, classCurrent.call(this)) > 0;
}

export function isOnWeekend(this: Receiver): boolean {
  return WEEKEND_DAYS.includes(wday.call(this));
}

export function isOnWeekday(this: Receiver): boolean {
  return !WEEKEND_DAYS.includes(wday.call(this));
}

export function isBefore(this: Receiver, dateOrTime: Comparable): boolean {
  return compare.call(this, dateOrTime) < 0;
}

export function isAfter(this: Receiver, dateOrTime: Comparable): boolean {
  return compare.call(this, dateOrTime) > 0;
}

export function daysAgo(this: Receiver, days: number): Result {
  return advance.call(this, { days: -days });
}

export function daysSince(this: Receiver, days: number): Result {
  return advance.call(this, { days: days });
}

export function weeksAgo(this: Receiver, weeks: number): Result {
  return advance.call(this, { weeks: -weeks });
}

export function weeksSince(this: Receiver, weeks: number): Result {
  return advance.call(this, { weeks: weeks });
}

export function monthsAgo(this: Receiver, months: number): Result {
  return advance.call(this, { months: -months });
}

export function monthsSince(this: Receiver, months: number): Result {
  return advance.call(this, { months: months });
}

export function yearsAgo(this: Receiver, years: number): Result {
  return advance.call(this, { years: -years });
}

export function yearsSince(this: Receiver, years: number): Result {
  return advance.call(this, { years: years });
}

export function beginningOfMonth(this: Receiver): Result {
  return firstHour.call(this, change.call(this, { day: 1 }));
}

export const atBeginningOfMonth = beginningOfMonth;

export function beginningOfQuarter(this: Receiver): Result {
  const firstQuarterMonth = month.call(this) - ((2 + month.call(this)) % 3);
  return change.call(beginningOfMonth.call(this), { month: firstQuarterMonth });
}

export const atBeginningOfQuarter = beginningOfQuarter;

export function endOfQuarter(this: Receiver): Result {
  const lastQuarterMonth = month.call(this) + ((12 - month.call(this)) % 3);
  return endOfMonth.call(change.call(beginningOfMonth.call(this), { month: lastQuarterMonth }));
}

export const atEndOfQuarter = endOfQuarter;

export function quarter(this: Receiver): number {
  return Math.ceil(month.call(this) / 3.0);
}

export function beginningOfYear(this: Receiver): Result {
  return beginningOfMonth.call(change.call(this, { month: 1 }));
}

export const atBeginningOfYear = beginningOfYear;

export function nextWeek(
  this: Receiver,
  givenDayInNextWeek: string = date.beginningOfWeek(),
  { sameTime = false }: { sameTime?: boolean } = {},
): Result {
  const result = firstHour.call(
    this,
    daysSince.call(
      beginningOfWeek.call(weeksSince.call(this, 1)),
      daysSpan.call(this, givenDayInNextWeek),
    ),
  );
  return sameTime ? copyTimeTo.call(this, result) : result;
}

export function nextWeekday(this: Receiver): Result {
  if (isOnWeekend.call(nextDay.call(this))) {
    return nextWeek.call(this, ":monday", { sameTime: true });
  } else {
    return nextDay.call(this);
  }
}

export function nextQuarter(this: Receiver): Result {
  return monthsSince.call(this, 3);
}

export function prevWeek(
  this: Receiver,
  startDay: string = date.beginningOfWeek(),
  { sameTime = false }: { sameTime?: boolean } = {},
): Result {
  const result = firstHour.call(
    this,
    daysSince.call(beginningOfWeek.call(weeksAgo.call(this, 1)), daysSpan.call(this, startDay)),
  );
  return sameTime ? copyTimeTo.call(this, result) : result;
}

export const lastWeek = prevWeek;

export function prevWeekday(this: Receiver): Result {
  if (isOnWeekend.call(prevDay.call(this))) {
    return copyTimeTo.call(this, beginningOfWeek.call(this, ":friday"));
  } else {
    return prevDay.call(this);
  }
}

export const lastWeekday = prevWeekday;

export function lastMonth(this: Receiver): Result {
  return monthsAgo.call(this, 1);
}

export function prevQuarter(this: Receiver): Result {
  return monthsAgo.call(this, 3);
}

export const lastQuarter = prevQuarter;

export function lastYear(this: Receiver): Result {
  return yearsAgo.call(this, 1);
}

export function daysToWeekStart(this: Receiver, startDay: string = date.beginningOfWeek()): number {
  const startDayNumber = fetch<number>(DAYS_INTO_WEEK, startDay);
  return (((wday.call(this) - startDayNumber) % 7) + 7) % 7;
}

export function beginningOfWeek(this: Receiver, startDay: string = date.beginningOfWeek()): Result {
  const result = daysAgo.call(this, daysToWeekStart.call(this, startDay));
  if (result instanceof Temporal.PlainDateTime || result instanceof Temporal.ZonedDateTime)
    return dateTime.beginningOfDay(result);
  return Object.actsLike(this, "time") ? time.midnight(receiver(result) as Date) : result;
}

export const atBeginningOfWeek = beginningOfWeek;

export function monday(this: Receiver): Result {
  return beginningOfWeek.call(this, ":monday");
}

export function endOfWeek(this: Receiver, startDay: string = date.beginningOfWeek()): Result {
  return lastHour.call(this, daysSince.call(this, 6 - daysToWeekStart.call(this, startDay)));
}

export const atEndOfWeek = endOfWeek;

export function sunday(this: Receiver): Result {
  return endOfWeek.call(this, ":monday");
}

export function endOfMonth(this: Receiver): Result {
  const lastDay = time.daysInMonth(month.call(this), year.call(this));
  return lastHour.call(this, daysSince.call(this, lastDay - day.call(this)));
}

export const atEndOfMonth = endOfMonth;

export function endOfYear(this: Receiver): Result {
  return endOfMonth.call(change.call(this, { month: 12 }));
}

export const atEndOfYear = endOfYear;

export function allDay(this: Receiver): Range<TimeWithZone | Temporal.Instant | RubyTime> {
  return new Range(beginningOfDay.call(this), endOfDay.call(this));
}

export function allWeek(this: Receiver, startDay: string = date.beginningOfWeek()): Range<Result> {
  return new Range(beginningOfWeek.call(this, startDay), endOfWeek.call(this, startDay));
}

export function allMonth(this: Receiver): Range<Result> {
  return new Range(beginningOfMonth.call(this), endOfMonth.call(this));
}

export function allQuarter(this: Receiver): Range<Result> {
  return new Range(beginningOfQuarter.call(this), endOfQuarter.call(this));
}

export function allYear(this: Receiver): Range<Result> {
  return new Range(beginningOfYear.call(this), endOfYear.call(this));
}

export function nextOccurring(this: Receiver, dayOfWeek: string): Result {
  let fromNow = fetch<number>(DAYS_INTO_WEEK, dayOfWeek) - wday.call(this);
  if (!(fromNow > 0)) fromNow += 7;
  return advance.call(this, { days: fromNow });
}

export function prevOccurring(this: Receiver, dayOfWeek: string): Result {
  let ago = wday.call(this) - fetch<number>(DAYS_INTO_WEEK, dayOfWeek);
  if (!(ago > 0)) ago += 7;
  return advance.call(this, { days: -ago });
}

/** @internal */
function firstHour(this: Receiver, dateOrTime: Result): Result {
  if (dateOrTime instanceof Temporal.PlainDateTime || dateOrTime instanceof Temporal.ZonedDateTime)
    return dateTime.beginningOfDay(dateOrTime);
  return Object.actsLike(dateOrTime, "time")
    ? time.beginningOfDay(receiver(dateOrTime) as Date)
    : dateOrTime;
}

/** @internal */
function lastHour(this: Receiver, dateOrTime: Result): Result {
  if (dateOrTime instanceof Temporal.PlainDateTime || dateOrTime instanceof Temporal.ZonedDateTime)
    return dateTime.endOfDay(dateOrTime);
  return Object.actsLike(dateOrTime, "time")
    ? time.endOfDay(receiver(dateOrTime) as Date)
    : dateOrTime;
}

/** @internal */
function daysSpan(this: Receiver, day: string): number {
  return (
    (((fetch<number>(DAYS_INTO_WEEK, day) - fetch<number>(DAYS_INTO_WEEK, date.beginningOfWeek())) %
      7) +
      7) %
    7
  );
}

/** @internal */
function copyTimeTo(this: Receiver, other: Result): Result {
  return change.call(other, {
    hour: hour.call(this),
    min: min.call(this),
    sec: sec.call(this),
    nsec: nsec.call(this),
  });
}

// boundary: `include DateAndTime::Calculations` (time/calculations.rb:12, date/calculations.rb:11). Spelled from this module's own bottom, not from core-ext/time/calculations.ts or core-ext/date/calculations.ts where Rails spells it, because an import edge in that direction closes a cycle through core-ext/date/calculations.ts and reads this module's bindings in TDZ.
declare module "@blazetrails/date" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Date extends Included<typeof DateAndTimeCalculations> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Time extends Included<typeof DateAndTimeCalculations> {}
}

include(RubyTime, DateAndTimeCalculations);
include(RubyDate, DateAndTimeCalculations);
