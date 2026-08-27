import { rbHash } from "@blazetrails/activesupport";
import { NodeExpression } from "./node-expression.js";

export class Distinct extends NodeExpression {
  // Mirrors Arel::Nodes::Distinct#hash / #eql? / #== (terminal.rb:5-13).
  hash(): number {
    return rbHash(this.constructor);
  }

  eql(other: unknown): boolean {
    return other instanceof Distinct && this.constructor === other.constructor;
  }
}
