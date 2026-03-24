import { Node } from "./nodes/node.js";
import { UpdateStatement } from "./nodes/update-statement.js";
import { Assignment } from "./nodes/binary.js";
import { Quoted } from "./nodes/quoted.js";
import { Limit } from "./nodes/unary.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Table } from "./table.js";
import { ToSql } from "./visitors/to-sql.js";

/**
 * UpdateManager — chainable API for building UPDATE statements.
 *
 * Mirrors: Arel::UpdateManager
 */
export class UpdateManager {
  readonly ast: UpdateStatement;

  constructor() {
    this.ast = new UpdateStatement();
  }

  /**
   * Set the target table.
   */
  table(table: Table): this {
    this.ast.relation = table;
    return this;
  }

  /**
   * Set column = value assignments.
   */
  set(values: [Node, unknown][]): this {
    this.ast.values = values.map(([col, val]) => {
      const right = val instanceof Node ? val : new Quoted(val);
      return new Assignment(col, right);
    });
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
   * Mirrors: Arel::UpdateManager#wheres
   */
  get wheres(): Node[] {
    return [...this.ast.wheres];
  }

  /**
   * Set a primary key condition for the update.
   *
   * Mirrors: Arel::UpdateManager#key=
   */
  key(keyNode: Node): this {
    this.ast.key = keyNode;
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
   * Mirrors: Arel::UpdateManager#having
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
