/**
 * Formats an element as its BARE (un-quoted) content — `quoteArrayLiteral`
 * applies the `"..."` quoting itself. Returning `undefined` falls through to
 * the default handling. Offered every element except nested arrays (which
 * recurse first), mirroring how Rails' `type_cast_array` dispatches all
 * non-array elements into `type_cast` (`postgresql/quoting.rb:221-226`). Lets a
 * caller that owns a dialect's formatting give array elements what the same
 * value gets on the scalar path.
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
    // Nested arrays recurse before the hook, per `type_cast_array`'s
    // `when ::Array` arm; every other element is offered to it uniformly,
    // as Rails dispatches all non-array elements into `type_cast`.
    if (Array.isArray(v)) return quoteArrayLiteral(v, formatElement);
    const formatted = formatElement?.(v);
    if (formatted !== undefined) {
      return `"${formatted.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
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
