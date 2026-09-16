import { Temporal, Date as RubyDate, Time as RubyTime } from "@blazetrails/date";
import * as date from "../date/calculations.js";
import * as dateTime from "../date-time/calculations.js";
import * as time from "../../time-ext.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { instantFrom } from "../../temporal.js";
import { cmp, fetch, Range } from "@blazetrails/ruby-compat";
import { Object } from "../object/acts-like.js";
import * as DateAndTimeCalculations from "./calculations.js";

export type DateOrTime = Temporal.PlainDate | RubyDate | Date;

export type Comparable = DateOrTime | DateTime | TimeWithZone | Temporal.Instant;

type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;

export type DateOrInstant = Temporal.PlainDate | RubyDate | Temporal.Instant;

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
  dateOrTime: DateOrTime | Temporal.Instant | RubyTime,
  options: { years?: number; months?: number; weeks?: number; days?: number },
): DateOrInstant {
  // boundary: once Time includes this module (time/calculations.rb:12) `advance` is Time's own (core_ext/time/calculations.rb:194), so a RubyTime receiver answers it itself and returns a RubyTime, the way Ruby's method resolution does.
  if (dateOrTime instanceof RubyTime) {
    return (dateOrTime as unknown as { advance(options: unknown): DateOrInstant }).advance(options);
  }
  if (dateOrTime instanceof Temporal.PlainDateTime || dateOrTime instanceof Temporal.ZonedDateTime)
    return dateTime.advance(dateOrTime, options) as never;
  dateOrTime = receiver(dateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date
    ? time.advance(dateOrTime, options)
    : date.advance(dateOrTime, options);
}

function toDate(dateOrTime: DateOrTime | DateTime | RubyTime): Temporal.PlainDate {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (dateOrTime instanceof Date) return time.toDate(dateOrTime);
  if (
    dateOrTime instanceof Temporal.PlainDateTime ||
    dateOrTime instanceof Temporal.ZonedDateTime
  ) {
    return dateOrTime.toPlainDate();
  }
  return dateOrTime instanceof RubyDate || dateOrTime instanceof RubyTime
    ? dateOrTime.toDate()
    : dateOrTime;
}

function wday(dateOrTime: DateOrTime | Temporal.Instant | RubyTime): number {
  dateOrTime = receiver(dateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (dateOrTime instanceof Date) return dateOrTime.getDay();
  return dateOrTime instanceof RubyDate ? dateOrTime.wday : dateOrTime.dayOfWeek % 7;
}

function classCurrent(dateOrTime: DateOrTime | DateTime): Comparable {
  if (
    dateOrTime instanceof Temporal.PlainDateTime ||
    dateOrTime instanceof Temporal.ZonedDateTime
  ) {
    return dateTime.current();
  }
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? time.current() : date.current();
}

function compare(dateOrTime: Comparable, other: Comparable): number {
  return cmp(toInstant(dateOrTime).epochNanoseconds, toInstant(other).epochNanoseconds)!;
}

function toInstant(dateOrTime: Comparable): Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  if (dateOrTime instanceof Date) return instantFrom(dateOrTime);
  if (dateOrTime instanceof TimeWithZone) return dateOrTime.utc().toTime().toInstant();
  if (dateOrTime instanceof Temporal.Instant) return dateOrTime;
  if (dateOrTime instanceof Temporal.PlainDateTime)
    return dateOrTime.toZonedDateTime("UTC").toInstant();
  if (dateOrTime instanceof Temporal.ZonedDateTime) return dateOrTime.toInstant();
  return toDate(dateOrTime).toZonedDateTime("UTC").toInstant();
}

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

function receiver(dateOrTime: DateOrTime | Temporal.Instant | RubyTime): DateOrTime {
  if (dateOrTime instanceof RubyTime) return receiver(dateOrTime.toTime().toInstant());
  // boundary: the `Time` arm's receiver is a JS `Date`, which is what this rebuilds.
  return dateOrTime instanceof Temporal.Instant
    ? new Date(dateOrTime.epochMilliseconds)
    : dateOrTime;
}

function year(dateOrTime: DateOrTime | DateTime | Temporal.Instant): number {
  dateOrTime = receiver(dateOrTime as DateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getFullYear() : Number(dateOrTime.year);
}

function month(dateOrTime: DateOrTime | DateTime | Temporal.Instant): number {
  dateOrTime = receiver(dateOrTime as DateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getMonth() + 1 : dateOrTime.month;
}

function day(dateOrTime: DateOrTime | DateTime | Temporal.Instant): number {
  dateOrTime = receiver(dateOrTime as DateOrTime);
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getDate() : dateOrTime.day;
}

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

function nextDay(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: 1 });
}

function prevDay(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: -1 });
}

