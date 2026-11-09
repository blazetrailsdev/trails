import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Unary } from "./unary.js";

export class ValuesList extends Unary {
  get rows(): unknown[][] {
    return this.expr as unknown[][];
  }
}

constSet(Nodes, "ValuesList", ValuesList);
