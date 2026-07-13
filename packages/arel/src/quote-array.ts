/**
 * Formats a single array element as a dialect-correct literal, or returns
 * `undefined` to let `quoteArrayLiteral` apply its generic quoting. The caller
 * owns the dialect and the scalar formatter (ActiveRecord's
 * `temporalToBindString`), so datetime elements can render the same
 * `quoted_date` form scalars do (PG BC suffix + fixed-6 microseconds).
 */
export type ArrayElementFormatter = (value: unknown) => string | undefined;

/**
 * Formats a JS array as a PostgreSQL array literal string (without outer single quotes).
 * e.g. ["a", "b"] => {"a","b"}
 *
 * Shared between the Arel PostgreSQL visitor and ActiveRecord's inline SQL quoting.
 * An optional `formatElement` threads dialect-correct element formatting (e.g.
 * PG `quoted_date` for Temporal datetimes) from the caller that owns the dialect.
 */
export function quoteArrayLiteral(arr: unknown[], formatElement?: ArrayElementFormatter): string {
  const elements = arr.map((v) => {
    if (v === null || v === undefined) return "NULL";
    if (Array.isArray(v)) return quoteArrayLiteral(v, formatElement);
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (formatElement) {
      const formatted = formatElement(v);
      if (formatted !== undefined) {
        const escaped = formatted.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `"${escaped}"`;
      }
    }
    // boundary: defensive Date quoting for caller-supplied array literals.
    if (v instanceof Date) {
      return `"${v.toISOString()}"`;
    }
    if (
      typeof v === "object" &&
      v !== null &&
      "toISOString" in v &&
      typeof (v as { toISOString: unknown }).toISOString === "function"
    ) {
      return `"${(v as { toISOString: () => string }).toISOString()}"`;
    }
    let str: string;
    if (typeof v === "object" && v !== null) {
      const replacer = (_k: string, val: unknown) =>
        typeof val === "bigint" ? val.toString() : val;
      try {
        str = JSON.stringify(v, replacer) ?? String(v);
      } catch {
        str = String(v);
      }
    } else {
      str = String(v);
    }
    const escaped = str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  });
  return `{${elements.join(",")}}`;
}
