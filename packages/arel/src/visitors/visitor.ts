import { Node } from "../nodes/node.js";

export abstract class Visitor {
  constructor() {}

  accept(object: Node, collector?: unknown): unknown {
    return this.visit(object, collector);
  }

  protected abstract visit(object: Node, collector?: unknown): unknown;
}
