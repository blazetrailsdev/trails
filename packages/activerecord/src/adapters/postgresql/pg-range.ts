/**
 * PostgreSQL range parsing and serialization.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range
 *
 * Rails deserializes PG ranges into Ruby Range objects with typed bounds.
 * We do the same — parseRange returns a Range (from relation.ts) with
 * bounds cast through an optional subtype function, or null for empty ranges.
 */

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
  const commaIdx = findSeparator(inner);

  let rawBegin: string | null = inner.slice(0, commaIdx).trim();
  let rawEnd: string | null = inner.slice(commaIdx + 1).trim();

  if (rawBegin === "" || rawBegin === "-infinity") rawBegin = null;
  if (rawEnd === "" || rawEnd === "infinity") rawEnd = null;

  rawBegin = rawBegin && unquoteRange(rawBegin);
  rawEnd = rawEnd && unquoteRange(rawEnd);

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

function findSeparator(s: string): number {
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') {
      let backslashes = 0;
      let j = i - 1;
      while (j >= 0 && s[j] === "\\") {
        backslashes++;
        j--;
      }
      if (backslashes % 2 === 0) inQuote = !inQuote;
    } else if (!inQuote && s[i] === ",") {
      return i;
    }
  }
  return s.length;
}

/**
 * Unquote a range bound value.
 * PG uses "" for literal " and \\\\ for literal \\ inside double-quoted bounds.
 */
function unquoteRange(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}
