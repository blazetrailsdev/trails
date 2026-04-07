import { Node } from "./node.js";
import { Binary } from "./binary.js";

/**
 * Over node — OVER (window) clause.
 *
 * Mirrors: Arel::Nodes::Over (extends Binary)
 */
export class Over extends Binary {
  constructor(left: Node, right: Node | null = null) {
    super(left, right);
  }

  get operator(): string {
    return "OVER";
  }
}
