import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Unary } from "./unary.js";

export class ValuesList extends Unary {
  get rows(): unknown[][] {
    return this.expr as unknown[][];
  }
}

rbSetClassPathString(ValuesList, Nodes, "ValuesList");
Nodes.ValuesList = ValuesList;
