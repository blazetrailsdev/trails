import { NodeVisitor } from "./node.js";
import { Join } from "./binary.js";

export class FullOuterJoin extends Join {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
