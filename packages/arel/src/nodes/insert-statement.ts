import { Node, NodeVisitor } from "./node.js";

/**
 * InsertStatement — INSERT INTO ... VALUES ...
 *
 * Mirrors: Arel::Nodes::InsertStatement
 */
export class InsertStatement extends Node {
  relation: Node | null;
  columns: Node[];
  values: Node | null;
  select: Node | null;

  constructor() {
    super();
    this.relation = null;
    this.columns = [];
    this.values = null;
    this.select = null;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }

  clone(): InsertStatement {
    const copy = new InsertStatement();
    copy.relation = this.relation;
    copy.columns = [...this.columns];
    copy.values = this.values;
    copy.select = this.select;
    return copy;
  }
}
