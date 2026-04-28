/**
 * Wire-format parsers for Temporal types from Postgres and MySQL.
 *
 * Handles the quirks each driver emits before our cast layer ever sees
 * a value — space separator instead of T, two-digit offsets, BC suffix,
 * infinity sentinels, zero-dates.
 *
 * Naive timestamp parsers (no offset in the wire format) interpret values
 * in `defaultSqlTimezone()` — UTC by default, host-system local when
 * `ActiveRecord.default_timezone === "local"`. This is the only non-pure
 * dependency; everything else is pure and unit-testable without a live DB.
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import { defaultSqlTimezone } from "./quoting.js";

export { DateInfinity, DateNegativeInfinity };

/**
 * Convert a naive ISO datetime string (no offset) to a `Temporal.Instant`,
 * interpreting it in the configured SQL timezone (UTC by default, host-system
 * local when `ActiveRecord.default_timezone === "local"`).
 */
function naiveIsoToInstant(iso: string): Temporal.Instant {
  return Temporal.PlainDateTime.from(iso).toZonedDateTime(defaultSqlTimezone()).toInstant();
}

export type TimeTzValue = { time: Temporal.PlainTime; offset: string };

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

/**
 * Parse a Postgres `timestamptz` wire string to `Temporal.Instant`.
 *
 * Wire format: `'YYYY-MM-DD HH:MM:SS[.ffffff][+HH|±HH:MM]'`
 * or the sentinels `'infinity'` / `'-infinity'`.
 */
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

/**
 * Parse a Postgres `timestamp` (without tz) wire string to `Temporal.Instant`.
 *
 * Wire format: `'YYYY-MM-DD HH:MM:SS[.ffffff]'` (no offset).
 * The naive value is interpreted in `ActiveRecord.default_timezone` (UTC by
 * default, host-system local when set to `:local`) and converted to a
 * `Temporal.Instant`. Symmetric with `formatInstantForSql` in quoting, which
 * uses the same `defaultSqlTimezone()` for writes — so reads and writes
 * round-trip cleanly under either configuration.
 */
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

/**
 * Parse a Postgres `date` wire string to `Temporal.PlainDate`.
 *
 * Wire format: `'YYYY-MM-DD'`, `'YYYY-MM-DD BC'`,
 * or the sentinels `'infinity'` / `'-infinity'` which return
 * `DateInfinity` / `DateNegativeInfinity`.
 */
export function parsePostgresDate(
  text: string,
): Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType {
  const trimmed = text.trim();
  if (trimmed === "infinity") return DateInfinity;
  if (trimmed === "-infinity") return DateNegativeInfinity;
  const { iso, bc } = extractBcSuffix(trimmed);
  const plain = Temporal.PlainDate.from(iso);
  if (!bc) return plain;
  return Temporal.PlainDate.from({
    year: bcYearToIso(plain.year),
    month: plain.month,
    day: plain.day,
  });
}

/**
 * Parse a Postgres `time` wire string to `Temporal.PlainTime`.
 *
 * Wire format: `'HH:MM:SS[.ffffff]'`. Postgres allows `24:00:00` as a valid
 * end-of-day sentinel; Temporal rejects hour 24, so we normalize it to
 * `00:00:00` (midnight), matching Ruby Time's rollover behavior.
 */
export function parsePostgresTime(text: string): Temporal.PlainTime {
  return Temporal.PlainTime.from(normalizeTime24(text.trim()));
}

/**
 * Parse a Postgres `timetz` wire string.
 *
 * Wire format: `'HH:MM:SS[.ffffff]+HH'` or `'HH:MM:SS[.ffffff]±HH:MM'`.
 * Returns the time and offset separately — Temporal.PlainTime has no
 * timezone, so we preserve the offset as a sibling string.
 * `24:00:00` is normalized to `00:00:00` (see `parsePostgresTime`).
 */
export function parsePostgresTimeTz(text: string): TimeTzValue {
  // Split on first +/- that appears after the seconds portion
  const match = /^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)([-+]\d{2}(?::\d{2})?)$/.exec(text.trim());
  if (!match) {
    throw new RangeError(`Cannot parse timetz wire value: ${JSON.stringify(text)}`);
  }
  const [, timeStr, rawOffset] = match;
  return {
    time: Temporal.PlainTime.from(normalizeTime24(timeStr)),
    offset: expandOffset(rawOffset),
  };
}

// ---------------------------------------------------------------------------
// MySQL
// ---------------------------------------------------------------------------

/**
 * Parse a MySQL `TIMESTAMP` wire string to `Temporal.Instant`.
 *
 * Precondition: the connection's `@@session.time_zone` is `'+00:00'`.
 * MySQL TIMESTAMP is always stored as UTC; with the pinned session TZ
 * the driver returns strings in UTC wall-clock form.
 *
 * Wire format: `'YYYY-MM-DD HH:MM:SS[.ffffff]'` (no offset in string;
 * semantically UTC because of the pinned session timezone).
 */
export function parseMysqlInstant(text: string): Temporal.Instant | null {
  const trimmed = text.trim();
  // MySQL can emit zero timestamps from legacy schemas even on TIMESTAMP columns.
  if (isZeroDatetime(trimmed)) return null;
  const iso = clampFraction(trimmed.replace(" ", "T") + "Z");
  return Temporal.Instant.from(iso);
}

/**
 * Parse a MySQL `DATETIME` wire string to `Temporal.Instant`.
 *
 * Wire format: `'YYYY-MM-DD HH:MM:SS[.ffffff]'` (naive, no timezone).
 * `DATETIME` is timezone-naive in MySQL — the value is interpreted in
 * `ActiveRecord.default_timezone` (UTC by default, host-system local when
 * set to `:local`), matching the convention used by `formatInstantForSql`
 * on the write path. Zero-date `'0000-00-00 00:00:00'` returns `null`.
 */
