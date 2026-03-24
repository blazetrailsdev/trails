import { Node, NodeVisitor } from "./node.js";

export class False extends Node {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
