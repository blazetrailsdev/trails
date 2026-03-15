import { Node, NodeVisitor } from "./node.js";

/**
 * Grouping element — wraps expressions in parentheses for GROUP BY dimensions.
 *
 * Mirrors: Arel::Nodes::GroupingElement
 */
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

/**
 * CUBE(...) grouping element for GROUP BY.
 *
 * Mirrors: Arel::Nodes::Cube
 */
export class Cube extends GroupingElement {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/**
 * ROLLUP(...) grouping element for GROUP BY.
 *
 * Mirrors: Arel::Nodes::RollUp
 */
export class Rollup extends GroupingElement {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/**
 * GROUPING SETS(...) grouping element for GROUP BY.
 *
 * Mirrors: Arel::Nodes::GroupingSet
 */
export class GroupingSet extends GroupingElement {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
