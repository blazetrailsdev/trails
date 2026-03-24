import { Node, NodeVisitor } from "./node.js";

export class HomogeneousIn extends Node {
  readonly attribute: Node;
  readonly values: unknown[];
  readonly type: "in" | "notin";

  constructor(values: unknown[], attribute: Node, type: "in" | "notin") {
    super();
    this.values = values;
    this.attribute = attribute;
    this.type = type;
  }

  isEquality(): boolean {
    return this.type === "in";
  }

  invert(): HomogeneousIn {
    return new HomogeneousIn(this.values, this.attribute, this.type === "in" ? "notin" : "in");
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
