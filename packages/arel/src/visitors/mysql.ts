import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";
import { sql } from "../arel.js";

/**
 * MySQL visitor — dialect tweaks on top of generic ToSql.
 *
 * Mirrors: Arel::Visitors::MySQL
 */
export class MySQL extends ToSql {
  // Mirrors Rails' MySQL visitor: `CAST(expr AS BINARY)` (the explicit
  // cast form) rather than the prefix-`BINARY ` operator the previous
  // Trails impl used. Both force binary comparison; this matches Rails'
  // emitted SQL.
  protected override visitArelNodesBin(o: Nodes.Bin, collector: SQLString): SQLString {
    collector.append("CAST(");
    this.visit(o.expr, collector);
    collector.append(" AS BINARY)");
    return collector;
  }

  // MySQL renders an UnqualifiedColumn by visiting its inner expression
  // (typically an Attribute), unlike the base ToSql which special-cases the
  // bare name (mysql.rb:13-15). The relation prefix this leaves on for an
  // Attribute is fine: MySQL's `UPDATE t SET x = t.x + 1` is valid.
  protected override visitArelNodesUnqualifiedColumn(
    o: Nodes.UnqualifiedColumn,
    collector: SQLString,
  ): SQLString {
    this.visit(o.expr, collector);
    return collector;
  }

  protected override visitArelNodesSelectStatement(
    o: Nodes.SelectStatement,
    collector: SQLString,
  ): SQLString {
    if (o.offset && !o.limit) {
      // Ruby's Integer is arbitrary-precision; the max unsigned 64-bit value
      // is past Number.MAX_SAFE_INTEGER, so it has to be a bigint here.
      o.limit = new Nodes.Limit(18446744073709551615n);
    }
    return super.visitArelNodesSelectStatement(o, collector);
  }

  protected override visitArelNodesSelectCore(
    o: Nodes.SelectCore,
    collector: SQLString,
  ): SQLString {
    o.froms ??= sql("DUAL", { retryable: true });
    return super.visitArelNodesSelectCore(o, collector);
  }

  protected override visitArelNodesConcat(o: Nodes.Concat, collector: SQLString): SQLString {
    collector.append(" CONCAT(");
    this.visit(o.left, collector);
    collector.append(", ");
    this.visit(o.right, collector);
    collector.append(") ");
    return collector;
  }

  protected override visitArelNodesIsNotDistinctFrom(
    o: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(" <=> ");
    this.visit(o.right, collector);
    return collector;
  }

  protected override visitArelNodesIsDistinctFrom(
    o: Nodes.IsDistinctFrom,
    collector: SQLString,
  ): SQLString {
    collector.append("NOT ");
    return this.visitArelNodesIsNotDistinctFrom(o, collector);
  }

  // MySQL uses `REGEXP` / `NOT REGEXP`, not the SQL-standard `~` /
  // `!~` (which is Postgres). Mirrors Rails MySQL's `infix_value`
  // helper — same shape as visitArelNodesMatches.
  protected override visitArelNodesRegexp(o: Nodes.Regexp, collector: SQLString): SQLString {
    return this.infixValue(o, collector, " REGEXP ");
  }

  protected override visitArelNodesNotRegexp(o: Nodes.NotRegexp, collector: SQLString): SQLString {
    return this.infixValue(o, collector, " NOT REGEXP ");
  }

  protected override visitArelNodesNullsFirst(
    o: Nodes.NullsFirst,
    collector: SQLString,
  ): SQLString {
    const expr = o.expr as Nodes.Ascending | Nodes.Descending;
    this.visit(expr.expr as Nodes.NodeOrValue, collector);
    collector.append(" IS NOT NULL, ");
    this.visit(expr, collector);
    return collector;
  }

  protected override visitArelNodesNullsLast(o: Nodes.NullsLast, collector: SQLString): SQLString {
    const expr = o.expr as Nodes.Ascending | Nodes.Descending;
    this.visit(expr.expr as Nodes.NodeOrValue, collector);
    collector.append(" IS NULL, ");
    this.visit(expr, collector);
    return collector;
  }

  protected override visitArelNodesCte(o: Nodes.Cte, collector: SQLString): SQLString {
    // MySQL identifiers are backtick-quoted, not double-quoted, and the
    // MATERIALIZED / NOT MATERIALIZED modifiers Postgres supports are
    // ignored. Mirrors Rails' MySQL visit_Arel_Nodes_Cte (mysql.rb:72-76),
    // which calls `quote_table_name` (which emits backticks on the MySQL
    // adapter) and lets the relation supply its own parens.
    collector.append(`${this.quoteTableName(o.name)} AS `);
    this.visit(o.relation, collector);
    return collector;
  }

  // In the simple case, MySQL allows JOINs directly in UPDATE/DELETE
  // queries. LIMIT/OFFSET/ORDER need a subquery. Mirrors Rails MySQL's
  // `prepare_update_statement` / `prepare_delete_statement` (aliased).
  protected override prepareUpdateStatement(o: Nodes.UpdateStatement): Nodes.UpdateStatement {
    if (
      o.offset ||
      this.hasGroupByAndHaving(o) ||
      (this.hasJoinSources(o) && this.hasLimitOrOffsetOrOrders(o))
    ) {
      return super.prepareUpdateStatement(o);
    }
    return o;
  }

  protected override prepareDeleteStatement(o: Nodes.DeleteStatement): Nodes.DeleteStatement {
    if (
      o.offset ||
      this.hasGroupByAndHaving(o) ||
      (this.hasJoinSources(o) && this.hasLimitOrOffsetOrOrders(o))
    ) {
      return super.prepareDeleteStatement(o);
    }
    return o;
  }

  // MySQL doesn't auto-create a temp table for the subquery; force it by
  // adding DISTINCT (when LIMIT/OFFSET/ORDER doesn't already materialize)
  // and wrapping the subselect in another SELECT aliased as
  // `__active_record_temp`. Mirrors Rails MySQL's `build_subselect`.
  //
  // A composite primary key arrives as `Node[]`; the outer projection reads
  // `key.name`, which has no array equivalent. This is a pre-existing Rails
  // parity gap — `arel/visitors/mysql.rb`'s `build_subselect` likewise calls
  // `quote_column_name(key.name)` and does not handle composite keys on the
  // join+LIMIT delete path — so composite-PK MySQL deletes through this branch
  // are unsupported in both implementations.
  protected override buildSubselect(
    key: Node | Node[],
    o: {
      relation: Node | null;
      wheres: Node[];
      groups: Node[];
      havings: Node[];
      limit: Node | null;
      offset: Node | null;
      orders: Node[];
    },
  ): Nodes.SelectStatement {
    const subselect = super.buildSubselect(key, o);

    if (!this.hasLimitOrOffsetOrOrders(subselect)) {
      const subCore = subselect.cores[subselect.cores.length - 1];
      subCore.setQuantifier = new Nodes.Distinct();
    }

    const stmt = new Nodes.SelectStatement();
    const core = stmt.cores[stmt.cores.length - 1];
    core.source = new Nodes.JoinSource(new Nodes.Grouping(subselect).as("__active_record_temp"));
    core.projections = [
      sql(this.quoteColumnName((key as unknown as { name: string }).name), { retryable: true }),
    ];
    return stmt;
  }
}
