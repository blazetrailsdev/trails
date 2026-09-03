import { DateTime as RubyDateTime, Temporal, Time, cCivilToJd } from "@blazetrails/date";
import { secFraction } from "../../time-ext.js";
import { DATE_FORMATS } from "../time/conversions.js";
import { TimeZone } from "../../values/time-zone.js";
import { isUtc, secondsSinceMidnight, utcOffset } from "./calculations.js";

type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;

export function toFs(datetime: DateTime, format = "default"): string {
  const formatter = DATE_FORMATS[format];
  if (formatter != null) {
    return typeof formatter === "function"
      ? String(formatter(datetime))
      : new RubyDateTime(datetime).strftime(formatter);
  }
  return new RubyDateTime(datetime).toS();
}

export const toFormattedS = toFs;

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

export function defaultInspect(datetime: DateTime): string {
  return new RubyDateTime(datetime).inspect();
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
  return secondsSinceUnixEpoch(datetime) + secFraction(datetime);
}

export function toI(datetime: DateTime): number {
  return Math.trunc(secondsSinceUnixEpoch(datetime));
}

export function usec(datetime: DateTime): number {
  return Math.trunc(secFraction(datetime) * 1_000_000);
}

export function nsec(datetime: DateTime): number {
  return Math.trunc(secFraction(datetime) * 1_000_000_000);
}

export function offsetInSeconds(datetime: DateTime): number {
  return new RubyDateTime(datetime).offset.mul(86400).toI();
}

export function secondsSinceUnixEpoch(datetime: DateTime): number {
  const jd = cCivilToJd(datetime.year, datetime.month, datetime.day);
  return (jd - 2440588) * 86400 - offsetInSeconds(datetime) + secondsSinceMidnight(datetime);
}
