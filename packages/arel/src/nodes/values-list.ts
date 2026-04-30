import { Unary } from "./unary.js";

/**
 * ValuesList — VALUES (...), (...), ...
 *
 * Mirrors: Arel::Nodes::ValuesList (extends Unary). Rails carries
 * arbitrary value objects in each row; the visitor delegates rendering
 * to `visitNodeOrValue`, so raw primitives flow through unwrapped.
 */
export class ValuesList extends Unary {
  readonly rows: unknown[][];

  constructor(rows: unknown[][]) {
    super(null);
    this.rows = rows;
  }
}
