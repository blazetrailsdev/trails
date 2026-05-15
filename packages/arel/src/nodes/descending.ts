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

  nullsFirst(): NullsFirst {
    return new NullsFirst(this);
  }

  nullsLast(): NullsLast {
    return new NullsLast(this);
  }
}

import { Ascending } from "./ascending.js";
import { NullsFirst, NullsLast } from "./ordering.js";
