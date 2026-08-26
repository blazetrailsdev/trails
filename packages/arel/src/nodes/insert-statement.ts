import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";

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

  // Mirrors Arel::Nodes::InsertStatement#initialize_copy
  // (insert_statement.rb:16-21), which Ruby runs for `#clone`.
  clone(): this {
    const copy = objectClone(this);
    copy.columns = [...this.columns];
    if (this.values) copy.values = cloneSlot(this.values);
    if (this.select) copy.select = cloneSlot(this.select);
    return copy;
  }
}
