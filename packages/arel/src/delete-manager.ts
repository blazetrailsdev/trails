import { Node } from "./nodes/node.js";
import { TreeManager, StatementMethods } from "./tree-manager.js";
import { include } from "@blazetrails/activesupport";
import { DeleteStatement } from "./nodes/delete-statement.js";
import { Group } from "./nodes/unary.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";

/**
 * DeleteManager — chainable API for building DELETE statements.
 *
 * Mirrors: Arel::DeleteManager
 */
export class DeleteManager extends TreeManager {
  readonly ast: DeleteStatement;
  // Installed via include(DeleteManager, StatementMethods) below. Rails
  // mixes these in via `include TreeManager::StatementMethods`.
  declare key: unknown;
  declare wheres: Node[];
  declare where: (expr: Node) => this;
  declare take: (limit: unknown) => this;
  declare offset: (offset: unknown) => this;
  declare order: (...expr: Node[]) => this;

  constructor() {
    super();
    this.ast = new DeleteStatement();
  }

  /**
   * Set the target table.
   *
   * Mirrors: Arel::DeleteManager#from
   */
  from(table: Table): this {
    this.ast.relation = table;
    return this;
  }

  /**
   * Add GROUP BY.
   *
   * Mirrors: Arel::DeleteManager#group
   */
  group(column: Node | string, ...rest: (Node | string)[]): this {
    const columns = [column, ...rest];
    for (const c of columns) {
      if (typeof c === "string") {
        this.ast.groups.push(new Group(new SqlLiteral(c)));
      } else {
        this.ast.groups.push(new Group(c));
      }
    }
    return this;
  }

  /**
   * Add HAVING.
   *
   * Mirrors: Arel::DeleteManager#having
   */
  having(condition: Node): this {
    this.ast.havings.push(condition);
    return this;
  }
}

include(DeleteManager, StatementMethods);
