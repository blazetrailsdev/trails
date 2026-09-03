import { Temporal } from "@blazetrails/date";
import * as date from "../date/calculations.js";
import * as time from "../../time-ext.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { instantFrom } from "../../temporal.js";
import { cmp, fetch, Range } from "@blazetrails/ruby-compat";
import { Object } from "../object/acts-like.js";

export type DateOrTime = Temporal.PlainDate | Date;

export type Comparable = DateOrTime | TimeWithZone | Temporal.Instant;

export type DateOrInstant = Temporal.PlainDate | Temporal.Instant;

export const DAYS_INTO_WEEK: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

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
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? dateOrTime.getDay() : dateOrTime.dayOfWeek % 7;
}

function classCurrent(dateOrTime: DateOrTime): Temporal.PlainDate | TimeWithZone | Date {
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
  return dateOrTime.toZonedDateTime("UTC").toInstant();
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

function receiver(dateOrTime: DateOrTime | Temporal.Instant): DateOrTime {
  // boundary: the `Time` arm's receiver is a JS `Date`, which is what this rebuilds.
  return dateOrTime instanceof Temporal.Instant
    ? new Date(dateOrTime.epochMilliseconds)
    : dateOrTime;
}

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
    : date.beginningOfDay(dateOrTime);
}

function endOfDay(dateOrTime: DateOrTime): TimeWithZone | Temporal.Instant {
  // boundary: a JS `Date` is the `Time` arm's receiver, and this dispatch is keyed on being one.
  return dateOrTime instanceof Date ? time.endOfDay(dateOrTime) : date.endOfDay(dateOrTime);
}

export function yesterday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function yesterday(dateOrTime: Date): Temporal.Instant;
export function yesterday(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: -1 });
}

