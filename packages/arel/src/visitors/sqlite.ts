import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

/**
 * SQLite visitor — dialect tweaks on top of generic ToSql.
 *
 * Mirrors: Arel::Visitors::SQLite
 */
export class SQLite extends ToSql {
  protected override visitSelectStatement(node: Nodes.SelectStatement): SQLString {
    if (node.with) {
      this.visit(node.with);
      this.collector.append(" ");
    }

    for (let i = 0; i < node.cores.length; i++) {
      if (i > 0) this.collector.append(" ");
      this.visit(node.cores[i]);
    }

    if (node.orders.length > 0) {
      this.collector.append(" ORDER BY ");
      this.visitArray(node.orders, ", ");
    }

    if (node.limit) {
      this.collector.append(" ");
      this.visit(node.limit);
    } else if (node.offset) {
      // SQLite requires LIMIT when using OFFSET; -1 means "no limit".
      this.collector.append(" LIMIT -1");
    }

    if (node.offset) {
      this.collector.append(" ");
      this.visit(node.offset);
    }

    // SQLite does not support locking; ignore lock clause entirely.

    if (node.comment) {
      this.visit(node.comment);
    }

    return this.collector;
  }

  protected override visitTrue(_node: Nodes.True): SQLString {
    this.collector.append("1");
    return this.collector;
  }

  protected override visitFalse(_node: Nodes.False): SQLString {
    this.collector.append("0");
    return this.collector;
  }

  protected override quote(value: unknown): string {
    if (typeof value === "boolean") return value ? "1" : "0";
    return super.quote(value);
  }
}
