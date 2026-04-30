/**
 * MySQL quoting — MySQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting (module)
 *
 * In Rails, Quoting is a module mixed into AbstractMysqlAdapter.
 * Here we export standalone functions and an interface, matching
 * the pattern used by the PostgreSQL and SQLite3 adapters.
 *
 * @boundary-file: SQL value quoting branches on `instanceof Date` alongside
 *   Temporal types; legacy Date values from custom-typed columns hit a
 *   typed-error path that mirrors the abstract dispatcher.
 */

import {
  formatInstantForSqlMysql as formatInstantForSql,
  formatPlainDateTimeForSqlMysql as formatPlainDateTimeForSql,
  formatPlainDateForSql,
  formatPlainTimeForSqlMysql as formatPlainTimeForSql,
} from "../abstract/quoting.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

export interface Quoting {
  quotedTrue(): string;
  unquotedTrue(): number;
  quotedFalse(): string;
  unquotedFalse(): number;
  quoteTableName(name: string): string;
  quoteColumnName(name: string): string;
  quoteString(value: string): string;
  quotedBinaryString(value: Buffer): string;
}

export function quotedTrue(): string {
  return "1";
}

export function unquotedTrue(): number {
  return 1;
}

export function quotedFalse(): string {
  return "0";
}

export function unquotedFalse(): number {
  return 0;
}

export function quoteTableName(name: string): string {
  return name
    .split(".")
    .map((part) => quoteColumnName(part))
    .join(".");
}

export function quoteColumnName(name: string): string {
  if (name === "*") return name;
  return `\`${name.replace(/`/g, "``")}\``;
}

/**
 * Mirrors: MySQL identifier quoting — backtick form. Re-exported so
 * the Quoting interface has a uniform `quoteIdentifier` regardless of
 * adapter.
 */
export function quoteIdentifier(name: string): string {
  return quoteColumnName(name);
}

// eslint-disable-next-line no-control-regex
const MYSQL_ESCAPE_RE = /[\\\x00\n\r\x1a]/g;
const MYSQL_ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  "\0": "\\0",
  "\n": "\\n",
  "\r": "\\r",
  "\x1a": "\\Z",
};

/**
 * Quote a string value for use in SQL. Single quotes are escaped using
 * SQL-standard quote doubling (''), which is safe regardless of
 * NO_BACKSLASH_ESCAPES. Backslash and control characters (NUL, newline,
 * carriage return, Ctrl-Z) are escaped with backslashes for safe
 * transport across protocols.
 */
export function quoteString(value: string): string {
  const withDoubledQuotes = value.replace(/'/g, "''");
  const escaped = withDoubledQuotes.replace(MYSQL_ESCAPE_RE, (ch) => MYSQL_ESCAPE_MAP[ch] ?? ch);
  return `'${escaped}'`;
}

export function quotedBinaryString(value: Buffer): string {
  return `x'${value.toString("hex")}'`;
}

export function quotedBinary(value: Buffer | string): string {
  const hex = Buffer.isBuffer(value)
    ? value.toString("hex")
    : Buffer.from(value, "binary").toString("hex");
  return `x'${hex}'`;
}

export function unquoteIdentifier(identifier: string | null | undefined): string | null {
  if (identifier && identifier.startsWith("`") && identifier.endsWith("`")) {
    return identifier.slice(1, -1).replace(/``/g, "`");
  }
  return identifier ?? null;
}

export function castBoundValue(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value === true) return "1";
  if (value === false) return "0";
  return value;
}

// Mirrors Rails' MySQL::Quoting.column_name_matcher.
// Rails uses recursive \g<n> back-references; JS approximates with 2-level
// function call unrolling (handles length(trim(col)) and similar).
// Rails MySQL COLUMN_NAME supports: integers, `backtick`, "double-quoted", \w identifiers,
// with up to 2 qualifier prefixes (schema.table.col) and recursive function args.
export function columnNameMatcher(): RegExp {
  // id: integer literal, backtick-quoted, double-quoted, or plain \w identifier
  const id =
    String.raw`(?:\d+|` +
    "`" +
    String.raw`[^` +
    "`" +
    String.raw`]*` +
    "`" +
    String.raw`|"[^"]*"|\w+)`;
  const col = String.raw`(?:(?:${id}\.){0,2})${id}`;
  // Rails uses \w+\((?:|\g<2>)\) — 0 or 1 arg (no comma-separated multi-arg).
  // fnCall2: function with 0 or 1 plain col/star arg (deepest level)
  const fnCall2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
  // fnCall1: function with 0 or 1 arg (which can itself be a function)
  const fnCall1 = String.raw`\w+\(\s*(?:\*|${col}|${fnCall2})?\s*\)`;
  const expr = String.raw`(?:${col}|${fnCall1})`;
  const aliased = String.raw`${expr}(?:(?:\s+AS)?\s+${id})?`;
  return new RegExp(`^${aliased}(?:\\s*,\\s*${aliased})*$`, "i");
}

// Mirrors Rails' MySQL::Quoting.column_name_with_order_matcher — like
// columnNameMatcher but also allows COLLATE and ASC/DESC/NULLS suffixes.
export function columnNameWithOrderMatcher(): RegExp {
  const id =
    String.raw`(?:\d+|` +
    "`" +
    String.raw`[^` +
    "`" +
    String.raw`]*` +
    "`" +
    String.raw`|"[^"]*"|\w+)`;
  const col = String.raw`(?:(?:${id}\.){0,2})${id}`;
  const fnCall2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
  const fnCall1 = String.raw`\w+\(\s*(?:\*|${col}|${fnCall2})?\s*\)`;
  const expr = String.raw`(?:${col}|${fnCall1})`;
  const collate = String.raw`(?:\s+COLLATE\s+\w+)?`;
  const dir = String.raw`(?:\s+ASC|\s+DESC)?`;
  const nulls = String.raw`(?:\s+NULLS\s+(?:FIRST|LAST))?`;
  const ordered = String.raw`${expr}${collate}${dir}${nulls}`;
  return new RegExp(`^${ordered}(?:\\s*,\\s*${ordered})*$`, "i");
}

/**
 * Quote a value for inclusion in a SQL literal.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting#quote
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
  if (value instanceof Buffer) return quotedBinary(value);
  if (typeof value === "symbol") {
    const desc = value.description;
    if (desc === undefined) throw new TypeError("Cannot quote a Symbol without a description");
    return quoteString(desc);
  }
  if (typeof value === "string") return quoteString(value);
  // Rails: when Class then "'#{value}'"
  if (typeof value === "function" && value.name) return `'${value.name}'`;
  throw new TypeError(`can't quote ${(value as object).constructor?.name ?? typeof value}`);
}

/**
 * Type-cast a value for use as a column default in DDL.
 * MySQL represents booleans as 1/0 integers.
 */
export function typecastForDatabase(value: unknown): unknown {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}

/**
 * Cast a value to the primitive form MySQL drivers expect for binds.
 * Booleans become 1/0; Temporal types are formatted as unquoted
 * `YYYY-MM-DD HH:MM:SS[.ffffff]` strings (it's `quote()`'s job to
 * add surrounding single quotes); strings and numbers pass through.
 * JS Date is not accepted — use a Temporal type instead.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting#type_cast
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
