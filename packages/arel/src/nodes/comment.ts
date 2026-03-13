import { Node, NodeVisitor } from "./node.js";

/**
 * SQL comment: appended as `/* ... *\/` to a query.
 *
 * Mirrors: Arel::Nodes::Comment
 */
export class Comment extends Node {
  readonly values: string[];

  constructor(...values: string[]) {
    super();
    this.values = values;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
