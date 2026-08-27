import { rbEqual, rbHash } from "@blazetrails/activesupport";
import type { NodeOrValue } from "./binary.js";
import { Function } from "./function.js";

/**
 * NamedFunction — a SQL function call, e.g. COUNT(*), SUM(x).
 *
 * Mirrors: Arel::Nodes::NamedFunction
 */
export class NamedFunction extends Function {
  name: string;

  constructor(name: string, expr: NodeOrValue[], aliaz?: string) {
    super(expr, aliaz ?? null);
    this.name = name;
  }

  // Mirrors Arel::Nodes::NamedFunction#hash / #eql? / #== (named_function.rb:12-20).
  override hash(): number {
    return (super.hash() ^ rbHash(this.name)) >>> 0;
  }

  override eql(other: unknown): boolean {
    return super.eql(other) && rbEqual(this.name, (other as NamedFunction).name);
  }
}
