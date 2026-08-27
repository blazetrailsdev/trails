import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

/**
 * Represents EXTRACT(field FROM expr).
 *
 * Mirrors: Arel::Nodes::Extract (extends Unary)
 */
export class Extract extends Unary {
  field: string;

  constructor(expr: Node | Node[], field: string) {
    super(expr);
    this.field = field;
  }

  // Mirrors Arel::Nodes::Extract#hash / #eql? / #== (extract.rb:12-21).
  override hash(): number {
    return (super.hash() ^ rbHash(this.field)) >>> 0;
  }

  override eql(other: unknown): boolean {
    return super.eql(other) && rbEqual(this.field, (other as Extract).field);
  }
}
