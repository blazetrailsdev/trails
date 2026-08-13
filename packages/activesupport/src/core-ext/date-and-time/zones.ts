/**
 * Mirrors: `DateAndTime::Zones` (`core_ext/date_and_time/zones.rb`) — the
 * mixin Rails includes into `Date`, `Time` and `DateTime` (via
 * `core_ext/date/zones.rb`, `core_ext/time/zones.rb`,
 * `core_ext/date_time/zones.rb`) so one body serves every receiver.
 *
 * Ruby gets the two arms from the receiver: `acts_like?(:time)` is true for a
 * `Time`/`DateTime` and false for a `Date`. A TS free function has no receiver
 * to resolve against, so the arm is chosen from the value's type here —
 * `Temporal.PlainDate` is the `Date` arm, a JS `Date` or `Temporal.Instant`
 * the `Time` arm — exactly the receivers trails carries. The mixin's own body
 * stays line-for-line with the Ruby.
 */

import { Temporal } from "@blazetrails/date";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";
import { findZoneBang, getZone } from "../../time-zone-config.js";
import { instantFrom } from "../../temporal.js";
import { toTime } from "../date/conversions.js";

/** A receiver of the mixin: the `Date` arm or the `Time` arm. */
export type DateOrTime = Temporal.PlainDate | Date | Temporal.Instant;

/**
 * Returns the simultaneous time in `Time.zone` if a zone is given or if
 * `Time.zone_default` is set. Otherwise, it returns the current time.
 *
 *     Time.zone = 'Hawaii'        // => 'Hawaii'
 *     inTimeZone(Time.utc(2000))  // => Fri, 31 Dec 1999 14:00:00 HST -10:00
 *
 * You can also pass in a TimeZone instance or a string that identifies a
 * TimeZone as an argument, and the conversion will be based on that zone
 * instead of `Time.zone`.
 *
 * Mirrors: `DateAndTime::Zones#in_time_zone` (zones.rb:20-29). The `zone`
 * parameter takes both arms Rails accepts — a `TimeZone` object and a String
 * identifying one — because `Time.find_zone!` dispatches on both.
 */
/**
 * The `Date` arm. Ruby's `time || to_time` is `to_time` here (a Date is never
 * `acts_like?(:time)`), and trails' `Date#to_time` answers a `TimeWithZone`
 * (`core-ext/date/conversions.ts`, `date/conversions.rb:83-86`), so both arms
 * of this receiver return one — `Temporal.Instant` is reachable only from the
 * `Time` arm's `time`.
 */
export function inTimeZone(dateOrTime: Temporal.PlainDate, zone?: unknown): TimeWithZone;
export function inTimeZone(
  dateOrTime: Date | Temporal.Instant,
  zone?: unknown,
): TimeWithZone | Temporal.Instant;
export function inTimeZone(
  dateOrTime: DateOrTime,
  zone: unknown = getZone(),
): TimeWithZone | Temporal.Instant {
  const timeZone = findZoneBang(zone);
  const time = actsLikeTime(dateOrTime) ? dateOrTime : null;

  if (timeZone) {
    return timeWithZone(dateOrTime, time, timeZone);
  }
  return time !== null ? asInstant(time) : toTime(dateOrTime as Temporal.PlainDate);
}

/**
 * Mirrors: `DateAndTime::Zones#time_with_zone` (zones.rb:32-38).
 *
 * @internal
 *
 * Ruby's `time` local is the receiver itself on the `Time` arm and `nil` on
 * the `Date` arm, so it is threaded in rather than re-derived. `time.utc? ?
 * time : time.getutc` is free here: a `Temporal.Instant` is already the UTC
 * instant `TimeWithZone` wants.
 */
function timeWithZone(
  dateOrTime: DateOrTime,
  time: Date | Temporal.Instant | null,
  zone: TimeZone,
): TimeWithZone {
  if (time !== null) {
    return new TimeWithZone(asInstant(time), zone);
  }
  // `ActiveSupport::TimeWithZone.new(nil, zone, to_time(:utc))` — the day read
  // as midnight in `zone`. trails' constructor has no local-time third seat,
  // so `TimeZone#local` builds the same value.
  const date = dateOrTime as Temporal.PlainDate;
  return zone.local(date.year, date.month, date.day);
}

/**
 * Ruby's `time.utc? ? time : time.getutc` (zones.rb:34) — the receiver read as
 * its UTC instant, which a `Temporal.Instant` already is.
 */
function asInstant(time: Date | Temporal.Instant): Temporal.Instant {
  return time instanceof Temporal.Instant ? time : instantFrom(time);
}

/**
 * `acts_like?(:time)` for the two receivers this mixin sees: a
 * `Temporal.PlainDate` is the `Date` arm and never acts like a time.
 */
function actsLikeTime(dateOrTime: DateOrTime): dateOrTime is Date | Temporal.Instant {
  return !(dateOrTime instanceof Temporal.PlainDate);
}
