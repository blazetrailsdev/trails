import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
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

constSet(Nodes, "Ascending", Ascending);
