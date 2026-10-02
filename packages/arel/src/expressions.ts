import type { Count } from "./nodes/count.js";
import type { Extract } from "./nodes/extract.js";
import type { Sum, Max, Min, Avg } from "./nodes/function.js";
import type { Node } from "./nodes/node.js";
import { Nodes } from "./namespaces.js";

export interface ExpressionsModule {
  count(distinct?: boolean | null): Count;
  sum(): Sum;
  maximum(): Max;
  minimum(): Min;
  average(): Avg;
  extract(field: string): Extract;
}

export const Expressions: ExpressionsModule = {
  count(this: Node, distinct: boolean | null = false): Count {
    return new Nodes.Count([this], distinct);
  },
  sum(this: Node): Sum {
    return new Nodes.Sum([this]);
  },
  maximum(this: Node): Max {
    return new Nodes.Max([this]);
  },
  minimum(this: Node): Min {
    return new Nodes.Min([this]);
  },
  average(this: Node): Avg {
    return new Nodes.Avg([this]);
  },
  extract(this: Node, field: string): Extract {
    return new Nodes.Extract([this], field);
  },
};
