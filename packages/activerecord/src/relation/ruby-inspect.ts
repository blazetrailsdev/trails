/**
 * Small subset of Ruby's `Object#inspect` output — enough for
 * rendering an array of type-cast bind values the way Rails' `inspect`
 * would. Used by `Relation#_renderExplainBinds` to match Rails'
 * `binds.map { |attr| render_bind(c, attr) }.inspect` output shape.
 *
 * Ruby conventions this needs to honor:
 *   - `nil.inspect == "nil"`
 *   - `"foo".inspect == "\"foo\""` (double-quoted, escapes embedded `"` and `\`)
 *   - `42.inspect == "42"`, `BigInt(42).inspect == "42"`
 *   - `true.inspect == "true"`, `false.inspect == "false"`
 *   - `[1, "foo", nil].inspect == "[1, \"foo\", nil]"`
 *
 * Intentionally minimal: no Hash, no nested containers beyond simple
 * pass-through for string/number/bigint/null/boolean/array — the
 * bind-list domain is narrow.
 *
 * Mirrors: Ruby's `Object#inspect` / `Array#inspect` via
 * `Kernel#p`-style output.
 */
export function rubyInspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "string") {
    // Ruby's String#inspect: wrap in `"`, escape `"` and `\`, plus the
    // common control characters (`\n`, `\r`, `\t`, `\f`, `\b`, `\v`,
    // `\0`, `\a`, `\e`). Without these, a bind containing a literal
    // newline would render across multiple lines in the EXPLAIN
    // header and diverge from Ruby's single-line output.
    /* eslint-disable no-control-regex */
    return `"${value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/\f/g, "\\f")
      .replace(/\x08/g, "\\b")
      .replace(/\v/g, "\\v")
      .replace(/\0/g, "\\0")
      .replace(/\x07/g, "\\a")
      .replace(/\x1b/g, "\\e")}"`;
    /* eslint-enable no-control-regex */
  }
  if (Array.isArray(value)) return rubyInspectArray(value);
  // Fallback — Ruby's `Object#inspect` gives `#<Class …>`; here we
  // just call `String(value)` for anything unhandled.
  return String(value);
}

export function rubyInspectArray(values: unknown[]): string {
  return `[${values.map(rubyInspect).join(", ")}]`;
}
