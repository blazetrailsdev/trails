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
  constructor() {}

  call(attribute: Nodes.Attribute, value: Range): Nodes.Node {
    const beginVal = value.begin;
    const endVal = value.end;

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
}
