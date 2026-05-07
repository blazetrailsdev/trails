/**
 * PostgreSQL range parsing and serialization.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range
 *
 * This is a thin adapter-level helper. The canonical implementation lives
 * in `connection-adapters/postgresql/oid/range.ts` as `RangeType` — this
 * function predates that class and is kept for callers that need a plain
 * parser without constructing a full Type::Value. Both share the
 * findRangeSeparator / unquoteRangeBound helpers so parsing stays in sync.
 */

import {
  findRangeSeparator,
  unquoteRangeBound,
} from "../../connection-adapters/postgresql/oid/range.js";
import { Range } from "../../relation.js";

export type SubtypeCast = (value: string) => unknown;

/**
 * Parse a PG range string like "[1,10)" into a Range object.
 *
 * Returns null for empty ranges (matching Rails, which returns nil).
 * Throws if the range excludes its beginning (Ruby Range doesn't support this).
 */
export function parseRange(input: string, subtype?: SubtypeCast): Range | null {
  if (!input || input === "empty") return null;

  const excludeBegin = input[0] === "(";
  const excludeEnd = input[input.length - 1] === ")";

  const inner = input.slice(1, -1);
  const commaIdx = findRangeSeparator(inner);

  let rawBegin: string | null = inner.slice(0, commaIdx).trim();
  let rawEnd: string | null = inner.slice(commaIdx + 1).trim();

  if (rawBegin === "" || rawBegin === "-infinity") rawBegin = null;
  if (rawEnd === "" || rawEnd === "infinity") rawEnd = null;

  rawBegin = rawBegin && unquoteRangeBound(rawBegin);
  rawEnd = rawEnd && unquoteRangeBound(rawEnd);

  if (excludeBegin && rawBegin !== null) {
    throw new Error(
      "The Range object does not support excluding the beginning of a Range. " +
        `(unsupported value: '${input}')`,
    );
  }

  const castBegin = rawBegin !== null && subtype ? subtype(rawBegin) : rawBegin;
  const castEnd = rawEnd !== null && subtype ? subtype(rawEnd) : rawEnd;

  return new Range(castBegin, castEnd, excludeEnd);
}

export type SubtypeSerialize = (value: unknown) => string;

/**
 * Serialize a Range into a PG range literal like "[3,50)".
 *
 * Null bounds represent infinity (stored as empty string in the literal).
 * Bounds containing special characters are double-quoted per the PG format.
 */
export function serializeRange(range: Range, subtype?: SubtypeSerialize): string {
  const serializeBound = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = subtype ? subtype(v) : String(v);
    return quoteRangeBound(s);
  };
  const endBracket = range.excludeEnd ? ")" : "]";
  return `[${serializeBound(range.begin)},${serializeBound(range.end)}${endBracket}`;
}

function quoteRangeBound(value: string): string {
  if (/[",\\\s[\]()]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '""')}"`;
  }
  return value;
}
