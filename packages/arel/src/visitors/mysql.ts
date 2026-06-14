import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql, cteRelationSelfWraps } from "./to-sql.js";
import type { ArelConnection } from "./connection.js";
import { mysqlDefaultQuoter } from "./default-quoter.js";

/**
 * MySQL visitor — dialect tweaks on top of generic ToSql.
 *
 * Mirrors: Arel::Visitors::MySQL
 */
export class MySQL extends ToSql {
  constructor(connection: ArelConnection = mysqlDefaultQuoter) {
    super(connection);
  }

  // Mirrors Rails' MySQL visitor: `CAST(expr AS BINARY)` (the explicit
  // cast form) rather than the prefix-`BINARY ` operator the previous
  // Trails impl used. Both force binary comparison; this matches Rails'
  // emitted SQL.
  protected override visitArelNodesBin(node: Nodes.Bin, collector: SQLString): SQLString {
    collector.append("CAST(");
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else if (node.expr !== null) {
      collector.append(String(node.expr));
    }
    collector.append(" AS BINARY)");
    return collector;
  }

  // MySQL renders an UnqualifiedColumn by visiting its inner expression
  // (typically an Attribute). Rails delegates with `visit o.expr` —
  // unlike the base ToSql which special-cases the bare name. The
  // relation prefix this leaves on for an Attribute is fine: MySQL's
  // `UPDATE t SET x = t.x + 1` is valid.
  protected override visitArelNodesUnqualifiedColumn(
    node: Nodes.UnqualifiedColumn,
    collector: SQLString,
  ): SQLString {
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else if (node.expr !== null) {
      collector.append(String(node.expr));
    }
    return collector;
  }

  protected override visitArelNodesSelectStatement(
    node: Nodes.SelectStatement,
    collector: SQLString,
  ): SQLString {
    if (node.with) {
      this.visit(node.with, collector);
      collector.append(" ");
    }

    for (let i = 0; i < node.cores.length; i++) {
      if (i > 0) collector.append(" ");
      this.visit(node.cores[i], collector);
    }

    if (node.orders.length > 0) {
      collector.append(" ORDER BY ");
      this.injectJoin(node.orders, ", ", collector);
    }

    if (node.limit) {
      collector.append(" ");
      this.visit(node.limit, collector);
    } else if (node.offset) {
      // MySQL requires a LIMIT when using OFFSET; use the max unsigned 64-bit value.
      collector.append(" LIMIT 18446744073709551615");
    }

    if (node.offset) {
      collector.append(" ");
      this.visit(node.offset, collector);
    }

    if (node.lock) {
      collector.append(" ");
      this.visit(node.lock, collector);
    }

    return collector;
  }

  protected override visitArelNodesSelectCore(
    node: Nodes.SelectCore,
    collector: SQLString,
  ): SQLString {
    collector.append("SELECT");

    this.emitOptimizerHints(node, collector);

    if (node.setQuantifier) {
      collector.append(" ");
      this.visit(node.setQuantifier, collector);
    }

    if (node.projections.length > 0) {
      collector.append(" ");
      this.injectJoin(node.projections, ", ", collector);
    }

    // MySQL emits FROM DUAL for empty FROM.
    if (node.source.left) {
      collector.append(" FROM ");
      this.visit(node.source, collector);
    } else {
      collector.append(" FROM DUAL");
    }

    if (node.wheres.length > 0) {
      collector.append(" WHERE ");
      const conditions = node.wheres.length === 1 ? node.wheres[0] : new Nodes.And(node.wheres);
      this.visit(conditions, collector);
    }

    if (node.groups.length > 0) {
      collector.append(" GROUP BY ");
      this.injectJoin(node.groups, ", ", collector);
    }

    if (node.havings.length > 0) {
      collector.append(" HAVING ");
      const conditions = node.havings.length === 1 ? node.havings[0] : new Nodes.And(node.havings);
      this.visit(conditions, collector);
    }

    if (node.windows.length > 0) {
      collector.append(" WINDOW ");
      this.injectJoin(node.windows, ", ", collector);
    }

    // Mirrors base ToSql#visitArelNodesSelectCore — emits the optional
    // SQL comment after WINDOW. Rails' MySQL visitor (mysql.rb) inherits
    // the SelectCore visitor from to_sql.rb; Trails overrides for the
    // FROM DUAL behavior so the comment emission has to be replicated.
    this.maybeVisit(node.comment ?? null, collector);

    return collector;
  }

