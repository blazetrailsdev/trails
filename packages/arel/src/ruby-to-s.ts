/**
 * Ruby `Object#to_s` semantics for the values Arel hands to an adapter's
 * `quote_column_name` / `quote_table_name` (both of which do `name.to_s`).
 *
 * JS `String(value)` matches Ruby for the common `String`/`Symbol` name, but
 * diverges for an `Array`: Ruby's `Array#to_s` is `inspect`-style
 * (`["shop_id", "id"]`) while `String(["shop_id", "id"])` comma-joins
 * (`shop_id,id`). An Array-named `Attribute` reaches quoting on the
 * composite-primary-key default-order path (`table[primaryKey].desc`); the SQL
 * it produces is invalid in Rails too, so this exists to keep the emitted text
 * byte-identical to Rails rather than to make the query work.
 */
export function rubyToS(value: unknown): string {
  if (Array.isArray(value)) return rubyInspect(value);
  return String(value);
}

function rubyInspect(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(rubyInspect).join(", ")}]`;
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return String(value);
}
