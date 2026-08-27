import { Node } from "./nodes/node.js";
import { TreeManager } from "./tree-manager.js";
import { InsertStatement, type InsertSelectSource } from "./nodes/insert-statement.js";
import { Attribute } from "./attributes/attribute.js";
import { ValuesList } from "./nodes/values-list.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";

export class InsertManager extends TreeManager {
  readonly ast: InsertStatement;

  constructor(table?: Table | null) {
    super();
    this.ast = new InsertStatement(table ?? null);
  }

  into(table: Table): this {
    this.ast.relation = table;
    return this;
  }

  get columns(): Node[] {
    return this.ast.columns;
  }

  set values(val: Node | null) {
    this.ast.values = val;
  }

  select(select: InsertSelectSource): this {
    this.ast.select = select;
    return this;
  }

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

    const values: unknown[] = [];
    for (const [column, value] of fields) {
      this.ast.columns.push(column);
      values.push(value);
    }
    this.ast.values = this.createValues(values);
    return this;
  }

  createValues(values: unknown[]): ValuesList {
    return new ValuesList([values]);
  }

  createValuesList(rows: unknown[][]): ValuesList {
    return new ValuesList(rows);
  }
}
