import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

const BIND_BLOCK: (index: number) => string = (i: number) => `$${i}`;

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
    this.visit(o.expr, collector);
    collector.append(" )");
    return collector;
  }

  protected visitArelNodesGroupingElement(
    o: Nodes.GroupingElement,
    collector: SQLString,
  ): SQLString {
    collector.append("( ");
    this.visit(o.expr as Nodes.Node | Nodes.Node[], collector);
    collector.append(" )");
    return collector;
  }

  protected visitArelNodesCube(o: Nodes.Cube, collector: SQLString): SQLString {
    collector.append("CUBE");
    return this.groupingArrayOrGroupingElement(o, collector);
  }

  protected visitArelNodesRollUp(o: Nodes.RollUp, collector: SQLString): SQLString {
    collector.append("ROLLUP");
    return this.groupingArrayOrGroupingElement(o, collector);
  }

  protected visitArelNodesGroupingSet(o: Nodes.GroupingSet, collector: SQLString): SQLString {
    collector.append("GROUPING SETS");
    return this.groupingArrayOrGroupingElement(o, collector);
  }

  protected visitArelNodesLateral(o: Nodes.Lateral, collector: SQLString): SQLString {
    collector.append("LATERAL ");
    return this.groupingParentheses(o.expr, collector);
  }

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

  protected override bindBlock(): (index: number) => string {
    return BIND_BLOCK;
  }

  protected groupingArrayOrGroupingElement(o: Nodes.Unary, collector: SQLString): SQLString {
    if (Array.isArray(o.expr)) {
      collector.append("( ");
      this.visit(o.expr, collector);
      collector.append(" )");
    } else {
      return this.visit(o.expr, collector);
    }
    return collector;
  }
}
