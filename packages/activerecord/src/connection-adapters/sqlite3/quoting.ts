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
  quoteDefaultExpression as abstractQuoteDefaultExpression,
  type QuotingHost,
  quotedDate as abstractQuotedDate,
  typeCast as abstractTypeCast,
  toBytes,
  type QuotedTimeValue,
  type QuotingDispatchHost,
} from "../abstract/quoting.js";
import { defaultSqlTimezone } from "../abstract/sql-datetime.js";
import { Value as TimeValue } from "../../type/time.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { BigDecimal, TimeWithZone } from "@blazetrails/activesupport";
import { BinaryData } from "@blazetrails/activemodel";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";

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

const QUOTED_COLUMN_NAMES = new Map<unknown, string>();
const QUOTED_TABLE_NAMES = new Map<unknown, string>();

export function quoteTableName(name: unknown): string {
  let quoted = QUOTED_TABLE_NAMES.get(name);
  if (quoted === undefined) {
    quoted = `"${toS(name).replace(/"/g, '""').replace(/\./g, '"."')}"`;
    QUOTED_TABLE_NAMES.set(name, quoted);
  }
  return quoted;
}

export function quoteColumnName(name: unknown): string {
  let quoted = QUOTED_COLUMN_NAMES.get(name);
  if (quoted === undefined) {
    quoted = `"${toS(name).replace(/"/g, '""')}"`;
    QUOTED_COLUMN_NAMES.set(name, quoted);
  }
  return quoted;
}

/** @missingRailsCall quote — PERMANENT */
export function quoteString(s: string): string {
  return s.replace(/'/g, "''");
}

export function quote(this: QuotingDispatchHost, value: unknown): string {
  if (typeof value === "number" || value instanceof BigDecimal) {
    if (value instanceof BigDecimal ? value.isFinite() : Number.isFinite(value)) {
      return abstractQuote.call(this, value);
    } else {
      return `'${toS(value)}'`;
    }
  } else {
    return abstractQuote.call(this, value);
  }
}

export function quoteTableNameForAssignment(_table: string, attr: string): string {
  return quoteColumnName(attr);
}

export function quotedTime(value: QuotedTimeValue): string {
  if (value instanceof TimeValue) {
    const obj = value.getobj();
    value =
      obj instanceof TimeWithZone || obj instanceof RubyTime
        ? obj
        : obj.toZonedDateTimeISO(defaultSqlTimezone()).toPlainDateTime();
  }
  if (value instanceof RubyTime) value = value.toTime().toPlainDateTime();
  value =
    value instanceof TimeWithZone
      ? value.change({ year: 2000, month: 1, day: 1 })
      : value instanceof Temporal.PlainTime
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
  return abstractQuotedDate(value).replace(/^\d{4}-\d{2}-\d{2} /, "2000-01-01 ");
}

export function quotedBinary(value: Uint8Array | ArrayBuffer | BinaryData): string {
  const bytes = toBytes(value);
  if (!bytes) {
    throw new TypeError(
      `quotedBinary expects a Uint8Array, ArrayBuffer, Buffer, or BinaryData; got ${
        value === null ? "null" : typeof value
      }`,
    );
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `x'${hex}'`;
}

export function quoteDefaultExpression(
  this: QuotingDispatchHost & QuotingHost,
  value: unknown,
  column: { sqlType?: string | null },
): string {
  if (typeof value === "function") {
    const called = (value as () => unknown)() as string;
    return /^\w+\(.*\)$/.test(called) ? `(${called})` : called;
  }
  return abstractQuoteDefaultExpression.call(this, value, column);
}

export function typeCast(this: QuotingDispatchHost, value: unknown, bindsAsFloat = false): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return BigInt(value ? this.unquotedTrue() : this.unquotedFalse());
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (bindsAsFloat) return value;
    return Number.isInteger(value) ? BigInt(value) : value;
  }
  if (value instanceof BigDecimal) return Number(value.toString("F"));
  return abstractTypeCast.call(this, value);
}

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
        i += 2;
      } else {
        return i + 1;
      }
    } else {
      i++;
    }
  }
  return -1;
}

function matchColumnExpr(s: string, pos: number): number {
  let i = pos;
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
      i += m[0].length + 1;
    } else if (s[i + m[0].length] === "(") {
      return skipBalancedParens(s, i + m[0].length);
    } else {
      return i + m[0].length;
    }
  }
  if (s[i] === '"') {
    return skipQuotedIdentifier(s, i);
  }
  const nameMatch = s.slice(i).match(/^\w+/);
  if (!nameMatch) return -1;
  i += nameMatch[0].length;
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

    {
      const saved = i;
      let hasAs = false;
      if (/^AS\b/i.test(s.slice(i))) {
        i = skipWhitespace(s, i + 2);
        hasAs = true;
      }
      const peek = s.slice(i);
      if (peek[0] === '"') {
        const end = skipQuotedIdentifier(s, i);
        if (end !== -1) {
          i = skipWhitespace(s, end);
        } else if (hasAs) {
          return false;
        }
      } else {
        const alias = peek.match(/^\w+/);
        if (alias && !/^(?:ASC|DESC|COLLATE|NULLS|,)\b/i.test(alias[0])) {
          i = skipWhitespace(s, i + alias[0].length);
        } else if (hasAs) {
          return false;
        } else {
          i = saved;
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
