import { Date as RubyDate, Temporal, Time as RubyTime } from "@blazetrails/date";
import { include, TopLevel } from "@blazetrails/ruby-compat";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";
import { findZoneBang, zone as currentZone } from "../../time-zone-config.js";
import { instantFrom } from "../../temporal.js";
import { toTime } from "../date/conversions.js";
import { actsLike } from "../object/acts-like.js";

export type DateOrTime =
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime
  | Date
  | Temporal.Instant
  | RubyTime
  | TimeWithZone;

type InTimeZoneResult<T> = T extends TimeWithZone
  ? TimeWithZone
  : TimeWithZone | (T extends Temporal.PlainDate ? RubyTime : T);

export function inTimeZone<T extends DateOrTime>(
  this: T,
  zone: unknown = currentZone(),
): InTimeZoneResult<T> {
  type Result = InTimeZoneResult<T>;
  if (this instanceof TimeWithZone) return this.inTimeZone(zone) as Result;

  const timeZone = findZoneBang(zone);
  const time = actsLike.call(this, "time") ? (this as TimeLike) : null;

  if (timeZone) {
    return timeWithZone(this, time, timeZone) as Result;
  }
  return (time !== null ? time : toTime(this as Temporal.PlainDate)) as Result;
}

/** @internal */
function timeWithZone(dateOrTime: DateOrTime, time: TimeLike | null, zone: TimeZone): TimeWithZone {
  if (time !== null) {
    return new TimeWithZone(
      time instanceof RubyTime ? (time.isUtc() ? time : time.getutc()) : asInstant(time),
      zone,
    );
  }
  const date = dateOrTime as Temporal.PlainDate;
  return zone.local(date.year, date.month, date.day);
}

function asInstant(time: Exclude<TimeLike, RubyTime>): Temporal.Instant {
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

declare module "@blazetrails/date" {
  interface Time {
    inTimeZone(zone?: unknown): TimeWithZone | Time;
  }
  interface Date {
    inTimeZone(zone?: unknown): TimeWithZone | Time;
  }
}

export const Zones = { inTimeZone };

include(RubyTime, Zones);
include(RubyDate, Zones);

(TopLevel.DateAndTime ??= { name: "DateAndTime" }).Zones = Zones;
