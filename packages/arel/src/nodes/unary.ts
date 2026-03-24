import { Node, NodeVisitor } from "./node.js";

/**
 * Unary — base class for nodes with a single expression.
 *
 * Mirrors: Arel::Nodes::Unary
 */
export class Unary extends Node {
  readonly expr: Node | string | number | null;

  constructor(expr: Node | string | number | null) {
    super();
    this.expr = expr;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Offset extends Unary {}
export class Limit extends Unary {}
export class Top extends Unary {}
export class Lock extends Unary {}
export class DistinctOn extends Unary {}
export class Bin extends Unary {}
export class On extends Unary {}
