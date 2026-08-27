import { Node } from "./nodes/node.js";
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

export class UpdateManager extends TreeManager {
  readonly ast: UpdateStatement;
  declare key: unknown;
  declare wheres: Node[];
  declare where: (expr: Node) => this;
  declare take: (limit: unknown) => this;
  declare offset: (offset: unknown) => this;
  declare order: (...expr: Node[]) => this;

  constructor(table: Table | Node | null = null) {
    super();
    this.ast = new UpdateStatement(table);
  }

  table(table: Table | Node): this {
    this.ast.relation = table;
    return this;
  }

  set(values: UpdateValues): this {
    if (typeof values === "string") {
      this.ast.values = [new SqlLiteral(values)];
    } else if (values instanceof SqlLiteral || values instanceof BoundSqlLiteral) {
      this.ast.values = [values];
    } else {
      this.ast.values = values.map(
        ([column, value]) => new Assignment(new UnqualifiedColumn(column), value as NodeOrValue),
      );
    }
    return this;
  }

  group(columns: (Node | string)[]): this {
    for (const column of columns) {
      if (typeof column === "string") {
        this.ast.groups.push(new Group(new SqlLiteral(column)));
      } else {
        this.ast.groups.push(new Group(column));
      }
    }
    return this;
  }

  having(expr: Node | string): this {
    this.ast.havings.push(typeof expr === "string" ? new SqlLiteral(expr) : expr);
    return this;
  }
}

include(UpdateManager, StatementMethods);
