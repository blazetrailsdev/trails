import { Node } from "./node.js";
import { Function } from "./function.js";

export class Count extends Function {
  constructor(expr: Node | Node[], distinct: boolean | null = false, aliaz: string | null = null) {
    super(Array.isArray(expr) ? expr : [expr], aliaz);
    this.distinct = distinct;
  }
}
