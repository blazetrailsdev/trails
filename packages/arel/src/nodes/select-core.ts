import { Node, NodeVisitor } from "./node.js";
import { JoinSource } from "./join-source.js";

/**
 * SelectCore — the core of a SELECT statement (projections, from, where, etc.).
 *
 * Mirrors: Arel::Nodes::SelectCore
 */
export class SelectCore extends Node {
  source: JoinSource;
  projections: Node[];
  wheres: Node[];
  groups: Node[];
  havings: Node[];
  windows: Node[];
  setQuantifier: Node | null;
  optimizerHints: string[];
  comment: Node | null;

  constructor() {
    super();
    this.source = new JoinSource(null);
    this.projections = [];
    this.wheres = [];
    this.groups = [];
    this.havings = [];
    this.windows = [];
    this.setQuantifier = null;
    this.optimizerHints = [];
    this.comment = null;
  }

  get from(): Node | null {
    return this.source.left;
  }

  set from(value: Node | null) {
    this.source.left = value;
  }

  clone(): SelectCore {
    const c = new SelectCore();
    c.source = new JoinSource(this.source.left, [...this.source.right]);
    c.projections = [...this.projections];
    c.wheres = [...this.wheres];
    c.groups = [...this.groups];
    c.havings = [...this.havings];
    c.windows = [...this.windows];
    c.setQuantifier = this.setQuantifier;
    c.optimizerHints = [...this.optimizerHints];
    c.comment = this.comment;
    return c;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
