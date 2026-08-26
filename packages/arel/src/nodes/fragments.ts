import { ArgumentError } from "@blazetrails/activesupport";
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

  // Mirrors Arel::Nodes::Fragments#hash (fragments.rb:17-19) — `[@values].hash`,
  // so `values` alone keys it, not every field the way Node#hash does.
  override hash(): number {
    let h = 0x811c9dc5;
    for (const value of this.values) {
      const valueHash =
        value instanceof Node
          ? value.hash()
          : typeof value === "string"
            ? stringHash(value)
            : stringHash(String(value));
      h ^= valueHash;
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Mirrors Arel::Nodes::Fragments#eql? / #== (fragments.rb:28-32) — the class
  // and `values` alone, not Node#eql's serialization of every field.
  override eql(other: unknown): boolean {
    return (
      other instanceof Fragments &&
      this.constructor === other.constructor &&
      this.values.length === other.values.length &&
      this.values.every((value, i) => valueEql(value, other.values[i]))
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

  join(node: Node): Fragments {
    return new Fragments([...this.values, node]);
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

// Ruby `Array#==` compares elements with `==`, which on an arel node is its
// own `eql?` (node.rb aliases the two).
function valueEql(left: unknown, right: unknown): boolean {
  if (left instanceof Node) return left.eql(right);
  return left === right;
}

function stringHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
