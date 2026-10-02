import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Ordering } from "./ordering.js";

export class Ascending extends Ordering {
  reverse(): Descending {
    return new Descending(this.expr);
  }

  get direction(): "asc" {
    return "asc";
  }

  isAscending(): boolean {
    return true;
  }

  isDescending(): boolean {
    return false;
  }
}

import { Descending } from "./descending.js";

rbModConstSet(Nodes, "Ascending", Ascending);
