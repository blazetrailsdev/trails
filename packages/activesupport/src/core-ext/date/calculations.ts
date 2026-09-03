import { Temporal, Date as RubyDate } from "@blazetrails/date";
import { Duration } from "../../duration.js";
import { IsolatedExecutionState } from "../../isolated-execution-state.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { ArgumentError, zone as timeZone } from "../../time-zone-config.js";
import { DAYS_INTO_WEEK } from "../date-and-time/calculations.js";
import { inTimeZone } from "../date-and-time/zones.js";

const BEGINNING_OF_WEEK = "beginning_of_week";

let _beginningOfWeekDefault: string | null = null;

export function beginningOfWeekDefault(): string | null {
  return _beginningOfWeekDefault;
}

export function setBeginningOfWeekDefault(weekStart: string | null): void {
  _beginningOfWeekDefault = weekStart;
}

export function beginningOfWeek(): string {
  return (
    IsolatedExecutionState.get<string>(BEGINNING_OF_WEEK) ?? beginningOfWeekDefault() ?? "monday"
  );
}

export function setBeginningOfWeek(weekStart: string): void {
  IsolatedExecutionState.set(BEGINNING_OF_WEEK, findBeginningOfWeekBang(weekStart));
}

export function findBeginningOfWeekBang(weekStart: string): string {
  if (!Object.prototype.hasOwnProperty.call(DAYS_INTO_WEEK, weekStart)) {
    throw new ArgumentError(`Invalid beginning of week: ${weekStart}`);
  }
  return weekStart;
}

export function yesterday(): Temporal.PlainDate {
  return advance(current(), { days: -1 });
}

export function tomorrow(): Temporal.PlainDate {
  return advance(current(), { days: 1 });
}

export function current(): Temporal.PlainDate {
  const zone = timeZone();
  if (zone) {
    return zone.today();
  }
  return Temporal.Now.plainDateISO();
}

export function ago(date: Temporal.PlainDate, seconds: number): TimeWithZone {
  return inTimeZone(date).since(-seconds);
}

export function since(date: Temporal.PlainDate, seconds: number): TimeWithZone {
  return inTimeZone(date).since(seconds);
}

export { since as in };

export function beginningOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date);
}

export const midnight = beginningOfDay;

export const atMidnight = beginningOfDay;

export const atBeginningOfDay = beginningOfDay;

export function middleOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date).middleOfDay();
}

export const midday = middleOfDay;

export const noon = middleOfDay;

export const atMidday = middleOfDay;

export const atNoon = middleOfDay;

export const atMiddleOfDay = middleOfDay;

export function endOfDay(date: Temporal.PlainDate): TimeWithZone {
  return inTimeZone(date).endOfDay();
}

export const atEndOfDay = endOfDay;

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

export function plusWithoutDuration(date: Temporal.PlainDate, other: number): Temporal.PlainDate {
  return date.add({ days: other });
}

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

export function minusWithoutDuration(
  date: Temporal.PlainDate,
  other: number | Temporal.PlainDate,
): Temporal.PlainDate | number {
  if (other instanceof Temporal.PlainDate) {
    return date.since(other, { largestUnit: "day" }).days;
  }
  return date.subtract({ days: other });
}

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

export function change(
  date: Temporal.PlainDate,
  options: { year?: number; month?: number; day?: number },
): Temporal.PlainDate {
  return new Temporal.PlainDate(
    "year" in options ? options.year! : date.year,
    "month" in options ? options.month! : date.month,
    "day" in options ? options.day! : date.day,
  );
}

export function compareWithCoercion(
  date: Temporal.PlainDate,
  other: Temporal.PlainDate | Date | Temporal.Instant | TimeWithZone,
): number {
  // boundary: a JS `Date` is one of trails' moment receivers, and this arm is
  if (other instanceof Date || other instanceof Temporal.Instant || other instanceof TimeWithZone) {
    const toDatetime = new RubyDate(date).toDatetime();
    const instant =
      other instanceof Temporal.Instant
        ? other
        : other instanceof TimeWithZone
          ? other.utc().toTime().toInstant()
          : Temporal.Instant.fromEpochMilliseconds(other.getTime());
    return Temporal.Instant.compare(
      (toDatetime instanceof Temporal.ZonedDateTime
        ? toDatetime
        : toDatetime.toZonedDateTime("UTC")
      ).toInstant(),
      instant,
    );
  } else {
    return compareWithoutCoercion(date, other);
  }
}

export function compareWithoutCoercion(
  date: Temporal.PlainDate,
  other: Temporal.PlainDate,
): number {
  return Temporal.PlainDate.compare(date, other);
}
