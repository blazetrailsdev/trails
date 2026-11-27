import { Date as RubyDate, DateTime as RubyDateTime, Time as RubyTime } from "@blazetrails/date";
import type { TimeWithZone } from "../../time-with-zone.js";
import { ActiveSupport } from "../../namespaces.js";
import { Tryable } from "../object/try.js";
import { cmp } from "@blazetrails/ruby-compat/comparable";
import { fetch } from "@blazetrails/ruby-compat/hash";
import { include, type Included } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Range } from "@blazetrails/ruby-compat/range";
import { actsLike } from "../object/acts-like.js";
import * as DateAndTimeCalculations from "./calculations.js";

type Receiver = RubyDate | RubyTime;

type Result = Receiver;

export type Comparable = Receiver | TimeWithZone | Temporal.PlainDate | Temporal.Instant;

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
  return this.advance(options);
}

function toDate(this: Receiver): Temporal.PlainDate {
  return this.toDate();
}

function wday(this: Receiver): number {
  return this.wday;
}

function classCurrent(this: Receiver): Comparable {
  return (this.constructor as typeof RubyDate | typeof RubyTime).current();
}

function compare(this: Receiver, other: Comparable): number {
  return cmp(toInstant(this).epochNanoseconds, toInstant(other).epochNanoseconds)!;
}

function toInstant(dateOrTime: Comparable): Temporal.Instant {
  if (dateOrTime instanceof ActiveSupport.TimeWithZone!)
    return dateOrTime.utc().toZonedDateTime().toInstant();
  if (dateOrTime instanceof RubyTime) return dateOrTime.toZonedDateTime().toInstant();
  if (dateOrTime instanceof Temporal.Instant) return dateOrTime;
  if (dateOrTime instanceof RubyDateTime) return dateOrTime.toTime().toZonedDateTime().toInstant();
  if (dateOrTime instanceof RubyDate) return dateOrTime.toDate().toZonedDateTime("UTC").toInstant();
  return dateOrTime.toZonedDateTime("UTC").toInstant();
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
  return this.change(options);
}

function year(this: Receiver): number {
  return Number(this.year);
}

function month(this: Receiver): number {
  return this.month;
}

function day(this: Receiver): number {
  return this.day;
}

function nextDay(this: Receiver): Result {
  return advance.call(this, { days: 1 });
}

function prevDay(this: Receiver): Result {
  return advance.call(this, { days: -1 });
}

function beginningOfDay(this: Receiver): RubyTime | RubyDate | TimeWithZone {
  return this.beginningOfDay();
}

function endOfDay(this: Receiver): RubyTime | RubyDate | TimeWithZone {
  return this.endOfDay();
}

export function yesterday(this: Receiver): Result {
  return advance.call(this, { days: -1 });
}

export function tomorrow(this: Receiver): Result {
  return advance.call(this, { days: 1 });
}

export function isToday(this: Receiver): boolean {
  return toDate.call(this).equals(RubyDate.current().toDate());
}

export function isTomorrow(this: Receiver): boolean {
  return toDate.call(this).equals(RubyDate.current().tomorrow().toDate());
}

export const isNextDay = isTomorrow;

