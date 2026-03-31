import { Nodes } from "@blazetrails/arel";
import type { PredicateBuilder } from "../predicate-builder.js";
import { Range } from "../../connection-adapters/postgresql/oid/range.js";

/**
 * Sentinel used when no scalar values exist in an array condition.
 * Acts as an identity element for the OR-folding chain.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::ArrayHandler::NullPredicate
 */
export class NullPredicate {}

/**
 * Handles array values in where conditions by splitting them into
 * scalar values, nils, and ranges, then combining with OR predicates.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::ArrayHandler
 *
 * Examples:
 *   where({ id: [1, 2, 3] })          → id IN (1, 2, 3)
 *   where({ id: [1, null, 3] })       → id IN (1, 3) OR id IS NULL
 *   where({ age: [18, new Range(25, 30)] }) → age IN (18) OR age BETWEEN 25 AND 30
 */
export class ArrayHandler {
  private predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this.predicateBuilder = predicateBuilder;
  }

  call(attribute: Nodes.Attribute, value: unknown[]): Nodes.Node {
    if (value.length === 0) {
      return attribute.in([]);
    }

    const scalarValues: unknown[] = [];
    let hasNull = false;
    const ranges: Range[] = [];
    const nonScalarValues: unknown[] = [];

    for (const item of value) {
      if (item === null || item === undefined) {
        hasNull = true;
      } else if (item instanceof Range) {
        ranges.push(item);
      } else if (typeof item === "object" && item !== null && "id" in item) {
        scalarValues.push((item as any).id);
      } else if (typeof item === "object" || typeof item === "function") {
        nonScalarValues.push(item);
      } else {
        scalarValues.push(item);
      }
    }

    // Build the scalar values predicate, using NullPredicate as sentinel
    let valuesPredicate: Nodes.Node | typeof NullPredicate;
    if (scalarValues.length === 0) {
      valuesPredicate = NullPredicate;
    } else if (scalarValues.length === 1) {
      valuesPredicate = this.predicateBuilder.build(attribute, scalarValues[0]);
    } else {
      valuesPredicate = attribute.in(scalarValues);
    }

    // Fold in non-scalar values (e.g. Relations → subqueries) via PredicateBuilder
    for (const v of nonScalarValues) {
      const pred = this.predicateBuilder.build(attribute, v);
      valuesPredicate =
        valuesPredicate === NullPredicate ? pred : groupedOr(valuesPredicate as Nodes.Node, pred);
    }

    // Fold in NULL with Grouping to preserve precedence
    if (hasNull) {
      valuesPredicate =
        valuesPredicate === NullPredicate
          ? attribute.isNull()
          : groupedOr(valuesPredicate as Nodes.Node, attribute.isNull());
    }

    // Fold in ranges with Grouping to preserve precedence
    if (ranges.length === 0) {
      return valuesPredicate === NullPredicate ? attribute.in([]) : (valuesPredicate as Nodes.Node);
    }

    const rangePreds = ranges.map((r) => this.predicateBuilder.buildRangePredicate(attribute, r));
    let result: Nodes.Node | typeof NullPredicate = valuesPredicate;
    for (const rp of rangePreds) {
      result = result === NullPredicate ? rp : groupedOr(result as Nodes.Node, rp);
    }
    return result as Nodes.Node;
  }
}

function groupedOr(left: Nodes.Node, right: Nodes.Node): Nodes.Grouping {
  return new Nodes.Grouping(new Nodes.Or(left, right));
}
