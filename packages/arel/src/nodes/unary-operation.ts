import { Node } from "./node.js";
import { Unary } from "./unary.js";

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
