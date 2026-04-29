import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

/**
 * SQLite visitor — dialect tweaks on top of generic ToSql.
 *
 * Mirrors: Arel::Visitors::SQLite
 */
export class SQLite extends ToSql {
  protected override visitArelNodesSelectStatement(node: Nodes.SelectStatement): SQLString {
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
      this.injectJoin(node.orders, ", ");
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

    this.maybeVisit(node.comment ?? null);

    return this.collector;
  }

  protected override visitArelNodesLock(_node: Nodes.Lock): SQLString {
    // SQLite does not support locking — silently ignore.
    return this.collector;
  }

  protected override visitArelNodesTrue(_node: Nodes.True): SQLString {
    this.collector.append("1");
    return this.collector;
  }

  protected override visitArelNodesFalse(_node: Nodes.False): SQLString {
    this.collector.append("0");
    return this.collector;
  }

  protected override quote(value: unknown): string {
    if (typeof value === "boolean") return value ? "1" : "0";
    return super.quote(value);
  }

  /**
   * SQLite has no `IS DISTINCT FROM`; it overloads `IS` / `IS NOT` to be
   * NULL-aware equality/inequality. Rails routes `IsDistinctFrom` /
   * `IsNotDistinctFrom` through the SQLite adapter and emits `IS NOT` /
   * `IS` accordingly.
   */
  protected override visitArelNodesIsDistinctFrom(node: Nodes.IsDistinctFrom): SQLString {
    return this.visitBinaryOp(node, "IS NOT");
  }

  protected override visitArelNodesIsNotDistinctFrom(node: Nodes.IsNotDistinctFrom): SQLString {
    return this.visitBinaryOp(node, "IS");
  }
}
