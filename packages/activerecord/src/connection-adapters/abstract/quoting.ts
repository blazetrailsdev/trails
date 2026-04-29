/**
 * Quoting — SQL value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting
 */

import { NotImplementedError } from "../../errors.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { getDefaultTimezone } from "../../type/internal/timezone.js";

/**
 * Quote a SQL identifier (table name, column name, index name).
 * Uses double quotes for SQLite/PG, backticks for MySQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_column_name
 */
export function quoteIdentifier(name: string, adapter?: "sqlite" | "postgres" | "mysql"): string {
  if (adapter === "mysql") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Quote a table name. Handles schema-qualified names (schema.table).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_table_name
 */
export function quoteTableName(name: string, adapter?: "sqlite" | "postgres" | "mysql"): string {
  return name
    .split(".")
    .map((part) => quoteIdentifier(part, adapter))
    .join(".");
}

/**
 * Quote a column name.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_column_name
 */
export function quoteColumnName(
  columnName: string,
  adapter?: "sqlite" | "postgres" | "mysql",
): string {
  return quoteIdentifier(columnName, adapter);
}

/**
 * Quote a value for use in SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote
 */
export function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? quotedTrue() : quotedFalse();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof Temporal.Instant) return `'${formatInstantForSql(value)}'`;
  if (value instanceof Temporal.PlainDateTime) return `'${formatPlainDateTimeForSql(value)}'`;
  if (value instanceof Temporal.PlainDate) return `'${formatPlainDateForSql(value)}'`;
  if (value instanceof Temporal.PlainTime) return `'${formatPlainTimeForSql(value)}'`;
  if (value instanceof Temporal.ZonedDateTime) return `'${formatInstantForSql(value.toInstant())}'`;
  if (value instanceof Date)
    throw new TypeError(
      "quote: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  if (typeof value === "symbol") {
    const desc = value.description;
    if (desc === undefined) throw new TypeError("Cannot quote a Symbol without a description");
    return `'${quoteString(desc)}'`;
  }
  if (typeof value === "string") {
    return `'${quoteString(value)}'`;
  }
  // Rails: when Class then "'#{value}'"
  if (typeof value === "function" && value.name) {
    return `'${value.name}'`;
  }
  throw new TypeError(`can't quote ${(value as object).constructor?.name ?? typeof value}`);
}

/**
 * Cast a value to a type the database understands.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#type_cast
 */
export function typeCast(value: unknown): unknown {
  if (typeof value === "symbol") return value.description ?? String(value);
  if (value === true) return unquotedTrue();
  if (value === false) return unquotedFalse();
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "string") return value;
  if (value instanceof Temporal.Instant) return formatInstantForSql(value);
  if (value instanceof Temporal.PlainDateTime) return formatPlainDateTimeForSql(value);
  if (value instanceof Temporal.PlainDate) return formatPlainDateForSql(value);
  if (value instanceof Temporal.PlainTime) return formatPlainTimeForSql(value);
  if (value instanceof Temporal.ZonedDateTime) return formatInstantForSql(value.toInstant());
  if (value instanceof Date)
    throw new TypeError(
      "typeCast: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  throw new TypeError(`can't cast ${(value as object).constructor?.name ?? typeof value}`);
}

/**
 * Cast a value to be used as a bound parameter of unknown type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#cast_bound_value
 */
export function castBoundValue(value: unknown): unknown {
  return value;
}

/**
 * Host interface for quoting methods that need adapter context.
 */
export interface QuotingHost {
  /** @internal */
  lookupCastType?(sqlType: string): unknown;
}

/**
 * Look up the cast type from a column. Delegates to lookupCastType(column.sql_type)
 * on the adapter, matching Rails' internal delegation chain.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#lookup_cast_type_from_column
 */
export function lookupCastTypeFromColumn(
  this: QuotingHost | void,
  column: { sqlType: string | null },
): unknown {
  const sqlType = column.sqlType;
  if (!sqlType) return null;
  if (this && typeof this === "object" && typeof this.lookupCastType === "function") {
    return this.lookupCastType(sqlType);
  }
  return sqlType;
}

