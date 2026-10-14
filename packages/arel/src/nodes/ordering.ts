import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Unary } from "./unary.js";
import type { Ascending } from "./ascending.js";
import type { Descending } from "./descending.js";

export class Ordering extends Unary {
  nullsFirst(): NullsFirst {
    return new NullsFirst(this);
  }

  nullsLast(): NullsLast {
    return new NullsLast(this);
  }
}

export class NullsFirst extends Unary {
  reverse(): NullsLast {
    const inner = this.expr as Ascending | Descending;
    return new NullsLast(inner.reverse());
  }
}

export class NullsLast extends Unary {
  reverse(): NullsFirst {
    const inner = this.expr as Ascending | Descending;
    return new NullsFirst(inner.reverse());
  }
}

rbModConstSet(Nodes, "Ordering", Ordering);
rbModConstSet(Nodes, "NullsFirst", NullsFirst);
rbModConstSet(Nodes, "NullsLast", NullsLast);
