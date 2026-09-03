import { Date as RubyDate, DateTime as RubyDateTime, Temporal, Time } from "@blazetrails/date";
import { Rational, rational } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../../hash-utils.js";
import { instantFrom } from "../../temporal.js";
import { currentTime } from "../../time-travel.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { zone as timeZone } from "../../time-zone-config.js";
import { secFraction } from "../../time-ext.js";
import * as date from "../date/calculations.js";
import { toDatetime as stringToDatetime } from "../string/conversions.js";
import { nsec, toI } from "./conversions.js";

type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;

export function current(): Temporal.PlainDateTime | Temporal.ZonedDateTime {
  const zone = timeZone();
  if (zone) {
    return new TimeWithZone(instantFrom(currentTime()), zone).toDatetime();
  }
  const now = currentTime();
  return new Time(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds() + now.getMilliseconds() / 1000,
  ).toDatetime();
}

export function secondsSinceMidnight(datetime: DateTime): number {
  const self = new RubyDateTime(datetime);
  return self.sec + self.min * 60 + self.hour * 3600;
}

export function secondsUntilEndOfDay(datetime: DateTime): number {
  return toI(endOfDay(datetime)) - toI(datetime);
}

export function subsec(datetime: DateTime): number {
  return secFraction(datetime);
}

interface ChangeOptions {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  min?: number;
  sec?: number;
  usec?: number | Rational;
  nsec?: number;
  offset?: number | Rational | string;
  start?: number;
}

export function change(datetime: DateTime, options: ChangeOptions): DateTime {
  const self = new RubyDateTime(datetime);

  let newFraction: Rational;
  const newNsec = options.nsec;
  if (newNsec != null) {
    if (options.usec != null) {
      throw new ArgumentError(
        `Can't change both :nsec and :usec at the same time: ${inspect(options)}`,
      );
    }
    newFraction = rational(newNsec, 1000000000);
  } else {
    const newUsec =
      "usec" in options
        ? options.usec!
        : options.hour != null || options.min != null || options.sec != null
          ? 0
          : rational(nsec(datetime), 1000);
    newFraction = rational(newUsec, 1000000);
  }

  if (newFraction.cmp(1) >= 0) throw new ArgumentError("argument out of range");

  return RubyDateTime.civil(
    "year" in options ? options.year! : Number(self.year),
    "month" in options ? options.month! : self.month,
    "day" in options ? options.day! : self.day,
    "hour" in options ? options.hour! : self.hour,
    "min" in options ? options.min! : options.hour != null ? 0 : self.min,
    newFraction.add(
      "sec" in options ? options.sec! : options.hour != null || options.min != null ? 0 : self.sec,
    ),
    "offset" in options ? options.offset! : self.offset,
    "start" in options ? options.start! : self.start,
  );
}

