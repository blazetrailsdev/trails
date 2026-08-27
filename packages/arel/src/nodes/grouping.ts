import { _setGrouping } from "../node-slots.js";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class Grouping extends Unary {
  constructor(expr: Node | Node[]) {
    super(expr);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return (
      this.expr as { fetchAttribute(block: (attr: Node) => unknown): unknown }
    ).fetchAttribute(block);
  }
}

_setGrouping(Grouping);
