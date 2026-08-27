import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class With extends Unary {
  constructor(children: Node[]) {
    super(children);
  }

  get children(): Array<{ toCte(): Node }> {
    return this.expr as Array<{ toCte(): Node }>;
  }
}

export class WithRecursive extends With {}
