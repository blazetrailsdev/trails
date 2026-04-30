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
    // Cast bounds through the attribute's type (e.g. integer casts "1-meowmeow" → 1)
    const cast = this._castBound
      ? (v: unknown) => this._castBound!(attribute, v)
      : (v: unknown) => v;
    const beginVal =
      value.begin !== null && value.begin !== undefined ? cast(value.begin) : value.begin;
    const endVal = value.end !== null && value.end !== undefined ? cast(value.end) : value.end;

    if (beginVal === null || beginVal === undefined) {
      if (endVal === null || endVal === undefined) {
        return attribute.isNotNull();
      }
      return value.excludeEnd ? attribute.lt(endVal) : attribute.lteq(endVal);
    }

    if (endVal === null || endVal === undefined) {
      return attribute.gteq(beginVal);
    }

    if (value.excludeEnd) {
      return new Nodes.And([attribute.gteq(beginVal), attribute.lt(endVal)]);
    }

    return attribute.between(beginVal, endVal);
  }

  callNegated(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const cast = this._castBound
      ? (v: unknown) => this._castBound!(attribute, v)
      : (v: unknown) => v;
    const beginVal =
      value.begin !== null && value.begin !== undefined ? cast(value.begin) : value.begin;
    const endVal = value.end !== null && value.end !== undefined ? cast(value.end) : value.end;

    if (beginVal === null || beginVal === undefined) {
      if (endVal === null || endVal === undefined) return attribute.isNull();
      return value.excludeEnd ? attribute.gteq(endVal) : attribute.gt(endVal);
    }
    if (endVal === null || endVal === undefined) {
      return attribute.lt(beginVal);
    }
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
