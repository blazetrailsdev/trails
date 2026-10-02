import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { NodeExpression } from "./node-expression.js";
import type { ArelNode } from "../arel.js";
import type { Attribute } from "../attributes/attribute.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Nary extends NodeExpression {
  readonly children: ReturnType<typeof Nodes.buildQuoted>[];

  constructor(children: ReturnType<typeof Nodes.buildQuoted>[]) {
    super();
    this.children = children;
  }

  get left(): ReturnType<typeof Nodes.buildQuoted> | undefined {
    return this.children[0];
  }

  get right(): ReturnType<typeof Nodes.buildQuoted> | undefined {
    return this.children[1];
  }

  fetchAttribute(block: (attr: Attribute) => boolean): boolean {
    return (
      this.children.length > 0 &&
      this.children.every((child) =>
        Boolean((child as Exclude<ArelNode, Attribute>).fetchAttribute(block)),
      )
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

rbModConstSet(Nodes, "And", And);
rbModConstSet(Nodes, "Or", Or);

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Nary extends _AliasPredication {}

rbModConstSet(Nodes, "Nary", Nary);
