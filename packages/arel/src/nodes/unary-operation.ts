import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class UnaryOperation extends Unary<Node> {
  readonly operator: string;

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

rbSetClassPathString(UnaryOperation, Nodes, "UnaryOperation");
Nodes.UnaryOperation = UnaryOperation;
rbSetClassPathString(BitwiseNot, Nodes, "BitwiseNot");
Nodes.BitwiseNot = BitwiseNot;
