import { Node, NodeVisitor } from "./node.js";

/**
 * UpdateStatement — UPDATE ... SET ... WHERE ...
 *
 * Mirrors: Arel::Nodes::UpdateStatement
 */
export class UpdateStatement extends Node {
  relation: Node | null;
  values: Node[];
  wheres: Node[];
  orders: Node[];
  groups: Node[];
  havings: Node[];
  limit: Node | null;
  offset: Node | null;
  key: Node | null;

  constructor(relation: Node | null = null) {
    super();
    this.relation = relation;
    this.values = [];
    this.wheres = [];
    this.orders = [];
    this.groups = [];
    this.havings = [];
    this.limit = null;
    this.offset = null;
    this.key = null;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }

  clone(): UpdateStatement {
    const copy = new UpdateStatement();
    copy.relation = this.relation;
    copy.values = [...this.values];
    copy.wheres = [...this.wheres];
    copy.orders = [...this.orders];
    copy.groups = [...this.groups];
    copy.havings = [...this.havings];
    copy.limit = this.limit;
    copy.offset = this.offset;
    copy.key = this.key;
    return copy;
  }
}
