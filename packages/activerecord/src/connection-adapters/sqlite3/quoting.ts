/**
 * SQLite3 quoting — SQLite-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Quoting
 *
 * @boundary-file: SQL value quoting branches on `instanceof Date` alongside
 *   Temporal types; legacy Date values from custom-typed columns hit a
 *   typed-error path that mirrors the abstract dispatcher.
 */

import {
  formatInstantForSql,
  formatPlainDateTimeForSql,
  formatPlainDateForSql,
  formatPlainTimeForSql,
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
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(".");
}

export function quoteColumnName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Mirrors: SQLite3 identifier quoting — double-quote form. Re-exported
 * so the Quoting interface has a uniform `quoteIdentifier` regardless
 * of adapter.
 */
export function quoteIdentifier(name: string): string {
  return quoteColumnName(name);
}

export function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function quote(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return quoteString(value);
  if (typeof value === "boolean") return value ? quotedTrue() : quotedFalse();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return quoteString(String(value));
    return String(value);
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "symbol") {
    if (value.description === undefined) {
      throw new TypeError("can't quote a Symbol without a description");
    }
    return quoteString(value.description);
  }
  if (value instanceof Temporal.Instant) return `'${formatInstantForSql(value)}'`;
  if (value instanceof Temporal.PlainDateTime) return `'${formatPlainDateTimeForSql(value)}'`;
  if (value instanceof Temporal.PlainDate) return `'${formatPlainDateForSql(value)}'`;
  if (value instanceof Temporal.PlainTime) return `'2000-01-01 ${formatPlainTimeForSql(value)}'`;
  if (value instanceof Temporal.ZonedDateTime) return `'${formatInstantForSql(value.toInstant())}'`;
  if (value instanceof Date)
    throw new TypeError(
      "quote: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return quotedBinary(value);
  }
  if (typeof value === "function" && value.name) {
    return quoteString(value.name);
  }
  throw new TypeError(`can't quote ${Object.prototype.toString.call(value)}`);
}

export function quoteTableNameForAssignment(_table: string, attr: string): string {
  return quoteColumnName(attr);
}

export function quotedBinary(value: Uint8Array | ArrayBuffer): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `x'${hex}'`;
}

export function quoteDefaultExpression(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "NULL";
  if (typeof value === "function") {
    const result = (value as () => unknown)();
    if (result === undefined) return "";
    if (result === null) return "NULL";
    const str = String(result);
    if (/^\w+\(.*\)$/.test(str)) return `(${str})`;
    return str;
  }
  return quote(value);
}

export function typeCast(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? unquotedTrue() : unquotedFalse();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "bigint") return value;
  if (typeof value === "symbol") return value.description ?? null;
  if (value instanceof Temporal.Instant) return formatInstantForSql(value);
  if (value instanceof Temporal.PlainDateTime) return formatPlainDateTimeForSql(value);
  if (value instanceof Temporal.PlainDate) return formatPlainDateForSql(value);
  // PlainTime is stored with a 2000-01-01 date prefix so SQLite can round-trip it.
  if (value instanceof Temporal.PlainTime) return `2000-01-01 ${formatPlainTimeForSql(value)}`;
  if (value instanceof Temporal.ZonedDateTime) return formatInstantForSql(value.toInstant());
  if (value instanceof Date)
    throw new TypeError(
      "typeCast: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  throw new TypeError(`can't cast ${Object.prototype.toString.call(value)} to a SQLite3 type`);
}

// Rails uses recursive regex \g<2> to match nested function calls like
// COALESCE(a, b) or COUNT(DISTINCT name). JS doesn't support recursive
// regex patterns, so we use a function-based matcher that walks balanced
// parentheses to arbitrary depth.

// SQL keywords that should never appear inside function arguments
// in a column name context — prevents subquery injection.
const DANGEROUS_KEYWORDS =
  /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|UNION|INTO|FROM|WHERE|EXEC|EXECUTE)\b/i;

function skipBalancedParens(s: string, pos: number): number {
  if (s[pos] !== "(") return -1;
  let depth = 1;
  let i = pos + 1;
  const start = i;
  while (i < s.length && depth > 0) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    i++;
  }
  if (depth !== 0) return -1;
  // Strip string literals before checking for dangerous keywords
  // so that IFNULL(name, 'from') is not rejected.
  const contents = s.slice(start, i - 1).replace(/'[^']*'/g, "");
  if (DANGEROUS_KEYWORDS.test(contents)) return -1;
  return i;
}

