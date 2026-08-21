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
  return false;
}
