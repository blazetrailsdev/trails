import { Nodes } from "@blazetrails/arel";
import type { PredicateBuilder } from "../predicate-builder.js";

import { isBaseInstance } from "./is-base-instance.js";
import { Range } from "@blazetrails/ruby-compat";

export class NullPredicate {}

export class ArrayHandler {
  private predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this.predicateBuilder = predicateBuilder;
  }

  call(attribute: Nodes.Attribute, value: unknown[] | Set<unknown>): Nodes.Node {
    if ((Array.isArray(value) ? value.length : value.size) === 0) {
      return attribute.in([]);
    }

    const values: unknown[] = [];
    let hasNull = false;
    const ranges: Range<unknown>[] = [];

    for (const item of value) {
      if (item === null || item === undefined) {
        hasNull = true;
      } else if (item instanceof Range) {
        ranges.push(item);
      } else if (isBaseInstance(item)) {
        values.push(item.id);
      } else {
        values.push(item);
      }
    }

    let valuesPredicate: Nodes.Node | typeof NullPredicate;
    if (values.length === 0) {
      valuesPredicate = NullPredicate;
    } else if (values.length === 1) {
      valuesPredicate = this.predicateBuilder.build(attribute, values[0]);
    } else {
      valuesPredicate = new Nodes.HomogeneousIn(values, attribute, "in");
    }

    if (hasNull) {
      valuesPredicate =
        valuesPredicate === NullPredicate
          ? attribute.eq(null)
          : groupedOr(valuesPredicate as Nodes.Node, attribute.eq(null));
    }

    if (ranges.length === 0) {
      return valuesPredicate === NullPredicate ? attribute.in([]) : (valuesPredicate as Nodes.Node);
    }

    const arrayPredicates = ranges.map((range) => this.predicateBuilder.build(attribute, range));
    let result: Nodes.Node | typeof NullPredicate = valuesPredicate;
    for (const rp of arrayPredicates) {
      result = result === NullPredicate ? rp : groupedOr(result as Nodes.Node, rp);
    }
    return result as Nodes.Node;
  }

  or(left: Nodes.Node, right: Nodes.Node): Nodes.Node {
    return groupedOr(left, right);
  }
}

function groupedOr(left: Nodes.Node, right: Nodes.Node): Nodes.Grouping {
  return new Nodes.Grouping(new Nodes.Or([left, right]));
}
