import { rbHash } from "@blazetrails/activesupport";
import { NodeExpression } from "./node-expression.js";

export class False extends NodeExpression {
  hash(): number {
    return rbHash(this.constructor);
  }

  eql(other: unknown): boolean {
    return other instanceof False && this.constructor === other.constructor;
  }
}
