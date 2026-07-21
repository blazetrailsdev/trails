import { Unary } from "./unary.js";

export class UnqualifiedColumn extends Unary {
  get attribute() {
    return this.expr;
  }

  get relation(): unknown {
    return (this.expr as { relation: unknown })?.relation;
  }

  get column(): unknown {
    return (this.expr as { column: unknown })?.column;
  }

  get name(): unknown {
    return (this.expr as { name: unknown })?.name;
  }
}
