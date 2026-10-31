import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Function } from "./function.js";
import type { NodeOrValue } from "./binary.js";

export class Count extends Function {
  constructor(
    expr: NodeOrValue[] | NodeOrValue,
    distinct: boolean | null = false,
    aliaz: string | null = null,
  ) {
    super(expr, aliaz);
    this.distinct = distinct;
  }
}

constSet(Nodes, "Count", Count);
