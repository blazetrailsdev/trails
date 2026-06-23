/**
 * SQL date/time serialization — formats Temporal values into the
 * `YYYY-MM-DD HH:MM:SS[.fffffffff]` strings the adapters embed in SQL.
 *
 * These are NOT part of the {@link Quoting} interface (Rails has no
 * equivalent in `ConnectionAdapters::Quoting`; the datetime serialization
 * logic lives in `ActiveSupport::TimeWithZone` / `Type::DateTime#serialize`).
 * They are split out of `abstract/quoting.ts` so the quoting modules and
 * non-adapter call sites can reach them without pulling in the full quoting
 * surface.
 *
 * @internal
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { getDefaultTimezone } from "../../type/internal/timezone.js";

/**
 * Return the IANA timezone string for SQL datetime serialization/deserialization,
 * based on `ActiveRecord.default_timezone`. Shared by all instant formatters and
 * by `SQLiteDateTimeType#cast` so both directions always agree on the timezone.
 */
export function defaultSqlTimezone(): string {
  return getDefaultTimezone() === "utc" ? "UTC" : Temporal.Now.timeZoneId();
}

/**
 * Format a `Temporal.Instant` for SQL as `YYYY-MM-DD HH:MM:SS[.fffffffff]`.
 * Respects `ActiveRecord.default_timezone`:
 * UTC when the setting is `"utc"`, otherwise the host system's local timezone.
 * Preserves up to nanosecond precision; trailing zero groups are trimmed.
 */
export function formatInstantForSql(value: Temporal.Instant): string {
  return formatZonedComponents(value.toZonedDateTimeISO(defaultSqlTimezone()));
}

/**
 * Format a `Temporal.PlainDateTime` for SQL as `YYYY-MM-DD HH:MM:SS[.fffffffff]`.
 * No timezone conversion — the value is naive by definition. Fractional digits
 * are trimmed to the smallest non-zero 3-digit group (ms/µs/ns).
 */
export function formatPlainDateTimeForSql(value: Temporal.PlainDateTime): string {
  return formatPlainComponents(value);
}

/**
 * Format a `Temporal.PlainDate` for SQL as `YYYY-MM-DD`.
 */