export function isYesterday(this: Receiver): boolean {
  return toDate.call(this).equals(RubyDate.current().yesterday().toDate());
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

export function isBefore(this: Receiver, dateOrTime: Comparable | RubyTime): boolean {
  return compare.call(this, dateOrTime) < 0;
}

export function isAfter(this: Receiver, dateOrTime: Comparable | RubyTime): boolean {
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
  givenDayInNextWeek: string = RubyDate.beginningOfWeek(),
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
  startDay: string = RubyDate.beginningOfWeek(),
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

export function daysToWeekStart(
  this: Receiver,
  startDay: string = RubyDate.beginningOfWeek(),
): number {
  const startDayNumber = fetch<number>(DAYS_INTO_WEEK, startDay);
  return (((wday.call(this) - startDayNumber) % 7) + 7) % 7;
}

export function beginningOfWeek(
  this: Receiver,
  startDay: string = RubyDate.beginningOfWeek(),
): Result {
  const result = daysAgo.call(this, daysToWeekStart.call(this, startDay));
  return actsLike.call(this, "time") ? (result.midnight() as Result) : result;
}

export const atBeginningOfWeek = beginningOfWeek;

export function monday(this: Receiver): Result {
  return beginningOfWeek.call(this, ":monday");
}

export function endOfWeek(this: Receiver, startDay: string = RubyDate.beginningOfWeek()): Result {
  return lastHour.call(this, daysSince.call(this, 6 - daysToWeekStart.call(this, startDay)));
}

export const atEndOfWeek = endOfWeek;

export function sunday(this: Receiver): Result {
  return endOfWeek.call(this, ":monday");
}

export function endOfMonth(this: Receiver): Result {
  const lastDay = RubyTime.daysInMonth(month.call(this), year.call(this));
  return lastHour.call(this, daysSince.call(this, lastDay - day.call(this)));
}

export const atEndOfMonth = endOfMonth;

export function endOfYear(this: Receiver): Result {
  return endOfMonth.call(change.call(this, { month: 12 }));
}

export const atEndOfYear = endOfYear;

export function allDay(this: Receiver): Range<RubyTime | RubyDate | TimeWithZone> {
  return new Range(beginningOfDay.call(this), endOfDay.call(this));
}

export function allWeek(
  this: Receiver,
  startDay: string = RubyDate.beginningOfWeek(),
): Range<Result> {
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
  return actsLike.call(dateOrTime, "time") ? (dateOrTime.beginningOfDay() as Result) : dateOrTime;
}

/** @internal */
function lastHour(this: Receiver, dateOrTime: Result): Result {
  return actsLike.call(dateOrTime, "time") ? (dateOrTime.endOfDay() as Result) : dateOrTime;
}

/** @internal */
function daysSpan(this: Receiver, day: string): number {
  return (
    (((fetch<number>(DAYS_INTO_WEEK, day) -
      fetch<number>(DAYS_INTO_WEEK, RubyDate.beginningOfWeek())) %
      7) +
      7) %
    7
  );
}

/** @internal */
function copyTimeTo(this: Receiver, other: Result): Result {
  return change.call(other, {
    hour: (this as RubyTime).hour,
    min: (this as RubyTime).min,
    sec: (this as RubyTime).sec,
    nsec: (Tryable.try(this, "nsec") ?? undefined) as number | undefined,
  });
}

// boundary: `include DateAndTime::Calculations` (time/calculations.rb:12, date/calculations.rb:11). Spelled from this module's own bottom, not from core-ext/time/calculations.ts or core-ext/date/calculations.ts where Rails spells it, because an import edge in that direction closes a cycle through core-ext/date/calculations.ts and reads this module's bindings in TDZ.
declare module "@blazetrails/date" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Date extends Included<typeof DateAndTimeCalculations> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Time extends Included<typeof DateAndTimeCalculations> {}
  namespace Date {
    export const DAYS_INTO_WEEK: Record<string, number>;
  }
  namespace Time {
    export const DAYS_INTO_WEEK: Record<string, number>;
  }
}

include(RubyTime, DateAndTimeCalculations);
include(RubyDate, DateAndTimeCalculations);
Object.assign(RubyTime, { DAYS_INTO_WEEK });
Object.assign(RubyDate, { DAYS_INTO_WEEK });

(TopLevel.DateAndTime ??= { name: "DateAndTime" }).Calculations = DateAndTimeCalculations;

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    DateAndTime?: {
      name: string;
      Calculations?: typeof DateAndTimeCalculations;
      Zones?: typeof import("./zones.js").Zones;
      Compatibility?: typeof import("./compatibility.js");
    };
  }
}
