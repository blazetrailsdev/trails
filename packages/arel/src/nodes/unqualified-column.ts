import { Unary } from "./unary.js";

export class UnqualifiedColumn extends Unary {
  get attribute() {
    return this.expr;
  }

  get relation(): unknown {
    return (this.expr as unknown as { relation: unknown })?.relation;
  }

  get column(): unknown {
    return (this.expr as unknown as { column: unknown })?.column;
  }

  get name(): unknown {
    return (this.expr as unknown as { name: unknown })?.name;
  }
}
