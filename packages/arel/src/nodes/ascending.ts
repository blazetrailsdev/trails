import { Unary } from "./unary.js";

export class Ascending extends Unary {
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

// Lazy imports to avoid circular deps
import { Descending } from "./descending.js";
import { NullsFirst, NullsLast } from "./ordering.js";
