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
} from "../abstract/sql-datetime.js";
import { quote as abstractQuote, type QuotingDispatchHost } from "../abstract/quoting.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { BigDecimal } from "@blazetrails/activesupport";
import { BinaryData } from "@blazetrails/activemodel";

export interface Quoting {
  quotedTrue(): string;
  unquotedTrue(): number;
  quotedFalse(): string;
  unquotedFalse(): number;
  quoteTableName(name: string): string;
  quoteColumnName(name: string): string;
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

/**
 * Mirrors: MySQL::Quoting#quote_table_name —
 * `"`#{name.gsub('`', '``').gsub('.', '`.`')}`"`. The whole name is wrapped in
 * backticks with `.` rewritten as `` `.` `` so `foo.bar` → `` `foo`.`bar` ``
 * (no `*` special-casing, unlike quoteColumnName).
 */
export function quoteTableName(name: string): string {
  return `\`${name.replace(/`/g, "``").replace(/\./g, "`.`")}\``;
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
const MYSQL_ESCAPE_RE = /[\\'"\x00\n\r\x1a]/g;
const MYSQL_ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  "'": "\\'",
  '"': '\\"',
  "\0": "\\0",
  "\n": "\\n",
  "\r": "\\r",
  "\x1a": "\\Z",
};

/**
 * Quote a string value for use in SQL. Single/double quotes, backslash,
 * and control characters (NUL, newline, carriage return, Ctrl-Z) are
 * escaped with backslashes. Mirrors Rails MySQL `quote_string`, which
 * delegates to `mysql2`'s connection-level escape — uses backslash-escapes
 * (not SQL-standard `''` doubling). The npm `mysql2` driver's `escape()`
 * matches this same shape.
 */
export function quoteString(value: string): string {
  return `'${value.replace(MYSQL_ESCAPE_RE, (ch) => MYSQL_ESCAPE_MAP[ch] ?? ch)}'`;
}

export function quotedBinary(value: Buffer | Uint8Array | string): string {
  const hex = Buffer.isBuffer(value)
    ? value.toString("hex")
    : value instanceof Uint8Array
      ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")
      : Buffer.from(value, "binary").toString("hex");
  return `x'${hex}'`;
}

/** @internal */
export function unquoteIdentifier(identifier: string | null | undefined): string | null {
  if (identifier && identifier.startsWith("`") && identifier.endsWith("`")) {
    return identifier.slice(1, -1).replace(/``/g, "`");
  }
  return identifier ?? null;
}

/** @internal */
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
  const collate = String.raw`(?:\s+COLLATE\s+(?:\w+|"\w+"))?`;
  const dir = String.raw`(?:\s+ASC|\s+DESC)?`;
  const nulls = String.raw`(?:\s+NULLS\s+(?:FIRST|LAST))?`;
  const ordered = String.raw`${expr}${collate}${dir}${nulls}`;
  return new RegExp(`^${ordered}(?:\\s*,\\s*${ordered})*$`, "i");
}

/**
 * Quote a value for inclusion in a SQL literal.
 *
 * Rails' MySQL adapter has **no** `quote` override — `mysql/quoting.rb` defines
 * only `quote_column_name` / `quote_table_name` / `cast_bound_value`, so a MySQL
 * `quote` runs the abstract `quote` and the MySQL-specific behaviour flows in
 * through the dispatched helpers (`quoted_true`/`quoted_false`, `quote_string`,
 * `quoted_binary`, `quoted_date`/`quoted_time`). We mirror that here: only the
 * branches whose dispatch the abstract `quote` doesn't thread through `this`
 * (booleans, binary, symbols, strings — plus the trails-only non-finite guard)
 * stay inline; everything else delegates to {@link abstractQuote} with `this`
 * threaded so the date/time dispatch lands on MySQL's {@link quotedDate}.
 */
export function quote(this: QuotingDispatchHost | void, value: unknown): string {
  if (typeof value === "boolean") return value ? quotedTrue() : quotedFalse();
  // Non-finite numbers (±Infinity, NaN) have no MySQL literal — `String(Infinity)`
  // produces the bareword `Infinity`, which MySQL parses as an identifier and
  // throws "Unknown column 'Infinity'". Mirror PG's behavior and quote them as
  // strings; MySQL coerces or rejects at the column-type boundary.
  if (typeof value === "number" && !Number.isFinite(value)) return quoteString(String(value));
  if (value instanceof Buffer || value instanceof Uint8Array) return quotedBinary(value);
  // Mirrors Rails abstract/quoting.rb: `when Type::Binary::Data then quoted_binary(value)`.
  if (value instanceof BinaryData) return quotedBinary(value.bytes);
  if (typeof value === "symbol") {
    const desc = value.description;
    if (desc === undefined) throw new TypeError("Cannot quote a Symbol without a description");
    return quoteString(desc);
  }
  if (typeof value === "string") return quoteString(value);
  // nil, BigDecimal, finite numbers/bigints, Class, and date/time all match the
  // abstract `quote`. Thread `this` so `quoted_date`/`quoted_time` dispatch onto
  // MySQL's microsecond-capped {@link quotedDate} (and the inherited quotedTime).
  return abstractQuote.call(this, value);
}

/**
 * Format a date/time value for SQL without surrounding quotes, capping
 * fractional seconds at 6 digits (microseconds).
 *
 * Not a Rails method: `mysql/quoting.rb` has no `quoted_date` override — MySQL
 * inherits the abstract `quoted_date`, and Ruby's `Time#usec` is intrinsically
 * microsecond-bounded, so Rails never needs an explicit cap. Trails' abstract
 * helper emits up to nanoseconds (Temporal precision), and MySQL
 * TIME/DATETIME/TIMESTAMP reject the 7–9th fractional digits in strict mode, so
 * this trails-specific override re-routes through the MySQL-safe formatters.
 * Exposed on the adapter so the inherited abstract `quote` / `quotedTime` date
 * dispatch lands here instead of the nanosecond-precision abstract helper.
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
    // Abstract quotedDate normalises a bare time onto 2000-01-01; mirror that so
    // direct quotedDate(time) calls match the abstract helper's shape.
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
  // Rails type_cast: `when BigDecimal then value.to_s("F")`.
  if (value instanceof BigDecimal) return value.toString("F");
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
