import { Node, NodeVisitor } from "./node.js";

export class Over extends Node {
  readonly left: Node;
  readonly right: Node | null;

  constructor(left: Node, right: Node | null = null) {
    super();
    this.left = left;
    this.right = right;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
