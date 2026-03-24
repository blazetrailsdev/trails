import { Node, NodeVisitor } from "./node.js";

export class Exists extends Node {
  readonly expressions: Node;
  readonly alias: Node | null;

  constructor(expressions: Node, alias: Node | null = null) {
    super();
    this.expressions = expressions;
    this.alias = alias;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