export function formatPlainDateForSql(value: Temporal.PlainDate): string {
  const y = padYear(value.year);
  const m = String(value.month).padStart(2, "0");
  const d = String(value.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * PostgreSQL literal formatters, faithful to `PostgreSQL::Quoting#quoted_date`
 * (and the abstract `quoted_date` it builds on, abstract/quoting.rb:188-197):
 *
 *   result = value.to_fs(:db)                       # "YYYY-MM-DD HH:MM:SS"
 *   if value.respond_to?(:usec) && value.usec > 0   # append microseconds only
 *     "#{result}.#{sprintf("%06d", value.usec)}"    # when non-zero, fixed 6 digits
 *   ...
 *   # PG#quoted_date then suffixes " BC" for proleptic years <= 0.
 *
 * Differs from {@link formatInstantForSql} in two Rails-faithful ways: the
 * fractional part is a fixed 6-digit microsecond field (not a trimmed 3/6/9 group)
 * and is capped at microseconds — matching PG's `timestamp` resolution — so a
 * nil-precision nanosecond value never reaches the wire as 7–9 digits. The " BC"
 * suffix is what the abstract formatters omit.
 */
function pgDateTimeLiteral(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number,
  usec: number,
): string {
  const isBc = year <= 0;
  const yyyy = String(isBc ? -year + 1 : year).padStart(4, "0");
  const p2 = (n: number) => String(n).padStart(2, "0");
  let s = `${yyyy}-${p2(month)}-${p2(day)} ${p2(hour)}:${p2(min)}:${p2(sec)}`;
  if (usec > 0) s += `.${String(usec).padStart(6, "0")}`;
  return isBc ? `${s} BC` : s;
}

export function formatInstantForSqlPostgres(value: Temporal.Instant): string {
  const z = value.toZonedDateTimeISO(defaultSqlTimezone());
  return pgDateTimeLiteral(
    z.year,
    z.month,
    z.day,
    z.hour,
    z.minute,
    z.second,
    z.millisecond * 1000 + z.microsecond,
  );
}

export function formatPlainDateTimeForSqlPostgres(value: Temporal.PlainDateTime): string {
  return pgDateTimeLiteral(
    value.year,
    value.month,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond * 1000 + value.microsecond,
  );
}

export function formatPlainDateForSqlPostgres(value: Temporal.PlainDate): string {
  const isBc = value.year <= 0;
  const yyyy = String(isBc ? -value.year + 1 : value.year).padStart(4, "0");
  const s = `${yyyy}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
  return isBc ? `${s} BC` : s;
}

/**
 * Format a `Temporal.PlainTime` for SQL as `HH:MM:SS[.fffffffff]`.
 * Fractional digits are trimmed to the smallest non-zero 3-digit group.
 */
export function formatPlainTimeForSql(value: Temporal.PlainTime): string {
  return formatTimeComponents(
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
    value.microsecond,
    value.nanosecond,
  );
}

/**
 * MySQL-safe variants of the formatters. MySQL TIME/DATETIME/TIMESTAMP support
 * at most 6 fractional digits (microseconds); emitting 7–9 nanosecond digits
 * in strict SQL mode causes an error rather than silent truncation.
 */
export function formatInstantForSqlMysql(value: Temporal.Instant): string {
  const zdt = value.toZonedDateTimeISO(defaultSqlTimezone());
  return (
    formatDatePrefix(zdt) +
    formatTimeComponents(zdt.hour, zdt.minute, zdt.second, zdt.millisecond, zdt.microsecond, 0, 6)
  );
}

export function formatPlainDateTimeForSqlMysql(value: Temporal.PlainDateTime): string {
  return (
    formatDatePrefix(value) +
    formatTimeComponents(
      value.hour,
      value.minute,
      value.second,
      value.millisecond,
      value.microsecond,
      0,
      6,
    )
  );
}

export function formatPlainTimeForSqlMysql(value: Temporal.PlainTime): string {
  return formatTimeComponents(
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
    value.microsecond,
    0,
    6,
  );
}

function formatDatePrefix(v: { year: number; month: number; day: number }): string {
  return `${padYear(v.year)}-${String(v.month).padStart(2, "0")}-${String(v.day).padStart(2, "0")} `;
}

function padYear(year: number): string {
  if (year < 0) return String(year);
  return String(year).padStart(4, "0");
}

function formatZonedComponents(zdt: Temporal.ZonedDateTime): string {
  return (
    formatDatePrefix(zdt) +
    formatTimeComponents(
      zdt.hour,
      zdt.minute,
      zdt.second,
      zdt.millisecond,
      zdt.microsecond,
      zdt.nanosecond,
    )
  );
}

function formatPlainComponents(pdt: Temporal.PlainDateTime): string {
  const base = formatDatePrefix(pdt);
  return (
    base +
    formatTimeComponents(
      pdt.hour,
      pdt.minute,
      pdt.second,
      pdt.millisecond,
      pdt.microsecond,
      pdt.nanosecond,
    )
  );
}

function formatTimeComponents(
  h: number,
  min: number,
  s: number,
  ms: number,
  us: number,
  ns: number,
  maxFracDigits = 9,
): string {
  const hh = String(h).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const base = `${hh}:${mm}:${ss}`;
  // Clamp sub-second components to maxFracDigits before building the string.
  const effectiveUs = maxFracDigits >= 6 ? us : 0;
  const effectiveNs = maxFracDigits >= 9 ? ns : 0;
  if (ms === 0 && effectiveUs === 0 && effectiveNs === 0) return base;
  const frac9 =
    String(ms).padStart(3, "0") +
    String(effectiveUs).padStart(3, "0") +
    String(effectiveNs).padStart(3, "0");
  const frac =
    effectiveNs !== 0 ? frac9 : effectiveUs !== 0 ? frac9.slice(0, 6) : frac9.slice(0, 3);
  return `${base}.${frac.slice(0, maxFracDigits)}`;
}
