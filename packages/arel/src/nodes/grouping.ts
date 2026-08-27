import { _setGrouping } from "../node-slots.js";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

/**
 * Grouping node — wraps an expression in parentheses.
 *
 * Mirrors: Arel::Nodes::Grouping (extends Unary)
 */
export class Grouping extends Unary {
  // `expr` is an array for a composite-key row-value tuple `(pk1, pk2)`
  // (Rails wraps `o.key` — which may be an array of columns — in a Grouping).
  constructor(expr: Node | Node[]) {
    super(expr);
  }

  // Mirrors: Arel::Nodes::Grouping#fetch_attribute (grouping.rb:6-8) —
  // `expr.fetch_attribute(&block)`, delegated bare.
  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return (
      this.expr as { fetchAttribute(block: (attr: Node) => unknown): unknown }
    ).fetchAttribute(block);
  }
}

_setGrouping(Grouping);
