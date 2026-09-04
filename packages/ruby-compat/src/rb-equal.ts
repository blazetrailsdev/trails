import { temporalTag, widenPlainDate } from "./temporal-tag.js";

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
  /* Ruby's `Date#==` (`vendor/ruby/ext/date/date_core.c:6902` `d_lite_equal`) is
     `<=>`-based (`vendor/ruby/ext/date/date_core.c:6810` `d_lite_cmp`), so it
     answers `false` for an operand of another class instead of raising, and a
     Date equals a DateTime at the same instant. Temporal's own `equals` has
     neither half — it coerces its argument, so `PlainDate#equals` raises
     `TypeError: year is required` for an Instant — which is why this is tried
     before the `equals` arm below, mirroring `cmp`'s Temporal arm. */
  const tag = temporalTag(a);
  if (tag !== null) {
    if (temporalTag(b) === null) return false;
    const x = widenPlainDate(a);
    const y = widenPlainDate(b);
    if (temporalTag(x) !== temporalTag(y)) return false;
    return (
      (x as { constructor: { compare(l: unknown, r: unknown): number } }).constructor.compare(
        x,
        y,
      ) === 0
    );
  }
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
  /* A `Uint8Array` stands in for a Ruby binary String (the representation
     `ActiveModel::Type::Binary#cast` produces, binary.rb:20-27), whose `==`
     (`vendor/ruby/string.c:3269` `rb_str_equal`) compares bytes rather than
     identity. */
  if (a instanceof Uint8Array) {
    return b instanceof Uint8Array && a.length === b.length && a.every((byte, i) => byte === b[i]);
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
