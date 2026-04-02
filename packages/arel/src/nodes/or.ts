import { Node } from "./node.js";
import { Nary } from "./nary.js";

/**
 * OR node — represents a disjunction.
 * In Rails, Or = Class.new(Nary), so it stores children[].
 *
 * Mirrors: Arel::Nodes::Or
 */
export class Or extends Nary {
  constructor(children: Node[]);
  constructor(left: Node, right: Node);
  constructor(childrenOrLeft: Node[] | Node, right?: Node) {
    if (Array.isArray(childrenOrLeft)) {
      super(childrenOrLeft);
    } else {
      if (right === undefined) {
        throw new TypeError(
          "Or requires both left and right when constructed with individual arguments",
        );
      }
      super([childrenOrLeft, right]);
    }
  }
}
