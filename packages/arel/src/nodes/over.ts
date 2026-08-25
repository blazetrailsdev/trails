import { Binary, type NodeOrValue } from "./binary.js";

/**
 * Over node — OVER (window) clause.
 *
 * Mirrors: Arel::Nodes::Over (extends Binary)
 */
export class Over extends Binary {
  // Rails' `initialize(left, right = nil)` puts no constraint on either slot —
  // its own test seats bare Strings in both (`Over.new("foo", "bar")`,
  // test/cases/arel/nodes/over_test.rb:52-68) — and the
  // visitor branches on its runtime type, quoting a bare String window name
  // as an identifier and rendering a SqlLiteral bare (to_sql.rb:300-309).
  constructor(left: NodeOrValue, right: NodeOrValue = null) {
    super(left, right);
  }

  get operator(): string {
    return "OVER";
  }
}
