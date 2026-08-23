/**
 * Mirrors: `class Time` (`core_ext/time/conversions.rb`) — the named formats
 * `to_fs` resolves and the offset formatter its `rfc822` entry reaches for.
 */

import { DateTime as RubyDateTime, Temporal, Time as RubyTime } from "@blazetrails/date";
import { formattedOffset as dateTimeFormattedOffset } from "../date-time/conversions.js";
import { ordinalize } from "../../inflector.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";

/**
 * The receivers `Time::DATE_FORMATS`' lambdas duck-type: a ruby/date `Time`,
 * the `PlainDateTime | ZonedDateTime` seat a Ruby `DateTime` stands on, and a
 * `TimeWithZone` — `time_with_zone.rb:212-220` resolves the same hash and
 * passes `self`. All three answer `day`, `strftime`, `formatted_offset`,
 * `rfc2822` and `iso8601`, which is every member those lambdas call.
 */
type DateFormatsReceiver =
  | RubyTime
  | TimeWithZone
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime;

/**
 * The named formats `to_fs` resolves, either a `strftime` string or a callable
 * taking the receiver.
 *
 * Mirrors: `Time::DATE_FORMATS` (`core_ext/time/conversions.rb:8-27`). The
 * Ruby keys are Symbols and the four lambdas duck-type their argument — a
 * `Time`, a `Date` or a `DateTime` all answer `day`, `strftime`,
 * `formatted_offset`, `rfc2822` and `iso8601` — so the hash is shared by every
 * `to_fs` in ActiveSupport. TS has no open classes, so the duck typing is the
 * `DateFormatsReceiver` union below and an explicit dispatch inside each
 * lambda: a ruby/date `Time` — the receiver `toFs` bridges a JS `Date` onto —
 * answers `strftime`/`rfc2822`/`iso8601` itself, and the `DateTime` seat
 * reaches the same names through `RubyDateTime`.
 *
 * `rfc822`'s `time.formatted_offset(false)` is the `Time` arm this file
 * declares for a `Time` receiver and `dateTimeFormattedOffset`
 * (`core_ext/date_time/conversions.rb`'s arm of the same Rails name) for the
 * `DateTime` one.
 *
 * That import closes a cycle with `core-ext/date-time/conversions.ts`, which
 * reads `DATE_FORMATS` back for its `to_fs`. Neither side touches the other at
 * module-eval time — the read is inside a lambda here and inside `toFs` there,
 * and neither file declares a `class ... extends` across the edge — so no
 * binding is in TDZ when either module body runs. Verified by importing the
 * built `dist/time-ext.js`, `dist/core-ext/date-time/conversions.js` and
 * `dist/index.js` as entry modules under plain node, per CLAUDE.md's
 * call-time-constant section; a vitest run enters through a funnel module and
 * would mask it.
 */
export const DATE_FORMATS: Record<string, string | ((time: DateFormatsReceiver) => string)> = {
  db: "%Y-%m-%d %H:%M:%S",
  inspect: "%Y-%m-%d %H:%M:%S.%9N %z",
  number: "%Y%m%d%H%M%S",
  nsec: "%Y%m%d%H%M%S%9N",
  usec: "%Y%m%d%H%M%S%6N",
  time: "%H:%M",
  short: "%d %b %H:%M",
  long: "%B %d, %Y %H:%M",
  long_ordinal: (time) => {
    const dayFormat = ordinalize(time.day);
    return (
      time instanceof RubyTime || time instanceof TimeWithZone ? time : new RubyDateTime(time)
    ).strftime(`%B ${dayFormat}, %Y %H:%M`);
  },
  rfc822: (time) => {
    const offsetFormat =
      time instanceof RubyTime
        ? formattedOffset(time, false)
        : time instanceof TimeWithZone
          ? time.formattedOffset(false)
          : dateTimeFormattedOffset(time, false);
    return (
      time instanceof RubyTime || time instanceof TimeWithZone ? time : new RubyDateTime(time)
    ).strftime(`%a, %d %b %Y %H:%M:%S ${offsetFormat}`);
  },
  rfc2822: (time) =>
    (time instanceof RubyTime || time instanceof TimeWithZone
      ? time
      : new RubyDateTime(time)
    ).rfc2822(),
  iso8601: (time) =>
    (time instanceof RubyTime || time instanceof TimeWithZone
      ? time
      : new RubyDateTime(time)
    ).iso8601(),
};

