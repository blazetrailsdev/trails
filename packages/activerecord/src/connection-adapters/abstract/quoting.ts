/**
 * Quoting — SQL value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting
 */

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
  if (value instanceof Date) return `'${quotedDate(value)}'`;
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
  if (value instanceof Date) return quotedDate(value);
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
 * Format a date/time value for SQL. Includes microseconds if available.
 * Respects ActiveRecord.default_timezone (:utc or :local).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_date
 */
export function quotedDate(value: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const useUtc = getDefaultTimezone() === "utc";

  const y = useUtc ? value.getUTCFullYear() : value.getFullYear();
  const m = pad(useUtc ? value.getUTCMonth() + 1 : value.getMonth() + 1);
  const d = pad(useUtc ? value.getUTCDate() : value.getDate());
  const hh = pad(useUtc ? value.getUTCHours() : value.getHours());
  const mm = pad(useUtc ? value.getUTCMinutes() : value.getMinutes());
  const ss = pad(useUtc ? value.getUTCSeconds() : value.getSeconds());
  const ms = useUtc ? value.getUTCMilliseconds() : value.getMilliseconds();

  let result = `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  if (ms > 0) {
    result += "." + pad(ms * 1000, 6);
  }
  return result;
}

/**
 * Format a time value for SQL (time portion only).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_time
 */
export function quotedTime(value: Date): string {
  const useUtc = getDefaultTimezone() === "utc";
  const h = useUtc ? value.getUTCHours() : value.getHours();
  const m = useUtc ? value.getUTCMinutes() : value.getMinutes();
  const s = useUtc ? value.getUTCSeconds() : value.getSeconds();
  const ms = useUtc ? value.getUTCMilliseconds() : value.getMilliseconds();

  // Build a date at 2000-01-01 with the time components, then format via quotedDate
  const adjusted = useUtc
    ? new Date(Date.UTC(2000, 0, 1, h, m, s, ms))
    : new Date(2000, 0, 1, h, m, s, ms);
  const full = quotedDate(adjusted);
  return full.replace(/^\d{4}-\d{2}-\d{2} /, "");
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
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:(?:\s+AS)?\s+\w+)?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:(?:\s+AS)?\s+\w+)?)*$/i;
}

/**
 * Regexp for column names with order.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#column_name_with_order_matcher
 */
export function columnNameWithOrderMatcher(): RegExp {
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*$/i;
}

function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}
