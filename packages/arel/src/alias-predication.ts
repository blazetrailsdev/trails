import type { Node } from "./nodes/node.js";

export interface AliasPredication {
  as(aliasName: string): Node;
}
