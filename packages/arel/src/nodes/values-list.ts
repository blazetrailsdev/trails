import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Unary } from "./unary.js";

export class ValuesList extends Unary {
  get rows(): unknown[][] {
    return this.expr as unknown[][];
  }
}

rbModConstSet(Nodes, "ValuesList", ValuesList);
