import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { And } from "./and.js";
import { Or } from "./or.js";
import { Not } from "./unary.js";
import { Grouping } from "./grouping.js";
import { Cte } from "./cte.js";

export type NodeOrValue = Node | string | number | boolean | bigint | Date | null | undefined;

export const ATTRIBUTE_BRAND = Symbol.for("arel.Attribute");

function isAttribute(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  return (node as Record<symbol, unknown>)[ATTRIBUTE_BRAND] === true;
}

export function fetchAttributeFromBinary(
  left: NodeOrValue,
  right: NodeOrValue,
  block: (attr: Node) => unknown,
): unknown {
  if (isAttribute(left)) return block(left as Node);
  if (isAttribute(right)) return block(right as Node);
  return undefined;
}

export class Binary extends Node {
  left: NodeOrValue;
  right: NodeOrValue;

  constructor(left: NodeOrValue, right: NodeOrValue) {
    super();
    this.left = left;
    this.right = right;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  and(other: Node): And {
    return new And([this, other]);
  }

  or(other: Node): Grouping {
    return new Grouping(new Or([this, other]));
  }

  not(): Not {
    return new Not(this);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Assignment extends Binary {}

export class As extends Binary {
  toCte(): Cte {
    const name =
      this.right instanceof SqlLiteral ? (this.right as SqlLiteral).value : String(this.right);
    return new Cte(name, this.left as Node);
  }
}

export class Between extends Binary {
  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class NotEqual extends Binary {
  invert(): Node {
    if (!_invertRegistry.Equality) {
      throw new Error(
        'NotEqual.invert() requires the inversion registry. Import from "@blazetrails/arel" instead of deep-importing node classes.',
      );
    }
    return new _invertRegistry.Equality(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class GreaterThan extends Binary {
  invert(): Node {
    return new LessThanOrEqual(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class GreaterThanOrEqual extends Binary {
  invert(): Node {
    return new LessThan(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class LessThan extends Binary {
  invert(): Node {
    return new GreaterThanOrEqual(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class LessThanOrEqual extends Binary {
  invert(): Node {
    return new GreaterThan(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

export class IsDistinctFrom extends Binary {
  invert(): Node {
    return new IsNotDistinctFrom(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class IsNotDistinctFrom extends Binary {
  invert(): Node {
    return new IsDistinctFrom(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class NotIn extends Binary {
  invert(): Node {
    if (!_invertRegistry.In) {
      throw new Error(
        'NotIn.invert() requires the inversion registry. Import from "@blazetrails/arel" instead of deep-importing node classes.',
      );
    }
    return new _invertRegistry.In(this.left, this.right);
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    return fetchAttributeFromBinary(this.left, this.right, block);
  }
}

/** Join base class — Rails defines via const_set in binary.rb */
export abstract class Join extends Node {
  readonly left: Node;
  readonly right: Node | null;

  constructor(left: Node, right: Node | null = null) {
    super();
    this.left = left;
    this.right = right;
  }
}

export class CrossJoin extends Join {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/** Set operations — Rails defines via const_set in binary.rb */
export class Union extends Node {
  readonly left: Node;
  readonly right: Node;

  constructor(left: Node, right: Node) {
    super();
    this.left = left;
    this.right = right;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class UnionAll extends Node {
  readonly left: Node;
  readonly right: Node;

  constructor(left: Node, right: Node) {
    super();
    this.left = left;
    this.right = right;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Intersect extends Node {
  readonly left: Node;
  readonly right: Node;

  constructor(left: Node, right: Node) {
    super();
    this.left = left;
    this.right = right;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

// Registry for breaking circular deps (Equality→Binary, In→Binary)
const _invertRegistry: {
  Equality?: new (left: NodeOrValue, right: NodeOrValue) => Binary;
  In?: new (left: NodeOrValue, right: NodeOrValue) => Binary;
} = {};

export function registerBinaryInversions(deps: {
  Equality: new (left: NodeOrValue, right: NodeOrValue) => Binary;
  In: new (left: NodeOrValue, right: NodeOrValue) => Binary;
}): void {
  _invertRegistry.Equality = deps.Equality;
  _invertRegistry.In = deps.In;
}

export interface FetchAttribute {
  fetchAttribute(block: (attr: Node) => unknown): unknown;
}

export class Except extends Node {
  readonly left: Node;
  readonly right: Node;

  constructor(left: Node, right: Node) {
    super();
    this.left = left;
    this.right = right;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
