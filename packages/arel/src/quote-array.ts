/**
 * Formats a single array element as its bare (un-quoted) literal content, or
 * returns `undefined` to fall through to the default handling. Callers that own
 * a dialect's date formatting (the Arel PostgreSQL visitor's `quotedDate`) pass
 * one so array elements match what the same value gets on the scalar path —
 * Rails' `type_cast_array` sends each element through the same `type_cast` a
 * scalar takes (`postgresql/quoting.rb:221-226`).
 */
export type FormatArrayElement = (value: unknown) => string | undefined;

/**
 * Formats a JS array as a PostgreSQL array literal string (without outer single quotes).
 * e.g. ["a", "b"] => {"a","b"}
 *
 * Shared between the Arel PostgreSQL visitor and ActiveRecord's inline SQL quoting.
 */
export function quoteArrayLiteral(arr: unknown[], formatElement?: FormatArrayElement): string {
  const elements = arr.map((v) => {
    if (v === null || v === undefined) return "NULL";
    if (Array.isArray(v)) return quoteArrayLiteral(v, formatElement);
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    const formatted = formatElement?.(v);
    if (formatted !== undefined) {
      return `"${formatted.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
