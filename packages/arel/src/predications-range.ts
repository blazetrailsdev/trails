import { Node } from "./nodes/node.js";
import { Quoted } from "./nodes/casted.js";
import { And } from "./nodes/and.js";
import { Or } from "./nodes/or.js";
import { Grouping } from "./nodes/grouping.js";
import { Between } from "./nodes/binary.js";

/**
 * Range-protocol helpers shared between `Predications#between` /
 * `notBetween` (the mixin) and `Attribute#between` / `notBetween` (the
 * class-side overrides). Mirrors Rails' Predications private helpers
 * (`infinity?`, `unboundable?`, `open_ended?`) and the public `between`
 * / `not_between` decision tree.
 *
 * Source of truth: Rails v8.0.2 `activerecord/lib/arel/predications.rb`
 *   `between` body — Predications#between
 *   `not_between` body — Predications#not_between
 *   `infinity?` / `unboundable?` / `open_ended?` — private helpers
 *
 * TS deviations (deliberate, called out in the audit):
 * - `infinitySign` and `unboundableSign` are Trails' stand-ins for Ruby's
 *   `infinity?` / `unboundable?` value protocols, and they read *different*
 *   things — the two are not interchangeable:
 *   - `infinitySign` mirrors `infinity?` (predications.rb:248-250): bare
 *     `±Infinity`, a `Quoted` wrapper around it (`Quoted#infinite?`,
 *     casted.rb:43-45), or a bound exposing `isInfinite()`. It deliberately
 *     does NOT unwrap `Casted`, which defines no `infinite?` in Rails
 *     (casted.rb:5-35) — see the note at `infinitySign` before "fixing" that.
 *   - `unboundableSign` mirrors `unboundable?` (predications.rb:252-253) and is
 *     purely duck-typed: only a bound exposing `isUnboundable()` answers it. A
 *     bare `±Infinity` is open-ended, NOT unboundable.
 * - The TS port accepts three input shapes (array, object, positional)
 *   instead of Ruby's single `Range`.
 */

export interface RangeLike {
  begin: unknown;
  end: unknown;
  excludeEnd: boolean;
}

export interface RangeHost extends Node {
  quotedNode(other: unknown): Node;
  in(values: unknown[]): Node;
  notIn(values: unknown[]): Node;
  eq(o: unknown): Node;
  gt(o: unknown): Node;
  gteq(o: unknown): Node;
  lt(o: unknown): Node;
  lteq(o: unknown): Node;
}

export function parseRange(beginOrRange: unknown, end: unknown, excludeEnd?: boolean): RangeLike {
  if (Array.isArray(beginOrRange) && end === undefined) {
    return { begin: beginOrRange[0], end: beginOrRange[1], excludeEnd: false };
  }
  if (
    typeof beginOrRange === "object" &&
    beginOrRange !== null &&
    !(beginOrRange instanceof Node) &&
    end === undefined &&
    "begin" in (beginOrRange as Record<string, unknown>) &&
    "end" in (beginOrRange as Record<string, unknown>)
  ) {
    const r = beginOrRange as { begin: unknown; end: unknown; excludeEnd?: boolean };
    return { begin: r.begin, end: r.end, excludeEnd: r.excludeEnd === true };
  }
  return { begin: beginOrRange, end, excludeEnd: excludeEnd === true };
}

// Mirrors Rails Predications#infinity? (predications.rb:248-250) —
// `value.respond_to?(:infinite?) && value.infinite?`, which yields the *sign*
// because `Float#infinite?` returns `1 | -1 | nil`.
//
// Unwraps `Quoted` (whose `infinite?` lives at casted.rb:43-45) but deliberately
// NOT `Casted`: Rails' `Casted` defines no `infinite?` (casted.rb:5-35), so
// `open_ended?(Casted(INFINITY))` is false there and must be false here. Do not
// "fix" this to unwrap Casted — it would silently change `between`.
//
// The `r === true` arm is NOT the same dead coercion removed from
// `unboundableSign`: it compensates for a live producer. Rails'
// `QueryAttribute#infinite?` (query_attribute.rb:42-44) returns
// `infinity?(...)`, i.e. the sign; trails' returns a plain `boolean`
// (`activerecord/src/relation/query-attribute.ts:89-94`), and `BindParam#isInfinite`
// delegates to it (bind-param.ts:45-48) despite its `number | null` annotation.
// Dropping the arm would stop detecting +Infinity binds; keeping it reports +1
// for a -Infinity bind. Both are wrong — the root cause is the boolean return,
// tracked in story `arel-predications-unboundable-duck-types-like-rails`. Latent
// today: trails' RangeHandler passes cast values / UnboundableBound, never a
// QueryAttribute, as a range bound.
export function infinitySign(value: unknown): 1 | -1 | 0 {
  if (value === Infinity) return 1;
  if (value === -Infinity) return -1;
  if (value instanceof Quoted) return infinitySign(value.value);
  if (
    value &&
    typeof value === "object" &&
    typeof (value as InfiniteLike).isInfinite === "function"
  ) {
    const r = (value as InfiniteLike).isInfinite!();
    if (r === 1 || r === true) return 1;
    if (r === -1) return -1;
  }
  return 0;
}

