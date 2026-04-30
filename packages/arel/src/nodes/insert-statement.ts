import { Node, NodeVisitor } from "./node.js";

/**
 * InsertStatement — INSERT INTO ... VALUES ...
 *
 * Mirrors: Arel::Nodes::InsertStatement
 */
/**
 * Mirrors Rails: `@ast.select = select` in `InsertManager#select` —
 * Rails stores a `SelectManager` directly (not its inner `.ast`), so
 * the field type widens to "Node-or-SelectManager-shape-or-null".
 */
export type InsertSelectSource = Node | { ast: Node; toSql: () => string } | null;

export class InsertStatement extends Node {
  relation: Node | null;
  columns: Node[];
  values: Node | null;
  select: InsertSelectSource;

  constructor(relation: Node | null = null) {
    super();
    this.relation = relation;
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
