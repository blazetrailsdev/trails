import { Unary } from "./unary.js";

export class Descending extends Unary {
  get direction(): "desc" {
    return "desc";
  }

  isAscending(): boolean {
    return false;
  }

  isDescending(): boolean {
    return true;
  }

  reverse(): Ascending {
    return new Ascending(this.expr);
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
