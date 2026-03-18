/**
 * PostgreSQL range parsing and serialization.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range
 */

export interface PgRange {
  begin: string | null;
  end: string | null;
  excludeBegin: boolean;
  excludeEnd: boolean;
  empty: boolean;
}

/**
 * Parse a PG range string like "[1,10)" into a PgRange object.
 */
export function parseRange(input: string): PgRange {
  if (!input || input === "empty") {
    return { begin: null, end: null, excludeBegin: false, excludeEnd: false, empty: true };
  }

  const excludeBegin = input[0] === "(";
  const excludeEnd = input[input.length - 1] === ")";

  const inner = input.slice(1, -1);
  const commaIdx = findSeparator(inner);

  let beginVal: string | null = inner.slice(0, commaIdx).trim();
  let endVal: string | null = inner.slice(commaIdx + 1).trim();

  if (beginVal === "" || beginVal === "-infinity") beginVal = null;
  if (endVal === "" || endVal === "infinity") endVal = null;

  // Unquote if quoted
  beginVal = beginVal && unquote(beginVal);
  endVal = endVal && unquote(endVal);

  return { begin: beginVal, end: endVal, excludeBegin, excludeEnd, empty: false };
}

function findSeparator(s: string): number {
  const depth = 0;
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inQuote = !inQuote;
    } else if (!inQuote && s[i] === "," && depth === 0) {
      return i;
    }
  }
  return s.length;
}

function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}