function beginningOfDay(dateOrTime: DateOrTime): TimeWithZone | Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date
    ? time.beginningOfDay(dateOrTime)
    : date.beginningOfDay(toDate(dateOrTime));
}

function endOfDay(dateOrTime: DateOrTime): TimeWithZone | Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? time.endOfDay(dateOrTime) : date.endOfDay(toDate(dateOrTime));
}

export function yesterday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function yesterday(dateOrTime: Date): Temporal.Instant;
export function yesterday(dateOrTime: RubyDate): RubyDate;
export function yesterday(dateOrTime: RubyTime): RubyTime;
export function yesterday(dateOrTime: DateOrTime | RubyTime): DateOrInstant | RubyTime {
  return advance(dateOrTime, { days: -1 });
}

export function tomorrow(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function tomorrow(dateOrTime: Date): Temporal.Instant;
export function tomorrow(dateOrTime: RubyDate): RubyDate;
export function tomorrow(dateOrTime: RubyTime): RubyTime;
export function tomorrow(dateOrTime: DateOrTime | RubyTime): DateOrInstant | RubyTime {
  return advance(dateOrTime, { days: 1 });
}

export function isToday(dateOrTime: DateOrTime | DateTime | RubyTime): boolean {
  return toDate(dateOrTime).equals(date.current());
}

export function isTomorrow(dateOrTime: DateOrTime | DateTime | RubyTime): boolean {
  return toDate(dateOrTime).equals(tomorrow(date.current()));
}

export const isNextDay = isTomorrow;

export function isYesterday(dateOrTime: DateOrTime | DateTime | RubyTime): boolean {
  return toDate(dateOrTime).equals(yesterday(date.current()));
}

export const isPrevDay = isYesterday;

export function isPast(dateOrTime: DateOrTime | DateTime): boolean {
  return compare(dateOrTime, classCurrent(dateOrTime)) < 0;
}

export function isFuture(dateOrTime: DateOrTime | DateTime): boolean {
  return compare(dateOrTime, classCurrent(dateOrTime)) > 0;
}

export function isOnWeekend(dateOrTime: DateOrTime | Temporal.Instant): boolean {
  return WEEKEND_DAYS.includes(wday(dateOrTime));
}

export function isOnWeekday(dateOrTime: DateOrTime): boolean {
  return !WEEKEND_DAYS.includes(wday(dateOrTime));
}

export function isBefore(self: DateOrTime, dateOrTime: Comparable): boolean {
  return compare(self, dateOrTime) < 0;
}

export function isAfter(self: DateOrTime, dateOrTime: Comparable): boolean {
  return compare(self, dateOrTime) > 0;
}

export function daysAgo(dateOrTime: Temporal.PlainDate, days: number): Temporal.PlainDate;
export function daysAgo(dateOrTime: Date, days: number): Temporal.Instant;
export function daysAgo(dateOrTime: RubyTime, days: number): RubyTime;
export function daysAgo(dateOrTime: DateOrTime | RubyTime, days: number): DateOrInstant | RubyTime {
  return advance(dateOrTime, { days: -days });
}

export function daysSince(dateOrTime: Temporal.PlainDate, days: number): Temporal.PlainDate;
export function daysSince(dateOrTime: Date, days: number): Temporal.Instant;
export function daysSince(dateOrTime: DateOrInstant, days: number): DateOrInstant;
export function daysSince(dateOrTime: RubyTime, days: number): RubyTime;
export function daysSince(
  dateOrTime: DateOrTime | Temporal.Instant | RubyTime,
  days: number,
): DateOrInstant | RubyTime {
  return advance(dateOrTime, { days: days });
}

export function weeksAgo(dateOrTime: Temporal.PlainDate, weeks: number): Temporal.PlainDate;
export function weeksAgo(dateOrTime: Date, weeks: number): Temporal.Instant;
export function weeksAgo(dateOrTime: RubyTime, weeks: number): RubyTime;
export function weeksAgo(
  dateOrTime: DateOrTime | RubyTime,
  weeks: number,
): DateOrInstant | RubyTime {
  return advance(dateOrTime, { weeks: -weeks });
}

export function weeksSince(dateOrTime: Temporal.PlainDate, weeks: number): Temporal.PlainDate;
export function weeksSince(dateOrTime: Date, weeks: number): Temporal.Instant;
export function weeksSince(dateOrTime: RubyTime, weeks: number): RubyTime;
export function weeksSince(
  dateOrTime: DateOrTime | RubyTime,
  weeks: number,
): DateOrInstant | RubyTime {
  return advance(dateOrTime, { weeks: weeks });
}

export function monthsAgo(dateOrTime: Temporal.PlainDate, months: number): Temporal.PlainDate;
export function monthsAgo(dateOrTime: Date, months: number): Temporal.Instant;
export function monthsAgo(dateOrTime: RubyTime, months: number): RubyTime;
export function monthsAgo(
  dateOrTime: DateOrTime | RubyTime,
  months: number,
): DateOrInstant | RubyTime {
  return advance(dateOrTime, { months: -months });
}

export function monthsSince(dateOrTime: Temporal.PlainDate, months: number): Temporal.PlainDate;
export function monthsSince(dateOrTime: Date, months: number): Temporal.Instant;
export function monthsSince(dateOrTime: RubyTime, months: number): RubyTime;
export function monthsSince(
  dateOrTime: DateOrTime | RubyTime,
  months: number,
): DateOrInstant | RubyTime {
  return advance(dateOrTime, { months: months });
}

export function yearsAgo(dateOrTime: Temporal.PlainDate, years: number): Temporal.PlainDate;
export function yearsAgo(dateOrTime: Date, years: number): Temporal.Instant;
export function yearsAgo(dateOrTime: RubyTime, years: number): RubyTime;
export function yearsAgo(
  dateOrTime: DateOrTime | RubyTime,
  years: number,
): DateOrInstant | RubyTime {
  return advance(dateOrTime, { years: -years });
}

export function yearsSince(dateOrTime: Temporal.PlainDate, years: number): Temporal.PlainDate;
export function yearsSince(dateOrTime: Date, years: number): Temporal.Instant;
export function yearsSince(dateOrTime: RubyTime, years: number): RubyTime;
export function yearsSince(
  dateOrTime: DateOrTime | RubyTime,
  years: number,
): DateOrInstant | RubyTime {
  return advance(dateOrTime, { years: years });
}

export function beginningOfMonth(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function beginningOfMonth(dateOrTime: Date): Temporal.Instant;
export function beginningOfMonth(dateOrTime: DateOrInstant): DateOrInstant;
export function beginningOfMonth(dateOrTime: DateOrTime | Temporal.Instant): DateOrInstant {
  return firstHour(change(dateOrTime, { day: 1 }));
}

export const atBeginningOfMonth = beginningOfMonth;

export function beginningOfQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function beginningOfQuarter(dateOrTime: Date): Temporal.Instant;
export function beginningOfQuarter(dateOrTime: DateOrTime): DateOrInstant {
  const firstQuarterMonth = month(dateOrTime) - ((2 + month(dateOrTime)) % 3);
  return change(beginningOfMonth(dateOrTime as Date), { month: firstQuarterMonth });
}

export const atBeginningOfQuarter = beginningOfQuarter;

export function endOfQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function endOfQuarter(dateOrTime: Date): Temporal.Instant;
export function endOfQuarter(dateOrTime: DateOrTime): DateOrInstant {
  const lastQuarterMonth = month(dateOrTime) + ((12 - month(dateOrTime)) % 3);
  return endOfMonth(change(beginningOfMonth(dateOrTime as Date), { month: lastQuarterMonth }));
}

export const atEndOfQuarter = endOfQuarter;

export function quarter(dateOrTime: DateOrTime): number {
  return Math.ceil(month(dateOrTime) / 3.0);
}

export function beginningOfYear(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function beginningOfYear(dateOrTime: Date): Temporal.Instant;
export function beginningOfYear(dateOrTime: DateOrTime): DateOrInstant {
  return beginningOfMonth(change(dateOrTime, { month: 1 }));
}

export const atBeginningOfYear = beginningOfYear;

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
  dateOrTime: RubyDate,
  givenDayInNextWeek?: string,
  options?: { sameTime?: boolean },
): RubyDate;
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

export function nextWeekday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function nextWeekday(dateOrTime: Date): Temporal.Instant;
export function nextWeekday(dateOrTime: DateOrTime): DateOrInstant {
  if (isOnWeekend(nextDay(dateOrTime))) {
    return nextWeek(dateOrTime as Date, ":monday", { sameTime: true });
  } else {
    return nextDay(dateOrTime);
  }
}

export function nextQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function nextQuarter(dateOrTime: Date): Temporal.Instant;
export function nextQuarter(dateOrTime: DateOrTime): DateOrInstant {
  return monthsSince(dateOrTime as Date, 3);
}

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
  dateOrTime: DateTime,
  startDay?: string,
  options?: { sameTime?: boolean },
): DateTime;
export function prevWeek(
  dateOrTime: DateOrTime | DateTime,
  startDay: string = date.beginningOfWeek(),
  { sameTime = false }: { sameTime?: boolean } = {},
): DateOrInstant | DateTime {
  const result = firstHour(
    daysSince(beginningOfWeek(weeksAgo(dateOrTime as Date, 1)), daysSpan(startDay)),
  );
  return sameTime ? copyTimeTo(dateOrTime as DateOrTime, result) : result;
}

export const lastWeek = prevWeek;

export function prevWeekday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function prevWeekday(dateOrTime: Date): Temporal.Instant;
export function prevWeekday(dateOrTime: DateOrTime): DateOrInstant {
  if (isOnWeekend(prevDay(dateOrTime))) {
    return copyTimeTo(dateOrTime, beginningOfWeek(dateOrTime as Date, ":friday"));
  } else {
    return prevDay(dateOrTime);
  }
}

export const lastWeekday = prevWeekday;

export function lastMonth(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function lastMonth(dateOrTime: Date): Temporal.Instant;
export function lastMonth(dateOrTime: DateOrTime): DateOrInstant {
  return monthsAgo(dateOrTime as Date, 1);
}

export function prevQuarter(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function prevQuarter(dateOrTime: Date): Temporal.Instant;
export function prevQuarter(dateOrTime: DateOrTime): DateOrInstant {
  return monthsAgo(dateOrTime as Date, 3);
}

export const lastQuarter = prevQuarter;

export function lastYear(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function lastYear(dateOrTime: Date): Temporal.Instant;
export function lastYear(dateOrTime: RubyDate): RubyDate;
export function lastYear(dateOrTime: DateOrTime): DateOrInstant {
  return yearsAgo(dateOrTime as Date, 1);
}

export function daysToWeekStart(
  dateOrTime: DateOrTime | Temporal.Instant,
  startDay: string = date.beginningOfWeek(),
): number {
  const startDayNumber = fetch<number>(DAYS_INTO_WEEK, startDay);
  return (((wday(dateOrTime) - startDayNumber) % 7) + 7) % 7;
}

export function beginningOfWeek(
  dateOrTime: Temporal.PlainDate,
  startDay?: string,
): Temporal.PlainDate;
export function beginningOfWeek(dateOrTime: Date, startDay?: string): Temporal.Instant;
export function beginningOfWeek(dateOrTime: RubyDate, startDay?: string): RubyDate;
export function beginningOfWeek(dateOrTime: DateOrInstant, startDay?: string): DateOrInstant;
export function beginningOfWeek(
  dateOrTime: DateOrTime | Temporal.Instant,
  startDay: string = date.beginningOfWeek(),
): DateOrInstant {
  const result = daysAgo(dateOrTime as Date, daysToWeekStart(dateOrTime, startDay));
  if (result instanceof Temporal.PlainDateTime || result instanceof Temporal.ZonedDateTime)
    return dateTime.beginningOfDay(result) as never;
  return Object.actsLike(dateOrTime, "time") ? time.midnight(receiver(result) as Date) : result;
}

export const atBeginningOfWeek = beginningOfWeek;

export function monday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function monday(dateOrTime: Date): Temporal.Instant;
export function monday(dateOrTime: DateOrTime): DateOrInstant {
  return beginningOfWeek(dateOrTime as Date, ":monday");
}

export function endOfWeek(dateOrTime: Temporal.PlainDate, startDay?: string): Temporal.PlainDate;
export function endOfWeek(dateOrTime: Date, startDay?: string): Temporal.Instant;
export function endOfWeek(dateOrTime: RubyDate, startDay?: string): RubyDate;
export function endOfWeek(
  dateOrTime: DateOrTime,
  startDay: string = date.beginningOfWeek(),
): DateOrInstant {
  return lastHour(daysSince(dateOrTime as Date, 6 - daysToWeekStart(dateOrTime, startDay)));
}

export const atEndOfWeek = endOfWeek;

export function sunday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function sunday(dateOrTime: Date): Temporal.Instant;
export function sunday(dateOrTime: DateOrTime): DateOrInstant {
  return endOfWeek(dateOrTime as Date, ":monday");
}

export function endOfMonth(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function endOfMonth(dateOrTime: Date): Temporal.Instant;
export function endOfMonth(dateOrTime: DateTime): DateTime;
export function endOfMonth(dateOrTime: DateOrInstant): DateOrInstant;
export function endOfMonth(
  dateOrTime: DateOrTime | DateTime | Temporal.Instant,
): DateOrInstant | DateTime {
  const lastDay = time.daysInMonth(month(dateOrTime), year(dateOrTime));
  return lastHour(daysSince(dateOrTime as Date, lastDay - day(dateOrTime)));
}

export const atEndOfMonth = endOfMonth;

export function endOfYear(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function endOfYear(dateOrTime: Date): Temporal.Instant;
export function endOfYear(dateOrTime: DateOrTime): DateOrInstant {
  return endOfMonth(change(dateOrTime, { month: 12 }));
}

export const atEndOfYear = endOfYear;

export function allDay(dateOrTime: DateOrTime): Range<TimeWithZone | Temporal.Instant> {
  return new Range(beginningOfDay(dateOrTime), endOfDay(dateOrTime));
}

export function allWeek(
  dateOrTime: DateOrTime,
  startDay: string = date.beginningOfWeek(),
): Range<DateOrInstant> {
  return new Range(
    beginningOfWeek(dateOrTime as Date, startDay),
    endOfWeek(dateOrTime as Date, startDay),
  );
}

export function allMonth(dateOrTime: DateOrTime): Range<DateOrInstant> {
  return new Range(beginningOfMonth(dateOrTime as Date), endOfMonth(dateOrTime as Date));
}

export function allQuarter(dateOrTime: DateOrTime): Range<DateOrInstant> {
  return new Range(beginningOfQuarter(dateOrTime as Date), endOfQuarter(dateOrTime as Date));
}

export function allYear(dateOrTime: DateOrTime): Range<DateOrInstant> {
  return new Range(beginningOfYear(dateOrTime as Date), endOfYear(dateOrTime as Date));
}

export function nextOccurring(
  dateOrTime: Temporal.PlainDate,
  dayOfWeek: string,
): Temporal.PlainDate;
export function nextOccurring(dateOrTime: Date, dayOfWeek: string): Temporal.Instant;
export function nextOccurring(dateOrTime: RubyTime, dayOfWeek: string): RubyTime;
export function nextOccurring(
  dateOrTime: DateOrTime | RubyTime,
  dayOfWeek: string,
): DateOrInstant | RubyTime {
  let fromNow = fetch<number>(DAYS_INTO_WEEK, dayOfWeek) - wday(dateOrTime);
  if (!(fromNow > 0)) fromNow += 7;
  return advance(dateOrTime, { days: fromNow });
}

export function prevOccurring(
  dateOrTime: Temporal.PlainDate,
  dayOfWeek: string,
): Temporal.PlainDate;
export function prevOccurring(dateOrTime: Date, dayOfWeek: string): Temporal.Instant;
export function prevOccurring(dateOrTime: RubyTime, dayOfWeek: string): RubyTime;
export function prevOccurring(
  dateOrTime: DateOrTime | RubyTime,
  dayOfWeek: string,
): DateOrInstant | RubyTime {
  let ago = wday(dateOrTime) - fetch<number>(DAYS_INTO_WEEK, dayOfWeek);
  if (!(ago > 0)) ago += 7;
  return advance(dateOrTime, { days: -ago });
}

/** @internal */
function firstHour(dateOrTime: DateOrInstant): DateOrInstant {
  if (dateOrTime instanceof Temporal.PlainDateTime || dateOrTime instanceof Temporal.ZonedDateTime)
    return dateTime.beginningOfDay(dateOrTime) as never;
  return Object.actsLike(dateOrTime, "time")
    ? time.beginningOfDay(receiver(dateOrTime) as Date)
    : dateOrTime;
}

/** @internal */
function lastHour(dateOrTime: DateOrInstant): DateOrInstant {
  if (dateOrTime instanceof Temporal.PlainDateTime || dateOrTime instanceof Temporal.ZonedDateTime)
    return dateTime.endOfDay(dateOrTime) as never;
  return Object.actsLike(dateOrTime, "time")
    ? time.endOfDay(receiver(dateOrTime) as Date)
    : dateOrTime;
}

/** @internal */
function daysSpan(day: string): number {
  return (
    (((fetch<number>(DAYS_INTO_WEEK, day) - fetch<number>(DAYS_INTO_WEEK, date.beginningOfWeek())) %
      7) +
      7) %
    7
  );
}

/** @internal */
function copyTimeTo(self: DateOrTime, other: DateOrInstant): DateOrInstant {
  return change(other, {
    hour: hour(self),
    min: min(self),
    sec: sec(self),
    nsec: nsec(self),
  });
}

// boundary: `include DateAndTime::Calculations` (time/calculations.rb:12) — the module sits below Time in the ancestor chain, so a name Time defines itself wins, and each module function takes the receiver Ruby passes as self as its first argument. Installed from this module's own bottom, not from core-ext/time/calculations.ts where Rails spells the include, because an import edge in that direction closes a cycle through core-ext/date/calculations.ts and reads this module's bindings in TDZ.
for (const [name, member] of globalThis.Object.entries(DateAndTimeCalculations)) {
  if (typeof member !== "function") continue;
  if (name in RubyTime.prototype) continue;
  globalThis.Object.defineProperty(RubyTime.prototype, name, {
    value: function (this: RubyTime, ...args: unknown[]): unknown {
      return (member as (...a: unknown[]) => unknown)(this, ...args);
    },
    writable: true,
    configurable: true,
  });
}