function skipQuotedIdentifier(s: string, pos: number): number {
  if (s[pos] !== '"') return -1;
  let i = pos + 1;
  while (i < s.length) {
    if (s[i] === '"') {
      if (s[i + 1] === '"') {
        i += 2; // escaped ""
      } else {
        return i + 1;
      }
    } else {
      i++;
    }
  }
  return -1; // unclosed quote
}

function matchColumnExpr(s: string, pos: number): number {
  let i = pos;
  // optional table qualifier: word. or "word".
  if (s[i] === '"') {
    const end = skipQuotedIdentifier(s, i);
    if (end === -1) return -1;
    if (s[end] === ".") {
      i = end + 1;
    } else {
      return end;
    }
  } else {
    const m = s.slice(i).match(/^\w+/);
    if (!m) return -1;
    if (s[i + m[0].length] === ".") {
      // table.column — consume qualifier
      i += m[0].length + 1;
    } else if (s[i + m[0].length] === "(") {
      // function call: word(...)
      return skipBalancedParens(s, i + m[0].length);
    } else {
      // just a column name
      return i + m[0].length;
    }
  }
  // column name after qualifier: word or "word", or function call: word(...)
  if (s[i] === '"') {
    return skipQuotedIdentifier(s, i);
  }
  const nameMatch = s.slice(i).match(/^\w+/);
  if (!nameMatch) return -1;
  i += nameMatch[0].length;
  // function call with balanced parens
  if (s[i] === "(") {
    const end = skipBalancedParens(s, i);
    if (end === -1) return -1;
    return end;
  }
  return i;
}

function skipWhitespace(s: string, pos: number): number {
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  return pos;
}

function matchColumnList(s: string, allowOrder: boolean): boolean {
  let i = skipWhitespace(s, 0);
  if (i >= s.length) return false;

  while (true) {
    const exprEnd = matchColumnExpr(s, i);
    if (exprEnd === -1) return false;
    i = skipWhitespace(s, exprEnd);

    // optional [AS] alias — Rails: (?:(?:\s+AS)?\s+(?:\w+|"\w+"))?
    {
      const saved = i;
      let hasAs = false;
      if (/^AS\b/i.test(s.slice(i))) {
        i = skipWhitespace(s, i + 2);
        hasAs = true;
      }
      // Try to consume an alias identifier (not a keyword or comma)
      const peek = s.slice(i);
      if (peek[0] === '"') {
        const end = skipQuotedIdentifier(s, i);
        if (end !== -1) {
          i = skipWhitespace(s, end);
        } else if (hasAs) {
          return false; // AS without valid alias
        }
      } else {
        const alias = peek.match(/^\w+/);
        if (alias && !/^(?:ASC|DESC|COLLATE|NULLS|,)\b/i.test(alias[0])) {
          i = skipWhitespace(s, i + alias[0].length);
        } else if (hasAs) {
          return false; // AS without valid alias
        } else {
          i = saved; // no alias found, backtrack
        }
      }
    }

    if (allowOrder) {
      if (/^COLLATE\b/i.test(s.slice(i))) {
        i = skipWhitespace(s, i + 7);
        const coll = s.slice(i).match(/^(?:\w+|"\w+")/);
        if (!coll) return false;
        i = skipWhitespace(s, i + coll[0].length);
      }
      if (/^(?:ASC|DESC)\b/i.test(s.slice(i))) {
        i = skipWhitespace(s, i + s.slice(i).match(/^(?:ASC|DESC)/i)![0].length);
      }
      if (/^NULLS\s+(?:FIRST|LAST)\b/i.test(s.slice(i))) {
        const nm = s.slice(i).match(/^NULLS\s+(?:FIRST|LAST)/i)!;
        i = skipWhitespace(s, i + nm[0].length);
      }
    }

    if (i >= s.length) return true;
    if (s[i] !== ",") return false;
    i = skipWhitespace(s, i + 1);
  }
}

class ColumnMatcher extends RegExp {
  private readonly _allowOrder: boolean;

  constructor(allowOrder: boolean) {
    super(".*");
    this._allowOrder = allowOrder;
  }

  override test(s: string): boolean {
    return matchColumnList(s, this._allowOrder);
  }

  override exec(s: string): RegExpExecArray | null {
    if (!this.test(s)) return null;
    const match = [s] as RegExpExecArray;
    match.index = 0;
    match.input = s;
    match.groups = undefined;
    return match;
  }
}

export const COLUMN_NAME_MATCHER: RegExp = new ColumnMatcher(false);
export const COLUMN_NAME_WITH_ORDER_MATCHER: RegExp = new ColumnMatcher(true);

export function columnNameMatcher(): RegExp {
  return COLUMN_NAME_MATCHER;
}

export function columnNameWithOrderMatcher(): RegExp {
  return COLUMN_NAME_WITH_ORDER_MATCHER;
}
