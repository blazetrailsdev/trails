import { Node, NodeVisitor } from "./node.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";

/**
 * Grouping node — wraps an expression in parentheses.
 *
 * Mirrors: Arel::Nodes::Grouping
 */
export class Grouping extends Node {
  readonly expr: Node;

  constructor(expr: Node) {
    super();
    this.expr = expr;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
