/**
 * Type-casts an element to the text `PG::TextEncoder::Array` would be handed,
 * i.e. the BARE content — the encoder decides `"..."` quoting from that text.
 * Returning `undefined` falls through to the default handling. Offered every
 * element except nested arrays (which recurse first), mirroring how Rails'
 * `type_cast_array` dispatches all non-array elements into `type_cast`
 * (`postgresql/quoting.rb:221-226`). Lets a caller that owns a dialect's
 * formatting give array elements what the same value gets on the scalar path.
 */
export type FormatArrayElement = (value: unknown) => string | undefined;

// `PG::TextEncoder::Array` quotes on content, never on type: an element is
// wrapped only when leaving it bare would be ambiguous — empty, `NULL`
// (case-insensitively), or carrying a delimiter, whitespace, quote or
// backslash. Anything else is emitted bare, so `["a"]` encodes to `{a}`.
// Whitespace is spelled out rather than `\s` because pg tests bytes with
// `isspace()`, which excludes the non-ASCII spaces `\s` would match.
const ELEMENT_NEEDS_QUOTING = /[{},"\\ \t\n\r\v\f]/;
// `/i` on a non-unicode pattern folds ASCII only, mirroring pg's
// `pg_strcasecmp(ptr, "NULL")`; `toUpperCase()` would be a Unicode-aware fold,
// a wider net than pg casts. The difference is unobservable by construction —
// no codepoint in all of Unicode uppercases to `N`, `U` or `L`, so no input
// can tell the two apart, and no test can guard this. It stays a regex because
// it's the exact mirror, not because a collision is reachable.
const NULL_LITERAL = /^null$/i;

function encodeArrayElement(text: string | null): string {
  // Rendering nil as the bare `NULL` token is the encoder's job, not
  // `type_cast`'s — the latter returns nil unchanged (`when nil, Numeric,
  // String then value`, `abstract/quoting.rb:101`). Keeping the split here is
  // what makes the `"NULL"` string quotable while real nil stays bare.
  if (text === null) return "NULL";
  if (text === "" || NULL_LITERAL.test(text) || ELEMENT_NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return text;
}

function typeCastArrayElement(value: unknown, formatElement?: FormatArrayElement): string | null {
  const formatted = formatElement?.(value);
  if (formatted !== undefined) return formatted;
  // boundary: JS has no nil/undefined distinction to port — Rails' type_cast
  // takes nil through `when nil` and raises TypeError on anything unmapped.
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  // boundary: defensive Date formatting for caller-supplied array literals.
  // Duck-typed rather than `instanceof Date` so cross-realm dates and Temporal
  // land here too; a real Date satisfies it, so it needs no arm of its own.
  if (
    typeof value === "object" &&
    "toISOString" in value &&
    typeof (value as { toISOString: unknown }).toISOString === "function"
  ) {
    return (value as { toISOString: () => string }).toISOString();
  }
  if (typeof value === "object" && value !== null) {
    const replacer = (_k: string, val: unknown) => (typeof val === "bigint" ? val.toString() : val);
    try {
      return JSON.stringify(value, replacer) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Formats a JS array as a PostgreSQL array literal string (without outer single quotes).
 * e.g. ["a", "b"] => {a,b}
 *
 * Shared between the Arel PostgreSQL visitor and ActiveRecord's inline SQL quoting.
 */
export function quoteArrayLiteral(arr: unknown[], formatElement?: FormatArrayElement): string {
  const elements = arr.map((v) => {
    // Nested arrays recurse before the hook, per `type_cast_array`'s
    // `when ::Array` arm; every other element is offered to it uniformly,
    // as Rails dispatches all non-array elements into `type_cast`.
    if (Array.isArray(v)) return quoteArrayLiteral(v, formatElement);
    return encodeArrayElement(typeCastArrayElement(v, formatElement));
  });
  return `{${elements.join(",")}}`;
}
