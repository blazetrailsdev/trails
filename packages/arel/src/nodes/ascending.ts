import { Ordering } from "./ordering.js";

export class Ascending extends Ordering {
  get direction(): "asc" {
    return "asc";
  }

  isAscending(): boolean {
    return true;
  }

  isDescending(): boolean {
    return false;
  }

  reverse(): Descending {
    return new Descending(this.expr);
  }

  nullsFirst(): NullsFirst {
    return new NullsFirst(this);
  }

  nullsLast(): NullsLast {
    return new NullsLast(this);
  }
}

import { Descending } from "./descending.js";
import { NullsFirst, NullsLast } from "./ordering.js";
