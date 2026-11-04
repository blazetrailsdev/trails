import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Unary } from "./unary.js";
import type { ArelNode } from "../arel.js";

export class UnaryOperation extends Unary<ArelNode> {
  readonly operator: string;

  constructor(operator: string, operand: ArelNode) {
    super(operand);
    this.operator = operator;
  }
}

export class BitwiseNot extends UnaryOperation {
  constructor(operand: ArelNode) {
    super("~", operand);
  }
}

constSet(Nodes, "UnaryOperation", UnaryOperation);
constSet(Nodes, "BitwiseNot", BitwiseNot);
