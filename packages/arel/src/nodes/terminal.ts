import { Node, NodeVisitor } from "./node.js";

export class Distinct extends Node {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
