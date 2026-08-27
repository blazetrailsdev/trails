import type { Table } from "../table.js";
import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";
import { sql } from "../arel.js";

export class MySQL extends ToSql {
  protected override visitArelNodesBin(o: Nodes.Bin, collector: SQLString): SQLString {
    collector.append("CAST(");
    this.visit(o.expr, collector);
    collector.append(" AS BINARY)");
    return collector;
  }

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
    collector.append(`${this.quoteTableName(o.name)} AS `);
    this.visit(o.relation, collector);
    return collector;
  }

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

  protected override buildSubselect(
    key: Node | Node[],
    o: {
      relation: Node | Table | null;
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
