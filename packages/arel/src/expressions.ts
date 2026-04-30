import { Count } from "./nodes/count.js";
import { Extract } from "./nodes/extract.js";
import { Sum, Max, Min, Avg } from "./nodes/function.js";
import type { Node } from "./nodes/node.js";

/**
 * Expressions — aggregate-function mixin.
 *
 * Mirrors: Arel::Expressions (activerecord/lib/arel/expressions.rb).
 * Mixed into NodeExpression and SqlLiteral via include() in ./index.ts.
 */
export interface ExpressionsModule {
  count(distinct?: boolean): Count;
  sum(): Sum;
  maximum(): Max;
  minimum(): Min;
  average(): Avg;
  extract(field: string): Extract;
}

export const Expressions: ExpressionsModule = {
  count(this: Node, distinct = false): Count {
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
    // Mirrors Rails: `Nodes::Extract.new [self], field` (expressions.rb).
    return new Extract([this], field);
  },
};
