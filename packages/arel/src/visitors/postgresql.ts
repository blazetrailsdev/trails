import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";
import { postgresqlDefaultQuoter } from "./default-quoter.js";
import type { ArelConnection } from "./connection.js";

/**
 * PostgreSQL visitor — extends generic ToSql with PostgreSQL-specific features.
 *
 * Mirrors: Arel::Visitors::PostgreSQL
 */
export class PostgreSQL extends ToSql {
  // Rails' Arel::Visitors::PostgreSQL defines no constructor — it inherits
  // ToSql's, and @connection is always a real adapter. Trails constructs
  // visitors with no connection (Node#toSql(), visitor unit tests), so the
  // default has to name a PG-flavoured quoting host rather than the ANSI one.
  // This is the only Rails-absent member here; the quote override it replaces
  // was the larger deviation (Rails formats arrays in the adapter's quote —
  // postgresql/quoting.rb:221-226 — never in the visitor).
  constructor(connection: ArelConnection = postgresqlDefaultQuoter) {
    super(connection);
  }

  protected override visitArelNodesMatches(node: Nodes.Matches, collector: SQLString): SQLString {
    this.visit(node.left, collector);
    collector.append(node.caseSensitive ? " LIKE " : " ILIKE ");
    this.visit(node.right, collector);
    this.appendEscape(node.escape, collector);
    return collector;
  }

  protected override visitArelNodesDoesNotMatch(
    node: Nodes.DoesNotMatch,
    collector: SQLString,
  ): SQLString {
    this.visit(node.left, collector);
    collector.append(node.caseSensitive ? " NOT LIKE " : " NOT ILIKE ");
    this.visit(node.right, collector);
    this.appendEscape(node.escape, collector);
    return collector;
  }

  protected override visitArelNodesRegexp(node: Nodes.Regexp, collector: SQLString): SQLString {
    return this.visitBinaryOp(node, node.caseSensitive ? "~" : "~*", collector);
  }

  protected override visitArelNodesNotRegexp(
    node: Nodes.NotRegexp,
    collector: SQLString,
  ): SQLString {
    return this.visitBinaryOp(node, node.caseSensitive ? "!~" : "!~*", collector);
  }

  protected override visitArelNodesDistinctOn(
    node: Nodes.DistinctOn,
    collector: SQLString,
  ): SQLString {
    collector.append("DISTINCT ON ( ");
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else if (node.expr !== null) {
      collector.append(String(node.expr));
    }
    collector.append(" )");
    return collector;
  }

  // Mirrors Rails Postgres formatting: `( expr )` with spaces inside
  // the parens. The base ToSql renders `(expr)` without spaces, so
  // override to match Rails' `visit_Arel_Nodes_GroupingElement`.
  protected override visitArelNodesGroupingElement(
    node: Nodes.GroupingElement,
    collector: SQLString,
  ): SQLString {
    return this.groupingArrayOrGroupingElement(node, collector);
  }

  // Cube/Rollup/GroupingSet: emit `CUBE` / `ROLLUP` / `GROUPING SETS`
  // followed by `grouping_array_or_grouping_element` formatting. Mirrors
  // Rails Postgres ([postgresql.rb](https://github.com/rails/rails/blob/v8.0.2/activerecord/lib/arel/visitors/postgresql.rb)).
  protected override visitArelNodesCube(node: Nodes.Cube, collector: SQLString): SQLString {
    collector.append("CUBE");
    return this.groupingArrayOrGroupingElement(node, collector);
  }

  protected override visitArelNodesRollUp(node: Nodes.RollUp, collector: SQLString): SQLString {
    collector.append("ROLLUP");
    return this.groupingArrayOrGroupingElement(node, collector);
  }

  protected override visitArelNodesGroupingSet(
    node: Nodes.GroupingSet,
    collector: SQLString,
  ): SQLString {
    collector.append("GROUPING SETS");
    return this.groupingArrayOrGroupingElement(node, collector);
  }

  // Postgres natively supports `IS [NOT] DISTINCT FROM`. Behaviorally
  // identical to the base ToSql visitor; the explicit override mirrors
  // Rails' Postgres visitor for fidelity (no behavior change).
  protected override visitArelNodesIsNotDistinctFrom(
    node: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visit(node.left, collector);
    collector.append(" IS NOT DISTINCT FROM ");
    this.visit(node.right, collector);
    return collector;
  }

  protected override visitArelNodesIsDistinctFrom(
    node: Nodes.IsDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visit(node.left, collector);
    collector.append(" IS DISTINCT FROM ");
    this.visit(node.right, collector);
    return collector;
  }

  /**
   * Mirrors Rails Postgres `grouping_array_or_grouping_element` (postgresql.rb:87).
   * Trails' `GroupingElement` always carries an `expressions: Node[]`
   * (Rails normalizes between bare `expr` and array `expr`); the wrapped
   * `( ... )` shape is the one Rails takes when `o.expr.is_a? Array`,
   * which Trails always hits. Used by visitArelNodesCube / RollUp /
   * GroupingSet / GroupingElement.
   */
  protected groupingArrayOrGroupingElement(
    o: Nodes.GroupingElement,
    collector: SQLString,
  ): SQLString {
    collector.append("( ");
    o.expressions.forEach((expr, i) => {
      if (i > 0) collector.append(", ");
      this.visit(expr, collector);
    });
    collector.append(" )");
    return collector;
  }
}

/**
 * PostgreSQL visitor — uses numbered bind parameters ($1, $2, ...).
 */
export class PostgreSQLWithBinds extends PostgreSQL {
  // SQLString tracks bindIndex in the collector (starts at 1, increments per
  // addBind call). Overriding bindBlock() to return the $N renderer is
  // sufficient — the index state never touches the visitor instance.
  protected override bindBlock(): (index: number) => string {
    return (i: number) => `$${i}`;
  }
}
