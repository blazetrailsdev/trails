import { Nodes } from "@blazetrails/arel";
import type { Range } from "../../connection-adapters/postgresql/oid/range.js";
import type { PredicateBuilder } from "../predicate-builder.js";

/**
 * Stand-in for a range bound that is out of range for its column type.
 *
 * Rails' RangeHandler wraps every bound in a QueryAttribute, whose
 * `unboundable?` reports the signed distance from zero for out-of-range values
 * (`+1` past the max, `-1` past the min) so Arel's `Predications#between` can
 * collapse the comparison (`in([])` / `not_in([])` / a single-sided bound)
 * instead of emitting a bind that would raise ActiveModelRangeError.
 *
 * Trails threads only the out-of-range bounds through this sentinel — in-range
 * bounds stay as their plain cast values so ordinary ranges emit unchanged
 * SQL. `arel`'s `unboundableSign` recognises it via `isUnboundable()` (reached
 * through `Predications#unboundable?` / `open_ended?`, which `between`
 * dispatches on self); it never reaches the visitor as a bind.
 *
 * This class has no Rails counterpart: range_handler.rb:12-16 wraps BOTH bounds
 * in `build_bind_attribute` and lets `QueryAttribute#unboundable?` answer.
 * Converging is tracked by story
 * `0023-surfaced-deviations/converge-range-handler-bind-attribute-bounds`, which
 * deletes this class.
 */
export class UnboundableBound {
  constructor(readonly sign: 1 | -1) {}

  isUnboundable(): 1 | -1 {
    return this.sign;
  }

  isInfinite(): false {
    return false;
  }
}

/**
 * Handles Range values in where conditions by delegating to
 * `attribute.between`, which encodes Rails' Arel `Predications#between`
 * decision tree (open-ended, ±Infinity, exclude-end).
 *
 * Mirrors: ActiveRecord::PredicateBuilder::RangeHandler — Rails' `call`
 * builds bind attributes for both bounds and hands a `RangeWithBinds` to
 * `attribute.between`; the open-ended / infinity logic lives in Arel.
 *
 * TS deviation: `call` builds a bind per bound as Rails does, but hands
 * `between` the bound's cast value (or an {@link UnboundableBound}) instead of
 * the bind itself — see `buildBoundAttribute`.
 */
export class RangeHandler {
  private _predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this._predicateBuilder = predicateBuilder;
  }

  call(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const beginBind = this.buildBoundAttribute(attribute, value.begin);
    const endBind = this.buildBoundAttribute(attribute, value.end);
    return attribute.between({ begin: beginBind, end: endBind, excludeEnd: value.excludeEnd });
  }

  /**
   * The one bound of Rails' `predicate_builder.build_bind_attribute(attribute.name, ...)`
   * (range_handler.rb:13-14). The bind IS built — its `isUnboundable()` is what
   * decides an out-of-range bound, exactly as Rails' `QueryAttribute#unboundable?`
   * does — but an in-range bound is handed on as its cast value rather than as
   * the bind itself, which is the deviation {@link UnboundableBound} documents
   * and story `0023-surfaced-deviations/converge-range-handler-bind-attribute-bounds`
   * removes.
   *
   * nil and ±Float::INFINITY bounds pass through uncast: Arel's `open_ended?` /
   * `infinity?` recognise them at the visitor, and a numeric type's cast would
   * turn Infinity into something finite. NaN is not infinite in Ruby
   * (`NaN.infinite?` is nil), so it still casts.
   */
  private buildBoundAttribute(attribute: Nodes.Attribute, bound: unknown): unknown {
    if (bound === null || bound === undefined || bound === Infinity || bound === -Infinity) {
      return bound;
    }
    const bind = this.predicateBuilder.buildBindAttribute(attribute.name, bound);
    const sign = bind.isUnboundable();
    if (sign !== false) return new UnboundableBound(sign);
    return this.predicateBuilder.table.type(attribute.name).cast(bound);
  }

  private get predicateBuilder(): PredicateBuilder {
    return this._predicateBuilder;
  }
}
