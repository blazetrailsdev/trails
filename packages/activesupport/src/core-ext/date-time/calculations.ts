/**
 * The `DateTime` arm of ActiveSupport's calculations reopenings
 * (`core_ext/date_time/calculations.rb`). Rails keeps `Time`, `Date` and
 * `DateTime` as three separate receivers, and the members whose bodies differ
 * only by the receiver's class live on `time-ext.ts` (the instant arm) or
 * `core-ext/date/calculations.ts` (the calendar-day arm). This file is the
 * DateTime one, keyed on the `Temporal.PlainDateTime | Temporal.ZonedDateTime`
 * seat `@blazetrails/date`'s `DateTime#toDatetime` answers — a civil date plus
 * a time of day, carrying an offset only where it is not UTC, which is what a
 * Ruby `DateTime` is. Every member here returns a DateTime rather than the
 * `Temporal.Instant` the `Time` arm returns, so one function could not answer
 * both: `Time.current` (`time/calculations.rb:39-41`) is `DateTime.current`
 * (`:10-12`) without the `to_datetime` tail, and `Time#change`
 * (`time/calculations.rb:130-176`) rebuilds a zoned instant where
 * `DateTime#change` (`:51-71`) rebuilds a civil date at an offset.
 *
 * Mirrors: `class DateTime` (`core_ext/date_time/calculations.rb`)
 */

import {
  Date as RubyDate,
  DateTime as RubyDateTime,
  Rational,
  Temporal,
  Time,
} from "@blazetrails/date";
import { rational } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../../hash-utils.js";
import { instantFrom } from "../../temporal.js";
import { currentTime } from "../../time-travel.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { zone as timeZone } from "../../time-zone-config.js";
import { secFraction } from "../../time-ext.js";
import * as date from "../date/calculations.js";
import { toDatetime as stringToDatetime } from "../string/conversions.js";
import { nsec, toI } from "./conversions.js";

/**
 * The receiver of this file's instance members: the seat
 * `@blazetrails/date`'s `DateTime#toDatetime` answers, where a `PlainDateTime`
 * is the offset-0 case a Ruby `DateTime` defaults to.
 */
type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;

/**
 * Mirrors: `DateTime.current` (`date_time/calculations.rb:10-12`) —
 * `::Time.zone ? ::Time.zone.now.to_datetime : ::Time.now.to_datetime`.
 *
 * `::Time.now` is trails' `currentTime()`, the travel-aware clock read
 * `Time.current` takes; the ruby/date `Time` it is handed to is what carries
 * `Time#to_datetime` (`packages/date/src/time.ts`), whose constructor reads the
 * same local-zone components `::Time.now` answers.
 */
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

/**
 * Mirrors: `DateTime#seconds_since_midnight` (`date_time/calculations.rb:20-22`)
 * — `sec + (min * 60) + (hour * 3600)`, a whole-second count with none of the
 * sub-second arithmetic `Time#seconds_since_midnight`
 * (`time/calculations.rb:64-66`) does.
 */
export function secondsSinceMidnight(datetime: DateTime): number {
  const self = new RubyDateTime(datetime);
  return self.sec + self.min * 60 + self.hour * 3600;
}

/**
 * Mirrors: `DateTime#seconds_until_end_of_day`
 * (`date_time/calculations.rb:29-31`) — `end_of_day.to_i - to_i`, where
 * `DateTime#to_i` is `seconds_since_unix_epoch.to_i`
 * (`date_time/conversions.rb:84-86`).
 */
export function secondsUntilEndOfDay(datetime: DateTime): number {
  return toI(endOfDay(datetime)) - toI(datetime);
}

/** Mirrors: `DateTime#subsec` (`date_time/calculations.rb:36-38`) — `sec_fraction`. */
export function subsec(datetime: DateTime): number {
  return secFraction(datetime);
}

/** The keys `DateTime#change` reads (`date_time/calculations.rb:51-71`). */
interface ChangeOptions {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  min?: number;
  sec?: number;
  usec?: number | Rational;
  nsec?: number;
  /** Ruby's `:offset` is a day fraction, a seconds Integer or a `"+09:00"` String. */
  offset?: number | Rational | string;
  start?: number;
}

