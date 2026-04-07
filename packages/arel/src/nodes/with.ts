import { Node } from "./node.js";
import { Unary } from "./unary.js";

/**
 * With — WITH clause for common table expressions.
 *
 * Mirrors: Arel::Nodes::With (extends Unary)
 */
export class With extends Unary {
  readonly children: Node[];

  constructor(children: Node[]) {
    super(null);
    this.children = children;
  }
}

/**
 * WithRecursive — WITH RECURSIVE clause.
 */
export class WithRecursive extends With {}
