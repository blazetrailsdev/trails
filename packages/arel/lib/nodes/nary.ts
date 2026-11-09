import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { NodeExpression } from "./node-expression.js";
import type { ArelNode } from "../arel.js";
import type { NodeOrValue } from "./binary.js";
import type { Attribute } from "../attributes/attribute.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Nary extends NodeExpression {
  readonly children: NodeOrValue[];

  constructor(children: NodeOrValue[]) {
    super();
    this.children = children;
  }

  get left(): NodeOrValue | undefined {
    return this.children[0];
  }

  get right(): NodeOrValue | undefined {
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

constSet(Nodes, "And", And);
constSet(Nodes, "Or", Or);

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Nary extends _AliasPredication {}

constSet(Nodes, "Nary", Nary);
