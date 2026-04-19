import { NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";

export class True extends NodeExpression {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
