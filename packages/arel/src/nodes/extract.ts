import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Unary } from "./unary.js";
import type { ArelNode } from "../arel.js";

export class Extract extends Unary {
  field: string;

  constructor(expr: ArelNode | ArelNode[], field: string) {
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

rbModConstSet(Nodes, "Extract", Extract);
