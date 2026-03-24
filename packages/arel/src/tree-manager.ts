import { Node } from "./nodes/node.js";

export abstract class TreeManager {
  abstract readonly ast: Node;
}
