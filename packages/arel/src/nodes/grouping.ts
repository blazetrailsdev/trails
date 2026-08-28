import { _setGrouping } from "../node-slots.js";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class Grouping extends Unary {
  constructor(expr: Node | Node[]) {
    super(expr);
  }

  fetchAttribute(block: (attr: Node) => boolean): boolean | undefined {
    return (
      this.expr as { fetchAttribute(block: (attr: Node) => boolean): boolean | undefined }
    ).fetchAttribute(block);
  }
}

_setGrouping(Grouping);
