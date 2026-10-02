import type { Filter } from "./nodes/filter.js";
import type { Node } from "./nodes/node.js";
import { Nodes } from "./namespaces.js";

export interface FilterPredicationsModule {
  filter(expr: Node): Filter;
}

export const FilterPredications: FilterPredicationsModule = {
  filter(this: Node, expr: Node): Filter {
    return new Nodes.Filter(this, expr);
  },
};
