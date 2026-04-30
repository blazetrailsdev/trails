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

/**
 * UpdateManager — chainable API for building UPDATE statements.
 *
 * Mirrors: Arel::UpdateManager
 */
export class UpdateManager extends TreeManager {
  readonly ast: UpdateStatement;
  // Installed via include(UpdateManager, StatementMethods) below. Rails
  // mixes these in via `include TreeManager::StatementMethods`.
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

  /**
   * Set the target table.
   *
   * Mirrors: Arel::UpdateManager#table
   */
  table(table: Table): this {
    this.ast.relation = table;
    return this;
  }

  /**
   * Set column = value assignments.
   *
   * Mirrors: Arel::UpdateManager#set
   */
  set(values: UpdateValues): this {
    // Mirrors Arel::UpdateManager#set (update_manager.rb): pairs become
    // `Assignment(UnqualifiedColumn(col), value)` with the value passed
    // through raw — the visitor's `visitNodeOrValue` dispatch quotes
    // primitives. The `UnqualifiedColumn` wrapper strips the table
    // qualifier so the visitor does not need an `_inUpdateSet` mode flag.
    if (typeof values === "string") {
      // Trails-only: keep the string form, but stash it as a SqlLiteral
      // so the AST always contains Nodes (Rails stashes raw strings and
      // relies on `visit_String`).
      this.ast.values = [new SqlLiteral(values)];
    } else if (values instanceof SqlLiteral || values instanceof BoundSqlLiteral) {
      this.ast.values = [values];
    } else {
      this.ast.values = values.map(
        ([col, val]) => new Assignment(new UnqualifiedColumn(col), val as NodeOrValue),
      );
    }
    return this;
  }

  /**
   * Add GROUP BY.
   *
   * Mirrors: Arel::UpdateManager#group
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
   * Mirrors: Arel::UpdateManager#having
   */
  having(condition: Node): this {
    this.ast.havings.push(condition);
    return this;
  }
}

include(UpdateManager, StatementMethods);