export function tomorrow(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function tomorrow(dateOrTime: Date): Temporal.Instant;
export function tomorrow(dateOrTime: DateOrTime): DateOrInstant {
  return advance(dateOrTime, { days: 1 });
}

export function isToday(dateOrTime: DateOrTime): boolean {
  return toDate(dateOrTime).equals(date.current());
}

export function isTomorrow(dateOrTime: DateOrTime): boolean {
  return toDate(dateOrTime).equals(tomorrow(date.current()));
}

export const isNextDay = isTomorrow;

export function isYesterday(dateOrTime: DateOrTime): boolean {
  return toDate(dateOrTime).equals(yesterday(date.current()));
}

export const isPrevDay = isYesterday;

export function isPast(dateOrTime: DateOrTime): boolean {
  return compare(dateOrTime, classCurrent(dateOrTime)) < 0;
}

export function isFuture(dateOrTime: DateOrTime): boolean {
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
export function daysAgo(dateOrTime: DateOrTime, days: number): DateOrInstant {
  return advance(dateOrTime, { days: -days });
}

export function daysSince(dateOrTime: Temporal.PlainDate, days: number): Temporal.PlainDate;
export function daysSince(dateOrTime: Date, days: number): Temporal.Instant;
export function daysSince(dateOrTime: DateOrInstant, days: number): DateOrInstant;
export function daysSince(dateOrTime: DateOrTime | Temporal.Instant, days: number): DateOrInstant {
  return advance(dateOrTime, { days: days });
}

export function weeksAgo(dateOrTime: Temporal.PlainDate, weeks: number): Temporal.PlainDate;
export function weeksAgo(dateOrTime: Date, weeks: number): Temporal.Instant;
export function weeksAgo(dateOrTime: DateOrTime, weeks: number): DateOrInstant {
  return advance(dateOrTime, { weeks: -weeks });
}

export function weeksSince(dateOrTime: Temporal.PlainDate, weeks: number): Temporal.PlainDate;
export function weeksSince(dateOrTime: Date, weeks: number): Temporal.Instant;
export function weeksSince(dateOrTime: DateOrTime, weeks: number): DateOrInstant {
  return advance(dateOrTime, { weeks: weeks });
}

export function monthsAgo(dateOrTime: Temporal.PlainDate, months: number): Temporal.PlainDate;
export function monthsAgo(dateOrTime: Date, months: number): Temporal.Instant;
export function monthsAgo(dateOrTime: DateOrTime, months: number): DateOrInstant {
  return advance(dateOrTime, { months: -months });
}

export function monthsSince(dateOrTime: Temporal.PlainDate, months: number): Temporal.PlainDate;
export function monthsSince(dateOrTime: Date, months: number): Temporal.Instant;
export function monthsSince(dateOrTime: DateOrTime, months: number): DateOrInstant {
  return advance(dateOrTime, { months: months });
}

export function yearsAgo(dateOrTime: Temporal.PlainDate, years: number): Temporal.PlainDate;
export function yearsAgo(dateOrTime: Date, years: number): Temporal.Instant;
export function yearsAgo(dateOrTime: DateOrTime, years: number): DateOrInstant {
  return advance(dateOrTime, { years: -years });
}

export function yearsSince(dateOrTime: Temporal.PlainDate, years: number): Temporal.PlainDate;
export function yearsSince(dateOrTime: Date, years: number): Temporal.Instant;
export function yearsSince(dateOrTime: DateOrTime, years: number): DateOrInstant {
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
    return nextWeek(dateOrTime as Date, "monday", { sameTime: true });
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
  dateOrTime: DateOrTime,
  startDay: string = date.beginningOfWeek(),
  { sameTime = false }: { sameTime?: boolean } = {},
): DateOrInstant {
  const result = firstHour(
    daysSince(beginningOfWeek(weeksAgo(dateOrTime as Date, 1)), daysSpan(startDay)),
  );
  return sameTime ? copyTimeTo(dateOrTime, result) : result;
}

export const lastWeek = prevWeek;

export function prevWeekday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function prevWeekday(dateOrTime: Date): Temporal.Instant;
export function prevWeekday(dateOrTime: DateOrTime): DateOrInstant {
  if (isOnWeekend(prevDay(dateOrTime))) {
    return copyTimeTo(dateOrTime, beginningOfWeek(dateOrTime as Date, "friday"));
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
export function beginningOfWeek(dateOrTime: DateOrInstant, startDay?: string): DateOrInstant;
export function beginningOfWeek(
  dateOrTime: DateOrTime | Temporal.Instant,
  startDay: string = date.beginningOfWeek(),
): DateOrInstant {
  const result = daysAgo(dateOrTime as Date, daysToWeekStart(dateOrTime, startDay));
  return Object.actsLike(dateOrTime, "time") ? time.midnight(receiver(result) as Date) : result;
}

export const atBeginningOfWeek = beginningOfWeek;

export function monday(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function monday(dateOrTime: Date): Temporal.Instant;
export function monday(dateOrTime: DateOrTime): DateOrInstant {
  return beginningOfWeek(dateOrTime as Date, "monday");
}

export function endOfWeek(dateOrTime: Temporal.PlainDate, startDay?: string): Temporal.PlainDate;
export function endOfWeek(dateOrTime: Date, startDay?: string): Temporal.Instant;
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
  return endOfWeek(dateOrTime as Date, "monday");
}

export function endOfMonth(dateOrTime: Temporal.PlainDate): Temporal.PlainDate;
export function endOfMonth(dateOrTime: Date): Temporal.Instant;
export function endOfMonth(dateOrTime: DateOrInstant): DateOrInstant;
export function endOfMonth(dateOrTime: DateOrTime | Temporal.Instant): DateOrInstant {
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
export function nextOccurring(dateOrTime: DateOrTime, dayOfWeek: string): DateOrInstant {
  let fromNow = fetch<number>(DAYS_INTO_WEEK, dayOfWeek) - wday(dateOrTime);
  if (!(fromNow > 0)) fromNow += 7;
  return advance(dateOrTime, { days: fromNow });
}

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

/** @internal */
function firstHour(dateOrTime: DateOrInstant): DateOrInstant {
  return Object.actsLike(dateOrTime, "time")
    ? time.beginningOfDay(receiver(dateOrTime) as Date)
    : dateOrTime;
}

/** @internal */
function lastHour(dateOrTime: DateOrInstant): DateOrInstant {
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
