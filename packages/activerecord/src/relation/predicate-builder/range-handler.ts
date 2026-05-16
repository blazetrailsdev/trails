import { Nodes } from "@blazetrails/arel";
import type { Range } from "../../connection-adapters/postgresql/oid/range.js";

/**
 * Handles Range values in where conditions by converting them to
 * BETWEEN predicates or >= / < pairs for exclusive ranges.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::RangeHandler
 *
 * Examples:
 *   where({ age: new Range(18, 65) })              → age BETWEEN 18 AND 65
 *   where({ age: new Range(18, 65, true) })         → age >= 18 AND age < 65
 *   where({ created_at: new Range(start, null) })   → created_at >= start
 *   where({ created_at: new Range(null, end) })     → created_at <= end
 */
export class RangeHandler {
  private _castBound?: (attribute: Nodes.Attribute, value: unknown) => unknown;
  private _predicateBuilder: unknown = undefined;

  constructor(castBound?: (attribute: Nodes.Attribute, value: unknown) => unknown) {
    this._castBound = castBound;
  }

  call(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    // Cast bounds through the attribute's type (e.g. integer casts "1-meowmeow" → 1).
    // Mirrors Rails RangeHandler#call: bounds that are nil or `is_a?(Float)`
    // skip the bind path so the Arel layer can recognize ±Infinity as
    // open-ended via Predications#infinity? / open_ended?.
    const skipCast = (v: unknown): boolean =>
      v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    const cast = this._castBound
      ? (v: unknown) => this._castBound!(attribute, v)
      : (v: unknown) => v;
    const beginVal = skipCast(value.begin) ? value.begin : cast(value.begin);
    const endVal = skipCast(value.end) ? value.end : cast(value.end);

    if (beginVal === null || beginVal === undefined || beginVal === -Infinity) {
      if (endVal === null || endVal === undefined || endVal === Infinity) {
        if (beginVal === -Infinity || endVal === Infinity) {
          return attribute.notIn([]);
        }
        return attribute.isNotNull();
      }
      if (endVal === -Infinity) return attribute.in([]);
      return value.excludeEnd ? attribute.lt(endVal) : attribute.lteq(endVal);
    }

    if (beginVal === Infinity) return attribute.in([]);

    if (endVal === null || endVal === undefined || endVal === Infinity) {
      return attribute.gteq(beginVal);
    }
    if (endVal === -Infinity) return attribute.in([]);

    if (value.excludeEnd) {
      return new Nodes.And([attribute.gteq(beginVal), attribute.lt(endVal)]);
    }

    return attribute.between(beginVal, endVal);
  }

  callNegated(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const skipCast = (v: unknown): boolean =>
      v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    const cast = this._castBound
      ? (v: unknown) => this._castBound!(attribute, v)
      : (v: unknown) => v;
    const beginVal = skipCast(value.begin) ? value.begin : cast(value.begin);
    const endVal = skipCast(value.end) ? value.end : cast(value.end);

    if (beginVal === null || beginVal === undefined || beginVal === -Infinity) {
      if (endVal === null || endVal === undefined || endVal === Infinity) {
        if (beginVal === -Infinity || endVal === Infinity) {
          return attribute.in([]);
        }
        return attribute.isNull();
      }
      if (endVal === -Infinity) return attribute.notIn([]);
      return value.excludeEnd ? attribute.gteq(endVal) : attribute.gt(endVal);
    }
    if (beginVal === Infinity) return attribute.notIn([]);
    if (endVal === null || endVal === undefined || endVal === Infinity) {
      return attribute.lt(beginVal);
    }
    if (endVal === -Infinity) return attribute.notIn([]);
    if (value.excludeEnd) {
      return new Nodes.Grouping(new Nodes.Or(attribute.lt(beginVal), attribute.gteq(endVal)));
    }
    // Mirrors Rails' AR-level `where.not(col: 1..5)`: the predicate
    // builder constructs `Between` then `where.not` wraps it in `Not`,
    // yielding `NOT (col BETWEEN b AND e)`. Don't delegate to
    // attribute.notBetween — that returns the predications.rb-aligned
    // `(col < b OR col > e)` shape, which is the right Arel-level
    // behavior but the wrong AR-level one.
    return new Nodes.Not(attribute.between(beginVal, endVal));
  }

  private get predicateBuilder(): unknown {
    return this._predicateBuilder;
  }
}
