import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

/**
 * PostgreSQL visitor — extends generic ToSql with PostgreSQL-specific features.
 *
 * Mirrors: Arel::Visitors::PostgreSQL
 */
export class PostgreSQL extends ToSql {
  protected override visitArelNodesMatches(o: Nodes.Matches, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(o.caseSensitive ? " LIKE " : " ILIKE ");
    this.visit(o.right, collector);
    this.appendEscape(o.escape, collector);
    return collector;
  }

  protected override visitArelNodesDoesNotMatch(
    o: Nodes.DoesNotMatch,
    collector: SQLString,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(o.caseSensitive ? " NOT LIKE " : " NOT ILIKE ");
    this.visit(o.right, collector);
    this.appendEscape(o.escape, collector);
    return collector;
  }

  protected override visitArelNodesRegexp(o: Nodes.Regexp, collector: SQLString): SQLString {
    return this.visitBinaryOp(o, o.caseSensitive ? "~" : "~*", collector);
  }

  protected override visitArelNodesNotRegexp(o: Nodes.NotRegexp, collector: SQLString): SQLString {
    return this.visitBinaryOp(o, o.caseSensitive ? "!~" : "!~*", collector);
  }

  protected override visitArelNodesDistinctOn(
    o: Nodes.DistinctOn,
    collector: SQLString,
  ): SQLString {
    collector.append("DISTINCT ON ( ");
    if (o.expr instanceof Node) {
      this.visit(o.expr, collector);
    } else if (o.expr !== null) {
      collector.append(String(o.expr));
    }
    collector.append(" )");
    return collector;
  }

  // Mirrors Rails Postgres formatting: `( expr )` with spaces inside
  // the parens. The base ToSql renders `(expr)` without spaces, so
  // override to match Rails' `visit_Arel_Nodes_GroupingElement`.
  protected override visitArelNodesGroupingElement(
    o: Nodes.GroupingElement,
    collector: SQLString,
  ): SQLString {
    return this.groupingArrayOrGroupingElement(o, collector);
  }

  // Cube/Rollup/GroupingSet: emit `CUBE` / `ROLLUP` / `GROUPING SETS`
  // followed by `grouping_array_or_grouping_element` formatting. Mirrors
  // Rails Postgres ([postgresql.rb](https://github.com/rails/rails/blob/v8.0.2/activerecord/lib/arel/visitors/postgresql.rb)).
  protected override visitArelNodesCube(o: Nodes.Cube, collector: SQLString): SQLString {
    collector.append("CUBE");
    return this.groupingArrayOrGroupingElement(o, collector);
  }

  protected override visitArelNodesRollUp(o: Nodes.RollUp, collector: SQLString): SQLString {
    collector.append("ROLLUP");
    return this.groupingArrayOrGroupingElement(o, collector);
  }

  protected override visitArelNodesGroupingSet(
    o: Nodes.GroupingSet,
    collector: SQLString,
  ): SQLString {
    collector.append("GROUPING SETS");
    return this.groupingArrayOrGroupingElement(o, collector);
  }

  // Postgres natively supports `IS [NOT] DISTINCT FROM`. Behaviorally
  // identical to the base ToSql visitor; the explicit override mirrors
  // Rails' Postgres visitor for fidelity (no behavior change).
  protected override visitArelNodesIsNotDistinctFrom(
    o: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(" IS NOT DISTINCT FROM ");
    this.visit(o.right, collector);
    return collector;
  }

  protected override visitArelNodesIsDistinctFrom(
    o: Nodes.IsDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(" IS DISTINCT FROM ");
    this.visit(o.right, collector);
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
