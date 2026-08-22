import { _setAnd, _setOr } from "../node-slots.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";

export class Nary extends NodeExpression {
  readonly children: Node[];

  constructor(children: Node[]) {
    super();
    this.children = children;
  }

  get left(): Node | undefined {
    return this.children[0];
  }

  get right(): Node | undefined {
    return this.children[1];
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    if (this.children.length === 0) return false;
    return this.children.every((child) => {
      if (typeof (child as unknown as { fetchAttribute: unknown }).fetchAttribute === "function") {
        return (
          child as unknown as { fetchAttribute(block: (attr: Node) => unknown): unknown }
        ).fetchAttribute(block);
      }
      return false;
    });
  }
}

/** Mirrors: `And = Class.new(Nary)` (nary.rb:36). */
export class And extends Nary {}

/** Mirrors: `Or = Class.new(Nary)` (nary.rb:37). */
export class Or extends Nary {}

_setAnd(And);
_setOr(Or);
