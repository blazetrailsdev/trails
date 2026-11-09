import type { Filter } from "./nodes/filter.js";
import type { Node } from "./nodes/node.js";
import { Nodes } from "./namespaces.js";
import type { ArelNode } from "./arel.js";

export interface FilterPredicationsModule {
  filter(expr: ArelNode): Filter;
}

export const FilterPredications: FilterPredicationsModule = {
  filter(this: Node, expr: ArelNode): Filter {
    return new Nodes.Filter(this, expr);
  },
};
