import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";

/**
 * JoinSource — wraps the FROM table and an array of join clauses.
 *
 * Mirrors: Arel::Nodes::JoinSource
 */
export class JoinSource extends Binary {
  // Rails' JoinSource stores `joinop` (an array) as its `@right`; widen the
  // inherited `Binary#right` here to mirror that usage on the TS side.
  declare left: Node | null;
  declare right: Node[];

  constructor(left: Node | null, right: Node[] = []) {
    super(left, right);
    this.left = left;
    this.right = right;
  }

  isEmpty(): boolean {
    return !this.left && this.right.length === 0;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