/** @internal */
function inspect(options: ChangeOptions): string {
  return `{${Object.entries(options)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? `"${value}"` : String(value)}`)
    .join(", ")}}`;
}

interface AdvanceOptions {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export function advance(datetime: DateTime, options: AdvanceOptions): DateTime {
  if (options.weeks != null) {
    const partialWeeks = options.weeks - Math.floor(options.weeks);
    options.weeks = Math.floor(options.weeks);
    options.days = (options.days ?? 0) + 7 * partialWeeks;
  }

  if (options.days != null) {
    const partialDays = options.days - Math.floor(options.days);
    options.days = Math.floor(options.days);
    options.hours = (options.hours ?? 0) + 24 * partialDays;
  }

  const d = date.advance(new RubyDateTime(datetime).toDate(), options);
  const datetimeAdvancedByDate = change(datetime, { year: d.year, month: d.month, day: d.day });
  const secondsToAdvance =
    (options.seconds ?? 0) + (options.minutes ?? 0) * 60 + (options.hours ?? 0) * 3600;

  if (secondsToAdvance === 0) {
    return datetimeAdvancedByDate;
  } else {
    return since(datetimeAdvancedByDate, secondsToAdvance);
  }
}

export function ago(datetime: DateTime, seconds: number): DateTime {
  return since(datetime, -seconds);
}

export function since(datetime: DateTime, seconds: number): DateTime {
  return new RubyDateTime(datetime).plus(rational(seconds, 86400)).toDatetime();
}

export { since as in };

export function beginningOfDay(datetime: DateTime): DateTime {
  return change(datetime, { hour: 0 });
}

export const midnight = beginningOfDay;

export const atMidnight = beginningOfDay;

export const atBeginningOfDay = beginningOfDay;

export function middleOfDay(datetime: DateTime): DateTime {
  return change(datetime, { hour: 12 });
}

export const midday = middleOfDay;

export const noon = middleOfDay;

export const atMidday = middleOfDay;

export const atNoon = middleOfDay;

export const atMiddleOfDay = middleOfDay;

export function endOfDay(datetime: DateTime): DateTime {
  return change(datetime, { hour: 23, min: 59, sec: 59, usec: rational(999999999, 1000) });
}

export const atEndOfDay = endOfDay;

export function beginningOfHour(datetime: DateTime): DateTime {
  return change(datetime, { min: 0 });
}

export const atBeginningOfHour = beginningOfHour;

export function endOfHour(datetime: DateTime): DateTime {
  return change(datetime, { min: 59, sec: 59, usec: rational(999999999, 1000) });
}

export const atEndOfHour = endOfHour;

export function beginningOfMinute(datetime: DateTime): DateTime {
  return change(datetime, { sec: 0 });
}

export const atBeginningOfMinute = beginningOfMinute;

export function endOfMinute(datetime: DateTime): DateTime {
  return change(datetime, { sec: 59, usec: rational(999999999, 1000) });
}

export const atEndOfMinute = endOfMinute;

export function localtime(datetime: DateTime, utcOffset: number | string | null = null): Time {
  const utc = new RubyDateTime(datetime).newOffset(0);

  return Time.utc(
    Number(utc.year),
    utc.month,
    utc.day,
    utc.hour,
    utc.min,
    new Rational(utc.sec, 1).add(utc.secFraction),
  ).getlocal(utcOffset);
}

export const getlocal = localtime;

export function utc(datetime: DateTime): Time {
  const utc = new RubyDateTime(datetime).newOffset(0);

  return Time.utc(
    Number(utc.year),
    utc.month,
    utc.day,
    utc.hour,
    utc.min,
    new Rational(utc.sec, 1).add(utc.secFraction),
  );
}

export const getgm = utc;

export const getutc = utc;

export const gmtime = utc;

export function isUtc(datetime: DateTime): boolean {
  return new RubyDateTime(datetime).offset.isZero();
}

export function utcOffset(datetime: DateTime): number {
  return new RubyDateTime(datetime).offset.mul(86400).toI();
}

export function compare(datetime: DateTime, other: unknown): number | null {
  if (
    typeof other === "string" ||
    other instanceof Time ||
    other instanceof TimeWithZone ||
    other instanceof RubyDate ||
    // boundary: a JS `Date` is trails' `Time` seat, and Ruby's `Time` answers `to_datetime`.
    other instanceof globalThis.Date ||
    other instanceof Temporal.PlainDate ||
    other instanceof Temporal.PlainDateTime ||
    other instanceof Temporal.ZonedDateTime ||
    other instanceof Temporal.Instant
  ) {
    try {
      const asDatetime: Temporal.PlainDateTime | Temporal.ZonedDateTime | undefined =
        typeof other === "string"
          ? stringToDatetime(other)
          : other instanceof Time || other instanceof TimeWithZone || other instanceof RubyDate
            ? other.toDatetime()
            : other instanceof Temporal.PlainDate
              ? new RubyDate(other).toDatetime()
              : other instanceof Temporal.Instant
                ? Time.at(new Rational(other.epochNanoseconds, 1_000_000_000n)).toDatetime()
                : // boundary: the `Time` seat again, on the `to_datetime` arm.
                  other instanceof globalThis.Date
                  ? Time.at(new Rational(BigInt(other.getTime()), 1000n)).toDatetime()
                  : other;
      if (asDatetime === undefined) return null;
      return new RubyDateTime(datetime).cmp(new RubyDateTime(asDatetime));
    } catch {
      return null;
    }
  } else {
    return new RubyDateTime(datetime).cmp(other);
  }
}
