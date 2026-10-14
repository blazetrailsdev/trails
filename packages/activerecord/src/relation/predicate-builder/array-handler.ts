import type * as Arel from "@blazetrails/arel";
import { Nodes } from "@blazetrails/arel";
import { extractBang } from "@blazetrails/activesupport";
import type { PredicateBuilder } from "../predicate-builder.js";

import { ActiveRecord } from "../../namespaces.js";
import { compactBang, isEmpty, Range } from "@blazetrails/ruby-compat";

export const NullPredicate = {
  or(other: Nodes.Node): Nodes.Node {
    return other;
  },
};

export class ArrayHandler {
  private predicateBuilder: PredicateBuilder;

  constructor(predicateBuilder: PredicateBuilder) {
    this.predicateBuilder = predicateBuilder;
  }

  call(attribute: Arel.Attribute, value: unknown[] | Set<unknown>): Nodes.Node {
    if (isEmpty(value)) return attribute.in([]);

    const values = Array.from(value, (x) => (x instanceof ActiveRecord.Base ? x.id : x));
    const nils = compactBang(values);
    const ranges = extractBang(values, (v) => v instanceof Range);

    let valuesPredicate: Nodes.Node | typeof NullPredicate;
    switch (values.length) {
      case 0:
        valuesPredicate = NullPredicate;
        break;
      case 1:
        valuesPredicate = this.predicateBuilder.build(attribute, values[0]);
        break;
      default:
        valuesPredicate = new Nodes.HomogeneousIn(values, attribute, "in");
    }

    if (nils) {
      valuesPredicate = valuesPredicate.or(attribute.eq(null));
    }

    if (isEmpty(ranges)) {
      return valuesPredicate as Nodes.Node;
    } else {
      const arrayPredicates = ranges.map((range) => this.predicateBuilder.build(attribute, range));
      return arrayPredicates.reduce(
        (memo, predicate) => memo.or(predicate),
        valuesPredicate,
      ) as Nodes.Node;
    }
  }
}
