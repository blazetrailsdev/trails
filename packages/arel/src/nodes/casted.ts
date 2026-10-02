import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { rbModConstSet, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { Arel, Attributes, Nodes } from "../namespaces.js";
import { Unary } from "./unary.js";
import type { Attribute } from "../attributes/attribute.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import type { ArelNode } from "../arel.js";

export function buildQuoted(other: unknown, attribute?: unknown): ArelNode {
  if (
    other instanceof Node ||
    other instanceof Attributes.Attribute ||
    other instanceof Arel.Table ||
    other instanceof Arel.SelectManager ||
    other instanceof ModelAttribute
  )
    return other as ArelNode;
  if (attribute instanceof Attributes.Attribute) return new Casted(other, attribute);
  return new Quoted(other);
}

Nodes.buildQuoted = buildQuoted;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Casted extends NodeExpression {
  readonly value: unknown;
  readonly attribute: Attribute;

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  constructor(value: unknown, attribute: Attribute) {
    super();
    this.value = value;
    this.attribute = attribute;
  }

  isNil(): boolean {
    return this.value === null || this.value === undefined;
  }

  valueForDatabase(): unknown {
    if (this.attribute.isAbleToTypeCast()) {
      return this.attribute.typeCastForDatabase(this.value);
    }
    return this.value;
  }

  hash(): number {
    return rbHash([this.constructor, this.value, this.attribute]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Casted &&
      this.constructor === other.constructor &&
      rbEqual(this.value, other.value) &&
      rbEqual(this.attribute, other.attribute)
    );
  }
}

export class Quoted extends Unary {
  constructor(value: unknown) {
    super(value);
  }

  valueForDatabase(): unknown {
    return this.value;
  }

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  isNil(): boolean {
    return this.value === null || this.value === undefined;
  }

  isInfinite(): 1 | -1 | false {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    const value = this.value as { isInfinite(): 1 | -1 | false };
    return rbObjRespondTo(value, "isInfinite") && value.isInfinite();
  }

  get value(): unknown {
    return this.expr;
  }
}

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Casted extends _AliasPredication {}

rbModConstSet(Nodes, "Quoted", Quoted);
rbModConstSet(Nodes, "Casted", Casted);
