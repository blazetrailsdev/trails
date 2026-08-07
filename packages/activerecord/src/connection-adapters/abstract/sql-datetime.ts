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
 *
 * @noRailsEquivalent PERMANENT — Ruby has `Time`, `Date` and `DateTime` in the
 * core library, so a Rails adapter formats a datetime for SQL by calling
 * `value.to_fs(:db)` / `strftime` on the value itself and `quoted_date`
 * (abstract/quoting.rb:193-197) is the only method the layer needs. JS has no
 * such type: trails carries Temporal, whose four value shapes (`Instant`,
 * `PlainDateTime`, `PlainDate`, `PlainTime`) each need their own formatter,
 * per adapter dialect. Every name here is one arm of that expansion — Ruby
 * writes none of them because `strftime` covers all of it — and the one method
 * Rails does declare, `quotedDate`, stays in `abstract/quoting.ts` at its Rails
 * address and calls into this file.
 */

import { Rational, Temporal, strftime, type StrftimeSubject } from "@blazetrails/date";
import { ActiveRecord } from "../../ar-config.js";

/**
 * `Time::DATE_FORMATS[:db]` (activesupport/lib/active_support/core_ext/time/
 * conversions.rb:9) and `Date::DATE_FORMATS[:db]`
 * (core_ext/date/conversions.rb:12) — the two formats `quoted_date`'s
 * `value.to_fs(:db)` (abstract/quoting.rb:193) resolves to, depending on
 * whether the value carries a time.
 */
const TIME_DB_FORMAT = "%Y-%m-%d %H:%M:%S";
const DATE_DB_FORMAT = "%Y-%m-%d";

/**
 * @internal The fields the `date` gem's `strftime` reads off its receiver.
 * `%Y-%m-%d %H:%M:%S` touches none of `wday` / `yday` / `zone` / `utcOffset`,
 * but the subject is the whole receiver, so build it whole.
 */
function strftimeSubject(v: {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  dayOfYear: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  microsecond: number;
  nanosecond: number;
}): StrftimeSubject {
  return {
    year: v.year,
    mon: v.month,
    day: v.day,
    wday: v.dayOfWeek % 7,
    yday: v.dayOfYear,
    hour: v.hour,
    min: v.minute,
    sec: v.second,
    nsec: new Rational(v.millisecond * 1_000_000 + v.microsecond * 1_000 + v.nanosecond, 1),
    zone: "",
    utcOffset: 0,
  };
}

/**
 * `quoted_date`'s body (abstract/quoting.rb:184-199) over an already
 * timezone-resolved value: `value.to_fs(:db)`, then `"." + sprintf("%06d",
 * value.usec)` when `usec > 0`.
 */
function toFsDbWithUsec(subject: StrftimeSubject): string {
  const nsec = subject.nsec.div(1);
  return strftime(subject, TIME_DB_FORMAT) + microsecondFraction(Math.floor(nsec / 1_000));
}

/**
 * Return the IANA timezone string for SQL datetime serialization/deserialization,
 * based on `ActiveRecord.default_timezone`. Shared by all instant formatters and
 * by `SQLite3DateTime#cast` so both directions always agree on the timezone.
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
  return toFsDbWithUsec(strftimeSubject(value.toZonedDateTimeISO(defaultSqlTimezone())));
}

/**
 * Format a `Temporal.PlainDateTime` for SQL as `YYYY-MM-DD HH:MM:SS[.ffffff]`.
 * No timezone conversion — the value is naive by definition. Fractional part is
 * a fixed 6-digit microsecond field when `usec > 0`, capped at microseconds
 * (see {@link formatInstantForSql}).
 */
export function formatPlainDateTimeForSql(value: Temporal.PlainDateTime): string {
  return toFsDbWithUsec(strftimeSubject(value));
}

/**
 * Format a `Temporal.PlainDate` for SQL as `YYYY-MM-DD`.
 */
export function formatPlainDateForSql(value: Temporal.PlainDate): string {
  return strftime(strftimeSubject(value.toPlainDateTime()), DATE_DB_FORMAT);
}

/**
 * PostgreSQL literal formatters. `PostgreSQL::Quoting#quoted_date`
 * (postgresql/quoting.rb:143-150) is a pure override over the abstract one:
 *
 *   if value.year <= 0
 *     bce_year = format("%04d", -value.year + 1)
 *     super.sub(/^-?\d+/, bce_year) + " BC"
 *   else
 *     super
 *   end
 *
 * so each PG arm here calls the abstract formatter above — the shared
 * `to_fs(:db)` path through `packages/date`'s `strftime` — and applies only
 * that year rewrite, exactly as `super` does.
 */
function bceSuffixed(year: number, superResult: string): string {
  if (year <= 0) {
    const bceYear = String(-year + 1).padStart(4, "0");
    return `${superResult.replace(/^-?\d+/, bceYear)} BC`;
  }
  return superResult;
}

export function formatInstantForSqlPostgres(value: Temporal.Instant): string {
  const z = value.toZonedDateTimeISO(defaultSqlTimezone());
  return bceSuffixed(z.year, formatInstantForSql(value));
}

export function formatPlainDateTimeForSqlPostgres(value: Temporal.PlainDateTime): string {
  return bceSuffixed(value.year, formatPlainDateTimeForSql(value));
}

export function formatPlainDateForSqlPostgres(value: Temporal.PlainDate): string {
  return bceSuffixed(value.year, formatPlainDateForSql(value));
}

/**
 * Format a `Temporal.PlainTime` for SQL as `HH:MM:SS[.ffffff]`, the way
 * `quoted_time` (abstract/quoting.rb:201-204) does it: move the value to
 * 2000-01-01, format it through `quoted_date`, and strip the date prefix.
 */
export function formatPlainTimeForSql(value: Temporal.PlainTime): string {
  const dt = new Temporal.PlainDateTime(
    2000,
    1,
    1,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
    value.microsecond,
    value.nanosecond,
  );
  return formatPlainDateTimeForSql(dt).replace(/^\d{4}-\d{2}-\d{2} /, "");
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

/**
 * Rails `quoted_date`'s fractional-seconds rule (abstract/quoting.rb:194-195):
 * append `.` + `sprintf("%06d", usec)` when `usec > 0`, otherwise nothing.
 */
function microsecondFraction(usec: number): string {
  return usec > 0 ? `.${String(usec).padStart(6, "0")}` : "";
}
