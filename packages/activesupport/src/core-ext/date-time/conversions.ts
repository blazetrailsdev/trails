/**
 * The `DateTime` arm of ActiveSupport's conversions reopenings
 * (`core_ext/date_time/conversions.rb`), the sibling of
 * `core-ext/date-time/calculations.ts` and keyed on the same
 * `Temporal.PlainDateTime | Temporal.ZonedDateTime` seat: a civil date plus a
 * time of day, carrying an offset only where it is not UTC. Every member here
 * reads the receiver's `offset` and its Julian day rather than an instant's
 * epoch, which is why they are not the `Time` arm's same-named readers on
 * `time-ext.ts` (`core_ext/time/conversions.rb`).
 *
 * Mirrors: `class DateTime` (`core_ext/date_time/conversions.rb`)
 */

import { Rational, Temporal, Time, cCivilToJd } from "@blazetrails/date";
import { secFraction } from "../../time-ext.js";
import { TimeZone } from "../../values/time-zone.js";
import { isUtc, secondsSinceMidnight, utcOffset } from "./calculations.js";

/**
 * The receiver of this file's instance members: the seat
 * `@blazetrails/date`'s `DateTime#toDatetime` answers, where a `PlainDateTime`
 * is the offset-0 case a Ruby `DateTime` defaults to.
 */
type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;

/**
 * Returns a formatted string of the offset from UTC, or an alternative string
 * if the time zone is already UTC.
 *
 * Mirrors: `DateTime#formatted_offset` (`core_ext/date_time/conversions.rb:51-53`)
 * — `utc? && alternate_utc_string || ActiveSupport::TimeZone.seconds_to_utc_offset(utc_offset, colon)`.
 * Ruby's `alternate_utc_string` is any non-nil String — `""` included — so the
 * arm is chosen on presence rather than on truthiness.
 */
export function formattedOffset(
  datetime: DateTime,
  colon = true,
  alternateUtcString: string | null = null,
): string {
  if (isUtc(datetime) && alternateUtcString != null) return alternateUtcString;
  return TimeZone.secondsToUtcOffset(utcOffset(datetime), colon);
}

/**
 * Returns DateTime with local offset for given year if format is local else
 * offset is zero.
 *
 * Mirrors: `DateTime.civil_from_format`
 * (`core_ext/date_time/conversions.rb:69-76`). Ruby's `offset` is a Rational
 * fraction of a day, which is how `civil` takes it; `Temporal` takes the same
 * offset as the zone the wall clock is read in, so the `:local` arm reads
 * `Time.local(year, month, day).utc_offset` off a bare ruby/date `Time`,
 * exactly as Ruby does.
 */
export function civilFromFormat(
  utcOrLocal: string,
  year: number,
  month = 1,
  day = 1,
  hour = 0,
  min = 0,
  sec = 0,
): Temporal.ZonedDateTime {
  let offset: number;
  if (utcOrLocal === "local") {
    offset = Time.local(year, month, day).utcOffset;
  } else {
    offset = 0;
  }
  const offsetHours = String(Math.trunc(Math.abs(offset) / 3600)).padStart(2, "0");
  const offsetMinutes = String(Math.trunc((Math.abs(offset) % 3600) / 60)).padStart(2, "0");
  const offsetId = `${offset < 0 ? "-" : "+"}${offsetHours}:${offsetMinutes}`;
  return Temporal.PlainDateTime.from({
    year,
    month,
    day,
    hour,
    minute: min,
    second: sec,
  }).toZonedDateTime(offsetId);
}

/**
 * Converts `self` to a floating-point number of seconds, including fractional
 * microseconds, since the Unix epoch.
 *
 * Mirrors: `DateTime#to_f` (`core_ext/date_time/conversions.rb:79-82`) —
 * `seconds_since_unix_epoch.to_f + sec_fraction`.
 */
export function toF(datetime: DateTime): number {
  return secondsSinceUnixEpoch(datetime) + secFraction(datetime);
}

/**
 * Converts `self` to an integer number of seconds since the Unix epoch.
 *
 * Mirrors: `DateTime#to_i` (`core_ext/date_time/conversions.rb:84-86`) —
 * `seconds_since_unix_epoch.to_i`.
 */
export function toI(datetime: DateTime): number {
  return Math.trunc(secondsSinceUnixEpoch(datetime));
}

/**
 * Returns the fraction of a second as microseconds.
 *
 * Mirrors: `DateTime#usec` (`core_ext/date_time/conversions.rb:89-91`) —
 * `(sec_fraction * 1_000_000).to_i`.
 */
export function usec(datetime: DateTime): number {
  return Math.trunc(secFraction(datetime) * 1_000_000);
}

/**
 * Returns the fraction of a second as nanoseconds.
 *
 * Mirrors: `DateTime#nsec` (`core_ext/date_time/conversions.rb:94-96`) —
 * `(sec_fraction * 1_000_000_000).to_i`.
 */
export function nsec(datetime: DateTime): number {
  return Math.trunc(secFraction(datetime) * 1_000_000_000);
}

/**
 * Ruby `DateTime#offset` (ruby/date, `date_core.c` `d_lite_offset`) over the
 * seat this file's `DateTime` methods take: the offset as a Rational fraction
 * of a day, built from `of` in seconds. `@blazetrails/date`'s `DateTime#offset`
 * is the same reader over the ruby/date receiver; a `PlainDateTime` stands in
 * for the `+00:00` a `DateTime` defaults to (date.rb's `civil`).
 */
function offset(datetime: DateTime): Rational {
  const of =
    datetime instanceof Temporal.PlainDateTime
      ? 0
      : Math.trunc(datetime.offsetNanoseconds / 1_000_000_000);
  return new Rational(of, 86_400);
}

/**
 * Mirrors: `DateTime#offset_in_seconds`
 * (`core_ext/date_time/conversions.rb:99-101`) — `(offset * 86400).to_i`,
 * where Ruby's `offset` is the fraction of a day.
 */
export function offsetInSeconds(datetime: DateTime): number {
  return offset(datetime).mul(86400).toI();
}

/**
 * Mirrors: `DateTime#seconds_since_unix_epoch`
 * (`core_ext/date_time/conversions.rb:103-105`) — `(jd - 2440588) * 86400 -
 * offset_in_seconds + seconds_since_midnight`.
 */
export function secondsSinceUnixEpoch(datetime: DateTime): number {
  const jd = cCivilToJd(datetime.year, datetime.month, datetime.day);
  return (jd - 2440588) * 86400 - offsetInSeconds(datetime) + secondsSinceMidnight(datetime);
}
