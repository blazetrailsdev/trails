import { Node } from "./node.js";
import { Unary } from "./unary.js";

/**
 * ValuesList — VALUES (...), (...), ...
 *
 * Mirrors: Arel::Nodes::ValuesList (extends Unary)
 */
export class ValuesList extends Unary {
  readonly rows: Node[][];

  constructor(rows: Node[][]) {
    super(null);
    this.rows = rows;
  }
}
