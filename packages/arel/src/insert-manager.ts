import { TreeManager } from "./tree-manager.js";
import { InsertStatement, type InsertSelectSource } from "./nodes/insert-statement.js";
import { Attribute } from "./attributes/attribute.js";
import { ValuesList } from "./nodes/values-list.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";
import { first, isEmpty, rbModConstSet } from "@blazetrails/ruby-compat";
import { Arel } from "./namespaces.js";
import type { ArelNode } from "./arel.js";

export class InsertManager extends TreeManager<InsertStatement> {
  constructor(table: Table | null = null) {
    super();
    this.ast = new InsertStatement(table);
  }

  into(table: Table): this {
    this.ast.relation = table;
    return this;
  }

  get columns(): ArelNode[] {
    return this.ast.columns;
  }

  set values(val: ArelNode | null) {
    this.ast.values = val;
  }

  select(select: InsertSelectSource): this {
    this.ast.select = select;
    return this;
  }

  insert(fields: string | [ArelNode, unknown][] | Map<ArelNode, unknown>): this | undefined {
    if (isEmpty(fields)) return;

    if (typeof fields === "string") {
      this.ast.values = new SqlLiteral(fields);
    } else {
      this.ast.relation ||= (first(first(fields)!) as Attribute).relation as Table | ArelNode;

      const values: unknown[] = [];

      for (const [column, value] of fields) {
        this.ast.columns.push(column);
        values.push(value);
      }
      this.ast.values = this.createValues(values);
    }
    return this;
  }

  createValues(values: unknown[]): ValuesList {
    return new ValuesList([values]);
  }

  createValuesList(rows: unknown[][]): ValuesList {
    return new ValuesList(rows);
  }
}

rbModConstSet(Arel, "InsertManager", InsertManager);
