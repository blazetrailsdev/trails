import { ArgumentError, rbEqual, rbHash } from "@blazetrails/activesupport";
import { arelNode } from "../arel.js";
import { objectClone } from "../clone-support.js";
import { Node } from "./node.js";

/**
 * Fragments — a list of nodes to be emitted in sequence.
 *
 * Mirrors: Arel::Nodes::Fragments
 */
export class Fragments extends Node {
  values: Node[];

  constructor(values: Node[] = []) {
    super();
    this.values = values;
  }

  // Mirrors Arel::Nodes::Fragments#hash (fragments.rb:17-19) — `[@values].hash`.
  hash(): number {
    return rbHash([this.values]);
  }

  // Mirrors Arel::Nodes::Fragments#eql? / #== (fragments.rb:28-32).
  eql(other: unknown): boolean {
    return (
      other instanceof Fragments &&
      this.constructor === other.constructor &&
      rbEqual(this.values, other.values)
    );
  }

  // Mirrors Arel::Nodes::Fragments#initialize_copy (fragments.rb:13-15), which
  // Ruby runs for `#clone`: the array itself is copied so a cloned Fragments
  // does not share it with the original.
  clone(): this {
    const copy = objectClone(this);
    copy.values = [...this.values];
    return copy;
  }

  // Mirrors Arel::Nodes::Fragments#+ (fragments.rb:22-26). Method-renamed to
  // `plus` because TS classes can't define an arithmetic operator, and the
  // param is `unknown` so the Rails guard stays reachable from typed callers
  // — the same shape BoundSqlLiteral#plus already uses.
  plus(other: unknown): Fragments {
    if (!arelNode(other)) {
      throw new ArgumentError("Expected Arel node");
    }
    return new Fragments([...this.values, other as Node]);
  }
}
