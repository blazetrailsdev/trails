import * as Nodes from "../nodes/index.js";
import { Node } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

/**
 * SQLite visitor — dialect tweaks on top of generic ToSql.
 *
 * Mirrors: Arel::Visitors::SQLite
 */
export class SQLite extends ToSql {
  protected override visitArelNodesLock(_node: Nodes.Lock, collector: SQLString): SQLString {
    // SQLite does not support locking — silently ignore.
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
      // SQLite requires LIMIT when using OFFSET; -1 means "no limit".
      collector.append(" LIMIT -1");
    }

    if (node.offset) {
      collector.append(" ");
      this.visit(node.offset, collector);
    }

    // SQLite does not support locking; ignore lock clause entirely.

    return collector;
  }

  protected override visitArelNodesTrue(_node: Nodes.True, collector: SQLString): SQLString {
    collector.append("1");
    return collector;
  }

  protected override visitArelNodesFalse(_node: Nodes.False, collector: SQLString): SQLString {
    collector.append("0");
    return collector;
  }

  protected override visitArelNodesIsNotDistinctFrom(
    node: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left, collector);
      collector.append(" IS NULL");
      return collector;
    }
    return this.visitBinaryOp(node, "IS", collector);
  }

  /**
   * SQLite has no `IS DISTINCT FROM`; it overloads `IS` / `IS NOT` to be
   * NULL-aware equality/inequality. Rails routes `IsDistinctFrom` /
   * `IsNotDistinctFrom` through the SQLite adapter and emits `IS NOT` /
   * `IS` accordingly.
   */
  protected override visitArelNodesIsDistinctFrom(
    node: Nodes.IsDistinctFrom,
    collector: SQLString,
  ): SQLString {
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left, collector);
      collector.append(" IS NOT NULL");
      return collector;
    }
    return this.visitBinaryOp(node, "IS NOT", collector);
  }

  /**
   * Mirrors `sqlite.rb#infix_value_with_paren`. SQLite rejects parens around
   * SELECT operands of UNION/INTERSECT/EXCEPT — strip a `Grouping` wrapper
   * from each operand before recursing/visiting.
   */
  protected override infixValueWithParen(
    o: Node & { left: Node; right: Node },
    value: string,
    suppressParens = false,
    collector: SQLString,
  ): SQLString {
    const sameClass = (child: Node): child is typeof o =>
      Object.getPrototypeOf(child) === Object.getPrototypeOf(o);

    if (!suppressParens) collector.append("( ");
    const left = this.unwrapGrouping(o.left);
    if (sameClass(left)) {
      this.infixValueWithParen(left, value, true, collector);
    } else {
      this.groupingParentheses(left, false, collector);
    }
    collector.append(value);
    const right = this.unwrapGrouping(o.right);
    if (sameClass(right)) {
      this.infixValueWithParen(right, value, true, collector);
    } else {
      this.groupingParentheses(right, false, collector);
    }
    if (!suppressParens) collector.append(" )");
    return collector;
  }

  protected override quote(value: unknown): string {
    if (typeof value === "boolean") return value ? "1" : "0";
    return super.quote(value);
  }

  private unwrapGrouping(node: Node): Node {
    if (node instanceof Nodes.Grouping && node.expr && typeof node.expr === "object") {
      return node.expr as Node;
    }
    return node;
  }
}
