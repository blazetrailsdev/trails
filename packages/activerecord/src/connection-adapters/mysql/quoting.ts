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

export function quotedDate(date: Date): string {
  return `'${date.toISOString().split("T")[0]}'`;
}

export function quotedTimeUtc(date: Date): string {
  return `'${date.toISOString().replace("T", " ").replace("Z", "")}'`;
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

/**
 * Quote a value for inclusion in a SQL literal.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting#quote
 */
export function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? quotedTrue() : quotedFalse();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  // Use abstract's `quotedDate` for the `YYYY-MM-DD HH:MM:SS[.microseconds]`
  // form (Rails' `:db` format — fractional seconds only when
  // non-zero), then wrap with single quotes. MySQL's own
  // `quotedDate` would drop the time; its `quotedTimeUtc` always
  // trails `.000`.
  if (value instanceof Date) return `'${abstractQuotedDate(value)}'`;
  if (value instanceof Buffer) return quotedBinaryString(value);
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
  if (value instanceof Date) {
    // Delegate to abstract's `quotedDate` which renders the
    // unquoted `YYYY-MM-DD HH:MM:SS[.microseconds]` form (optional
    // fractional seconds only when non-zero, matching Rails'
    // `:db`-format output). MySQL's own `quotedTimeUtc` relies on
    // `toISOString()` which always trails `.000`, and MySQL's
    // `quotedDate` drops the time. Neither matches Rails here;
    // the abstract formatter does.
    return abstractQuotedDate(value);
  }
  throw new TypeError(`can't cast ${(value as object).constructor?.name ?? typeof value}`);
}
