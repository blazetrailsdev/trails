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

// Ruby `Object#clone` on whatever occupies a statement slot — the same
// narrowing `Binary`'s own slot copy makes, for the same reason (see
// `cloneSlot` in binary.ts).
function cloneSlotValue<T>(value: T): T {
  if (Array.isArray(value)) return [...value] as T;
  const cloneable = value as { clone?: () => T };
  if (typeof cloneable?.clone === "function") return cloneable.clone();
  if (typeof value !== "object" || value === null) return value;
  return Object.assign(Object.create(Object.getPrototypeOf(value) as object) as object, value) as T;
}

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

  clone(): InsertStatement {
    const copy = new InsertStatement();
    copy.relation = this.relation;
    copy.columns = [...this.columns];
    // insert_statement.rb:16-21 clones both slots when present — a cloned
    // statement must not share its values/select node with the original.
    copy.values = this.values ? cloneSlotValue(this.values) : this.values;
    copy.select = this.select ? cloneSlotValue(this.select) : this.select;
    return copy;
  }
}
