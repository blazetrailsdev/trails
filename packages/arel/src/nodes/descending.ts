import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Ordering } from "./ordering.js";

export class Descending extends Ordering {
  reverse(): Ascending {
    return new Ascending(this.expr);
  }

  get direction(): "desc" {
    return "desc";
  }

  isAscending(): boolean {
    return false;
  }

  isDescending(): boolean {
    return true;
  }
}

import { Ascending } from "./ascending.js";

rbModConstSet(Nodes, "Descending", Descending);
