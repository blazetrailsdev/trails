/**
 * MySQL quoting — MySQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting (module)
 *
 * In Rails, Quoting is a module mixed into AbstractMysqlAdapter.
 * Here we export standalone functions and an interface, matching
 * the pattern used by the PostgreSQL and SQLite3 adapters.
 */

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
 * Type-cast a value for use as a column default in DDL.
 * MySQL represents booleans as 1/0 integers.
 */
export function typecastForDatabase(value: unknown): unknown {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}
