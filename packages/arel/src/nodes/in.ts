import { Binary, NotIn, fetchAttributeFromBinary } from "./binary.js";
import type { Node } from "./node.js";

export class In extends Binary {
  isEquality(): boolean {
    return true;
  }

  invert(): Node {
    return new NotIn(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}
