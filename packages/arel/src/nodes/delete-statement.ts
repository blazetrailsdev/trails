import { Node, NodeVisitor } from "./node.js";

/**
 * DeleteStatement — DELETE FROM ... WHERE ...
 *
 * Mirrors: Arel::Nodes::DeleteStatement
 */
export class DeleteStatement extends Node {
  relation: Node | null;
  wheres: Node[];
  orders: Node[];
  groups: Node[];
  havings: Node[];
  limit: Node | null;
  offset: Node | null;
  key: Node | Node[] | null;

  constructor() {
    super();
    this.relation = null;
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

  clone(): DeleteStatement {
    const copy = new DeleteStatement();
    copy.relation = this.relation;
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
