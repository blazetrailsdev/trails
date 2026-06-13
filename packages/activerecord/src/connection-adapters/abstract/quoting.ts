/**
 * Quoting — SQL value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting
 *
 * @boundary-file: SQL quoting accepts caller-supplied values; legacy callers
 *   may pass JS `Date` for date-typed columns. The dispatcher branches on
 *   `instanceof Date` alongside Temporal types and handles each separately.
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import { NotImplementedError } from "../../errors.js";
import type { SchemaQuoter } from "./assert-schema-adapter.js";
import {
  formatInstantForSql,
  formatPlainDateTimeForSql,
  formatPlainDateForSql,
  formatPlainTimeForSql,
} from "./sql-datetime.js";

/**
 * ANSI double-quote identifier quoter (`""`-escaped). Not a Rails-layer
 * method — Rails' abstract `Quoting` has no `quote_identifier`. This is the
 * SQL-92 fallback used only by {@link ABSTRACT_SCHEMA_QUOTER} when DDL is
 * rendered without a live adapter; every real adapter quotes through its own
 * dialect-specific helper.
 *
 * @internal
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Quotes the column name. Must be implemented by subclasses — the abstract
 * layer raises, mirroring Rails where every adapter defines its own.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#quote_column_name
 * (activerecord/.../abstract/quoting.rb L61 — `raise NotImplementedError`)
 */
export function quoteColumnName(_columnName: string): string {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/quoting.rb:61
  throw new NotImplementedError();
}

/**
 * Quotes the table name. Defaults to column-name quoting with no dot-split;
 * schema-qualified handling is adapter-specific (PG/MySQL/SQLite each override).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#quote_table_name
 * (activerecord/.../abstract/quoting.rb L66 — `quote_column_name(table_name)`)
 */
export function quoteTableName(name: string): string {
  return quoteColumnName(name);
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
export function quoteTableNameForAssignment(table: string, attr: string): string {
  return quoteTableName(`${table}.${attr}`);
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
export function quoteDefaultExpression(value: unknown, _column?: unknown): string {
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
 * ANSI fallback quoter used only when a schema visitor or definition is built
 * without a live adapter (the standalone `schemaCreation()` convention helpers
 * and isolated unit tests). Every adapter-backed caller passes its own
 * `SchemaQuoter`, so this never quotes DDL for a real connection; it exists so
 * the abstract schema layer stays usable adapter-free rather than silently
 * routing through whatever dialect happens to import these freestanding
 * functions. Mirrors the `ABSTRACT_QUOTER` crutch in `sanitization.ts`.
 */
export const ABSTRACT_SCHEMA_QUOTER: SchemaQuoter = {
  quoteIdentifier,
  // The adapter-free fallback renders schema-qualified names ANSI-style by
  // quoting each dot-separated part. The public `quoteTableName` mirrors Rails
  // (delegates to the throwing `quoteColumnName`), so it can't back this crutch.
  quoteTableName: (name) =>
    name
      .split(".")
      .map((part) => quoteIdentifier(part))
      .join("."),
  quoteDefaultExpression,
};

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

export function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}

/**
 * Format a date/time value for SQL without surrounding quotes.
 * Temporal.Instant and ZonedDateTime respect default_timezone.
 *
 * @internal
 */
export function quotedDate(
  value:
    | Temporal.Instant
    | Temporal.ZonedDateTime
    | Temporal.PlainDateTime
    | Temporal.PlainDate
    | Temporal.PlainTime,
): string {
  if (value instanceof Temporal.Instant) return formatInstantForSql(value);
  if (value instanceof Temporal.ZonedDateTime) return formatInstantForSql(value.toInstant());
  if (value instanceof Temporal.PlainDateTime) return formatPlainDateTimeForSql(value);
  if (value instanceof Temporal.PlainDate) return formatPlainDateForSql(value);
  if (value instanceof Temporal.PlainTime) {
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
    return formatPlainDateTimeForSql(dt);
  }
  throw new TypeError(
    `quotedDate: cannot format ${(value as object).constructor?.name ?? typeof value} — use a Temporal type`,
  );
}

/**
 * Format a time value for SQL, stripping the date prefix.
 *
 * @internal
 */
export function quotedTime(value: Temporal.PlainTime | Temporal.PlainDateTime): string {
  const dt =
    value instanceof Temporal.PlainTime
      ? new Temporal.PlainDateTime(
          2000,
          1,
          1,
          value.hour,
          value.minute,
          value.second,
          value.millisecond,
          value.microsecond,
          value.nanosecond,
        )
      : value.with({ year: 2000, month: 1, day: 1 });
  return formatPlainDateTimeForSql(dt).replace(/^\d{4}-\d{2}-\d{2} /, "");
}

/** @internal */
function typeCastedBinds(
  this: { typeCast: (v: unknown) => unknown },
  binds: unknown[] | null | undefined,
): unknown[] | undefined {
  return binds?.map((value: any) => {
    if (value instanceof ModelAttribute) {
      return this.typeCast(value.valueForDatabase);
    }
    return this.typeCast(value);
  });
}

/**
 * Mixin object for AbstractAdapter: bundles standalone Quoting helpers so
 * `include(AbstractAdapter, Quoting)` credits them to the host class.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting (included in AbstractAdapter)
 */
export const Quoting = {
  quotedDate,
  quotedTime,
  typeCastedBinds,
};
