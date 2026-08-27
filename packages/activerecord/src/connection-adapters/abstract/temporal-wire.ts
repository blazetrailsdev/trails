/** @noRailsEquivalent PERMANENT */

import { Temporal } from "@blazetrails/date";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import { defaultSqlTimezone } from "./sql-datetime.js";

export { DateInfinity, DateNegativeInfinity };

function naiveIsoToInstant(iso: string): Temporal.Instant {
  return Temporal.PlainDateTime.from(iso).toZonedDateTime(defaultSqlTimezone()).toInstant();
}

export function parsePostgresInstant(
  text: string,
): Temporal.Instant | DateInfinityType | DateNegativeInfinityType {
  const trimmed = text.trim();
  if (trimmed === "infinity") return DateInfinity;
  if (trimmed === "-infinity") return DateNegativeInfinity;
  const { iso, bc } = extractBcSuffix(trimmed);
  if (bc) return parseBcTimestampTzAsInstant(iso);
  return Temporal.Instant.from(normalizeTimestampTz(iso));
}

export function parsePostgresTimestampAsInstant(
  text: string,
): Temporal.Instant | DateInfinityType | DateNegativeInfinityType {
  const trimmed = text.trim();
  if (trimmed === "infinity") return DateInfinity;
  if (trimmed === "-infinity") return DateNegativeInfinity;
  const { iso, bc } = extractBcSuffix(trimmed);
  if (bc) return parseBcTimestampAsInstant(iso);
  return naiveIsoToInstant(clampFraction(iso.replace(" ", "T")));
}

export function parsePostgresDate(
  text: string,
): Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType {
  const trimmed = text.trim();
  if (trimmed === "infinity") return DateInfinity;
  if (trimmed === "-infinity") return DateNegativeInfinity;
  const { iso, bc } = extractBcSuffix(trimmed);
  if (!bc) return Temporal.PlainDate.from(iso);
  const m = /^(\d+)-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Cannot parse BC date: ${JSON.stringify(text)}`);
  return Temporal.PlainDate.from(
    { year: bcYearToIso(parseInt(m[1], 10)), month: parseInt(m[2], 10), day: parseInt(m[3], 10) },
    { overflow: "reject" },
  );
}

export function parseMysqlInstant(text: string): Temporal.Instant | null {
  const trimmed = text.trim();
  if (isZeroDatetime(trimmed)) return null;
  const iso = clampFraction(trimmed.replace(" ", "T") + "Z");
  return Temporal.Instant.from(iso);
}

export function parseMysqlDatetimeAsInstant(text: string): Temporal.Instant | null {
  const trimmed = text.trim();
  if (isZeroDatetime(trimmed)) return null;
  return naiveIsoToInstant(clampFraction(trimmed.replace(" ", "T")));
}

export function parseMysqlDate(text: string): Temporal.PlainDate | null {
  const trimmed = text.trim();
  if (isZeroDate(trimmed)) return null;
  return Temporal.PlainDate.from(trimmed);
}

function normalizeTimestampTz(text: string): string {
  return clampFraction(text.replace(" ", "T").replace(/([-+]\d{2})$/, "$1:00"));
}

function clampFraction(iso: string): string {
  return iso.replace(/(\.\d{9})\d+/, "$1");
}

function extractBcSuffix(text: string): { iso: string; bc: boolean } {
  if (text.endsWith(" BC")) {
    return { iso: text.slice(0, -3), bc: true };
  }
  return { iso: text, bc: false };
}

function bcYearToIso(pgYear: number): number {
  return -(pgYear - 1);
}

function parseBcTimestampTzAsInstant(withoutBc: string): Temporal.Instant {
  const match =
    /^(\d+)-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([-+]\d{2}(?::\d{2})?)$/.exec(
      withoutBc,
    );
  if (!match) throw new RangeError(`Cannot parse BC timestamptz: ${JSON.stringify(withoutBc)}`);
  const [, y, mo, d, h, mi, s, frac, rawOffset] = match;
  const { millisecond, microsecond, nanosecond } = parseFraction(frac);
  const zdt = Temporal.ZonedDateTime.from(
    {
      year: bcYearToIso(Number(y)),
      month: Number(mo),
      day: Number(d),
      hour: Number(h),
      minute: Number(mi),
      second: Number(s),
      millisecond,
      microsecond,
      nanosecond,
      timeZone: expandOffset(rawOffset),
    },
    { overflow: "reject" },
  );
  return zdt.toInstant();
}

function parseBcTimestampAsInstant(withoutBc: string): Temporal.Instant {
  const match = /^(\d+)-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(withoutBc);
  if (!match) throw new RangeError(`Cannot parse BC timestamp: ${JSON.stringify(withoutBc)}`);
  const [, y, mo, d, h, mi, s, frac] = match;
  const { millisecond, microsecond, nanosecond } = parseFraction(frac);
  return Temporal.ZonedDateTime.from(
    {
      year: bcYearToIso(Number(y)),
      month: Number(mo),
      day: Number(d),
      hour: Number(h),
      minute: Number(mi),
      second: Number(s),
      millisecond,
      microsecond,
      nanosecond,
      timeZone: defaultSqlTimezone(),
    },
    { overflow: "reject" },
  ).toInstant();
}

function parseFraction(frac: string | undefined): {
  millisecond: number;
  microsecond: number;
  nanosecond: number;
} {
  if (!frac) return { millisecond: 0, microsecond: 0, nanosecond: 0 };
  const clamped = frac.slice(0, 9).padEnd(9, "0");
  return {
    millisecond: Number(clamped.slice(0, 3)),
    microsecond: Number(clamped.slice(3, 6)),
    nanosecond: Number(clamped.slice(6, 9)),
  };
}

function expandOffset(offset: string): string {
  return offset.replace(/^([-+]\d{2})$/, "$1:00");
}

function isZeroDate(text: string): boolean {
  return text === "0000-00-00";
}

function isZeroDatetime(text: string): boolean {
  return /^0000-00-00[T ]00:00:00(\.\d+)?$/.test(text);
}
