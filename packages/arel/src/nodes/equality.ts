import { Binary, NotEqual, fetchAttributeFromBinary } from "./binary.js";
import type { Node } from "./node.js";

export class Equality extends Binary {
  isEquality(): boolean {
    return true;
  }

  invert(): Node {
    return new NotEqual(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}
