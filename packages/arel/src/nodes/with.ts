import { Node, NodeVisitor } from "./node.js";

/**
 * With — WITH clause for common table expressions.
 *
 * Mirrors: Arel::Nodes::With
 */
export class With extends Node {
  readonly children: Node[];

  constructor(children: Node[]) {
    super();
    this.children = children;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/**
 * WithRecursive — WITH RECURSIVE clause.
 */
export class WithRecursive extends With {}
