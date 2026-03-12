import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

/**
 * MySQL visitor — dialect tweaks on top of generic ToSql.
 *
 * Mirrors: Arel::Visitors::MySQL
 */
export class MySQL extends ToSql {
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
      // MySQL requires a LIMIT when using OFFSET; use the max unsigned 64-bit value.
      this.collector.append(" LIMIT 18446744073709551615");
    }

    if (node.offset) {
      this.collector.append(" ");
      this.visit(node.offset);
    }

    if (node.lock) {
      this.collector.append(" ");
      this.visit(node.lock);
    }

    if ((node as any).comment) {
      this.visit((node as any).comment);
    }

    return this.collector;
  }

  protected override visitSelectCore(node: Nodes.SelectCore): SQLString {
    this.collector.append("SELECT");

    if (node.setQuantifier) {
      this.collector.append(" ");
      this.visit(node.setQuantifier);
    }

    if (node.projections.length > 0) {
      this.collector.append(" ");
      this.visitArray(node.projections, ", ");
    }

    // MySQL emits FROM DUAL for empty FROM.
    if (node.source.left) {
      this.collector.append(" FROM ");
      this.visit(node.source);
    } else {
      this.collector.append(" FROM DUAL");
    }

    if (node.wheres.length > 0) {
      this.collector.append(" WHERE ");
      const conditions = node.wheres.length === 1 ? node.wheres[0] : new Nodes.And(node.wheres);
      this.visit(conditions);
    }

    if (node.groups.length > 0) {
      this.collector.append(" GROUP BY ");
      this.visitArray(node.groups, ", ");
    }

    if (node.havings.length > 0) {
      this.collector.append(" HAVING ");
      const conditions = node.havings.length === 1 ? node.havings[0] : new Nodes.And(node.havings);
      this.visit(conditions);
    }

    if (node.windows.length > 0) {
      this.collector.append(" WINDOW ");
      this.visitArray(node.windows, ", ");
    }

    return this.collector;
  }

  protected override visitConcat(node: Nodes.Concat): SQLString {
    this.collector.append("CONCAT(");
    this.visit(node.left);
    this.collector.append(", ");
    this.visit(node.right);
    this.collector.append(")");
    return this.collector;
  }

  protected override visitBin(node: Nodes.Bin): SQLString {
    this.collector.append("BINARY ");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  protected override visitCte(node: Nodes.Cte): SQLString {
    // MySQL ignores MATERIALIZED / NOT MATERIALIZED modifiers.
    this.collector.append(`"${node.name}" AS (`);
    this.visit(node.relation);
    this.collector.append(")");
    return this.collector;
  }
}
