import { Node } from "./node.js";
import { Unary } from "./unary.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";

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

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    if (
      this.expr &&
      typeof (this.expr as unknown as { fetchAttribute: unknown }).fetchAttribute === "function"
    ) {
      return (
        this.expr as unknown as { fetchAttribute(block: (attr: Node) => unknown): unknown }
      ).fetchAttribute(block);
    }
    return undefined;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName, { retryable: true }));
  }
}
