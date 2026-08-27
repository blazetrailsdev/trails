import { rbEqual, rbHash } from "@blazetrails/activesupport";
import type { NodeOrValue } from "./binary.js";
import { Function } from "./function.js";

export class NamedFunction extends Function {
  name: string;

  constructor(name: string, expr: NodeOrValue[], aliaz?: string) {
    super(expr, aliaz ?? null);
    this.name = name;
  }

  override hash(): number {
    return (super.hash() ^ rbHash(this.name)) >>> 0;
  }

  override eql(other: unknown): boolean {
    return super.eql(other) && rbEqual(this.name, (other as NamedFunction).name);
  }
}
