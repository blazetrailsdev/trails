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

  get children(): Node[] {
    return this.expr as Node[];
  }
}

/**
 * WithRecursive — WITH RECURSIVE clause.
 */
export class WithRecursive extends With {}
