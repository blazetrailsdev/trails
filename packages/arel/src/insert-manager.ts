import { Node } from "./nodes/node.js";
import { InsertStatement } from "./nodes/insert-statement.js";
import { Attribute } from "./attributes/attribute.js";
import { ValuesList } from "./nodes/values-list.js";
import { Quoted } from "./nodes/casted.js";
import { Table } from "./table.js";
import { ToSql } from "./visitors/to-sql.js";

/**
 * InsertManager — chainable API for building INSERT statements.
 *
 * Mirrors: Arel::InsertManager
 */
export class InsertManager {
  readonly ast: InsertStatement;

  constructor(table?: Table | null) {
    this.ast = new InsertStatement();
    if (table) this.into(table);
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
   */
  insert(values: [Attribute | Node, unknown][]): this {
    const columns: Node[] = [];
    const row: Node[] = [];
    for (const [col, val] of values) {
      columns.push(col);
      row.push(val instanceof Node ? val : new Quoted(val));
    }
    this.ast.columns = columns;
    this.ast.values = new ValuesList([row]);
    return this;
  }

  /**
   * Set values from raw rows.
   */
  values(valuesList: ValuesList): this {
    this.ast.values = valuesList;
    return this;
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
   * Mirrors: Arel::InsertManager#select
   */
  select(selectManager: { ast: Node }): this {
    this.ast.values = selectManager.ast;
    return this;
  }

  /**
   * Create a ValuesList from a single row and columns.
   *
   * Mirrors: Arel::InsertManager#create_values
   */
  createValues(row: Node[], _columns?: Node[]): ValuesList {
    return new ValuesList([row]);
  }

  /**
   * Create a ValuesList from multiple rows.
   *
   * Mirrors: Arel::InsertManager#create_values_list
   */
  createValuesList(rows: Node[][]): ValuesList {
    return new ValuesList(rows);
  }

  /**
   * Generate SQL string.
   */
  toSql(): string {
    return new ToSql().compile(this.ast);
  }
}
