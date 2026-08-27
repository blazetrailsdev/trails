import { rbHash } from "@blazetrails/activesupport";
import { NodeExpression } from "./node-expression.js";

export class True extends NodeExpression {
  // Mirrors Arel::Nodes::True#hash / #eql? / #== (true.rb:5-13).
  hash(): number {
    return rbHash(this.constructor);
  }

  eql(other: unknown): boolean {
    return other instanceof True && this.constructor === other.constructor;
  }
}
