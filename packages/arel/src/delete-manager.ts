import { Node } from "./nodes/node.js";
import { DeleteStatement } from "./nodes/delete-statement.js";
import { Limit } from "./nodes/unary.js";
import { Quoted } from "./nodes/quoted.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";
import { ToSql } from "./visitors/to-sql.js";

/**
 * DeleteManager — chainable API for building DELETE statements.
 *
 * Mirrors: Arel::DeleteManager
 */
export class DeleteManager {
  readonly ast: DeleteStatement;

  constructor() {
    this.ast = new DeleteStatement();
  }

  /**
   * Set the target table.
   */
  from(table: Table): this {
    this.ast.relation = table;
    return this;
  }

  /**
   * Add a WHERE condition.
   */
  where(condition: Node): this {
    this.ast.wheres.push(condition);
    return this;
  }

  /**
   * Add ORDER BY.
   */
  order(...exprs: Node[]): this {
    this.ast.orders.push(...exprs);
    return this;
  }

  /**
   * Set LIMIT.
   */
  take(amount: number): this {
    this.ast.limit = new Limit(new Quoted(amount));
    return this;
  }

  /**
   * Return the current WHERE conditions.
   *
   * Mirrors: Arel::DeleteManager#wheres
   */
  get wheres(): Node[] {
    return [...this.ast.wheres];
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
        this.ast.groups.push(new SqlLiteral(c));
      } else {
        this.ast.groups.push(c);
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

  /**
   * Generate SQL string.
   */
  toSql(): string {
    return new ToSql().compile(this.ast);
  }
}
