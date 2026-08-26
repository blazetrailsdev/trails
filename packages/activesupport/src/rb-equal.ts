/**
 * Ruby's `rb_equal` — the C primitive behind every `==` send: identity first,
 * then the receiver's own `==`. Ported callers (`Range#==`'s endpoint
 * comparison, `Duration#==`'s non-Duration arm) all need the same dispatch,
 * and JS `===` only covers its first arm.
 *
 * @noRailsEquivalent PERMANENT — `rb_equal` is a C primitive (object.c), not a
 *   Ruby method, so it has no counterpart file; JS has no `==` send at all, so
 *   one copy serves every ported `==`.
 */
export function rbEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof (a as { equals?: unknown }).equals === "function") {
    return (a as { equals(other: unknown): boolean }).equals(b);
  }
  // A class whose Ruby `==` is `alias :== :eql?` (Arel::Nodes::Casted,
  // arel/nodes/casted.rb:33; Arel::Table) has only the `eql` half in TS, so
  // that IS its `==`. Tried second on purpose: a class carrying both spellings
  // (Duration, TimeWithZone) means the two by their Ruby names, and `equals`
  // above is the `==` of the pair.
  if (typeof (a as { eql?: unknown }).eql === "function") {
    return (a as { eql(other: unknown): boolean }).eql(b);
  }
  return false;
}
