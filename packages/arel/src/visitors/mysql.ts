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

    this.maybeVisit(node.comment ?? null);

    return this.collector;
  }

  protected override visitArelNodesSelectCore(node: Nodes.SelectCore): SQLString {
    this.collector.append("SELECT");

    this.emitOptimizerHints(node);

    if (node.setQuantifier) {
      this.collector.append(" ");
      this.visit(node.setQuantifier);
    }

    if (node.projections.length > 0) {
      this.collector.append(" ");
      this.injectJoin(node.projections, ", ");
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
      this.injectJoin(node.groups, ", ");
    }

    if (node.havings.length > 0) {
      this.collector.append(" HAVING ");
      const conditions = node.havings.length === 1 ? node.havings[0] : new Nodes.And(node.havings);
      this.visit(conditions);
    }

    if (node.windows.length > 0) {
      this.collector.append(" WINDOW ");
      this.injectJoin(node.windows, ", ");
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

  // Mirrors Rails' MySQL visitor: `CAST(expr AS BINARY)` (the explicit
  // cast form) rather than the prefix-`BINARY ` operator the previous
  // Trails impl used. Both force binary comparison; this matches Rails'
  // emitted SQL.
  protected override visitBin(node: Nodes.Bin): SQLString {
    this.collector.append("CAST(");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    this.collector.append(" AS BINARY)");
    return this.collector;
  }

  // MySQL renders an UnqualifiedColumn by visiting its inner expression
  // (typically an Attribute). Rails delegates with `visit o.expr` —
  // unlike the base ToSql which special-cases the bare name. The
  // relation prefix this leaves on for an Attribute is fine: MySQL's
  // `UPDATE t SET x = t.x + 1` is valid.
  protected override visitUnqualifiedColumn(node: Nodes.UnqualifiedColumn): SQLString {
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  // MySQL's null-safe equality is `<=>`. The standard `IS [NOT] DISTINCT
  // FROM` is supported only on MySQL 8.0.14+; the operator form works
  // on every MySQL version.
  protected override visitIsNotDistinctFrom(node: Nodes.IsNotDistinctFrom): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" <=> ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  protected override visitIsDistinctFrom(node: Nodes.IsDistinctFrom): SQLString {
    this.collector.append("NOT ");
    this.visitNodeOrValue(node.left);
    this.collector.append(" <=> ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  // MySQL uses `REGEXP` / `NOT REGEXP`, not the SQL-standard `~` /
  // `!~` (which is Postgres). Mirrors Rails MySQL's `infix_value`
  // helper — same shape as visitMatches.
  protected override visitRegexp(node: Nodes.Regexp): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" REGEXP ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  protected override visitNotRegexp(node: Nodes.NotRegexp): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" NOT REGEXP ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  protected override visitNullsFirst(node: Nodes.NullsFirst): SQLString {
    // MySQL has no NULLS FIRST; emulate: col IS NOT NULL, col ASC/DESC
    const ordering = node.expr as Nodes.Ascending | Nodes.Descending;
    this.visitNodeOrValue(ordering.expr);
    this.collector.append(" IS NOT NULL, ");
    this.visit(ordering);
    return this.collector;
  }

  protected override visitNullsLast(node: Nodes.NullsLast): SQLString {
    // MySQL has no NULLS LAST; emulate: col IS NULL, col ASC/DESC
    const ordering = node.expr as Nodes.Ascending | Nodes.Descending;
    this.visitNodeOrValue(ordering.expr);
    this.collector.append(" IS NULL, ");
    this.visit(ordering);
    return this.collector;
  }

  protected override visitCte(node: Nodes.Cte): SQLString {
    // MySQL identifiers are backtick-quoted, not double-quoted, and the
    // MATERIALIZED / NOT MATERIALIZED modifiers Postgres supports are
    // ignored. Mirrors Rails' MySQL visit_Arel_Nodes_Cte which calls
    // `quote_table_name` (which emits backticks on the MySQL adapter).
    const escaped = node.name.replace(/`/g, "``");
    this.collector.append(`\`${escaped}\` AS (`);
    this.visit(node.relation);
    this.collector.append(")");
    return this.collector;
  }
}
