import { Node, NodeVisitor } from "./node.js";

/**
 * Window — a SQL window specification for OVER clauses.
 *
 * Mirrors: Arel::Nodes::Window
 */
export class Window extends Node {
  orders: Node[];
  partitions: Node[];
  framing: Node | null;

  constructor() {
    super();
    this.orders = [];
    this.partitions = [];
    this.framing = null;
  }

  order(...exprs: Node[]): this {
    this.orders.push(...exprs);
    return this;
  }

  partition(...exprs: Node[]): this {
    this.partitions.push(...exprs);
    return this;
  }

  frame(node: Node): this {
    this.framing = node;
    return this;
  }

  rows(expr: Node | null = null): Rows | this {
    if (this.framing) {
      return new Rows(expr);
    }
    this.frame(new Rows(expr));
    return this;
  }

  range(expr: Node | null = null): Range | this {
    if (this.framing) {
      return new Range(expr);
    }
    this.frame(new Range(expr));
    return this;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/**
 * NamedWindow — a named window definition (WINDOW w AS (...))
 */
export class NamedWindow extends Window {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }
}

/** Row-based frame bounds */
export class Preceding extends Node {
  readonly expr: Node | null;
  constructor(expr: Node | null = null) {
    super();
    this.expr = expr;
  }
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Following extends Node {
  readonly expr: Node | null;
  constructor(expr: Node | null = null) {
    super();
    this.expr = expr;
  }
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class CurrentRow extends Node {
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Rows extends Node {
  readonly expr: Node | null;
  constructor(expr: Node | null = null) {
    super();
    this.expr = expr;
  }
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Range extends Node {
  readonly expr: Node | null;
  constructor(expr: Node | null = null) {
    super();
    this.expr = expr;
  }
  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
