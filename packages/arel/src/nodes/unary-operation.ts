import { Node, NodeVisitor } from "./node.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Ascending } from "./ascending.js";
import { Descending } from "./descending.js";

/**
 * UnaryOperation — a prefix or postfix unary operation.
 *
 * Mirrors: Arel::Nodes::UnaryOperation
 */
export class UnaryOperation extends Node {
  readonly operator: string;
  readonly operand: Node;

  constructor(operator: string, operand: Node) {
    super();
    this.operator = operator;
    this.operand = operand;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  asc(): Ascending {
    return new Ascending(this);
  }

  desc(): Descending {
    return new Descending(this);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
