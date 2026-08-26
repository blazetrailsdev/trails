import { Node } from "./node.js";

/**
 * Fragments — a list of nodes to be emitted in sequence.
 *
 * Mirrors: Arel::Nodes::Fragments
 */
export class Fragments extends Node {
  readonly values: Node[];

  constructor(values: Node[] = []) {
    super();
    this.values = values;
  }

  join(node: Node): Fragments {
    return new Fragments([...this.values, node]);
  }

  // Mirrors Arel::Nodes::Fragments#+ (fragments.rb:22-26). Method-renamed to
  // `plus` because TS classes can't define an arithmetic operator, and the
  // param is `unknown` so the Rails guard stays reachable from typed callers
  // — the same shape BoundSqlLiteral#plus already uses.
  plus(other: unknown): Fragments {
    if (!(other instanceof Node)) {
      throw new TypeError("Expected Arel node");
    }
    return new Fragments([...this.values, other]);
  }
}
