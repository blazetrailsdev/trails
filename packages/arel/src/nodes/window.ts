import { Node } from "./node.js";
import { Unary } from "./unary.js";
import { SqlLiteral } from "./sql-literal.js";

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

  order(...expr: (Node | string)[]): this {
    this.orders.push(...expr.map((x) => (typeof x === "string" ? new SqlLiteral(x) : x)));
    return this;
  }

  partition(...expr: (Node | string)[]): this {
    this.partitions.push(...expr.map((x) => (typeof x === "string" ? new SqlLiteral(x) : x)));
    return this;
  }

  /**
   * Mirrors `frame` (nodes/window.rb:30-32), whose value is the assignment —
   * the framing node itself, which `rows`/`range` hand back to their caller.
   */
  frame(expr: Node): Node {
    this.framing = expr;
    return expr;
  }

  rows(expr: Node | null = null): Node {
    if (this.framing) {
      return new Rows(expr);
    } else {
      return this.frame(new Rows(expr));
    }
  }

  range(expr: Node | null = null): Node {
    if (this.framing) {
      return new Range(expr);
    } else {
      return this.frame(new Range(expr));
    }
  }
}

/**
 * NamedWindow — a named window definition (WINDOW w AS (...))
 */
export class NamedWindow extends Window {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }
}

// Row-based frame bounds. Mirrors Rails (window.rb): `Preceding`,
// `Following`, `Rows`, `Range` all extend Unary; only `CurrentRow`
// extends Node directly (it carries no expr).
export class Preceding extends Unary {
  /**
   * Rails' `Preceding.new(expr = nil)` (window.rb) puts no bound on the expr — the
   * frame offset is commonly a bare Integer — so it keeps `Unary`'s `expr`.
   */
  constructor(expr: unknown = null) {
    super(expr);
  }
}

export class Following extends Unary {
  /**
   * Rails' `Following.new(expr = nil)` (window.rb) puts no bound on the expr — the
   * frame offset is commonly a bare Integer — so it keeps `Unary`'s `expr`.
   */
  constructor(expr: unknown = null) {
    super(expr);
  }
}

export class CurrentRow extends Node {}

export class Rows extends Unary {
  declare expr: Node | null;
  constructor(expr: Node | null = null) {
    super(expr);
  }
}

export class Range extends Unary {
  declare expr: Node | null;
  constructor(expr: Node | null = null) {
    super(expr);
  }
}
