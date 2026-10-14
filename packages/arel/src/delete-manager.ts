import { TreeManager, StatementMethods } from "./tree-manager.js";
import { include } from "@blazetrails/activesupport";
import { DeleteStatement } from "./nodes/delete-statement.js";
import { Group } from "./nodes/unary.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Arel } from "./namespaces.js";
import type { ArelNode } from "./arel.js";

export class DeleteManager extends TreeManager<DeleteStatement> {
  declare key: unknown;
  declare wheres: ArelNode[];
  declare where: (expr: ArelNode) => this;
  declare take: (limit: unknown) => this;
  declare offset: (offset: unknown) => this;
  declare order: (...expr: ArelNode[]) => this;

  constructor(table: Table | ArelNode | null = null) {
    super();
    this.ast = new DeleteStatement(table);
  }

  from(relation: Table): this {
    this.ast.relation = relation;
    return this;
  }

  group(columns: (ArelNode | string)[]): this {
    for (let column of columns) {
      if (typeof column === "string") {
        column = new SqlLiteral(column.startsWith(":") ? column.slice(1) : column);
      }

      this.ast.groups.push(new Group(column));
    }
    return this;
  }

  having(expr: ArelNode): this {
    this.ast.havings.push(expr);
    return this;
  }
}

include(DeleteManager, StatementMethods);

rbModConstSet(Arel, "DeleteManager", DeleteManager);
