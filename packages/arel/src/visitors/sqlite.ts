import * as Nodes from "../nodes/index.js";
import { Node } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import { ToSql } from "./to-sql.js";

export class SQLite extends ToSql {
  protected override visitArelNodesLock(_node: Nodes.Lock, collector: SQLString): SQLString {
    return collector;
  }

  protected override visitArelNodesSelectStatement(
    o: Nodes.SelectStatement,
    collector: SQLString,
  ): SQLString {
    if (o.offset && !o.limit) o.limit = new Nodes.Limit(-1);
    return super.visitArelNodesSelectStatement(o, collector);
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
    o: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(" IS ");
    this.visit(o.right, collector);
    return collector;
  }

  protected override visitArelNodesIsDistinctFrom(
    o: Nodes.IsDistinctFrom,
    collector: SQLString,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(" IS NOT ");
    this.visit(o.right, collector);
    return collector;
  }

  protected override infixValueWithParen(
    o: Node & { left: Node; right: Node },
    collector: SQLString,
    value: string,
    suppressParens = false,
  ): SQLString {
    const sameClass = (child: Node): child is typeof o =>
      Object.getPrototypeOf(child) === Object.getPrototypeOf(o);

    if (!suppressParens) collector.append("( ");
    const left = this.unwrapGrouping(o.left);
    if (sameClass(left)) {
      this.infixValueWithParen(left, collector, value, true);
    } else {
      this.groupingParentheses(left, collector, false);
    }
    collector.append(value);
    const right = this.unwrapGrouping(o.right);
    if (sameClass(right)) {
      this.infixValueWithParen(right, collector, value, true);
    } else {
      this.groupingParentheses(right, collector, false);
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
