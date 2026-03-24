import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { And } from "./and.js";
import { Or } from "./or.js";
import { Not } from "./unary.js";
import { Grouping } from "./grouping.js";
import { Cte } from "./cte.js";

export type NodeOrValue = Node | string | number | boolean | bigint | Date | null | undefined;

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
    return new Grouping(new Or(this, other));
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

export class Between extends Binary {}
export class NotEqual extends Binary {}
export class GreaterThan extends Binary {}
export class GreaterThanOrEqual extends Binary {}
export class LessThan extends Binary {}
export class LessThanOrEqual extends Binary {}

export class IsDistinctFrom extends Binary {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class IsNotDistinctFrom extends Binary {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class NotIn extends Binary {}

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
