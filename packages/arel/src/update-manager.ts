import { TreeManager, StatementMethods } from "./tree-manager.js";
import { include } from "@blazetrails/activesupport";
import { UpdateStatement } from "./nodes/update-statement.js";
import { Assignment, type NodeOrValue } from "./nodes/binary.js";
import { UnqualifiedColumn } from "./nodes/unqualified-column.js";
import { Group } from "./nodes/unary.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { BoundSqlLiteral } from "./nodes/bound-sql-literal.js";
import { Table } from "./table.js";
import type { UpdateValues } from "./crud.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Arel } from "./namespaces.js";
import type { ArelNode } from "./arel.js";

export class UpdateManager extends TreeManager<UpdateStatement> {
  declare key: unknown;
  declare wheres: ArelNode[];
  declare where: (expr: ArelNode) => this;
  declare take: (limit: unknown) => this;
  declare offset: (offset: unknown) => this;
  declare order: (...expr: ArelNode[]) => this;

  constructor(table: Table | ArelNode | null = null) {
    super();
    this.ast = new UpdateStatement(table);
  }

  table(table: Table | ArelNode): this {
    this.ast.relation = table;
    return this;
  }

  set(values: UpdateValues): this {
    if (
      typeof values === "string" ||
      values instanceof SqlLiteral ||
      values instanceof BoundSqlLiteral
    ) {
      this.ast.values = [values];
    } else {
      this.ast.values = Array.from(values).map(
        ([column, value]) => new Assignment(new UnqualifiedColumn(column), value as NodeOrValue),
      );
    }
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

  having(expr: ArelNode | string): this {
    this.ast.havings.push(expr);
    return this;
  }
}

include(UpdateManager, StatementMethods);

rbModConstSet(Arel, "UpdateManager", UpdateManager);
