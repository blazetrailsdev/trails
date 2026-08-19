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

import { DateTime as RubyDateTime, Temporal, Time, cCivilToJd } from "@blazetrails/date";
import { secFraction } from "../../time-ext.js";
import { DATE_FORMATS } from "../time/conversions.js";
import { TimeZone } from "../../values/time-zone.js";
import { isUtc, secondsSinceMidnight, utcOffset } from "./calculations.js";

/**
 * The receiver of this file's instance members: the seat
 * `@blazetrails/date`'s `DateTime#toDatetime` answers, where a `PlainDateTime`
 * is the offset-0 case a Ruby `DateTime` defaults to.
 */
type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;

/**
 * Convert to a formatted string. See `Time::DATE_FORMATS` for predefined
 * formats.
 *
 * This method is aliased to {@link toFormattedS}.
 *
 *     toFs(datetime, "db")            // => "2007-12-04 00:00:00"
 *     toFs(datetime, "long_ordinal")  // => "December 4th, 2007 00:00"
 *     toFs(datetime, "rfc822")        // => "Tue, 04 Dec 2007 00:00:00 +0000"
 *
 * Mirrors: `DateTime#to_fs` (`core_ext/date_time/conversions.rb:35-40`) —
 * `formatter.respond_to?(:call) ? formatter.call(self).to_s : strftime(formatter)`,
 * else `to_s`. The unknown-format arm falls through to ruby/date's own
 * `DateTime#to_s` (`date_core.c` `dt_lite_to_s`), not to a format string.
 */
export function toFs(datetime: DateTime, format = "default"): string {
  const formatter = DATE_FORMATS[format];
  if (formatter != null) {
    return typeof formatter === "function"
      ? String(formatter(datetime))
      : new RubyDateTime(datetime).strftime(formatter);
  }
  return new RubyDateTime(datetime).toS();
}

/** Mirrors: `alias_method :to_formatted_s, :to_fs` (`core_ext/date_time/conversions.rb:42`). */
export const toFormattedS = toFs;

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
 * Overrides the default inspect method with a human readable one, e.g.,
 * "Mon, 21 Feb 2005 14:30:00 +0000".
 *
 * Mirrors: `DateTime#readable_inspect`
 * (`core_ext/date_time/conversions.rb:56-58`) — `to_fs(:rfc822)`. Rails then
 * runs `alias_method :inspect, :readable_inspect`, reopening `::DateTime`
 * itself; trails has no receiver to reopen, so callers reach this name
 * directly.
 */
export function readableInspect(datetime: DateTime): string {
  return toFs(datetime, "rfc822");
}

/**
 * Mirrors: `alias_method :default_inspect, :inspect`
 * (`core_ext/date_time/conversions.rb:59`), which captures the ORIGINAL
 * `::DateTime#inspect` — ruby/date's `d_lite_inspect` — before the line below
 * it replaces `inspect` with {@link readableInspect}.
 */
export function defaultInspect(datetime: DateTime): string {
  return new RubyDateTime(datetime).inspect();
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
 * Mirrors: `DateTime#offset_in_seconds`
 * (`core_ext/date_time/conversions.rb:99-101`) — `(offset * 86400).to_i`,
 * where `offset` is ruby/date's own reader (`date_core.c` `d_lite_offset`),
 * the offset as a Rational fraction of a day.
 */
export function offsetInSeconds(datetime: DateTime): number {
  return new RubyDateTime(datetime).offset.mul(86400).toI();
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
