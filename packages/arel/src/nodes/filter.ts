import { Node } from "./node.js";
import { Binary } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Over } from "./over.js";

/**
 * Filter — FILTER (WHERE ...) clause for aggregate functions.
 *
 * Mirrors: Arel::Nodes::Filter (extends Binary)
 */
export class Filter extends Binary {
  constructor(left: Node, right: Node) {
    super(left, right);
  }

  over(windowOrName?: Node | string): Over {
    if (typeof windowOrName === "string") {
      return new Over(this, new SqlLiteral(`"${windowOrName}"`));
    }
    return new Over(this, windowOrName ?? null);
  }
}
