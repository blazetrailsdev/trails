import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Unary } from "./unary.js";

export class ValuesList extends Unary {
  constructor(rows: unknown[][]) {
    super(rows);
  }

  get rows(): unknown[][] {
    return this.expr as unknown[][];
  }
}

rbSetClassPathString(ValuesList, Nodes, "ValuesList");
Nodes.ValuesList = ValuesList;
