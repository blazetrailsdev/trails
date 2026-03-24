import type { Node } from "./nodes/node.js";

export interface FilterPredications {
  filter(expr: Node): Node;
}
