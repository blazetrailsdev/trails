import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

/** Mirrors: Arel::Visitors::PostgreSQL::BIND_BLOCK (postgresql.rb:81-82), a private constant. */
const BIND_BLOCK: (index: number) => string = (i: number) => `$${i}`;

/**
 * PostgreSQL visitor — extends generic ToSql with PostgreSQL-specific features.
 *
 * Mirrors: Arel::Visitors::PostgreSQL
 */
export class PostgreSQL extends ToSql {
  protected override visitArelNodesMatches(o: Nodes.Matches, collector: SQLString): SQLString {
    const op = o.caseSensitive ? " LIKE " : " ILIKE ";
    collector = this.infixValue(o, collector, op);
    if (o.escape) {
      collector.append(" ESCAPE ");
      return this.visit(o.escape, collector);
    } else {
      return collector;
    }
  }

  protected override visitArelNodesDoesNotMatch(
    o: Nodes.DoesNotMatch,
    collector: SQLString,
  ): SQLString {
    const op = o.caseSensitive ? " NOT LIKE " : " NOT ILIKE ";
    collector = this.infixValue(o, collector, op);
    if (o.escape) {
      collector.append(" ESCAPE ");
      return this.visit(o.escape, collector);
    } else {
      return collector;
    }
  }

  protected override visitArelNodesRegexp(o: Nodes.Regexp, collector: SQLString): SQLString {
    const op = o.caseSensitive ? " ~ " : " ~* ";
    return this.infixValue(o, collector, op);
  }

  protected override visitArelNodesNotRegexp(o: Nodes.NotRegexp, collector: SQLString): SQLString {
    const op = o.caseSensitive ? " !~ " : " !~* ";
    return this.infixValue(o, collector, op);
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

  // Mirrors: Arel::Visitors::PostgreSQL#visit_Arel_Nodes_GroupingElement
  // (postgresql.rb:44-47) — `( expr )` with spaces inside the parens, where
  // the base ToSql renders `(expr)` without them.
  protected override visitArelNodesGroupingElement(
    o: Nodes.GroupingElement,
    collector: SQLString,
  ): SQLString {
    collector.append("( ");
    this.visit(o.expr, collector);
    collector.append(" )");
    return collector;
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

  protected visitArelNodesLateral(o: Nodes.Lateral, collector: SQLString): SQLString {
    collector.append("LATERAL ");
    return this.groupingParentheses(o.expr, collector);
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

  /** Mirrors: Arel::Visitors::PostgreSQL#bind_block (postgresql.rb:81-84). */
  protected override bindBlock(): (index: number) => string {
    return BIND_BLOCK;
  }

  /**
   * Mirrors: Arel::Visitors::PostgreSQL#grouping_array_or_grouping_element
   * (postgresql.rb:88-96). A bare `expr` — a single GroupingElement handed to
   * `Cube.new` — is visited as-is, so it supplies its own parentheses.
   */
  protected groupingArrayOrGroupingElement(
    o: Nodes.GroupingElement,
    collector: SQLString,
  ): SQLString {
    if (Array.isArray(o.expr)) {
      collector.append("( ");
      this.visit(o.expr, collector);
      collector.append(" )");
    } else {
      return this.visit(o.expr, collector);
    }
    return collector;
  }

  static {
    PostgreSQL.dispatchCache().set(Nodes.Lateral, "visitArelNodesLateral");
  }
}
