import { Node, NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";

export class Unary extends NodeExpression {
  readonly expr: Node | Node[] | string | number | null;

  constructor(expr: Node | Node[] | string | number | null) {
    super();
    this.expr = expr;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Offset extends Unary {}
export class Limit extends Unary {}
export class Top extends Unary {}
export class Lock extends Unary {}
export class DistinctOn extends Unary {}
export class Bin extends Unary {}
export class On extends Unary {}

export class Not extends Node {
  readonly expr: Node;

  constructor(expr: Node) {
    super();
    this.expr = expr;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Lateral extends Node {
  readonly subquery: Node;

  constructor(subquery: Node) {
    super();
    this.subquery = subquery;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class GroupingElement extends Node {
  readonly expressions: Node[];

  constructor(expressions: Node | Node[]) {
    super();
    this.expressions = Array.isArray(expressions) ? expressions : [expressions];
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Cube extends GroupingElement {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Rollup extends GroupingElement {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class GroupingSet extends GroupingElement {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Group extends Unary {}
/**
 * Rails' `Arel::Nodes::OptimizerHints` stores `[hint1, hint2, ...]` and the
 * visitor iterates them. The hints live on a dedicated typed field (rather
 * than on the now-`Node | Node[] | string | number | null` `expr`) so the
 * element type can be `string | SqlLiteral` instead of `Node`.
 */
export class OptimizerHints extends Unary {
  readonly hints: ReadonlyArray<string | import("./sql-literal.js").SqlLiteral>;

  constructor(hints: ReadonlyArray<string | import("./sql-literal.js").SqlLiteral>) {
    super(null);
    this.hints = hints;
  }
}
export class RollUp extends Rollup {}
