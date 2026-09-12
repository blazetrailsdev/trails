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
  return equalOrEql(a, b, false);
}

/**
 * Ruby's `rb_eql` (`vendor/ruby/object.c:159`) — the C primitive behind every
 * `eql?` send, and the equality a Hash keys on. It is `rb_equal` with one arm
 * removed: `Kernel#eql?` defaults to `rb_obj_equal`
 * (`vendor/ruby/object.c:4374`), identity, so a class that defines `==` and no
 * `eql?` is `eql?` only to itself, where `==` may answer true. The value
 * classes that override it — String, Array, Hash, Integer, Date, Time — are
 * shared with `rb_equal` and compare the same, which is why MRI threads the
 * difference as a flag through one body (`hash_equal`'s `int eql`,
 * `vendor/ruby/hash.c:3746`) rather than writing the walk twice.
 *
 * @noRailsEquivalent PERMANENT — `rb_eql` is a C primitive
 *   (`vendor/ruby/object.c:159`), not a Ruby method, so it has no counterpart
 *   file; JS has no `eql?` send at all, so one copy serves every ported
 *   `eql?`.
 */
export function rbEql(a: unknown, b: unknown): boolean {
  return equalOrEql(a, b, true);
}

/**
 * `rb_equal` (`vendor/ruby/object.c:147`) and `rb_eql`
 * (`object.c:159`) over one body, the way `hash_equal`
 * (`vendor/ruby/hash.c:3746`) carries both behind its `int eql`.
 */
function equalOrEql(a: unknown, b: unknown, eql: boolean): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  /* `rb_int_equal` (`vendor/ruby/numeric.c:4634`) compares by value, and Ruby
     has one Integer for every magnitude. JS splits that seat across `number`
     and `bigint`, so `===` answers false for two seats of the same Ruby
     Integer. */
  if (typeof a === "bigint" || typeof b === "bigint") {
    if (typeof a === "number") return Number.isInteger(a) && BigInt(a) === b;
    if (typeof b === "number") return Number.isInteger(b) && a === BigInt(b);
  }
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
  /* `Kernel#eql?` is `rb_obj_equal` (`vendor/ruby/object.c:4374`), identity, so
     a class's `==` answers only the `rb_equal` send; the `eql` arm below is the
     one an `eql?` send reaches. */
  if (!eql && typeof (a as { equals?: unknown }).equals === "function") {
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
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((element, i) => equalOrEql(element, b[i], eql))
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
  /* `rb_hash_equal` (`vendor/ruby/hash.c:3808`), which `hash_equal`
     (`hash.c:3746`) answers by size and then by `rb_equal` per key. A Ruby
     Hash has two JS seats — a plain object and a `Map` (ruby-compat's `Hash`,
     and `HashWithIndifferentAccess` under it) — and both stand for the same
     Ruby value, so the arm reads whichever the operand is. */
  const entriesA = hashEntries(a);
  if (entriesA !== null) {
    const entriesB = hashEntries(b);
    if (entriesB === null || entriesA.length !== entriesB.length) return false;
    /* `eql_i` (`vendor/ruby/hash.c:3714`) finds hash2's entry with
       `hash_stlike_lookup` (`hash.c:3719`), by
       the Hash's own key semantics — `hash` then `eql?`, never `==` — not by
       identity, so a separately allocated but `eql?` key (an Array key, say)
       still hits. The VALUES then compare with whichever send this call is
       (`eql_i`'s `data->eql ? rb_eql : rb_equal`, `hash.c:3724`). */
    return entriesA.every(([key, value]) => {
      const found = entriesB.find(([otherKey]) => rbEql(key, otherKey));
      return found !== undefined && equalOrEql(value, found[1], eql);
    });
  }
  return false;
}

/** The `RHASH` of `hash_equal` (`vendor/ruby/hash.c:3746`) over both JS seats. */
function hashEntries(value: unknown): [unknown, unknown][] | null {
  if (value instanceof Map) return [...value.entries()];
  if (typeof value === "object" && value !== null && value.constructor === Object) {
    return Object.entries(value as Record<string, unknown>);
  }
  return null;
}
