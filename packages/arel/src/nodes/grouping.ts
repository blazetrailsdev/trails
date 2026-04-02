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

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    if (
      this.expr &&
      typeof (this.expr as unknown as { fetchAttribute: unknown }).fetchAttribute === "function"
    ) {
      return (
        this.expr as unknown as { fetchAttribute(block: (attr: Node) => unknown): unknown }
      ).fetchAttribute(block);
    }
    return undefined;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
