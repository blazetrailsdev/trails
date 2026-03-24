import type { Node } from "./nodes/node.js";

export interface WindowPredications {
  over(window?: unknown): Node;
}
