import { Node } from "./nodes/node.js";
import { TreeManager } from "./tree-manager.js";
import { InsertStatement, type InsertSelectSource } from "./nodes/insert-statement.js";
import { Attribute } from "./attributes/attribute.js";
import { ValuesList } from "./nodes/values-list.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";

/**
 * InsertManager — chainable API for building INSERT statements.
 *
 * Mirrors: Arel::InsertManager
 */
export class InsertManager extends TreeManager {
  readonly ast: InsertStatement;

  constructor(table?: Table | null) {
    super();
    this.ast = new InsertStatement(table ?? null);
  }

  /**
   * Set the target table.
   */
  into(table: Table): this {
    this.ast.relation = table;
    return this;
  }

  /**
   * Set column/value pairs.
   *
   * Mirrors: Arel::InsertManager#insert (insert_manager.rb).
   * - returns early when `fields` is empty (Rails: `return if fields.empty?`)
   * - string form stores `Nodes::SqlLiteral.new(fields)` on `ast.values`
   * - infers `ast.relation` from the first column when not yet set
   *   (Rails: `@ast.relation ||= fields.first.first.relation`)
   * - values pass through raw — no `Quoted` wrap (Rails preserves them
   *   for the dialect-specific value visitor to quote)
   */
  insert(fields: string | [Attribute | Node, unknown][] | null | undefined): this {
    if (fields == null) return this;

    if (typeof fields === "string") {
      this.ast.values = new SqlLiteral(fields);
      return this;
    }

    if (fields.length === 0) return this;

    if (this.ast.relation == null) {
      const first = fields[0]?.[0] as { relation?: Node } | undefined;
      if (first?.relation) this.ast.relation = first.relation;
    }

    const row: unknown[] = [];
    for (const [col, val] of fields) {
      this.ast.columns.push(col);
      row.push(val);
    }
    this.ast.values = this.createValues(row);
    return this;
  }

  /**
   * Mirrors: Arel::InsertManager `values=` (insert_manager.rb).
   */
  set values(val: Node | null) {
    this.ast.values = val;
  }

  /**
   * Return the current columns list.
   *
   * Mirrors: Arel::InsertManager#columns
   */
  get columns(): Node[] {
    return this.ast.columns;
  }

  /**
   * Set a SelectManager as the source for INSERT ... SELECT.
   *
   * Mirrors: Arel::InsertManager#select — stores the manager itself
   * rather than unwrapping to its inner `.ast`. The visitor handles
   * either shape (raw Node or SelectManager-shaped duck-type) via
   * `visitNodeOrValue`.
   */
  select(selectManager: InsertSelectSource): this {
    this.ast.select = selectManager;
    return this;
  }

  /**
   * Create a ValuesList from a single row and columns.
   *
   * Mirrors: Arel::InsertManager#create_values
   */
  createValues(row: unknown[]): ValuesList {
    return new ValuesList([row as Node[]]);
  }

  /**
   * Create a ValuesList from multiple rows.
   *
   * Mirrors: Arel::InsertManager#create_values_list
   */
  createValuesList(rows: Node[][]): ValuesList {
    return new ValuesList(rows);
  }
}
