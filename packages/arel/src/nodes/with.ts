import { Node } from "./node.js";
import { Unary } from "./unary.js";

/**
 * With — WITH clause for common table expressions.
 *
 * Mirrors: Arel::Nodes::With (extends Unary; children stored in expr slot)
 */
export class With extends Unary {
  constructor(children: Node[]) {
    super(children);
  }

  // Every element is a Cte / As / TableAlias — the visitor calls `child.to_cte`
  // unconditionally (to_sql.rb:1026), so a child that cannot answer it is a
  // malformed WITH clause, not a case to fall back on.
  get children(): Array<{ toCte(): Node }> {
    return this.expr as Array<{ toCte(): Node }>;
  }
}

/**
 * WithRecursive — WITH RECURSIVE clause.
 */
export class WithRecursive extends With {}
