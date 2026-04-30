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
 * - `infinitySign` and `unboundableSign` collapse: Trails has no
 *   `unboundable?` value protocol, so both reduce to checking
 *   `+/-Infinity` (and a `Quoted` wrapper around the same).
 * - The TS port accepts three input shapes (array, object, positional)
 *   instead of Ruby's single `Range`.
 */

export interface RangeLike {
  begin: unknown;
  end: unknown;
  excludeEnd: boolean;
}

export interface RangeHost {
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

// Mirrors Rails Predications#infinity? — signed infinity check. Trails
// has no `infinite?` protocol; only +/-Infinity (and Quoted(Infinity))
// register.
export function infinitySign(value: unknown): 1 | -1 | 0 {
  if (value === Infinity) return 1;
  if (value === -Infinity) return -1;
  if (value instanceof Quoted) return infinitySign(value.value);
  return 0;
}

// Mirrors Rails Predications#unboundable? — Trails has no separate
// unboundable protocol on user values, so it collapses to infinitySign.
// Kept named so the decision tree below reads side-by-side with Rails.
export function unboundableSign(value: unknown): 1 | -1 | 0 {
  return infinitySign(value);
}

// Mirrors Rails Predications#open_ended? — null/undefined or any
// signed-infinity bound counts as "no bound on this side".
export function isOpenEnded(value: unknown): boolean {
  return value === null || value === undefined || infinitySign(value) !== 0;
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
  return new Between(
    host as unknown as Node,
    new And([host.quotedNode(range.begin), host.quotedNode(range.end)]),
  );
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
