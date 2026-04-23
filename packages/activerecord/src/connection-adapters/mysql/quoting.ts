/**
 * MySQL quoting — MySQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting (module)
 *
 * In Rails, Quoting is a module mixed into AbstractMysqlAdapter.
 * Here we export standalone functions and an interface, matching
 * the pattern used by the PostgreSQL and SQLite3 adapters.
 */

import { quotedDate as abstractQuotedDate } from "../abstract/quoting.js";

export interface Quoting {
  quotedTrue(): string;
  unquotedTrue(): number;
  quotedFalse(): string;
  unquotedFalse(): number;
  quotedDate(date: Date): string;
  quotedTimeUtc(date: Date): string;
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

/**
 * MySQL's DATETIME/TIMESTAMP literal format matches Rails' `:db`
 * form: unquoted `YYYY-MM-DD HH:MM:SS[.microseconds]`. Fractional
 * seconds only appear when milliseconds > 0. `quote()` wraps the
 * result with single quotes.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_date
 */
export function quotedDate(date: Date): string {
  return abstractQuotedDate(date);
}

/**
 * Time-only portion of `quotedDate`. Unquoted.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_time
 */
export function quotedTimeUtc(date: Date): string {
  const full = quotedDate(date);
  const sep = full.indexOf(" ");
  return sep === -1 ? full : full.slice(sep + 1);
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

// Mirrors Rails' MySQL::Quoting.column_name_matcher. JS can't replicate Ruby's
// recursive \g<n> back-references, so we limit function arguments to plain
// identifiers and column references (no nested expressions), which is stricter
// than Rails but prevents injection via function call arguments.
export function columnNameMatcher(): RegExp {
  const id = String.raw`(?:\w+|` + "`" + String.raw`\w+` + "`" + String.raw`)`;
  const col = String.raw`(?:${id}\.)?${id}`;
  const fnArg = String.raw`(?:\*|${col})`;
  const fnCall = String.raw`\w+\(\s*(?:${fnArg}(?:\s*,\s*${fnArg})*)?\s*\)`;
  const expr = String.raw`(?:${col}|${fnCall})`;
  const aliased = String.raw`${expr}(?:(?:\s+AS)?\s+${id})?`;
  return new RegExp(`^${aliased}(?:\\s*,\\s*${aliased})*$`, "i");
}

// Mirrors Rails' MySQL::Quoting.column_name_with_order_matcher — like
// columnNameMatcher but also allows COLLATE and ASC/DESC suffixes.
export function columnNameWithOrderMatcher(): RegExp {
  const id = String.raw`(?:\w+|` + "`" + String.raw`\w+` + "`" + String.raw`)`;
  const col = String.raw`(?:${id}\.)?${id}`;
  const fnArg = String.raw`(?:\*|${col})`;
  const fnCall = String.raw`\w+\(\s*(?:${fnArg}(?:\s*,\s*${fnArg})*)?\s*\)`;
  const expr = String.raw`(?:${col}|${fnCall})`;
  const collate = String.raw`(?:\s+COLLATE\s+(?:\w+|"\w+"))?`;
  const dir = String.raw`(?:\s+ASC|\s+DESC)?`;
  const ordered = String.raw`${expr}${collate}${dir}`;
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
  if (value instanceof Date) return `'${quotedDate(value)}'`;
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
 * Booleans become 1/0, Dates are rendered as an **unquoted**
 * `YYYY-MM-DD HH:MM:SS` string (Rails' `value.to_formatted_s(:db)`
 * form — it's `quote()`'s job to add the surrounding single quotes,
 * not `typeCast`'s), strings and numbers pass through unchanged.
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
  // Rails' `type_cast` returns `quoted_date(value)` — an unquoted
  // formatted string. EXPLAIN / log-subscriber renderers want the
  // primitive, not the Date instance.
  if (value instanceof Date) return quotedDate(value);
  throw new TypeError(`can't cast ${(value as object).constructor?.name ?? typeof value}`);
}
