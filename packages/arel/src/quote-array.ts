/**
 * Formats a JS array as a PostgreSQL array literal string (without outer single quotes).
 * e.g. ["a", "b"] => {"a","b"}
 *
 * Shared between the Arel PostgreSQL visitor and ActiveRecord's inline SQL quoting.
 */
export function quoteArrayLiteral(arr: unknown[]): string {
  const elements = arr.map((v) => {
    if (v === null || v === undefined) return "NULL";
    if (Array.isArray(v)) return quoteArrayLiteral(v);
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
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
      try {
        str = JSON.stringify(v);
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
