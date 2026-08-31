/**
 * Ruby's `rb_equal` (`vendor/ruby/object.c:147`), the C primitive behind every
 * `==` send. It has no Ruby-level counterpart file for the port to mirror.
 *
 * @noRailsEquivalent PERMANENT — `rb_equal` is a C primitive
 * (`vendor/ruby/object.c:147`), not a Ruby method, so no Rails file declares
 * the module this file's single export lives in.
 */

/**
 * Ruby's `rb_equal` (`vendor/ruby/object.c:147`) — the C primitive behind every `==` send: identity first,
 * then the receiver's own `==`. Ported callers (`Range#==`'s endpoint
 * comparison, `Duration#==`'s non-Duration arm) all need the same dispatch,
 * and JS `===` only covers its first arm.
 *
 * @noRailsEquivalent PERMANENT — `rb_equal` is a C primitive
 *   (`vendor/ruby/object.c:147`), not a
 *   Ruby method, so it has no counterpart file; JS has no `==` send at all, so
 *   one copy serves every ported `==`.
 */
export function rbEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof (a as { equals?: unknown }).equals === "function") {
    return (a as { equals(other: unknown): boolean }).equals(b);
  }
  /* `vendor/ruby/object.c:147`. A class whose Ruby `==` is `alias :== :eql?`
     (Arel::Nodes::Casted, arel/nodes/casted.rb:33; Arel::Table) has only the
     `eql` half in TS, so that IS its `==`. Tried second on purpose: a class
     carrying both spellings (Duration, TimeWithZone) means the two by their
     Ruby names, and `equals` above is the `==` of the pair. */
  if (typeof (a as { eql?: unknown }).eql === "function") {
    return (a as { eql(other: unknown): boolean }).eql(b);
  }
  /* Ruby's `Array#==` (`vendor/ruby/array.c:5120` `rb_ary_equal`) compares
     elementwise with `==`, and `Date#==` / `Time#==` compare by value — both
     are `rb_equal` sends of their own, and a JS `===` on either is reference
     equality. */
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) && a.length === b.length && a.every((element, i) => rbEqual(element, b[i]))
    );
  }
  /* boundary: a JS Date is one of the values a ported `==` is handed, and
     Ruby's `Date#==` / `Time#==` (`vendor/ruby/time.c:3951` `time_cmp`)
     compare by value where JS `===` does not. */
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
  /* A plain object stands in for a Ruby Hash, whose `==`
     (`vendor/ruby/hash.c:3808` `rb_hash_equal`) compares keys and values
     rather than identity. */
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && rbEqual(a[key], b[key]))
    );
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && value.constructor === Object;
}
