import { Node } from "../nodes/node.js";
import * as Nodes from "../nodes/index.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql, resolveValueForDatabase } from "./to-sql.js";
import { quoteArrayLiteral } from "../quote-array.js";

/**
 * PostgreSQL visitor — extends generic ToSql with PostgreSQL-specific features.
 *
 * Mirrors: Arel::Visitors::PostgreSQL
 */
export class PostgreSQL extends ToSql {
  protected override visitArelNodesDistinctOn(node: Nodes.DistinctOn): SQLString {
    this.collector.append("DISTINCT ON (");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    this.collector.append(")");
    return this.collector;
  }

  protected override visitArelNodesMatches(node: Nodes.Matches): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(node.caseSensitive ? " LIKE " : " ILIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  protected override visitArelNodesDoesNotMatch(node: Nodes.DoesNotMatch): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(node.caseSensitive ? " NOT LIKE " : " NOT ILIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  protected override visitArelNodesRegexp(node: Nodes.Regexp): SQLString {
    return this.visitBinaryOp(node, node.caseSensitive ? "~" : "~*");
  }

  protected override visitArelNodesNotRegexp(node: Nodes.NotRegexp): SQLString {
    return this.visitBinaryOp(node, node.caseSensitive ? "!~" : "!~*");
  }

  protected override quote(value: unknown): string {
    if (Array.isArray(value)) {
      const literal = quoteArrayLiteral(value);
      return `'${literal.replace(/'/g, "''")}'`;
    }
    return super.quote(value);
  }

  // Mirrors Rails Postgres formatting: `( expr )` with spaces inside
  // the parens. The base ToSql renders `(expr)` without spaces, so
  // override to match Rails' `visit_Arel_Nodes_GroupingElement`.
  protected override visitArelNodesGroupingElement(node: Nodes.GroupingElement): SQLString {
    return this.groupingArrayOrGroupingElement(node);
  }

  // Cube/Rollup/GroupingSet: emit `CUBE` / `ROLLUP` / `GROUPING SETS`
  // followed by `grouping_array_or_grouping_element` formatting. Mirrors
  // Rails Postgres ([postgresql.rb](https://github.com/rails/rails/blob/v8.0.2/activerecord/lib/arel/visitors/postgresql.rb)).
  protected override visitArelNodesCube(node: Nodes.Cube): SQLString {
    this.collector.append("CUBE");
    return this.groupingArrayOrGroupingElement(node);
  }

  protected override visitArelNodesRollUp(node: Nodes.Rollup): SQLString {
    this.collector.append("ROLLUP");
    return this.groupingArrayOrGroupingElement(node);
  }

  protected override visitArelNodesGroupingSet(node: Nodes.GroupingSet): SQLString {
    this.collector.append("GROUPING SETS");
    return this.groupingArrayOrGroupingElement(node);
  }

  // Lateral: only add wrapping parens when the inner isn't already a
  // Grouping (Rails: `grouping_parentheses`). Trails' base unconditionally
  // wraps, so a `LATERAL (grouping)` pre-existing parens would
  // produce `LATERAL ((expr))`.
  protected override visitArelNodesLateral(node: Nodes.Lateral): SQLString {
    this.collector.append("LATERAL ");
    if (node.subquery instanceof Nodes.Grouping) {
      this.visit(node.subquery);
    } else {
      this.collector.append("(");
      this.visit(node.subquery);
      this.collector.append(")");
    }
    return this.collector;
  }

  // Postgres natively supports `IS [NOT] DISTINCT FROM`. Behaviorally
  // identical to the base ToSql visitor; the explicit override mirrors
  // Rails' Postgres visitor for fidelity (no behavior change).
  protected override visitArelNodesIsNotDistinctFrom(node: Nodes.IsNotDistinctFrom): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" IS NOT DISTINCT FROM ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  protected override visitArelNodesIsDistinctFrom(node: Nodes.IsDistinctFrom): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" IS DISTINCT FROM ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  /**
   * Mirrors Rails Postgres `grouping_array_or_grouping_element` (postgresql.rb:87).
   * Trails' `GroupingElement` always carries an `expressions: Node[]`
   * (Rails normalizes between bare `expr` and array `expr`); the wrapped
   * `( ... )` shape is the one Rails takes when `o.expr.is_a? Array`,
   * which Trails always hits. Used by visitArelNodesCube / RollUp /
   * GroupingSet / GroupingElement.
   */
  protected groupingArrayOrGroupingElement(o: Nodes.GroupingElement): SQLString {
    this.collector.append("( ");
    o.expressions.forEach((expr, i) => {
      if (i > 0) this.collector.append(", ");
      this.visit(expr);
    });
    this.collector.append(" )");
    return this.collector;
  }
}

/**
 * PostgreSQL visitor — uses numbered bind parameters ($1, $2, ...).
 */
export class PostgreSQLWithBinds extends PostgreSQL {
  private bindIndex = 0;

  override compile(node: Node): string {
    this.bindIndex = 0;
    return super.compile(node);
  }

  override compileWithCollector(node: Node, externalCollector?: unknown): SQLString {
    this.bindIndex = 0;
    return super.compileWithCollector(node, externalCollector);
  }

  override compileWithBinds(node: Node): [string, unknown[]] {
    this.bindIndex = 0;
    return super.compileWithBinds(node);
  }

  protected override visitArelNodesCasted(node: Nodes.Casted): SQLString {
    if (this._extractBinds) {
      this.bindIndex += 1;
      this.collector.addBind(node.valueForDatabase(), () => `$${this.bindIndex}`);
    } else {
      this.collector.append(this.quote(node.valueForDatabase()));
    }
    return this.collector;
  }

  protected override visitArelNodesBindParam(node: Nodes.BindParam): SQLString {
    if (this._extractBinds) {
      this.bindIndex += 1;
      const value = node.value !== undefined ? node.value : node;
      this.collector.addBind(value, () => `$${this.bindIndex}`);
    } else if (node.value !== undefined) {
      this.collector.append(this.quote(resolveValueForDatabase(node.value)));
    } else {
      this.bindIndex += 1;
      this.collector.append(`$${this.bindIndex}`);
    }
    return this.collector;
  }

  protected override addDateBind(value: unknown): void {
    this.bindIndex += 1;
    this.collector.addBind(value, () => `$${this.bindIndex}`);
  }
}