  protected override visitArelNodesConcat(node: Nodes.Concat, collector: SQLString): SQLString {
    collector.append(" CONCAT(");
    this.visitNodeOrValue(node.left, collector);
    collector.append(", ");
    this.visitNodeOrValue(node.right, collector);
    collector.append(") ");
    return collector;
  }

  // MySQL's null-safe equality is `<=>`. The standard `IS [NOT] DISTINCT
  // FROM` is supported only on MySQL 8.0.14+; the operator form works
  // on every MySQL version.
  protected override visitArelNodesIsNotDistinctFrom(
    node: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" <=> ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  protected override visitArelNodesIsDistinctFrom(
    node: Nodes.IsDistinctFrom,
    collector: SQLString,
  ): SQLString {
    collector.append("NOT ");
    this.visitNodeOrValue(node.left, collector);
    collector.append(" <=> ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  // MySQL uses `REGEXP` / `NOT REGEXP`, not the SQL-standard `~` /
  // `!~` (which is Postgres). Mirrors Rails MySQL's `infix_value`
  // helper — same shape as visitArelNodesMatches.
  protected override visitArelNodesRegexp(node: Nodes.Regexp, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" REGEXP ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  protected override visitArelNodesNotRegexp(
    node: Nodes.NotRegexp,
    collector: SQLString,
  ): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" NOT REGEXP ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  protected override visitArelNodesNullsFirst(
    node: Nodes.NullsFirst,
    collector: SQLString,
  ): SQLString {
    // MySQL has no NULLS FIRST; emulate: col IS NOT NULL, col ASC/DESC
    const ordering = node.expr as Nodes.Ascending | Nodes.Descending;
    this.visitNodeOrValue(ordering.expr as Nodes.NodeOrValue, collector);
    collector.append(" IS NOT NULL, ");
    this.visit(ordering, collector);
    return collector;
  }

  protected override visitArelNodesNullsLast(
    node: Nodes.NullsLast,
    collector: SQLString,
  ): SQLString {
    // MySQL has no NULLS LAST; emulate: col IS NULL, col ASC/DESC
    const ordering = node.expr as Nodes.Ascending | Nodes.Descending;
    this.visitNodeOrValue(ordering.expr as Nodes.NodeOrValue, collector);
    collector.append(" IS NULL, ");
    this.visit(ordering, collector);
    return collector;
  }

  protected override visitArelNodesCte(node: Nodes.Cte, collector: SQLString): SQLString {
    // MySQL identifiers are backtick-quoted, not double-quoted, and the
    // MATERIALIZED / NOT MATERIALIZED modifiers Postgres supports are
    // ignored. Mirrors Rails' MySQL visit_Arel_Nodes_Cte which calls
    // `quote_table_name` (which emits backticks on the MySQL adapter).
    // Parens: Trails stores a bare SelectStatement in Cte.relation (not a
    // SelectManager as Rails does), so we add them explicitly. But a
    // Grouping (SqlLiteral path) or a set-operation node (array CTE → UnionAll)
    // visits with its own parens — skip the explicit wrap in that case.
    collector.append(`${this.connection.quoteTableName(node.name)} AS `);
    if (cteRelationSelfWraps(node.relation)) {
      this.visit(node.relation, collector);
    } else {
      collector.append("(");
      this.visit(node.relation, collector);
      collector.append(")");
    }
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
    const keyName = (key as unknown as { name: string }).name;
    core.source = new Nodes.JoinSource(new Nodes.Grouping(subselect).as("__active_record_temp"));
    core.projections = [new Nodes.SqlLiteral(this.quoteColumnName(keyName), { retryable: true })];
    return stmt;
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
}
