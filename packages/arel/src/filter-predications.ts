import { Filter } from "./nodes/filter.js";
import type { Node } from "./nodes/node.js";

/**
 * FilterPredications — `filter` mixin.
 *
 * Mirrors: Arel::FilterPredications (activerecord/lib/arel/filter_predications.rb).
 */
export interface FilterPredicationsModule {
  filter(expr: Node): Filter;
}

export const FilterPredications: FilterPredicationsModule = {
  filter(this: Node, expr: Node): Filter {
    return new Filter(this, expr);
  },
};
