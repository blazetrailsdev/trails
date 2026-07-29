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
import { ActiveRecord } from "../../ar-config.js";

/**
 * Return the IANA timezone string for SQL datetime serialization/deserialization,
 * based on `ActiveRecord.default_timezone`. Shared by all instant formatters and
 * by `SQLiteDateTimeType#cast` so both directions always agree on the timezone.
 */
export function defaultSqlTimezone(): string {
  return ActiveRecord.defaultTimezone === "utc" ? "UTC" : Temporal.Now.timeZoneId();
}

/**
 * Format a `Temporal.Instant` for SQL as `YYYY-MM-DD HH:MM:SS[.ffffff]`,
 * faithful to the abstract `quoted_date` (abstract/quoting.rb:193-197): the
 * fractional part is a fixed 6-digit microsecond field emitted only when
 * `usec > 0`, and precision is capped at microseconds (nanoseconds dropped).
 * Respects `ActiveRecord.default_timezone`: UTC when the setting is `"utc"`,
 * otherwise the host system's local timezone.
 */
export function formatInstantForSql(value: Temporal.Instant): string {
  return formatZonedComponents(value.toZonedDateTimeISO(defaultSqlTimezone()));
}

/**
 * Format a `Temporal.PlainDateTime` for SQL as `YYYY-MM-DD HH:MM:SS[.ffffff]`.
 * No timezone conversion — the value is naive by definition. Fractional part is
 * a fixed 6-digit microsecond field when `usec > 0`, capped at microseconds
 * (see {@link formatInstantForSql}).
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
 * Shares the fixed-6 microsecond fraction ({@link microsecondFraction}) with the
 * abstract/MySQL formatters; the only PG-specific behavior is the " BC" suffix
 * appended for proleptic years <= 0.
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
  const s = `${yyyy}-${p2(month)}-${p2(day)} ${p2(hour)}:${p2(min)}:${p2(sec)}${microsecondFraction(usec)}`;
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
 * Format a `Temporal.PlainTime` for SQL as `HH:MM:SS[.ffffff]`. Fractional part
 * is a fixed 6-digit microsecond field when `usec > 0`, capped at microseconds
 * (see {@link formatInstantForSql}).
 */
export function formatPlainTimeForSql(value: Temporal.PlainTime): string {
  return formatTimeComponents(
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
    value.microsecond,
  );
}

/**
 * MySQL variants. Since the abstract formatters already emit Rails' fixed-6
 * microsecond field capped at microseconds — the same resolution MySQL
 * TIME/DATETIME/TIMESTAMP support — the MySQL path is identical. Kept as named
 * exports so adapter call sites document intent.
 */
export const formatInstantForSqlMysql = formatInstantForSql;
export const formatPlainDateTimeForSqlMysql = formatPlainDateTimeForSql;
export const formatPlainTimeForSqlMysql = formatPlainTimeForSql;

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
    formatTimeComponents(zdt.hour, zdt.minute, zdt.second, zdt.millisecond, zdt.microsecond)
  );
}

function formatPlainComponents(pdt: Temporal.PlainDateTime): string {
  return (
    formatDatePrefix(pdt) +
    formatTimeComponents(pdt.hour, pdt.minute, pdt.second, pdt.millisecond, pdt.microsecond)
  );
}

/**
 * Build the `HH:MM:SS` base and append Rails' fixed 6-digit microsecond field
 * when non-zero. Sub-microsecond precision (nanoseconds) is dropped, matching
 * the abstract `quoted_date` cap and MySQL's fractional-seconds resolution.
 */
function formatTimeComponents(h: number, min: number, s: number, ms: number, us: number): string {
  const hh = String(h).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${hh}:${mm}:${ss}${microsecondFraction(ms * 1000 + us)}`;
}

/**
 * Rails `quoted_date`'s fractional-seconds rule (abstract/quoting.rb:194-195):
 * append `.` + `sprintf("%06d", usec)` when `usec > 0`, otherwise nothing.
 */
function microsecondFraction(usec: number): string {
  return usec > 0 ? `.${String(usec).padStart(6, "0")}` : "";
}
