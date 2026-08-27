import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { _Attribute, _Table, _setBuildQuoted } from "../node-slots.js";
import { Unary } from "./unary.js";
import type { Attribute } from "../attributes/attribute.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";

export function buildQuoted(other: unknown, attribute?: unknown): Node {
  if (other instanceof Node) return other;
  if (other && typeof other === "object") {
    if (_Attribute && other instanceof _Attribute) return other as Node;
    if (_Table && other instanceof _Table) return other as unknown as Node;
    if (other instanceof ModelAttribute) return other as unknown as Node;
    const maybeAst = (other as { ast?: unknown }).ast;
    if (maybeAst instanceof Node) return other as Node;
  }
  if (_Attribute && attribute instanceof _Attribute) return new Casted(other, attribute);
  return new Quoted(other);
}

_setBuildQuoted(buildQuoted);

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
    const v = this.value as { isInfinite?: () => 1 | -1 | false } | null | undefined;
    return typeof v?.isInfinite === "function" ? v.isInfinite() : false;
  }

  get value(): unknown {
    return this.expr;
  }
}
