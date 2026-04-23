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

    // Mirrors Rails' ArrayHandler#call:
    //   values = value.map { |x| x.is_a?(Base) ? x.id : x }
    //   nils = values.compact!
    //   ranges = values.extract! { |v| v.is_a?(Range) }
    // Everything that isn't a Base record, nil, or Range stays in `values`,
    // including arbitrary objects like AdditionalValue (for encrypted
    // deterministic queries). A single remaining value is routed through
    // `predicateBuilder.build(...)` (typically producing an Equality);
    // multiple values use the In/HomogeneousIn branch. Passing Relations
    // inside the array is unsupported here — Rails would likewise fail
    // to serialize them inside HomogeneousIn; use `where(col: relation)`
    // for subqueries instead.
    const scalarValues: unknown[] = [];
    let hasNull = false;
    const ranges: Range[] = [];

    for (const item of value) {
      if (item === null || item === undefined) {
        hasNull = true;
      } else if (item instanceof Range) {
        ranges.push(item);
      } else if (typeof item === "object" && item !== null && "id" in item) {
        // Rails: `x.is_a?(Base) ? x.id : x` — flatten AR records to their PK.
        // Duck-typed on `id` presence to avoid a circular import on Base.
        scalarValues.push((item as { id: unknown }).id);
      } else {
        scalarValues.push(item);
      }
    }

    let valuesPredicate: Nodes.Node | typeof NullPredicate;
    if (scalarValues.length === 0) {
      valuesPredicate = NullPredicate;
    } else if (scalarValues.length === 1) {
      valuesPredicate = this.predicateBuilder.build(attribute, scalarValues[0]);
    } else {
      valuesPredicate = attribute.in(scalarValues);
    }

    if (hasNull) {
      valuesPredicate =
        valuesPredicate === NullPredicate
          ? attribute.isNull()
          : groupedOr(valuesPredicate as Nodes.Node, attribute.isNull());
    }

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

  or(left: Nodes.Node, right: Nodes.Node): Nodes.Node {
    return groupedOr(left, right);
  }
}

function groupedOr(left: Nodes.Node, right: Nodes.Node): Nodes.Grouping {
  return new Nodes.Grouping(new Nodes.Or(left, right));
}