/**
 * Converts to a formatted string. See {@link DATE_FORMATS} for built-in
 * formats.
 *
 *     toFs(time, "time")   // => "06:10"
 *     toFs(time, "db")     // => "2007-01-18 06:10:17"
 *     toFs(time, "short")  // => "18 Jan 06:10"
 *
 * Mirrors: `Time#to_fs` (`core_ext/time/conversions.rb:55-61`) —
 * `formatter.respond_to?(:call) ? formatter.call(self).to_s : strftime(formatter)`,
 * else `to_s`, which for a `Time` is ruby/time.c's `time_to_s`.
 *
 * A JS `Date` is an instant with no zone of its own, so it is bridged onto the
 * ruby/date `Time` the Rails body formats as a `Time.utc` — the reading
 * `Date#toISOString` answers, and the receiver Rails' own tests of this
 * method's callers build (`range_ext_test.rb`'s `Time.utc` endpoints). A
 * `Temporal.Instant` is the same receiver with sub-millisecond precision — the
 * seat an ActiveRecord datetime attribute's cast value sits on — and is bridged
 * the same way, so `:usec`/`:nsec` still read the microseconds a `Date` cannot
 * carry.
 */
export function toFs(date: Date | Temporal.Instant | RubyTime, format: string = "default"): string {
  // A `::Time` receiver is already the one the Rails body formats — the value
  // `TimeWithZone#to_fs` hands over as `utc.to_fs(format)`
  // (time_with_zone.rb:220).
  let time: RubyTime;
  if (date instanceof RubyTime) {
    time = date;
  } else {
    const utc =
      // boundary: the JS `Date` a caller still holds is the instant this bridges
      // onto the ruby/date `Time` the Rails body formats.
      date instanceof Date
        ? Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO("UTC")
        : date.toZonedDateTimeISO("UTC");
    time = RubyTime.utc(
      utc.year,
      utc.month,
      utc.day,
      utc.hour,
      utc.minute,
      utc.second,
      utc.millisecond * 1_000 + utc.microsecond + utc.nanosecond / 1_000,
    );
  }
  const formatter = DATE_FORMATS[format];
  if (formatter != null) {
    return typeof formatter === "function" ? String(formatter(time)) : time.strftime(formatter);
  }
  return time.toS();
}

/** Mirrors: `alias_method :to_formatted_s, :to_fs` (`core_ext/time/conversions.rb:62`). */
export { toFs as toFormattedS };

/**
 * Returns a formatted string of the offset from UTC, or an alternative string
 * if the time zone is already UTC.
 *
 * Mirrors: `Time#formatted_offset` (`core_ext/time/conversions.rb:69-71`) —
 * `utc? && alternate_utc_string || ActiveSupport::TimeZone.seconds_to_utc_offset(utc_offset, colon)`.
 * A `Date` is an instant read in the system zone, so `utc?` is that zone's
 * offset being zero and `utc_offset` is the offset itself, in seconds; a
 * ruby/date `Time` — the receiver `Time::DATE_FORMATS`' `rfc822` lambda hands
 * over — answers both readers itself.
 * Ruby's `alternate_utc_string` is any non-nil String — `""` included — so the
 * arm is chosen on presence rather than on truthiness.
 */
export function formattedOffset(
  date: Date | RubyTime,
  colon = true,
  alternateUtcString: string | null = null,
): string {
  const isUtc = date instanceof RubyTime ? date.isUtc() : -date.getTimezoneOffset() * 60 === 0;
  if (isUtc && alternateUtcString != null) return alternateUtcString;
  const utcOffset = date instanceof RubyTime ? date.utcOffset : -date.getTimezoneOffset() * 60;
  return TimeZone.secondsToUtcOffset(utcOffset, colon);
}

/**
 * Returns an ISO 8601 representation of the receiver.
 *
 * `Time#xmlschema` is ruby/time's own — `conversions.rb` declares no body for
 * it — but it is the method `conversions.rb:74`'s `alias_method :rfc3339,
 * :xmlschema` points at, so it sits here beside the alias. A JS `Date` is an
 * instant, and `Date#toISOString` is the same UTC ISO 8601 reading ruby/time's
 * `time_xmlschema` produces for a UTC `Time`.
 */
export function xmlschema(date: Date): string {
  return date.toISOString();
}

/**
 * Aliased to `xmlschema` for compatibility with `DateTime`.
 *
 * Mirrors: `alias_method :rfc3339, :xmlschema`
 * (`core_ext/time/conversions.rb:74`). Note this is the INSTANCE-side
 * `Time#rfc3339`; the class-side parser `Time.rfc3339(str)`
 * (`core_ext/time/calculations.rb:69-83`) is a different Ruby method and keeps
 * its own name in `time-ext.ts`. The two collide in a flat ESM namespace, so
 * the package barrel pins the class-side one and this alias is reached through
 * `@blazetrails/activesupport/core-ext/time/conversions`.
 */
export { xmlschema as rfc3339 };
