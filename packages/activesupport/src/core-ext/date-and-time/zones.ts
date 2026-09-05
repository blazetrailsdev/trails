import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";
import { findZoneBang, zone as currentZone } from "../../time-zone-config.js";
import { instantFrom } from "../../temporal.js";
import { toTime } from "../date/conversions.js";
import { Object } from "../object/acts-like.js";

export type DateOrTime =
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime
  | Date
  | Temporal.Instant
  | RubyTime
  | TimeWithZone;

/** @missingRailsArgs acts_like? — PERMANENT */
export function inTimeZone(dateOrTime: Temporal.PlainDate, zone?: unknown): TimeWithZone;
export function inTimeZone(
  dateOrTime: Date | Temporal.Instant,
  zone?: unknown,
): TimeWithZone | Temporal.Instant;
export function inTimeZone(dateOrTime: RubyTime, zone?: unknown): TimeWithZone | RubyTime;
export function inTimeZone(dateOrTime: TimeWithZone, zone?: unknown): TimeWithZone;
export function inTimeZone(
  dateOrTime: Temporal.PlainDateTime | Temporal.ZonedDateTime,
  zone?: unknown,
): TimeWithZone | Temporal.Instant;
export function inTimeZone(
  dateOrTime: DateOrTime,
  zone?: unknown,
): TimeWithZone | Temporal.Instant | RubyTime;
export function inTimeZone(
  dateOrTime: DateOrTime,
  zone: unknown = currentZone(),
): TimeWithZone | Temporal.Instant | RubyTime {
  if (dateOrTime instanceof TimeWithZone) return dateOrTime.inTimeZone(zone);

  const timeZone = findZoneBang(zone);
  const time = Object.actsLike(dateOrTime, "time") ? (dateOrTime as TimeLike) : null;

  if (timeZone) {
    return timeWithZone(dateOrTime, time, timeZone);
  }
  return time !== null ? asInstant(time) : toTime(dateOrTime as Temporal.PlainDate);
}

/** @internal */
function timeWithZone(dateOrTime: DateOrTime, time: TimeLike | null, zone: TimeZone): TimeWithZone {
  if (time !== null) {
    return new TimeWithZone(asInstant(time), zone);
  }
  const date = dateOrTime as Temporal.PlainDate;
  return zone.local(date.year, date.month, date.day);
}

function asInstant(time: TimeLike): Temporal.Instant {
  if (time instanceof RubyTime) {
    return (time.isUtc() ? time : time.getutc()).toTime().toInstant();
  }
  if (time instanceof Temporal.ZonedDateTime) return time.toInstant();
  if (time instanceof Temporal.PlainDateTime) return time.toZonedDateTime("UTC").toInstant();
  return time instanceof Temporal.Instant ? time : instantFrom(time);
}

type TimeLike =
  | Date
  | Temporal.Instant
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime
  | RubyTime;
