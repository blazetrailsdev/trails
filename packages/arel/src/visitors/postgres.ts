import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

/**
 * PostgreSQL visitor — currently matches generic ToSql.
 *
 * Mirrors: Arel::Visitors::PostgreSQL
 */
export class PostgreSQL extends ToSql {}

/**
 * PostgreSQL visitor — uses numbered bind parameters ($1, $2, ...).
 */
export class PostgreSQLWithBinds extends PostgreSQL {
  private bindIndex = 0;

  override compile(node: Node): string {
    this.bindIndex = 0;
    return super.compile(node);
  }

  protected override visitBindParam(node: Nodes.BindParam): SQLString {
    if (node.value !== undefined) {
      this.collector.append(this.quote(node.value));
    } else {
      this.bindIndex += 1;
      this.collector.append(`$${this.bindIndex}`);
    }
    return this.collector;
  }
}
