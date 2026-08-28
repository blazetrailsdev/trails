import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { _setAnd, _setOr } from "../node-slots.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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

  fetchAttribute(block: (attr: Node) => boolean): boolean {
    return (
      this.children.length > 0 &&
      this.children.every((child) => Boolean(child.fetchAttribute(block)))
    );
  }

  hash(): number {
    return rbHash([this.constructor, this.children]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Nary &&
      this.constructor === other.constructor &&
      rbEqual(this.children, other.children)
    );
  }
}

export class And extends Nary {}

export class Or extends Nary {}

_setAnd(And);
_setOr(Or);

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Nary extends _AliasPredication {}
