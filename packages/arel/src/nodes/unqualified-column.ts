import { Unary } from "./unary.js";

export class UnqualifiedColumn extends Unary {
  get attribute() {
    return this.expr;
  }
}
