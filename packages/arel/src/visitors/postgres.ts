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
  protected override visitDistinctOn(node: Nodes.DistinctOn): SQLString {
    this.collector.append("DISTINCT ON (");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    this.collector.append(")");
    return this.collector;
  }

  protected override visitMatches(node: Nodes.Matches): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(node.caseSensitive ? " LIKE " : " ILIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  protected override visitDoesNotMatch(node: Nodes.DoesNotMatch): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(node.caseSensitive ? " NOT LIKE " : " NOT ILIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  protected override visitRegexp(node: Nodes.Regexp): SQLString {
    return this.visitBinaryOp(node, node.caseSensitive ? "~" : "~*");
  }

  protected override visitNotRegexp(node: Nodes.NotRegexp): SQLString {
    return this.visitBinaryOp(node, "!~");
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

  override compileWithCollector(node: Node): SQLString {
    this.bindIndex = 0;
    return super.compileWithCollector(node);
  }

  protected override visitBindParam(node: Nodes.BindParam): SQLString {
    if (node.value !== undefined) {
      this.collector.append(this.quote(node.value));
    } else {
      this.bindIndex += 1;
      this.collector.append(`$${this.bindIndex}`);
    }
    return this.collector;
  }
}
