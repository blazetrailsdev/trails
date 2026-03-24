import { Node, NodeVisitor } from "./node.js";

export class Nary extends Node {
  readonly children: Node[];

  constructor(children: Node[]) {
    super();
    this.children = children;
  }

  get left(): Node | undefined {
    return this.children[0];
  }

  get right(): Node | undefined {
    return this.children[1];
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