/**
 * Quotes a string, escaping any ' (single quote) and \ (backslash) characters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_string
 */
export function quoteString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

/**
 * Quote a table name for assignment (table.column form).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_table_name_for_assignment
 */
export function quoteTableNameForAssignment(
  table: string,
  attr: string,
  adapter?: "sqlite" | "postgres" | "mysql",
): string {
  return quoteTableName(`${table}.${attr}`, adapter);
}

/**
 * Quote a column default expression for use in DDL.
 *
 * Raw SQL defaults should be expressed as:
 * - A function: `() => "CURRENT_TIMESTAMP"` (mirrors Rails `-> { "CURRENT_TIMESTAMP" }`)
 * - An Arel SqlLiteral: `new SqlLiteral("CURRENT_TIMESTAMP")` (mirrors `Arel.sql(...)`)
 *
 * All other values are quoted as literals via `quote()`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#quote_default_expression
 */
export function quoteDefaultExpression(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "function") {
    const result = (value as () => unknown)();
    if (typeof result === "string") return ` DEFAULT ${result}`;
    if (isSqlLiteral(result)) return ` DEFAULT ${result.value}`;
    throw new TypeError(
      "quoteDefaultExpression expected function default to return a string or SqlLiteral",
    );
  }
  if (isSqlLiteral(value)) return ` DEFAULT ${value.value}`;
  return ` DEFAULT ${quote(value)}`;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_true
 */
export function quotedTrue(): string {
  return "TRUE";
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#unquoted_true
 */
export function unquotedTrue(): boolean {
  return true;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_false
 */
export function quotedFalse(): string {
  return "FALSE";
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#unquoted_false
 */
export function unquotedFalse(): boolean {
  return false;
}

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
  return String(year);
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

/**
 * Quote binary data for SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_binary
 */
export function quotedBinary(value: unknown): string {
  return `'${quoteString(String(value))}'`;
}

/**
 * Sanitize a string to appear within a SQL comment.
 * Strips surrounding comment markers and escapes internal ones.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#sanitize_as_sql_comment
 */
export function sanitizeAsSqlComment(value: unknown): string {
  let comment = String(value);
  comment = comment.replace(/^\s*\/\*\+?\s?/, "").replace(/\s?\*\/\s*$/, "");
  comment = comment.replace(/\*\//g, "* /");
  comment = comment.replace(/\/\*/g, "/ *");
  return comment;
}

/**
 * Regexp for column names (with or without a table name prefix).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#column_name_matcher
 */
export function columnNameMatcher(): RegExp {
  // Direct JS translation of Rails' abstract adapter column_name_matcher.
  // Ruby source uses \g<2> for recursion; JS approximates at 2 levels
  // (handles length(trim(col)) and similar real-world cases).
  //
  // Rails Ruby:
  //   /((?:\w+\.)?\w+ | \w+\((?:|\g<2>)\)) (?:(?:\s+AS)?\s+\w+)?
  //   (?:\s*,\s*\g<1>)*/ix
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)*$/i;
}

/**
 * Regexp for column names with order.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#column_name_with_order_matcher
 */
export function columnNameWithOrderMatcher(): RegExp {
  // Direct JS translation of Rails' abstract adapter column_name_with_order_matcher.
  // No COLLATE (abstract has none); NULLS FIRST/LAST included per Rails abstract pattern.
  //
  // Rails Ruby:
  //   /((?:\w+\.)?\w+ | \w+\((?:|\g<2>)\)) (?:\s+ASC|\s+DESC)?
  //   (?:\s+NULLS\s+(?:FIRST|LAST))? (?:\s*,\s*\g<1>)*/ix
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*$/i;
}

function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}

/** @internal */
function typeCastedBinds(binds: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Quoting#type_casted_binds is not implemented",
  );
}

/** @internal */
function lookupCastType(sqlType: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Quoting#lookup_cast_type is not implemented",
  );
}
