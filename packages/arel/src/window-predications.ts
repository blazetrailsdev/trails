import type { Node } from "./nodes/node.js";
import { Nodes } from "./namespaces.js";
import type { Over } from "./nodes/over.js";
import type { ArelNode } from "./arel.js";

export interface WindowPredicationsModule {
  over(expr?: ArelNode | string | null): Over;
}

export const WindowPredications: WindowPredicationsModule = {
  over(this: Node, expr: ArelNode | string | null = null): Over {
    return new Nodes.Over(this, expr);
  },
};
