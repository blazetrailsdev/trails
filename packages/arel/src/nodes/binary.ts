import { rbObjClone, rbSetClassPathString } from "@blazetrails/ruby-compat";
import type { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import type { Temporal } from "@blazetrails/date";
import { include, rbEqual, rbHash } from "@blazetrails/activesupport";
import { Attributes, Nodes } from "../namespaces.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";
import { And, Or } from "./nary.js";
import { Not } from "./unary.js";
import { Grouping } from "./grouping.js";
import type { Cte } from "./cte.js";
import type { SelectManager } from "../select-manager.js";
import type { Table } from "../table.js";

export type NodeOrValue =
  | Node
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
  | Node[]
  | null;

export const FetchAttribute = {
  fetchAttribute(this: Binary, block: (attr: Node) => boolean): boolean | undefined {
    if (this.left instanceof Attributes.Attribute) return block(this.left as Node);
    if (this.right instanceof Attributes.Attribute) return block(this.right as Node);
    return undefined;
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Binary extends NodeExpression {
  left: NodeOrValue;
  right: NodeOrValue;

  constructor(left: NodeOrValue, right: NodeOrValue) {
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

  and(other: Node): And {
    return new And([this, other]);
  }

  or(other: Node): Grouping {
    return new Grouping(new Or([this, other]));
  }

  not(): Not {
    return new Not(this);
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
  declare left: Node | Table;
  declare right: Node | Table | null;

  constructor(left: Node | Table, right: Node | Table | null = null) {
    super(left, right);
  }
}

export class Union extends Binary {
  declare left: Node;
  declare right: Node;

  constructor(left: Node, right: Node) {
    super(left, right);
  }
}

export class UnionAll extends Binary {
  declare left: Node;
  declare right: Node;

  constructor(left: Node, right: Node) {
    super(left, right);
  }
}

export class Intersect extends Binary {
  declare left: Node;
  declare right: Node;

  constructor(left: Node, right: Node) {
    super(left, right);
  }
}

export class Except extends Binary {
  declare left: Node;
  declare right: Node;

  constructor(left: Node, right: Node) {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Binary extends _AliasPredication {}

rbSetClassPathString(Binary, Nodes, "Binary");
Nodes.Binary = Binary;
rbSetClassPathString(Assignment, Nodes, "Assignment");
Nodes.Assignment = Assignment;
rbSetClassPathString(As, Nodes, "As");
Nodes.As = As;
rbSetClassPathString(Between, Nodes, "Between");
Nodes.Between = Between;
rbSetClassPathString(NotEqual, Nodes, "NotEqual");
Nodes.NotEqual = NotEqual;
rbSetClassPathString(GreaterThan, Nodes, "GreaterThan");
Nodes.GreaterThan = GreaterThan;
rbSetClassPathString(GreaterThanOrEqual, Nodes, "GreaterThanOrEqual");
Nodes.GreaterThanOrEqual = GreaterThanOrEqual;
rbSetClassPathString(LessThan, Nodes, "LessThan");
Nodes.LessThan = LessThan;
rbSetClassPathString(LessThanOrEqual, Nodes, "LessThanOrEqual");
Nodes.LessThanOrEqual = LessThanOrEqual;
rbSetClassPathString(IsDistinctFrom, Nodes, "IsDistinctFrom");
Nodes.IsDistinctFrom = IsDistinctFrom;
rbSetClassPathString(IsNotDistinctFrom, Nodes, "IsNotDistinctFrom");
Nodes.IsNotDistinctFrom = IsNotDistinctFrom;
rbSetClassPathString(NotIn, Nodes, "NotIn");
Nodes.NotIn = NotIn;
rbSetClassPathString(Join, Nodes, "Join");
Nodes.Join = Join;
rbSetClassPathString(Union, Nodes, "Union");
Nodes.Union = Union;
rbSetClassPathString(UnionAll, Nodes, "UnionAll");
Nodes.UnionAll = UnionAll;
rbSetClassPathString(Intersect, Nodes, "Intersect");
Nodes.Intersect = Intersect;
rbSetClassPathString(Except, Nodes, "Except");
Nodes.Except = Except;
