import { DateTime as RubyDateTime, Temporal, Time as RubyTime } from "@blazetrails/date";
import { formattedOffset as dateTimeFormattedOffset } from "../date-time/conversions.js";
import { ordinalize } from "../../inflector.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";

type DateFormatsReceiver =
  | RubyTime
  | TimeWithZone
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime;

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

export function toFs(date: Date | Temporal.Instant | RubyTime, format: string = "default"): string {
  let time: RubyTime;
  if (date instanceof RubyTime) {
    time = date;
  } else {
    const utc =
      // boundary: the JS `Date` a caller still holds is the instant this bridges
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

export { toFs as toFormattedS };

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

export function xmlschema(date: Date): string {
  return date.toISOString();
}

export { xmlschema as rfc3339 };
