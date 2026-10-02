import type { Count } from "./nodes/count.js";
import type { Extract } from "./nodes/extract.js";
import type { Sum, Max, Min, Avg } from "./nodes/function.js";
import type { ArelNode } from "./arel.js";
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
  count(this: ArelNode, distinct: boolean | null = false): Count {
    return new Nodes.Count([this], distinct);
  },
  sum(this: ArelNode): Sum {
    return new Nodes.Sum([this]);
  },
  maximum(this: ArelNode): Max {
    return new Nodes.Max([this]);
  },
  minimum(this: ArelNode): Min {
    return new Nodes.Min([this]);
  },
  average(this: ArelNode): Avg {
    return new Nodes.Avg([this]);
  },
  extract(this: ArelNode, field: string): Extract {
    return new Nodes.Extract([this], field);
  },
};
