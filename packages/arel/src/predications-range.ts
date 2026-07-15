import { Node } from "./nodes/node.js";
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
 * This file holds the SINGLE implementation of the three private helpers.
 * `Predications.isInfinity` / `isUnboundable` / `isOpenEnded` delegate here, as
 * `Predications#between` / `notBetween` and `Attribute#between` / `notBetween`
 * already do for the decision tree — Rails has one copy per Ruby file, and the
 * only other legitimate copy is the visitor's (to_sql.rb:905-907). Keep it that
 * way: a second copy is how `between` silently lost unboundable collapse before.
 *
 * TS deviations (deliberate, called out in the audit):
 * - `infinitySign` and `unboundableSign` mirror Ruby's `infinity?` /
 *   `unboundable?` value protocols. Both are duck-typed and both yield the
 *   *sign*, but they read *different* things — the two are not interchangeable:
 *   - `infinitySign` mirrors `infinity?` (predications.rb:248-250): bare
 *     `±Infinity` (Ruby's `Float` responds to `infinite?`), or a bound exposing
 *     `isInfinite()` — which is how a `Quoted` answers (casted.rb:43-45). A
 *     `Casted` defines no `infinite?` in Rails (casted.rb:5-35), so it never
 *     answers — see the note at `infinitySign` before "fixing" that.
 *   - `unboundableSign` mirrors `unboundable?` (predications.rb:252-253) and is
 *     purely duck-typed: only a bound exposing `isUnboundable()` answers it. A
 *     bare `±Infinity` is open-ended, NOT unboundable.
 * - Two sentinel conventions, deliberately, both standing in for Ruby's
 *   `1 | -1 | nil`. The HELPERS here (`infinitySign` / `unboundableSign`) return
 *   `1 | -1 | 0` and callers test `!== 0`, because Ruby's `0` is truthy and so
 *   could not double as "absent" — `0` is unreachable anyway (see the note on
 *   `unboundableSign`). The VALUE PROTOCOL (`Quoted#isInfinite`,
 *   `BindParam#isInfinite` / `#isUnboundable`, `QueryAttribute`,
 *   `UnboundableBound`) returns `1 | -1 | false`, mirroring the shape of Ruby's
 *   `respond_to?(:x) && value.x` — `false` is the `&&` short-circuit, `nil` the
 *   predicate's own miss. Do not "unify" them: the helper's `0` means no bound
 *   answered, the producer's `false` means this value has no opinion.
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
// A plain duck-type dispatch, like Rails: bare ±Infinity (Ruby's `Float`
// responds to `infinite?`), or anything exposing `isInfinite()`. `Quoted` is
// NOT special-cased — it answers through its own `isInfinite` (casted.rb:43-45)
// like any other value, and structurally unwrapping it here would be a second
// copy of that method. `Casted` defines no `infinite?` (casted.rb:5-35), so it
// answers 0 and `open_ended?(Casted(INFINITY))` stays false.
//
// Every trails producer returns the sign, matching Ruby: `Quoted#isInfinite`
// (casted.ts), `BindParam#isInfinite` (bind-param.ts), `QueryAttribute#isInfinite`
// (activerecord/src/relation/query-attribute.ts). Do not add a `true` arm back —
// a boolean producer would report `+1` for a -Infinity bound.
export function infinitySign(value: unknown): 1 | -1 | 0 {
  if (value === Infinity) return 1;
  if (value === -Infinity) return -1;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as InfiniteLike).isInfinite === "function"
  ) {
    const r = (value as InfiniteLike).isInfinite!();
    if (r === 1 || r === -1) return r;
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
  isInfinite?: () => 1 | -1 | false;
}

interface UnboundableLike {
  isUnboundable?: () => 1 | -1 | false;
}

// Mirrors Rails Predications#open_ended? (predications.rb:255-257) —
// `value.nil? || infinity?(value) || unboundable?(value)`. A nil, ±Infinity, or
// out-of-range (unboundable) bound counts as "no bound on this side".
//
// Ruby's leading `value.nil?` is a real dispatch: every Arel bound answers it,
// and the node classes override it (`BindParam#nil?` bind_param.rb:23-25,
// `Casted#nil?` / `Quoted#nil?` casted.rb:16,41) to report on the *wrapped*
// value. So `between(BindParam(nil), 3)` is `lteq(3)` in Rails, not a Between
// over a nil bind — reading only `=== null` here skipped that.
export function isOpenEnded(value: unknown): boolean {
  return isNil(value) || infinitySign(value) !== 0 || unboundableSign(value) !== 0;
}

// Mirrors Ruby's `value.nil?` for the shapes a bound can take: a bare
// null/undefined, or a node exposing the port's `isNil()`.
function isNil(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const v = value as { isNil?: () => boolean };
  return typeof v.isNil === "function" && v.isNil();
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
