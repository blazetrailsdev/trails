/**
 * MySQL quoting — MySQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting (module)
 *
 * In Rails, Quoting is a module mixed into AbstractMysqlAdapter.
 * Here we export standalone functions, matching the pattern used by
 * the PostgreSQL and SQLite3 adapters.
 *
 * @boundary-file: SQL value quoting branches on `instanceof Date` alongside
 *   Temporal types; legacy Date values from custom-typed columns hit a
 *   typed-error path that mirrors the abstract dispatcher.
 */

import {
  formatInstantForSqlMysql as formatInstantForSql,
  formatPlainDateTimeForSqlMysql as formatPlainDateTimeForSql,
  formatPlainDateForSql,
} from "../abstract/sql-datetime.js";
import {
  typeCast as abstractTypeCast,
  toBytes,
  type QuotingDispatchHost,
} from "../abstract/quoting.js";
import { Temporal } from "@blazetrails/date";
import { Value as TimeValue } from "../../type/time.js";
import { BinaryData } from "@blazetrails/activemodel";
import { toS } from "@blazetrails/activesupport";

// Rails MySQL overrides unquoted_true/false (1/0) but NOT quoted_true/false,
// which inherit the abstract "TRUE"/"FALSE" (mysql/quoting.rb).
export function unquotedTrue(): number {
  return 1;
}

export function unquotedFalse(): number {
  return 0;
}

/**
 * Mirrors: MySQL::Quoting::QUOTED_COLUMN_NAMES / QUOTED_TABLE_NAMES
 * (mysql/quoting.rb:11-12) — the `Concurrent::Map`s the class-side quoters memoize
 * through. Keyed on the name exactly as passed, as in Ruby (mysql/quoting.rb:46-52).
 */
const QUOTED_COLUMN_NAMES = new Map<unknown, string>();
const QUOTED_TABLE_NAMES = new Map<unknown, string>();

/**
 * Mirrors: MySQL::Quoting#quote_table_name —
 * `"`#{name.to_s.gsub('`', '``').gsub('.', '`.`')}`"`. The whole name is
 * wrapped in backticks with `.` rewritten as `` `.` `` so `foo.bar` →
 * `` `foo`.`bar` `` (mysql/quoting.rb:50-52).
 */
export function quoteTableName(name: unknown): string {
  let quoted = QUOTED_TABLE_NAMES.get(name);
  if (quoted === undefined) {
    quoted = `\`${toS(name).replace(/`/g, "``").replace(/\./g, "`.`")}\``;
    QUOTED_TABLE_NAMES.set(name, quoted);
  }
  return quoted;
}

export function quoteColumnName(name: unknown): string {
  let quoted = QUOTED_COLUMN_NAMES.get(name);
  if (quoted === undefined) {
    quoted = `\`${toS(name).replace(/`/g, "``")}\``;
    QUOTED_COLUMN_NAMES.set(name, quoted);
  }
  return quoted;
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
 * Escape a string value for use in SQL. Single/double quotes, backslash,
 * and control characters (NUL, newline, carriage return, Ctrl-Z) are
 * escaped with backslashes. Mirrors Rails MySQL `quote_string`
 * (`abstract_mysql_adapter.rb`), which delegates to `mysql2`'s
 * connection-level escape — backslash-escapes, not SQL-standard `''`
 * doubling. **Escape-only**: the surrounding quotes are added once by
 * `quote` (abstract/quoting.rb:75-76), as in Rails.
 */
export function quoteString(value: string): string {
  return value.replace(MYSQL_ESCAPE_RE, (ch) => MYSQL_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Mirrors: MySQL::Quoting#quoted_binary (`x'#{value.hex}'`, mysql/quoting.rb:80).
 * Rails' signature takes the `Type::Binary::Data` itself, so accept it alongside
 * the raw views our `quote` unwraps to — a Rails-shaped call then works here too.
 * Shares {@link toBytes} with the abstract, SQLite and PostgreSQL overrides, so
 * all accept the same union. A latin1 `string` stays supported on top: Ruby's `Data#hex` reads
 * a byte String, and callers here pass the JS stand-in for one. PG accepts one
 * too; SQLite's override rejects it.
 */
export function quotedBinary(
  value: Buffer | Uint8Array | ArrayBuffer | string | BinaryData,
): string {
  const bytes = toBytes(value);
  if (bytes) {
    return `x'${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex")}'`;
  }
  if (typeof value === "string") return `x'${Buffer.from(value, "binary").toString("hex")}'`;
  throw new TypeError(
    `quotedBinary expects a Uint8Array, ArrayBuffer, Buffer, string, or BinaryData; got ${
      value === null ? "null" : typeof value
    }`,
  );
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
export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  // Rails' MySQL override special-cases only the temporal arms — `when
  // ActiveSupport::TimeWithZone` / `when Time` / `when Date`
  // (mysql/quoting.rb:94-118) — because mysql2 handles those classes more
  // efficiently than Strings. trails' drivers take the SQL wire string, so the
  // arms dispatch through `self.quoted_time` / `self.quoted_date`, threading
  // `this` so MySQL's microsecond-capping `quotedDate` override is honored.
  if (value instanceof TimeValue || value instanceof Temporal.PlainTime)
    return this.quotedTime(value);
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return this.quotedDate(value);
  }
  // Rails: `else super` (mysql/quoting.rb:119-120). Symbol/`Type::Binary::Data`
  // (rb:95-96), the self-dispatched `unquoted_true`/`unquoted_false` pair
  // (rb:98-99), BigDecimal, the pass-throughs and the terminal raise (rb:105)
  // are all inherited from the abstract `type_cast` rather than duplicated
  // here, so a new abstract arm costs exactly one edit.
  return abstractTypeCast.call(this, value);
}
