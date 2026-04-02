import { Node, NodeVisitor } from "./node.js";
import type { Attribute } from "../attributes/attribute.js";

export interface Nodes {
  buildQuoted(other: unknown, attribute?: unknown): Node;
}

/**
 * Casted — a value bound to a specific attribute for type casting.
 *
 * Mirrors: Arel::Nodes::Casted
 */
export class Casted extends Node {
  readonly value: unknown;
  readonly attribute: Attribute;

  constructor(value: unknown, attribute: Attribute) {
    super();
    this.value = value;
    this.attribute = attribute;
  }

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  valueForDatabase(): unknown {
    const attr = this.attribute as unknown as {
      isAbleToTypeCast?: () => boolean;
      typeCastForDatabase?: (v: unknown) => unknown;
    };
    if (attr?.isAbleToTypeCast?.() && attr.typeCastForDatabase) {
      return attr.typeCastForDatabase(this.value);
    }
    return this.value;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/**
 * Quoted — a value that will be quoted/escaped in the output SQL.
 *
 * Mirrors: Arel::Nodes::Quoted
 */
export class Quoted extends Node {
  readonly value: unknown;

  constructor(value: unknown) {
    super();
    this.value = value;
  }

  valueForDatabase(): unknown {
    return this.value;
  }

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  isInfinite(): number | null {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    return null;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
