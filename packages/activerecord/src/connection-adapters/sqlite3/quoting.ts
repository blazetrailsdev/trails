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
  quote as abstractQuote,
  quotedDate as abstractQuotedDate,
  dispatchQuotedDate,
  dispatchQuotedTime,
  type QuotingDispatchHost,
} from "../abstract/quoting.js";
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

/**
 * Mirrors: SQLite3::Quoting#quote_table_name —
 * `%Q("#{name.gsub('"', '""').gsub(".", "\".\"")}")`. The whole name is wrapped
 * in double quotes with `.` rewritten as `"."` so `foo.bar` → `"foo"."bar"`.
 */
export function quoteTableName(name: string): string {
  return `"${name.replace(/"/g, '""').replace(/\./g, '"."')}"`;
}

export function quoteColumnName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Mirrors: SQLite3::Quoting#quote. Rails only special-cases non-finite
 * Numerics (`"'#{value}'"`) and otherwise calls `super`, letting the abstract
 * quoter dispatch date/time literals back through `self.quoted_time` /
 * `self.quoted_date` — which SQLite overrides to keep a `2000-01-01` prefix on
 * times. We thread `this` (the adapter) so that dispatch lands on SQLite's
 * `quotedTime`; bare calls fall back to {@link SQLITE_QUOTING_HOST} so the
 * prefix is still applied.
 *
 * The boolean, symbol, string, and binary branches stay inline because our
 * abstract `quote` renders those through module-level helpers (TRUE/FALSE,
 * backslash-escaping `quoteString`) rather than dispatching through `this`, so
 * delegating would lose SQLite's overrides (1/0, `''`-only escaping, `x'..'`
 * hex). These are exactly the quoting primitives SQLite3::Quoting overrides.
 */
export function quote(this: QuotingDispatchHost | void, value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) return quoteString(String(value));
  if (typeof value === "boolean") return value ? quotedTrue() : quotedFalse();
  if (typeof value === "symbol") {
    if (value.description === undefined) {
      throw new TypeError("can't quote a Symbol without a description");
    }
    return quoteString(value.description);
  }
  if (typeof value === "string") return quoteString(value);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return quotedBinary(value);
  // Mirrors Rails abstract/quoting.rb: `when Type::Binary::Data then quoted_binary(value)`.
  // BinaryData wraps raw bytes from serialize() (e.g. encryption ciphertext for binary columns).
  if (value instanceof BinaryData) return quotedBinary(value.bytes);
  const host = this && typeof this === "object" ? this : SQLITE_QUOTING_HOST;
  return abstractQuote.call(host, value);
}

export function quoteTableNameForAssignment(_table: string, attr: string): string {
  return quoteColumnName(attr);
}

/**
 * Mirrors: SQLite3::Quoting#quoted_date — identical to the abstract quoter; the
 * override exists so the inherited dispatch has a `self.quoted_date` to land on.
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
  return abstractQuotedDate(value);
}

/**
 * Mirrors: SQLite3::Quoting#quoted_time —
 * `value.change(year: 2000, ...); quoted_date(value).sub(/\A\d\d\d\d-\d\d-\d\d /, "2000-01-01 ")`.
 * Unlike the abstract `quoted_time` (which strips the date to a bare
 * `HH:MM:SS`), SQLite normalises the date to 2000-01-01, routes through
 * `quoted_date`, then re-prefixes — so SQLite can round-trip times as datetime
 * strings. Returns the bare literal (no surrounding quotes); the inherited
 * `quote` wraps it.
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
  return quotedDate(dt).replace(/^\d{4}-\d{2}-\d{2} /, "2000-01-01 ");
}

/**
 * Default dispatch host for bare `quote(value)` calls (no adapter `this`), so
 * date/time literals still reach SQLite's `quotedDate` / `quotedTime` overrides.
 */
const SQLITE_QUOTING_HOST: QuotingDispatchHost = { quotedDate, quotedTime };

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

export function typeCast(this: QuotingDispatchHost | void, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? unquotedTrue() : unquotedFalse();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "bigint") return value;
  // Rails SQLite3::Quoting#_type_cast: `when BigDecimal then value.to_f` — a
  // float, NOT the abstract adapter's `value.to_s("F")` string. (quote() still
  // emits the fixed-form string via the inherited abstract quoter.)
  if (value instanceof BigDecimal) return Number(value.toString("F"));
  if (typeof value === "symbol") return value.description ?? null;
  // Rails dispatches date/time through `self.quoted_time` / `self.quoted_date`
  // (abstract/quoting.rb:93-101) — which SQLite overrides to keep a `2000-01-01`
  // prefix on times. Thread `this` so the dispatch lands on those overrides;
  // bare calls fall back to SQLITE_QUOTING_HOST so the prefix is still applied.
  const host = this && typeof this === "object" ? this : SQLITE_QUOTING_HOST;
  if (value instanceof Temporal.PlainTime) return dispatchQuotedTime(host, value);
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return dispatchQuotedDate(host, value);
  }
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
