import { Unary } from "./unary.js";

/**
 * ValuesList — VALUES (...), (...), ...
 *
 * Mirrors: Arel::Nodes::ValuesList (extends Unary; rows stored in expr slot).
 * Rails carries arbitrary value objects in each row; the visitor delegates
 * rendering to `visitNodeOrValue`, so raw primitives flow through unwrapped.
 */
export class ValuesList extends Unary {
  constructor(rows: unknown[][]) {
    super(rows);
  }

  get rows(): unknown[][] {
    return this.expr as unknown[][];
  }
}
