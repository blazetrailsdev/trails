import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import { Unary } from "./unary.js";

export class With extends Unary {
  get children(): Array<{ toCte(): Node }> {
    return this.expr as Array<{ toCte(): Node }>;
  }
}

export class WithRecursive extends With {}

constSet(Nodes, "With", With);
constSet(Nodes, "WithRecursive", WithRecursive);
