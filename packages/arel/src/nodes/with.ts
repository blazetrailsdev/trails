import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class With extends Unary {
  get children(): Array<{ toCte(): Node }> {
    return this.expr as Array<{ toCte(): Node }>;
  }
}

export class WithRecursive extends With {}

rbModConstSet(Nodes, "With", With);
rbModConstSet(Nodes, "WithRecursive", WithRecursive);
