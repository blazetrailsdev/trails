import { Node } from "./node.js";
import { Binary } from "./binary.js";

/**
 * Over node — OVER (window) clause.
 *
 * Mirrors: Arel::Nodes::Over (extends Binary)
 */
export class Over extends Binary {
  // Rails' `initialize(left, right = nil)` puts no constraint on right; the
  // visitor branches on its runtime type, quoting a bare String window name
  // as an identifier and rendering a SqlLiteral bare (to_sql.rb:300-309).
  constructor(left: Node, right: Node | string | null = null) {
    super(left, right);
  }

  get operator(): string {
    return "OVER";
  }
}
