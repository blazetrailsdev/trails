import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { And } from "./and.js";
import { Or } from "./or.js";
import { Not } from "./not.js";
import { Grouping } from "./grouping.js";
import { Cte } from "./cte.js";

export type NodeOrValue = Node | string | number | boolean | bigint | Date | null | undefined;

/**
 * Binary — base class for nodes with left and right operands.
 *
 * Mirrors: Arel::Nodes::Binary
 */
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

/** Assignment: column = value */
export class Assignment extends Binary {}

/** As: expr AS alias */
export class As extends Binary {
  toCte(): Cte {
    const name =
      this.right instanceof SqlLiteral ? (this.right as SqlLiteral).value : String(this.right);
    return new Cte(name, this.left as Node);
  }
}

/** Between: expr BETWEEN left AND right */
export class Between extends Binary {}

/** Comparison predicates */
export class NotEqual extends Binary {}
export class GreaterThan extends Binary {}
export class GreaterThanOrEqual extends Binary {}
export class LessThan extends Binary {}
export class LessThanOrEqual extends Binary {}

/** IS DISTINCT FROM / IS NOT DISTINCT FROM */
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
