import { Node, NodeVisitor } from "./node.js";

/**
 * Fragments — a list of nodes to be emitted in sequence.
 *
 * Mirrors: Arel::Nodes::Fragments
 */
export class Fragments extends Node {
  readonly values: Node[];

  constructor(values: Node[]) {
    super();
    this.values = values;
  }

  join(node: Node): Fragments {
    return new Fragments([...this.values, node]);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
