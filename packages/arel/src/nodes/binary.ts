import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import type { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import type { Temporal } from "@blazetrails/date";
import { include, rbEqual, rbHash } from "@blazetrails/activesupport";
import { Attributes, Nodes } from "../namespaces.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";
import type { Cte } from "./cte.js";
import type { SelectManager } from "../select-manager.js";
import type { Table } from "../table.js";
import type { ArelNode } from "../arel.js";
import type { Attribute } from "../attributes/attribute.js";

export type NodeOrValue =
  | ArelNode
  | ModelAttribute
  | SelectManager
  | Table
  | string
  | number
  | bigint
  | boolean
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime
  | ArelNode[]
  | null;

export const FetchAttribute = {
  fetchAttribute(this: Binary, block: (attr: Attribute) => boolean): boolean | undefined {
    if (this.left instanceof Attributes.Attribute) return block(this.left);
    if (this.right instanceof Attributes.Attribute) return block(this.right);
    return undefined;
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Binary<L = NodeOrValue, R = NodeOrValue> extends NodeExpression {
  constructor(left: L, right: R) {
    super();
    this.left = left;
    this.right = right;
  }

  hash(): number {
    return rbHash([this.constructor, this.left, this.right]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Binary &&
      this.constructor === other.constructor &&
      rbEqual(this.left, other.left) &&
      rbEqual(this.right, other.right)
    );
  }

  initializeCopy(_other: Binary): void {
    if (this.left != null) this.left = rbObjClone(this.left);
    if (this.right != null) this.right = rbObjClone(this.right);
  }
}

export class As extends Binary {
  toCte(): Cte {
    return new Nodes.Cte((this.left as { name: string | SqlLiteral }).name, this.right as Node);
  }
}

export class Between extends Binary {}

export class GreaterThan extends Binary {
  invert(): Node {
    return new LessThanOrEqual(this.left, this.right);
  }
}

export class GreaterThanOrEqual extends Binary {
  invert(): Node {
    return new LessThan(this.left, this.right);
  }
}

export class LessThan extends Binary {
  invert(): Node {
    return new GreaterThanOrEqual(this.left, this.right);
  }
}

export class LessThanOrEqual extends Binary {
  invert(): Node {
    return new GreaterThan(this.left, this.right);
  }
}

export class IsDistinctFrom extends Binary {
  invert(): Node {
    return new IsNotDistinctFrom(this.left, this.right);
  }
}

export class IsNotDistinctFrom extends Binary {
  invert(): Node {
    return new IsDistinctFrom(this.left, this.right);
  }
}

export class NotEqual extends Binary {
  invert(): Node {
    return new Nodes.Equality(this.left, this.right);
  }
}

export class NotIn extends Binary {
  invert(): Node {
    return new Nodes.In(this.left, this.right);
  }
}

export class Assignment extends Binary {}

export abstract class Join extends Binary {
  declare left: ArelNode | Table;
  declare right: ArelNode | Table | null;

  constructor(left: ArelNode | Table, right: ArelNode | Table | null = null) {
    super(left, right);
  }
}

export class Union extends Binary {
  declare left: ArelNode;
  declare right: ArelNode;

  constructor(left: ArelNode, right: ArelNode) {
    super(left, right);
  }
}

export class UnionAll extends Binary {
  declare left: ArelNode;
  declare right: ArelNode;

  constructor(left: ArelNode, right: ArelNode) {
    super(left, right);
  }
}

export class Intersect extends Binary {
  declare left: ArelNode;
  declare right: ArelNode;

  constructor(left: ArelNode, right: ArelNode) {
    super(left, right);
  }
}

export class Except extends Binary {
  declare left: ArelNode;
  declare right: ArelNode;

  constructor(left: ArelNode, right: ArelNode) {
    super(left, right);
  }
}

type Includable = new (...args: unknown[]) => object;
const fetchAttributeModule = FetchAttribute as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;
include(Between as unknown as Includable, fetchAttributeModule);
include(NotEqual as unknown as Includable, fetchAttributeModule);
include(GreaterThan as unknown as Includable, fetchAttributeModule);
include(GreaterThanOrEqual as unknown as Includable, fetchAttributeModule);
include(LessThan as unknown as Includable, fetchAttributeModule);
include(LessThanOrEqual as unknown as Includable, fetchAttributeModule);
include(IsDistinctFrom as unknown as Includable, fetchAttributeModule);
include(IsNotDistinctFrom as unknown as Includable, fetchAttributeModule);
include(NotIn as unknown as Includable, fetchAttributeModule);

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
export interface Binary<L = NodeOrValue, R = NodeOrValue> extends _AliasPredication {
  left: L;
  right: R;
}

rbModConstSet(Nodes, "Binary", Binary);
rbModConstSet(Nodes, "Assignment", Assignment);
rbModConstSet(Nodes, "As", As);
rbModConstSet(Nodes, "Between", Between);
rbModConstSet(Nodes, "NotEqual", NotEqual);
rbModConstSet(Nodes, "GreaterThan", GreaterThan);
rbModConstSet(Nodes, "GreaterThanOrEqual", GreaterThanOrEqual);
rbModConstSet(Nodes, "LessThan", LessThan);
rbModConstSet(Nodes, "LessThanOrEqual", LessThanOrEqual);
rbModConstSet(Nodes, "IsDistinctFrom", IsDistinctFrom);
rbModConstSet(Nodes, "IsNotDistinctFrom", IsNotDistinctFrom);
rbModConstSet(Nodes, "NotIn", NotIn);
rbModConstSet(Nodes, "Join", Join);
rbModConstSet(Nodes, "Union", Union);
rbModConstSet(Nodes, "UnionAll", UnionAll);
rbModConstSet(Nodes, "Intersect", Intersect);
rbModConstSet(Nodes, "Except", Except);
