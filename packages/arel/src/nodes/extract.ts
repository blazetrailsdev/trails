import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class Extract extends Unary {
  field: string;

  constructor(expr: Node | Node[], field: string) {
    super(expr);
    this.field = field;
  }

  override hash(): number {
    return (super.hash() ^ rbHash(this.field)) >>> 0;
  }

  override eql(other: unknown): boolean {
    return super.eql(other) && rbEqual(this.field, (other as Extract).field);
  }
}
