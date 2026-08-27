import { Count } from "./nodes/count.js";
import { Extract } from "./nodes/extract.js";
import { Sum, Max, Min, Avg } from "./nodes/function.js";
import type { Node } from "./nodes/node.js";

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
    return new Count([this], distinct);
  },
  sum(this: Node): Sum {
    return new Sum([this]);
  },
  maximum(this: Node): Max {
    return new Max([this]);
  },
  minimum(this: Node): Min {
    return new Min([this]);
  },
  average(this: Node): Avg {
    return new Avg([this]);
  },
  extract(this: Node, field: string): Extract {
    return new Extract([this], field);
  },
};
