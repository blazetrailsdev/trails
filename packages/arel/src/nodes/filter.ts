import { Node, NodeVisitor } from "./node.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Over } from "./over.js";

/**
 * Filter — FILTER (WHERE ...) clause for aggregate functions.
 *
 * Mirrors: Arel::Nodes::Filter
 */
export class Filter extends Node {
  readonly expression: Node;
  readonly filter: Node;

  constructor(expression: Node, filter: Node) {
    super();
    this.expression = expression;
    this.filter = filter;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  over(windowOrName?: Node | string): Over {
    if (typeof windowOrName === "string") {
      return new Over(this, new SqlLiteral(`"${windowOrName}"`));
    }
    return new Over(this, windowOrName ?? null);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