export function parseMysqlDatetimeAsInstant(text: string): Temporal.Instant | null {
  const trimmed = text.trim();
  if (isZeroDatetime(trimmed)) return null;
  return naiveIsoToInstant(clampFraction(trimmed.replace(" ", "T")));
}

/**
 * Parse a MySQL `DATE` wire string to `Temporal.PlainDate`.
 *
 * Zero-date `'0000-00-00'` returns `null`.
 */
export function parseMysqlDate(text: string): Temporal.PlainDate | null {
  const trimmed = text.trim();
  if (isZeroDate(trimmed)) return null;
  return Temporal.PlainDate.from(trimmed);
}

/**
 * Parse a MySQL `TIME` wire string to `Temporal.PlainTime`.
 *
 * Wire format: `'HH:MM:SS[.ffffff]'` (standard range, no sign). MySQL TIME
 * can be negative or exceed 24 h for interval values; those paths are the
 * cast layer's responsibility and are not handled here.
 */
export function parseMysqlTime(text: string): Temporal.PlainTime {
  return Temporal.PlainTime.from(text.trim());
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a Postgres `timestamptz` string (no BC suffix) to strict
 * ISO 8601 for `Temporal.Instant.from`:
 *   `'2026-04-26 14:23:55.123456+00'` → `'2026-04-26T14:23:55.123456+00:00'`
 */
function normalizeTimestampTz(text: string): string {
  return clampFraction(text.replace(" ", "T").replace(/([-+]\d{2})$/, "$1:00"));
}

/**
 * Clamp fractional-seconds digits in an ISO datetime string to 9 (nanosecond
 * precision). Temporal parsers reject strings with more than 9 fractional
 * digits, and no database emits sub-nanosecond precision.
 */
function clampFraction(iso: string): string {
  return iso.replace(/(\.\d{9})\d+/, "$1");
}

/** Strip a trailing " BC" suffix and return both parts. */
function extractBcSuffix(text: string): { iso: string; bc: boolean } {
  if (text.endsWith(" BC")) {
    return { iso: text.slice(0, -3), bc: true };
  }
  return { iso: text, bc: false };
}

/**
 * Convert a positive Postgres year (1-based BC) to proleptic Gregorian ISO year.
 * Postgres `0044 BC` → ISO year `-43`.  `0001 BC` → ISO year `0`.
 */
function bcYearToIso(pgYear: number): number {
  return -(pgYear - 1);
}

/**
 * Parse a BC-suffixed Postgres `timestamptz` string to `Temporal.Instant`.
 * Uses component construction to avoid negative-year ISO string parsing,
 * which the polyfill rejects.
 *
 * Input has already had " BC" stripped.
 */
function parseBcTimestampTzAsInstant(withoutBc: string): Temporal.Instant {
  // e.g. "0044-03-15 12:00:00.123456+00" or "0044-03-15 12:00:00+02:30"
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

/**
 * Parse a BC-suffixed Postgres `timestamp` string to `Temporal.Instant`,
 * interpreting the naive value in `defaultSqlTimezone()` (UTC by default,
 * host-system local when `ActiveRecord.default_timezone === "local"`).
 * Input has already had " BC" stripped.
 */
function parseBcTimestampAsInstant(withoutBc: string): Temporal.Instant {
  // e.g. "0044-03-15 12:00:00.123456" or "0044-03-15 12:00:00"
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

/**
 * Convert a fractional-seconds string to the three Temporal sub-second
 * components, each in the 0–999 range.
 * "123456" → { millisecond: 123, microsecond: 456, nanosecond: 0 }.
 * Digits beyond 9 (sub-nanosecond) are truncated; no database emits them.
 */
function parseFraction(frac: string | undefined): {
  millisecond: number;
  microsecond: number;
  nanosecond: number;
} {
  if (!frac) return { millisecond: 0, microsecond: 0, nanosecond: 0 };
  // Clamp to 9 digits before padding so extra digits don't silently corrupt
  // the slice boundaries (e.g. a 10-digit input would shift microsecond into
  // the nanosecond slot without this guard).
  const clamped = frac.slice(0, 9).padEnd(9, "0");
  return {
    millisecond: Number(clamped.slice(0, 3)),
    microsecond: Number(clamped.slice(3, 6)),
    nanosecond: Number(clamped.slice(6, 9)),
  };
}

/**
 * Expand a two-digit offset `+HH` or `-HH` to `±HH:MM`.
 * Leaves `±HH:MM` offsets unchanged.
 */
function expandOffset(offset: string): string {
  return offset.replace(/^([-+]\d{2})$/, "$1:00");
}

/**
 * Normalize Postgres `24:00:00[.fraction]` (end-of-day sentinel) to
 * `00:00:00[.fraction]`. Only the exact sentinel is normalized; any other
 * `24:xx:xx` value is left unchanged so `Temporal.PlainTime.from` throws —
 * Postgres never emits those and they should not be silently corrupted.
 */
function normalizeTime24(timeStr: string): string {
  const match = /^24:00:00(\.\d+)?$/.exec(timeStr);
  return match ? `00:00:00${match[1] ?? ""}` : timeStr;
}

function isZeroDate(text: string): boolean {
  return text === "0000-00-00";
}

function isZeroDatetime(text: string): boolean {
  // Match "0000-00-00 00:00:00" / "0000-00-00T00:00:00" and the fractional
  // variants emitted by DATETIME(N) columns, e.g. "0000-00-00 00:00:00.000000".
  return /^0000-00-00[T ]00:00:00(\.\d+)?$/.test(text);
}
