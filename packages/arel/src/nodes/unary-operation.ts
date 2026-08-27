import { Node } from "./node.js";
import { Unary } from "./unary.js";

/**
 * UnaryOperation — a prefix or postfix unary operation.
 *
 * Mirrors: Arel::Nodes::UnaryOperation
 *
 * Predications + Math come from `Unary extends NodeExpression` via the
 * mixins wired in index.ts.
 */
export class UnaryOperation extends Unary {
  readonly operator: string;
  declare expr: Node;

  constructor(operator: string, operand: Node) {
    super(operand);
    this.operator = operator;
  }
}

export class BitwiseNot extends UnaryOperation {
  constructor(operand: Node) {
    super("~", operand);
  }
}
