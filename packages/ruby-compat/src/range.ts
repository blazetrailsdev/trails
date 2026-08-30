/**
 * Ruby's core `Range` class (`vendor/ruby/range.c:31`), which Rails'
 * `core_ext/range/*` files reopen. Those Rails files are ported one-for-one
 * under `activesupport/src/core-ext/range/`, and reopen this class the way
 * Ruby reopens `Range`.
 *
 * @boundary-file: the comparators here coerce `Date` ↔ epoch number for
 *   ordering since Rails' `Range#cover?` accepts any `<=>`-comparable value.
 *   Temporal-typed ranges live elsewhere.
 */

import { succ } from "./string/succ.js";
import { rbEqual } from "./rb-equal.js";

/** Ruby's `a <=> b`, the comparison `vendor/ruby/range.c:199` `r_less` makes
 *  on every endpoint, over the types trails' ranges carry. */
function cmp(a: unknown, b: unknown): number {
  // boundary: Date endpoints are compared as epoch millis.
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  return (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
}

/**
 * Ruby's core `Range`. Only the members Rails' reopenings and the framework
 * call are defined; `begin`, `end` and `exclude_end?` are the three readers
 * every one of them reads off the receiver.
 *
 * `vendor/ruby/range.c:31` — `rb_cRange`.
 *
 * @noRailsEquivalent PERMANENT — `Range` is a core Ruby class, not a Rails
 * declaration, so no Rails file declares it; the Rails-declared `Range`
 * classes (`Arel::Nodes::Range`, PG `OID::Range`) are unrelated node/type
 * classes.
 */
export class Range<T = unknown> {
  constructor(
    readonly begin: T | null,
    readonly end: T | null,
    readonly excludeEnd: boolean = false,
  ) {}

  /** Raises before any other check on a beginless range, as Ruby does
   *  (`vendor/ruby/range.c:1243` `range_first`). */
  first(): T {
    if (this.begin === null) {
      throw new RangeError("cannot get the first element of beginless range");
    }
    return this.begin;
  }

  /** `vendor/ruby/range.c:1349` `range_last`. */
  last(): T | null {
    return this.end;
  }

  /**
   * Ruby answers nil for an empty range and raises for a beginless one, since
   * there is no least element to report.
   *
   * @noRailsEquivalent PERMANENT — core Ruby `Range#min` (`vendor/ruby/range.c:1450`), read by
   * `length.rb:18`. No Rails file declares it, so `parity:api:extra` has no
   * Ruby name to credit it against.
   */
  min(): T | null {
    if (this.begin === null) {
      throw new RangeError("cannot get the minimum of beginless range");
    }
    /* `vendor/ruby/range.c:1450` — Ruby answers nil for an empty range, and an
       exclusive end makes `begin == end` empty: `(1...1).min` is nil where
       `(1..1).min` is 1. */
    if (this.end !== null && cmp(this.begin, this.end) >= (this.excludeEnd ? 0 : 1)) return null;
    return this.begin;
  }

  /**
   * Ruby raises `TypeError` for a non-Integer excluded end rather than
   * silently reporting a fractional maximum.
   *
   * @noRailsEquivalent PERMANENT — core Ruby `Range#max` (`vendor/ruby/range.c:1558`), read by
   * `compare_range.rb:24,50`. No Rails file declares it, so `parity:api:extra` has
   * no Ruby name to credit it against.
   */
  max(): T | null {
    const end = this.end;
    if (!this.excludeEnd || end === null) return end;
    if (typeof end === "number") {
      // `vendor/ruby/range.c:1558` — Ruby's own `Range#max` message.
      if (!Number.isInteger(end)) throw new TypeError("cannot exclude non Integer end value");
      return (end - 1) as T;
    }
    // boundary: Date endpoints, as above
    return new Date((end as Date).getTime() - 1) as T;
  }

  /**
   * @noRailsEquivalent PERMANENT — core Ruby `Range#to_s` (`vendor/ruby/range.c:1782`), the fallback
   * `conversions.rb:55` and `json.rb:160` reach. No Rails file declares it.
   */
  toS(): string {
    const begin = this.begin !== null ? String(this.begin) : "";
    const end = this.end !== null ? String(this.end) : "";
    return `${begin}${this.excludeEnd ? "..." : ".."}${end}`;
  }

  /**
   * Endpoint comparison — true when the range covers the scalar value.
   *
   * @noRailsEquivalent PERMANENT — core Ruby `Range#cover?` (`vendor/ruby/range.c:2107`), the method
   * `clusivity.rb:40-50` selects between. No Rails file declares it.
   */
  cover(value: T): boolean {
    if (this.begin !== null && cmp(value, this.begin) < 0) return false;
    if (this.end !== null) {
      const c = cmp(value, this.end);
      if (this.excludeEnd ? c >= 0 : c > 0) return false;
    }
    return true;
  }

  /**
   * For a String range, membership in the `succ`-enumerated sequence from
   * `begin` to `end`, NOT a plain lexicographic cover. Ruby enumerates string
   * ranges by `String#succ` (`vendor/ruby/range.c:1960`
   * `range_include_internal` → `vendor/ruby/string.c:5042` `rb_str_upto_each`),
   * so a value is a member only if it is actually
   * *reachable* by repeatedly applying `succ` to `begin` before passing `end`.
   * This mirrors that enumeration faithfully: `("a".."bbb").include?("z")` is
   * true (`"z"` is produced before the length guard trips), and
   * `("a".."bbb").include?("a1")` is false (`succ` mixes no character classes,
   * so `"a1"` is never produced) — unlike a `(length, lex)` window, which
   * would wrongly admit `"a1"`.
   *
   * Beginless/endless string ranges have no enumerable sequence; Ruby raises
   * `TypeError: cannot determine inclusion in beginless/endless ranges`
   * (`vendor/ruby/range.c:1960` `range_include_internal`), so this throws to match rather than
   * inventing an answer Ruby never produces.
   */
  isInclude(value: T): boolean {
    if (typeof this.begin !== "string" && typeof this.end !== "string") return this.cover(value);

    const { begin, end, excludeEnd } = this as Range<string>;

    if (begin === null || end === null) {
      throw new TypeError("cannot determine inclusion in beginless/endless ranges");
    }

    /* Faithful `vendor/ruby/string.c:5042` `rb_str_upto_each`: enumerate
       begin..end via succ, stopping at `end.succ`, when the exclusive end is
       reached, or when the current string grows past `end`'s length (succ is
       non-decreasing in length). */
    const n = cmp(begin, end);
    if (n > 0 || (excludeEnd && n === 0)) return false;
    const afterEnd = succ(end);
    let current = begin;
    let guard = 0;
    while (current !== afterEnd) {
      let next: string | null = null;
      if (excludeEnd || current !== end) next = succ(current);
      if (current === value) return true;
      if (next === null) break;
      current = next;
      if (excludeEnd && current === end) break;
      if (current.length > end.length || current.length === 0) break;
      /* The length guard above bounds enumeration to strings no longer than
         `end`, so this only trips for spans wider than ~26^5.
         `vendor/ruby/string.c:5042` would keep iterating (slow but correct);
         throw rather than return a wrong `false`. */
      if (++guard > 5_000_000) {
        throw new RangeError("string range too large to enumerate for include?");
      }
    }
    return false;
  }

  /** `vendor/ruby/range.c:1889` `range_eqq`. */
  caseEquals(value: T): boolean {
    return this.cover(value);
  }

  /**
   * Ruby `Range#==` (`vendor/ruby/range.c:183` `range_eq`): another Range whose `begin`, `end`
   * and `exclude_end?` are each `==`. Two separately-built `1..5` are equal in
   * Ruby, where JS `===` sees two distinct objects.
   */
  equals(other: unknown): boolean {
    if (!(other instanceof Range)) return false;
    return (
      rbEqual(this.begin, other.begin) &&
      rbEqual(this.end, other.end) &&
      this.excludeEnd === other.excludeEnd
    );
  }

  /** `vendor/ruby/range.c:934` `range_each`. */
  *each(): Generator<T> {
    yield* this.step(1);
  }

  /** `vendor/ruby/range.c:439` `range_step`. */
  *step(n: number = 1): Generator<T> {
    let current = this.first() as number;
    while (true) {
      if (this.end !== null) {
        const end = this.end as number;
        if (this.excludeEnd ? current >= end : current > end) break;
      }
      yield current as T;
      current += n;
    }
  }
}
