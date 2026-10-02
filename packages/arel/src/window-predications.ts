import type { Node } from "./nodes/node.js";
import { Nodes } from "./namespaces.js";
import type { Over } from "./nodes/over.js";

export interface WindowPredicationsModule {
  over(expr?: Node | string | null): Over;
}

export const WindowPredications: WindowPredicationsModule = {
  over(this: Node, expr: Node | string | null = null): Over {
    return new Nodes.Over(this, expr);
  },
};
