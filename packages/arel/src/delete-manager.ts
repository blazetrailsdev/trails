import { Node } from "./nodes/node.js";
import { TreeManager, StatementMethods } from "./tree-manager.js";
import { include } from "@blazetrails/activesupport";
import { DeleteStatement } from "./nodes/delete-statement.js";
import { Group } from "./nodes/unary.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";

export class DeleteManager extends TreeManager {
  readonly ast: DeleteStatement;
  declare key: unknown;
  declare wheres: Node[];
  declare where: (expr: Node) => this;
  declare take: (limit: unknown) => this;
  declare offset: (offset: unknown) => this;
  declare order: (...expr: Node[]) => this;

  constructor(table: Table | Node | null = null) {
    super();
    this.ast = new DeleteStatement(table);
  }

  from(relation: Table): this {
    this.ast.relation = relation;
    return this;
  }

  group(columns: (Node | string)[]): this {
    for (let column of columns) {
      if (typeof column === "string") {
        column = new SqlLiteral(column.startsWith(":") ? column.slice(1) : column);
      }

      this.ast.groups.push(new Group(column));
    }
    return this;
  }

  having(expr: Node): this {
    this.ast.havings.push(expr);
    return this;
  }
}

include(DeleteManager, StatementMethods);
