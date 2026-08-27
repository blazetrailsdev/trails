import { Unary } from "./unary.js";

export class ValuesList extends Unary {
  constructor(rows: unknown[][]) {
    super(rows);
  }

  get rows(): unknown[][] {
    return this.expr as unknown[][];
  }
}
