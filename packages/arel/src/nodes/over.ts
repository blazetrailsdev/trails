import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Binary, type NodeOrValue } from "./binary.js";

export class Over extends Binary {
  constructor(left: NodeOrValue, right: NodeOrValue = null) {
    super(left, right);
  }

  get operator(): string {
    return "OVER";
  }
}

rbModConstSet(Nodes, "Over", Over);
