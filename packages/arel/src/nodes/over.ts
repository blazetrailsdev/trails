import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Binary, type NodeOrValue } from "./binary.js";

export class Over extends Binary {
  constructor(left: NodeOrValue, right: NodeOrValue = null) {
    super(left, right);
  }

  get operator(): string {
    return "OVER";
  }
}

rbSetClassPathString(Over, Nodes, "Over");
Nodes.Over = Over;