/**
 * Mirrors: `DateTime#change` (`date_time/calculations.rb:51-71`).
 *
 * `nsec` and `sec_fraction` are `DateTime`'s own readers
 * (`date_time/conversions.rb:94-96`, ruby/date `d_lite_sec_fraction`), and
 * `offset` / `start` are read off the ruby/date receiver the seat widens into,
 * which is where `DateTime.civil` takes them back.
 *
 * `options.fetch` yields the stored value whenever the key is present — a zero
 * included — and Ruby's `options[:hour] || options[:min] || options[:sec]` is
 * false only for a missing key, never for a `0`, so both read presence rather
 * than truthiness here.
 */
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
    newFraction = new Rational(newNsec, 1000000000);
  } else {
    const newUsec =
      "usec" in options
        ? options.usec!
        : options.hour != null || options.min != null || options.sec != null
          ? 0
          : new Rational(nsec(datetime), 1000);
    newFraction =
      newUsec instanceof Rational ? newUsec.quo(1000000) : new Rational(newUsec, 1000000);
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

/**
 * `Hash#inspect` over the options `change` raises with — Ruby 3.4 spells a
 * Symbol key `nsec: 1`.
 * @internal
 */
function inspect(options: ChangeOptions): string {
  return `{${Object.entries(options)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? `"${value}"` : String(value)}`)
    .join(", ")}}`;
}

/** The keys `DateTime#advance` reads (`date_time/calculations.rb:82-105`). */
interface AdvanceOptions {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

/**
 * Mirrors: `DateTime#advance` (`date_time/calculations.rb:82-105`). Rails
 * normalises the fractional `:weeks` / `:days` back into the caller's hash —
 * `Date#advance` (`date/calculations.rb:127-136`) reads it only — so the
 * writes below land on the passed object, as the Ruby's do. `divmod(1)` floors
 * and answers the non-negative remainder, which is what the two splits below
 * spell out.
 */
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

/** Mirrors: `DateTime#ago` (`date_time/calculations.rb:109-111`) — `since(-seconds)`. */
export function ago(datetime: DateTime, seconds: number): DateTime {
  return since(datetime, -seconds);
}

/**
 * Mirrors: `DateTime#since` (`date_time/calculations.rb:116-118`) —
 * `self + Rational(seconds, 86400)`.
 */
export function since(datetime: DateTime, seconds: number): DateTime {
  return new RubyDateTime(datetime).plus(new Rational(seconds, 86400)).toDatetime();
}

/**
 * Mirrors: `alias :in :since` (`date_time/calculations.rb:119`). `in` is a
 * reserved word, so it cannot be a binding name; the export name can be one,
 * and that is the name importers and the comparator see.
 */
export { since as in };

/** Mirrors: `DateTime#beginning_of_day` (`date_time/calculations.rb:122-124`) */
export function beginningOfDay(datetime: DateTime): DateTime {
  return change(datetime, { hour: 0 });
}

/** Mirrors: `alias :midnight :beginning_of_day` (`date_time/calculations.rb:125`) */
export const midnight = beginningOfDay;

/** Mirrors: `alias :at_midnight :beginning_of_day` (`date_time/calculations.rb:126`) */
export const atMidnight = beginningOfDay;

/** Mirrors: `alias :at_beginning_of_day :beginning_of_day` (`date_time/calculations.rb:127`) */
export const atBeginningOfDay = beginningOfDay;

/** Mirrors: `DateTime#middle_of_day` (`date_time/calculations.rb:130-132`) */
export function middleOfDay(datetime: DateTime): DateTime {
  return change(datetime, { hour: 12 });
}

/** Mirrors: `alias :midday :middle_of_day` (`date_time/calculations.rb:133`) */
export const midday = middleOfDay;

/** Mirrors: `alias :noon :middle_of_day` (`date_time/calculations.rb:134`) */
export const noon = middleOfDay;

/** Mirrors: `alias :at_midday :middle_of_day` (`date_time/calculations.rb:135`) */
export const atMidday = middleOfDay;

/** Mirrors: `alias :at_noon :middle_of_day` (`date_time/calculations.rb:136`) */
export const atNoon = middleOfDay;

/** Mirrors: `alias :at_middle_of_day :middle_of_day` (`date_time/calculations.rb:137`) */
export const atMiddleOfDay = middleOfDay;

/** Mirrors: `DateTime#end_of_day` (`date_time/calculations.rb:140-142`) */
export function endOfDay(datetime: DateTime): DateTime {
  return change(datetime, { hour: 23, min: 59, sec: 59, usec: rational(999999999, 1000) });
}

/** Mirrors: `alias :at_end_of_day :end_of_day` (`date_time/calculations.rb:143`) */
export const atEndOfDay = endOfDay;

/** Mirrors: `DateTime#beginning_of_hour` (`date_time/calculations.rb:146-148`) */
export function beginningOfHour(datetime: DateTime): DateTime {
  return change(datetime, { min: 0 });
}

/** Mirrors: `alias :at_beginning_of_hour :beginning_of_hour` (`date_time/calculations.rb:149`) */
export const atBeginningOfHour = beginningOfHour;

/** Mirrors: `DateTime#end_of_hour` (`date_time/calculations.rb:152-154`) */
export function endOfHour(datetime: DateTime): DateTime {
  return change(datetime, { min: 59, sec: 59, usec: rational(999999999, 1000) });
}

/** Mirrors: `alias :at_end_of_hour :end_of_hour` (`date_time/calculations.rb:155`) */
export const atEndOfHour = endOfHour;

/** Mirrors: `DateTime#beginning_of_minute` (`date_time/calculations.rb:158-160`) */
export function beginningOfMinute(datetime: DateTime): DateTime {
  return change(datetime, { sec: 0 });
}

/** Mirrors: `alias :at_beginning_of_minute :beginning_of_minute` (`date_time/calculations.rb:161`) */
export const atBeginningOfMinute = beginningOfMinute;

/** Mirrors: `DateTime#end_of_minute` (`date_time/calculations.rb:164-166`) */
export function endOfMinute(datetime: DateTime): DateTime {
  return change(datetime, { sec: 59, usec: rational(999999999, 1000) });
}

/** Mirrors: `alias :at_end_of_minute :end_of_minute` (`date_time/calculations.rb:167`) */
export const atEndOfMinute = endOfMinute;

/**
 * Returns a `Time` instance of the simultaneous time in the system timezone.
 *
 * Mirrors: `DateTime#localtime(utc_offset = nil)`
 * (`date_time/calculations.rb:170-178`). `new_offset(0)` re-reads the receiver
 * at a zero offset, so the components handed to `Time.utc` are the UTC ones,
 * and `getlocal` moves that instant to the local zone (or to `utcOffset`).
 */
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

/** Mirrors: `alias_method :getlocal, :localtime` (`date_time/calculations.rb:179`) */
export const getlocal = localtime;

/**
 * Returns a `Time` instance of the simultaneous time in the UTC timezone.
 *
 * Mirrors: `DateTime#utc` (`date_time/calculations.rb:184-191`).
 */
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

/** Mirrors: `alias_method :getgm, :utc` (`date_time/calculations.rb:192`) */
export const getgm = utc;

/** Mirrors: `alias_method :getutc, :utc` (`date_time/calculations.rb:193`) */
export const getutc = utc;

/** Mirrors: `alias_method :gmtime, :utc` (`date_time/calculations.rb:194`) */
export const gmtime = utc;

/**
 * Mirrors: `DateTime#utc?` (`date_time/calculations.rb:196-198`) —
 * `offset == 0`.
 */
export function isUtc(datetime: DateTime): boolean {
  return new RubyDateTime(datetime).offset.isZero();
}

/**
 * Returns the offset value in seconds.
 *
 * Mirrors: `DateTime#utc_offset` (`date_time/calculations.rb:201-203`) —
 * `(offset * 86400).to_i`.
 */
export function utcOffset(datetime: DateTime): number {
  return new RubyDateTime(datetime).offset.mul(86400).toI();
}

/**
 * Layers additional behavior on `DateTime#<=>` so that `Time` and
 * `ActiveSupport::TimeWithZone` instances can be compared with a `DateTime`.
 *
 * Mirrors: `DateTime#<=>(other)` (`date_time/calculations.rb:208-214`), whose
 * `super` is ruby/date's own `Date#<=>` ({@link RubyDateTime#cmp},
 * `date_core.c` `d_lite_cmp`) — the arm that takes the Integer, Float and
 * Rational astronomical Julian days Rails' own tests compare against.
 *
 * Ruby dispatches the first arm on `respond_to? :to_datetime`, which TS has no
 * equivalent for: the guard below is the closed list of trails values that
 * answer `to_datetime` — the ruby/date receivers, a `TimeWithZone`, a String,
 * and the `Temporal` seats a DateTime, a Date and a Time are carried as — and
 * the conditional inside the `try` is the `to_datetime` dispatch itself, one
 * arm per receiver. A blank or unparsable String is `nil` from
 * `String#to_datetime` (`core_ext/string/conversions.rb:56-58`), which Ruby
 * hands to `super` and `rescue nil` then swallows; `rescue nil` covers
 * `other.to_datetime` as well as the `super` call.
 */
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
