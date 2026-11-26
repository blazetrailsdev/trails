import { rbClearMethodCache } from "@blazetrails/ruby-compat/method-cache";
import { TEMPORAL_METHOD_TABLE } from "@blazetrails/ruby-compat/object";
import { DateTime as RubyDateTime, Time, cCivilToJd } from "@blazetrails/date";
import { DATE_FORMATS } from "../time/conversions.js";
import { TimeZone } from "../../values/time-zone.js";
import { isUtc, secondsSinceMidnight, utcOffset } from "./calculations.js";

type DateTime = RubyDateTime;

export function toFs(datetime: DateTime, format = "default"): string {
  const formatter = DATE_FORMATS[format];
  if (formatter != null) {
    return typeof formatter === "function"
      ? String(formatter(datetime))
      : datetime.strftime(formatter);
  }
  return datetime.toS();
}

export const toFormattedS = toFs;

for (const seat of ["Temporal.PlainDateTime", "Temporal.ZonedDateTime"]) {
  Object.assign(TEMPORAL_METHOD_TABLE[seat], {
    toFs: (self: Temporal.PlainDateTime | Temporal.ZonedDateTime, format?: string) =>
      toFs(new RubyDateTime(self), format),
    toFormattedS: (self: Temporal.PlainDateTime | Temporal.ZonedDateTime, format?: string) =>
      toFormattedS(new RubyDateTime(self), format),
    usec: (self: Temporal.PlainDateTime | Temporal.ZonedDateTime) => usec(new RubyDateTime(self)),
  });
}

declare module "@blazetrails/date" {
  interface DateTime {
    toFs(format?: string): string;
    toFormattedS(format?: string): string;
    usec(): number;
  }
}

Object.assign(RubyDateTime.prototype, {
  toFs(this: RubyDateTime, format?: string): string {
    return toFs(this, format);
  },
  toFormattedS(this: RubyDateTime, format?: string): string {
    return toFormattedS(this, format);
  },
  usec(this: RubyDateTime): number {
    return usec(this);
  },
});
rbClearMethodCache();

export function formattedOffset(
  datetime: DateTime,
  colon = true,
  alternateUtcString: string | null = null,
): string {
  if (isUtc(datetime) && alternateUtcString != null) return alternateUtcString;
  return TimeZone.secondsToUtcOffset(utcOffset(datetime), colon);
}

export function readableInspect(datetime: DateTime): string {
  return toFs(datetime, "rfc822");
}

export { readableInspect as inspect };

export function defaultInspect(datetime: DateTime): string {
  return datetime.inspect();
}

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

export function toF(datetime: DateTime): number {
  return secondsSinceUnixEpoch(datetime) + datetime.secFraction.toF();
}

export function toI(datetime: DateTime): number {
  return Math.trunc(secondsSinceUnixEpoch(datetime));
}

export function usec(datetime: DateTime): number {
  return datetime.secFraction.mul(1_000_000).toI();
}

export function nsec(datetime: DateTime): number {
  return datetime.secFraction.mul(1_000_000_000).toI();
}

export function offsetInSeconds(datetime: DateTime): number {
  return datetime.offset.mul(86400).toI();
}

export function secondsSinceUnixEpoch(datetime: DateTime): number {
  const jd = cCivilToJd(Number(datetime.year), datetime.month, datetime.day);
  return (jd - 2440588) * 86400 - offsetInSeconds(datetime) + secondsSinceMidnight(datetime);
}