// Mirrors Rails Predications#unboundable? (predications.rb:252-253) —
// `value.respond_to?(:unboundable?) && value.unboundable?`, the same duck-typed
// predicate the visitor uses (to_sql.rb:905-907). A bound is unboundable when it
// serializes out of range for its column type; trails threads that through a
// bound exposing `isUnboundable()` (a QueryAttribute bind, or the RangeHandler's
// out-of-range sentinel), returning the sign of Ruby's `value <=> 0`.
//
// A bare ±Infinity is NOT unboundable — Float has no `unboundable?`, so Rails
// answers false and the bound falls through to the `open_ended?` / `infinity?`
// arms of the between decision tree (predications.rb:38-51). `Float::INFINITY..`
// still collapses to `in([])`, but via the nested `infinity?` check at
// predications.rb:42, not this predicate.
export function unboundableSign(value: unknown): 1 | -1 | 0 {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as UnboundableLike).isUnboundable === "function"
  ) {
    const r = (value as UnboundableLike).isUnboundable!();
    if (r === 1) return 1;
    if (r === -1) return -1;
  }
  return 0;
}

interface InfiniteLike {
  isInfinite?: () => number | boolean | null;
}

interface UnboundableLike {
  isUnboundable?: () => 1 | -1 | 0 | boolean;
}

// Mirrors Rails Predications#open_ended? — `value.nil? || infinity?(value) ||
// unboundable?(value)`. A null/undefined, ±Infinity, or out-of-range
// (unboundable) bound counts as "no bound on this side".
export function isOpenEnded(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    infinitySign(value) !== 0 ||
    unboundableSign(value) !== 0
  );
}

export function betweenFromRange(host: RangeHost, range: RangeLike): Node {
  if (unboundableSign(range.begin) === 1 || unboundableSign(range.end) === -1) {
    return host.in([]);
  }
  if (isOpenEnded(range.begin)) {
    if (isOpenEnded(range.end)) {
      if (infinitySign(range.begin) === 1 || infinitySign(range.end) === -1) {
        return host.in([]);
      }
      return host.notIn([]);
    }
    return range.excludeEnd ? host.lt(range.end) : host.lteq(range.end);
  }
  if (isOpenEnded(range.end)) {
    return host.gteq(range.begin);
  }
  if (range.excludeEnd) {
    return new And([host.gteq(range.begin), host.lt(range.end)]);
  }
  if (range.begin === range.end) {
    return host.eq(range.begin);
  }
  return new Between(host, new And([host.quotedNode(range.begin), host.quotedNode(range.end)]));
}

export function notBetweenFromRange(host: RangeHost, range: RangeLike): Node {
  if (unboundableSign(range.begin) === 1 || unboundableSign(range.end) === -1) {
    return host.notIn([]);
  }
  if (isOpenEnded(range.begin)) {
    if (isOpenEnded(range.end)) {
      if (infinitySign(range.begin) === 1 || infinitySign(range.end) === -1) {
        return host.notIn([]);
      }
      return host.in([]);
    }
    return range.excludeEnd ? host.gteq(range.end) : host.gt(range.end);
  }
  if (isOpenEnded(range.end)) {
    return host.lt(range.begin);
  }
  const left = host.lt(range.begin);
  const right = range.excludeEnd ? host.gteq(range.end) : host.gt(range.end);
  return new Grouping(new Or([left, right]));
}
