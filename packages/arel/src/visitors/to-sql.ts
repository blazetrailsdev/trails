import { arelNode } from "../arel.js";
import { Node } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";
import { Visitor, type NodeCtor } from "./visitor.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";

export class UnsupportedVisitError extends Error {
  constructor(object: unknown) {
    super(`Unsupported argument type: ${constructorName(object)}. Construct an Arel node instead.`);
    this.name = "UnsupportedVisitError";
  }
}

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export type { ArelConnection } from "./connection.js";
import type { ArelConnection } from "./connection.js";

function isActiveModelAttribute(v: unknown): boolean {
  return v instanceof ModelAttribute;
}

function constructorName(v: unknown): string {
  if (v === null || v === undefined) return "NilClass";
  return (v as { constructor?: { name?: string } }).constructor?.name ?? typeof v;
}

const DEFAULT_BIND_BLOCK: (index: number) => string = () => "?";

export class ToSql extends Visitor {
  protected readonly connection: ArelConnection;

  constructor(connection: ArelConnection) {
    super();
    this.connection = connection;
  }

  compile(node: Node | Table | ReadonlyArray<Nodes.NodeOrValue>): string;
  compile<T>(node: Node | Table | ReadonlyArray<Nodes.NodeOrValue>, collector: { value: T }): T;
  compile(
    node: Node | Table | ReadonlyArray<Nodes.NodeOrValue>,
    collector: { value: unknown } = new SQLString(),
  ): unknown {
    return this.accept(node, collector as unknown as SQLString).value;
  }

  protected visitArelNodesDeleteStatement(
    o: Nodes.DeleteStatement,
    collector: SQLString,
  ): SQLString {
    collector.retryable = false;
    o = this.prepareDeleteStatement(o);
    if (this.hasJoinSources(o)) {
      collector.append("DELETE ");
      this.visit((o.relation as Nodes.JoinSource).left, collector);
      collector.append(" FROM ");
    } else {
      collector.append("DELETE FROM ");
    }
    if (o.relation) this.visit(o.relation, collector);

    this.collectNodesFor(o.wheres, collector, " WHERE ", " AND ");
    this.collectNodesFor(o.orders, collector, " ORDER BY ");
    return this.maybeVisit(o.limit, collector);
  }

  protected visitArelNodesUpdateStatement(
    o: Nodes.UpdateStatement,
    collector: SQLString,
  ): SQLString {
    collector.retryable = false;
    o = this.prepareUpdateStatement(o);
    collector.append("UPDATE ");
    if (o.relation) this.visit(o.relation, collector);

    this.collectNodesFor(o.values, collector, " SET ");

    this.collectNodesFor(o.wheres, collector, " WHERE ", " AND ");
    this.collectNodesFor(o.orders, collector, " ORDER BY ");
    return this.maybeVisit(o.limit, collector);
  }

  protected visitArelNodesInsertStatement(
    o: Nodes.InsertStatement,
    collector: SQLString,
  ): SQLString {
    collector.retryable = false;
    collector.append("INSERT INTO ");
    if (o.relation) this.visit(o.relation, collector);

    if (o.columns.length > 0) {
      collector.append(" (");
      const colNames = o.columns.map((c) => {
        if (c instanceof Nodes.SqlLiteral) return c.value;
        const name =
          c instanceof Nodes.Attribute ? c.name : String((c as { name?: string }).name ?? c);
        return this.quoteColumnName(name);
      });
      collector.append(colNames.join(", "));
      collector.append(")");
    }

    if (o.values) {
      return this.maybeVisit(o.values, collector);
    } else if (o.select) {
      return this.maybeVisit(o.select as Node, collector);
    } else {
      return collector;
    }
  }

  protected visitArelNodesExists(o: Nodes.Exists, collector: SQLString): SQLString {
    collector.append("EXISTS (");
    this.visit(o.expressions, collector);
    collector.append(")");
    if (o.alias) {
      collector.append(" AS ");
      this.visit(o.alias, collector);
    }
    return collector;
  }

  protected visitArelNodesCasted(o: Nodes.Casted, collector: SQLString): SQLString {
    let valueForDatabase = o.valueForDatabase();
    if (
      valueForDatabase &&
      typeof valueForDatabase === "object" &&
      "valueForDatabase" in valueForDatabase
    ) {
      const held = valueForDatabase;
      const inner = (held as Record<string, unknown>).valueForDatabase;
      valueForDatabase = typeof inner === "function" ? (inner as () => unknown).call(held) : inner;
    }
    collector.append(this.quote(valueForDatabase));
    return collector;
  }

  private visitArelNodesQuoted(o: Nodes.Quoted, collector: SQLString): SQLString {
    return this.visitArelNodesCasted(o as unknown as Nodes.Casted, collector);
  }

  protected visitArelNodesTrue(_o: Nodes.True, collector: SQLString): SQLString {
    collector.append("TRUE");
    return collector;
  }

  protected visitArelNodesFalse(_o: Nodes.False, collector: SQLString): SQLString {
    collector.append("FALSE");
    return collector;
  }

  private visitArelNodesValuesList(o: Nodes.ValuesList, collector: SQLString): SQLString {
    collector.append("VALUES ");
    for (let i = 0; i < o.rows.length; i++) {
      if (i > 0) collector.append(", ");
      collector.append("(");
      for (let j = 0; j < o.rows[i].length; j++) {
        if (j > 0) collector.append(", ");
        const value = o.rows[i][j];
        if (
          value instanceof Nodes.SqlLiteral ||
          value instanceof Nodes.BindParam ||
          isActiveModelAttribute(value)
        ) {
          this.visit(value as Node, collector);
        } else {
          collector.append(this.quote(value));
        }
      }
      collector.append(")");
    }
    return collector;
  }

  protected visitArelNodesSelectStatement(
    o: Nodes.SelectStatement,
    collector: SQLString,
  ): SQLString {
    if (o.with) {
      this.visit(o.with, collector);
      collector.append(" ");
    }

    collector = o.cores.reduce((c, x) => this.visitArelNodesSelectCore(x, c), collector);

    if (o.orders.length > 0) {
      collector.append(" ORDER BY ");
      this.injectJoin(o.orders, collector, ", ");
    }

    return this.visitArelNodesSelectOptions(o, collector);
  }

  protected visitArelNodesSelectOptions(o: Nodes.SelectStatement, collector: SQLString): SQLString {
    this.maybeVisit(o.limit, collector);
    this.maybeVisit(o.offset, collector);
    this.maybeVisit(o.lock, collector);
    return collector;
  }

  protected visitArelNodesSelectCore(o: Nodes.SelectCore, collector: SQLString): SQLString {
    collector.append("SELECT");

    this.collectOptimizerHints(o, collector);
    this.maybeVisit(o.setQuantifier ?? null, collector);

    this.collectNodesFor(o.projections, collector, " ");

    if (o.source && !o.source.isEmpty()) {
      collector.append(" FROM ");
      this.visit(o.source, collector);
    }

    this.collectNodesFor(o.wheres, collector, " WHERE ", " AND ");
    this.collectNodesFor(o.groups, collector, " GROUP BY ");
    this.collectNodesFor(o.havings, collector, " HAVING ", " AND ");
    this.collectNodesFor(o.windows, collector, " WINDOW ");

    this.maybeVisit(o.comment ?? null, collector);

    return collector;
  }

  protected visitArelNodesOptimizerHints(o: Nodes.OptimizerHints, collector: SQLString): SQLString {
    const hints = o.expr.map((v) => this.sanitizeAsSqlComment(v)).join(" ");
    collector.append(`/*+ ${hints} */`);
    return collector;
  }

  protected visitArelNodesComment(o: Nodes.Comment, collector: SQLString): SQLString {
    const blocks = o.values.map((v) => `/* ${this.sanitizeAsSqlComment(v)} */`);
    collector.append(blocks.join(" "));
    return collector;
  }

  protected collectNodesFor(
    nodes: Node[],
    collector: SQLString,
    spacer: string,
    connector = ", ",
  ): SQLString {
    if (nodes.length === 0) return collector;
    collector.append(spacer);
    this.injectJoin(nodes, collector, connector);
    return collector;
  }

  protected visitArelNodesBin(o: Nodes.Bin, collector: SQLString): SQLString {
    this.visit(o.expr, collector);
    return collector;
  }

  private visitArelNodesDistinct(_o: Nodes.Distinct, collector: SQLString): SQLString {
    collector.append("DISTINCT");
    return collector;
  }

  protected visitArelNodesDistinctOn(_o: Nodes.DistinctOn, _collector: SQLString): SQLString {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/arel/visitors/to_sql.rb:194 cluster=arel-visitor-strategy
    throw new NotImplementedError("DISTINCT ON not implemented for this db");
  }

  private visitArelNodesWith(o: Nodes.With, collector: SQLString): SQLString {
    collector.append("WITH ");
    return this.collectCtes(o.children, collector);
  }

  private visitArelNodesWithRecursive(o: Nodes.WithRecursive, collector: SQLString): SQLString {
    collector.append("WITH RECURSIVE ");
    return this.collectCtes(o.children, collector);
  }

  protected visitArelNodesUnion(o: Nodes.Union, collector: SQLString): SQLString {
    return this.infixValueWithParen(o, collector, " UNION ");
  }

  protected visitArelNodesUnionAll(o: Nodes.UnionAll, collector: SQLString): SQLString {
    return this.infixValueWithParen(o, collector, " UNION ALL ");
  }

  protected visitArelNodesIntersect(o: Nodes.Intersect, collector: SQLString): SQLString {
    collector.append("( ");
    this.infixValue(o, collector, " INTERSECT ");
    collector.append(" )");
    return collector;
  }

  protected visitArelNodesExcept(o: Nodes.Except, collector: SQLString): SQLString {
    collector.append("( ");
    this.infixValue(o, collector, " EXCEPT ");
    collector.append(" )");
    return collector;
  }

  private visitArelNodesNamedWindow(o: Nodes.NamedWindow, collector: SQLString): SQLString {
    collector.append(`${this.quoteColumnName(o.name)} AS `);
    return this.visitArelNodesWindow(o, collector);
  }

  private visitArelNodesWindow(o: Nodes.Window, collector: SQLString): SQLString {
    collector.append("(");

    this.collectNodesFor(o.partitions, collector, "PARTITION BY ");

    if (o.orders.length > 0) {
      if (o.partitions.length > 0) collector.append(" ");
      collector.append("ORDER BY ");
      this.injectJoin(o.orders, collector, ", ");
    }
    if (o.framing) {
      if (o.partitions.length > 0 || o.orders.length > 0) collector.append(" ");
      this.visit(o.framing, collector);
    }
    collector.append(")");
    return collector;
  }

  private visitArelNodesFilter(o: Nodes.Filter, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(" FILTER (WHERE ");
    this.visit(o.right, collector);
    collector.append(")");
    return collector;
  }

  private visitArelNodesRows(o: Nodes.Rows, collector: SQLString): SQLString {
    collector.append("ROWS");
    if (o.expr) {
      collector.append(" ");
      this.visit(o.expr, collector);
    }
    return collector;
  }

  private visitArelNodesRange(o: Nodes.Range, collector: SQLString): SQLString {
    collector.append("RANGE");
    if (o.expr) {
      collector.append(" ");
      this.visit(o.expr, collector);
    }
    return collector;
  }

  private visitArelNodesPreceding(o: Nodes.Preceding, collector: SQLString): SQLString {
    if (o.expr) {
      this.visit(o.expr, collector);
      collector.append(" PRECEDING");
    } else {
      collector.append("UNBOUNDED PRECEDING");
    }
    return collector;
  }

  private visitArelNodesFollowing(o: Nodes.Following, collector: SQLString): SQLString {
    if (o.expr) {
      this.visit(o.expr, collector);
      collector.append(" FOLLOWING");
    } else {
      collector.append("UNBOUNDED FOLLOWING");
    }
    return collector;
  }

  private visitArelNodesCurrentRow(_o: Nodes.CurrentRow, collector: SQLString): SQLString {
    collector.append("CURRENT ROW");
    return collector;
  }

  private visitArelNodesOver(o: Nodes.Over, collector: SQLString): SQLString {
    if (o.right == null) {
      this.visit(o.left, collector);
      collector.append(" OVER ()");
      return collector;
    } else if (o.right instanceof Nodes.SqlLiteral) {
      return this.infixValue(o as { left: Node; right: Node }, collector, " OVER ");
    } else if (typeof o.right === "string") {
      this.visit(o.left, collector);
      collector.append(` OVER ${this.quoteColumnName(o.right)}`);
      return collector;
    } else {
      return this.infixValue(o as { left: Node; right: Node }, collector, " OVER ");
    }
  }

  protected visitArelNodesOffset(o: Nodes.Offset, collector: SQLString): SQLString {
    collector.append("OFFSET ");
    this.visit(o.expr, collector);
    return collector;
  }

  protected visitArelNodesLimit(o: Nodes.Limit, collector: SQLString): SQLString {
    collector.append("LIMIT ");
    this.visit(o.expr, collector);
    return collector;
  }

  protected visitArelNodesLock(o: Nodes.Lock, collector: SQLString): SQLString {
    this.visit(o.expr as Node, collector);
    return collector;
  }

  private visitArelNodesGrouping(o: Nodes.Grouping, collector: SQLString): SQLString {
    if (o.expr instanceof Nodes.Grouping) {
      this.visit(o.expr, collector);
    } else {
      collector.append("(");
      this.visit(o.expr, collector);
      collector.append(")");
    }
    return collector;
  }

  private visitArelNodesHomogeneousIn(o: Nodes.HomogeneousIn, collector: SQLString): SQLString {
    collector.preparable = false;
    this.visit(o.left, collector);
    collector.append(o.type === "in" ? " IN (" : " NOT IN (");
    const values = o.castedValues;
    if (values.length === 0) {
      collector.append(this.quote(null));
    } else {
      collector.addBinds(values, o.procForBinds, this.bindBlock());
    }
    collector.append(")");
    return collector;
  }

  protected visitArelSelectManager(o: { ast: Node }, collector: SQLString): SQLString {
    collector.append("(");
    this.visit(o.ast, collector);
    collector.append(")");
    return collector;
  }

  private visitArelNodesAscending(o: Nodes.Ascending, collector: SQLString): SQLString {
    this.visit(o.expr, collector);
    collector.append(" ASC");
    return collector;
  }

  private visitArelNodesDescending(o: Nodes.Descending, collector: SQLString): SQLString {
    this.visit(o.expr, collector);
    collector.append(" DESC");
    return collector;
  }

  protected visitArelNodesNullsFirst(o: Nodes.NullsFirst, collector: SQLString): SQLString {
    this.visit(o.expr, collector);
    collector.append(" NULLS FIRST");
    return collector;
  }

  protected visitArelNodesNullsLast(o: Nodes.NullsLast, collector: SQLString): SQLString {
    this.visit(o.expr, collector);
    collector.append(" NULLS LAST");
    return collector;
  }

  private visitArelNodesGroup(o: Nodes.Group, collector: SQLString): SQLString {
    return this.visit(o.expr, collector);
  }

  private visitArelNodesNamedFunction(o: Nodes.NamedFunction, collector: SQLString): SQLString {
    collector.retryable = false;
    collector.append(o.name);
    collector.append("(");
    if (o.distinct) collector.append("DISTINCT ");
    this.injectJoin(o.expressions as Nodes.NodeOrValue[], collector, ", ");
    collector.append(")");
    if (o.alias) {
      collector.append(" AS ");
      this.visit(o.alias, collector);
    }
    return collector;
  }

  private visitArelNodesExtract(o: Nodes.Extract, collector: SQLString): SQLString {
    collector.append(`EXTRACT(${String(o.field).toUpperCase()} FROM `);
    this.visit(o.expr, collector);
    collector.append(")");
    return collector;
  }

  protected visitArelNodesCount(o: Nodes.Count, collector: SQLString): SQLString {
    return this.aggregate("COUNT", o, collector);
  }

  protected visitArelNodesSum(o: Nodes.Sum, collector: SQLString): SQLString {
    return this.aggregate("SUM", o, collector);
  }

  protected visitArelNodesMax(o: Nodes.Max, collector: SQLString): SQLString {
    return this.aggregate("MAX", o, collector);
  }

  protected visitArelNodesMin(o: Nodes.Min, collector: SQLString): SQLString {
    return this.aggregate("MIN", o, collector);
  }

  protected visitArelNodesAvg(o: Nodes.Avg, collector: SQLString): SQLString {
    return this.aggregate("AVG", o, collector);
  }

  private visitArelNodesTableAlias(o: Nodes.TableAlias, collector: SQLString): SQLString {
    this.visit(o.relation, collector);
    collector.append(` ${this.quoteTableName(o.name)}`);
    return collector;
  }

  private visitArelNodesBetween(o: Nodes.Between, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(" BETWEEN ");
    if (o.right instanceof Nodes.And) {
      const and = o.right;
      this.visit(and.children[0], collector);
      collector.append(" AND ");
      this.visit(and.children[1], collector);
    } else {
      this.visit(o.right, collector);
    }
    return collector;
  }

  protected visitArelNodesGreaterThanOrEqual(
    o: Nodes.GreaterThanOrEqual,
    collector: SQLString,
  ): SQLString {
    const sign = this.unboundableSign(o.right);
    if (sign === 1) return collector.append("1=0");
    if (sign === -1) return collector.append("1=1");
    return this.visitBinaryOp(o, ">=", collector);
  }

  protected visitArelNodesGreaterThan(o: Nodes.GreaterThan, collector: SQLString): SQLString {
    const sign = this.unboundableSign(o.right);
    if (sign === 1) return collector.append("1=0");
    if (sign === -1) return collector.append("1=1");
    return this.visitBinaryOp(o, ">", collector);
  }

  protected visitArelNodesLessThanOrEqual(
    o: Nodes.LessThanOrEqual,
    collector: SQLString,
  ): SQLString {
    const sign = this.unboundableSign(o.right);
    if (sign === 1) return collector.append("1=1");
    if (sign === -1) return collector.append("1=0");
    return this.visitBinaryOp(o, "<=", collector);
  }

  protected visitArelNodesLessThan(o: Nodes.LessThan, collector: SQLString): SQLString {
    const sign = this.unboundableSign(o.right);
    if (sign === 1) return collector.append("1=1");
    if (sign === -1) return collector.append("1=0");
    return this.visitBinaryOp(o, "<", collector);
  }

  protected visitArelNodesMatches(o: Nodes.Matches, collector: SQLString): SQLString {
    collector = this.visit(o.left, collector);
    collector.append(" LIKE ");
    collector = this.visit(o.right, collector);
    if (o.escape) {
      collector.append(" ESCAPE ");
      return this.visit(o.escape, collector);
    } else {
      return collector;
    }
  }

  protected visitArelNodesDoesNotMatch(o: Nodes.DoesNotMatch, collector: SQLString): SQLString {
    collector = this.visit(o.left, collector);
    collector.append(" NOT LIKE ");
    collector = this.visit(o.right, collector);
    if (o.escape) {
      collector.append(" ESCAPE ");
      return this.visit(o.escape, collector);
    } else {
      return collector;
    }
  }

  private visitArelNodesJoinSource(o: Nodes.JoinSource, collector: SQLString): SQLString {
    if (o.left) this.visit(o.left, collector);
    if (o.right.length > 0) {
      if (o.left) collector.append(" ");
      this.injectJoin(o.right, collector, " ");
    }
    return collector;
  }

  protected visitArelNodesRegexp(_o: Nodes.Regexp, _collector: SQLString): SQLString {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/arel/visitors/to_sql.rb:520 cluster=arel-visitor-strategy
    throw new NotImplementedError("~ not implemented for this db");
  }

  protected visitArelNodesNotRegexp(_o: Nodes.NotRegexp, _collector: SQLString): SQLString {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/arel/visitors/to_sql.rb:524 cluster=arel-visitor-strategy
    throw new NotImplementedError("!~ not implemented for this db");
  }

  private visitArelNodesStringJoin(o: Nodes.StringJoin, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    return collector;
  }

  private visitArelNodesFullOuterJoin(o: Nodes.FullOuterJoin, collector: SQLString): SQLString {
    collector.append("FULL OUTER JOIN ");
    this.visit(o.left, collector);
    collector.append(" ");
    this.visit(o.right as Node, collector);
    return collector;
  }

  private visitArelNodesOuterJoin(o: Nodes.OuterJoin, collector: SQLString): SQLString {
    collector.append("LEFT OUTER JOIN ");
    this.visit(o.left, collector);
    collector.append(" ");
    this.visit(o.right as Node, collector);
    return collector;
  }

  private visitArelNodesRightOuterJoin(o: Nodes.RightOuterJoin, collector: SQLString): SQLString {
    collector.append("RIGHT OUTER JOIN ");
    this.visit(o.left, collector);
    collector.append(" ");
    this.visit(o.right as Node, collector);
    return collector;
  }

  private visitArelNodesInnerJoin(o: Nodes.InnerJoin, collector: SQLString): SQLString {
    collector.append("INNER JOIN ");
    this.visit(o.left, collector);
    if (o.right) {
      collector.append(" ");
      this.visit(o.right, collector);
    }
    return collector;
  }

  private visitArelNodesOn(o: Nodes.On, collector: SQLString): SQLString {
    collector.append("ON ");
    this.visit(o.expr, collector);
    return collector;
  }

  private visitArelNodesNot(o: Nodes.Not, collector: SQLString): SQLString {
    collector.append("NOT (");
    this.visit(o.expr, collector);
    collector.append(")");
    return collector;
  }

  private visitArelTable(o: Table, collector: SQLString): SQLString {
    const name = o.name;
    if (name instanceof Node) {
      this.visit(name, collector);
    } else {
      collector.append(this.quoteTableName(o.name));
    }
    if (o.tableAlias) {
      collector.append(` ${this.quoteTableName(o.tableAlias)}`);
    }
    return collector;
  }

  private visitArelNodesIn(o: Nodes.In, collector: SQLString): SQLString {
    const attr = o.left;
    let values = o.right;
    if (Array.isArray(values)) {
      collector.preparable = false;
      if (values.length > 0) {
        values = values.filter((v) => this.unboundableSign(v) === 0);
      }
      if (values.length === 0) {
        collector.append("1=0");
        return collector;
      }
    }
    this.visit(attr, collector);
    if (
      values &&
      typeof values === "object" &&
      !Array.isArray(values) &&
      "ast" in (values as unknown as Record<string, unknown>) &&
      "toSql" in (values as unknown as Record<string, unknown>)
    ) {
      collector.append(" IN ");
      this.visit(values, collector);
      return collector;
    }
    collector.append(" IN (");
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; i++) {
        if (i > 0) collector.append(", ");
        this.visit(values[i], collector);
      }
    } else {
      this.visit(values, collector);
    }
    collector.append(")");
    return collector;
  }

  private visitArelNodesNotIn(o: Nodes.NotIn, collector: SQLString): SQLString {
    const attr = o.left;
    let values = o.right;
    if (Array.isArray(values)) {
      collector.preparable = false;
      if (values.length > 0) {
        values = values.filter((v) => this.unboundableSign(v) === 0);
      }
      if (values.length === 0) {
        collector.append("1=1");
        return collector;
      }
    }
    this.visit(attr, collector);
    if (Array.isArray(values)) {
      collector.append(" NOT IN (");
      for (let i = 0; i < values.length; i++) {
        if (i > 0) collector.append(", ");
        this.visit(values[i], collector);
      }
      collector.append(")");
    } else {
      collector.append(" NOT IN (");
      this.visit(values, collector);
      collector.append(")");
    }
    return collector;
  }

  private visitArelNodesAnd(o: Nodes.And, collector: SQLString): SQLString {
    return this.injectJoin(o.children, collector, " AND ");
  }

  private visitArelNodesOr(o: Nodes.Or, collector: SQLString): SQLString {
    return this.injectJoin(o.children, collector, " OR ");
  }

  private visitArelNodesAssignment(o: Nodes.Assignment, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(" = ");
    if (o.right instanceof Node || isActiveModelAttribute(o.right)) {
      this.visit(o.right, collector);
    } else {
      collector.append(this.quote(o.right));
    }
    return collector;
  }

  private visitArelNodesEquality(o: Nodes.Equality, collector: SQLString): SQLString {
    const right = o.right;

    if (this.unboundableSign(right) !== 0) {
      return collector.append("1=0");
    }

    this.visit(o.left, collector);

    if (this.rightIsNull(right)) {
      collector.append(" IS NULL");
    } else {
      collector.append(" = ");
      this.visit(right, collector);
    }
    return collector;
  }

  protected visitArelNodesIsNotDistinctFrom(
    o: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    if (this.rightIsNull(o.right)) {
      this.visit(o.left, collector);
      collector.append(" IS NULL");
      return collector;
    }
    collector = this.isDistinctFrom(o, collector);
    collector.append(" = 0");
    return collector;
  }

  protected visitArelNodesIsDistinctFrom(o: Nodes.IsDistinctFrom, collector: SQLString): SQLString {
    if (this.rightIsNull(o.right)) {
      this.visit(o.left, collector);
      collector.append(" IS NOT NULL");
      return collector;
    }
    collector = this.isDistinctFrom(o, collector);
    collector.append(" = 1");
    return collector;
  }

  private visitArelNodesNotEqual(o: Nodes.NotEqual, collector: SQLString): SQLString {
    const right = o.right;

    if (this.unboundableSign(right) !== 0) {
      return collector.append("1=1");
    }

    this.visit(o.left, collector);

    if (this.rightIsNull(right)) {
      collector.append(" IS NOT NULL");
    } else {
      collector.append(" != ");
      this.visit(right, collector);
    }
    return collector;
  }

  private visitArelNodesAs(o: Nodes.As, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(" AS ");
    this.visit(o.right, collector);
    return collector;
  }

  private visitArelNodesCase(o: Nodes.Case, collector: SQLString): SQLString {
    collector.append("CASE");
    if (o.case) {
      collector.append(" ");
      this.visit(o.case, collector);
    }
    for (const when of o.conditions) {
      collector.append(" ");
      this.visitArelNodesWhen(when, collector);
    }
    if (o.default) {
      collector.append(" ");
      this.visit(o.default, collector);
    }
    collector.append(" END");
    return collector;
  }

  protected visitArelNodesWhen(o: Nodes.When, collector: SQLString): SQLString {
    collector.append("WHEN ");
    this.visit(o.left, collector);
    collector.append(" THEN ");
    this.visit(o.right, collector);
    return collector;
  }

  protected visitArelNodesElse(o: Nodes.Else, collector: SQLString): SQLString {
    collector.append("ELSE ");
    this.visit(o.expr as Nodes.NodeOrValue, collector);
    return collector;
  }

  protected visitArelNodesUnqualifiedColumn(
    o: Nodes.UnqualifiedColumn,
    collector: SQLString,
  ): SQLString {
    collector.append(this.quoteColumnName(o.name as string | Node | null));
    return collector;
  }

  protected visitArelNodesCte(o: Nodes.Cte, collector: SQLString): SQLString {
    collector.append(`${this.quoteTableName(o.name)} AS `);
    if (o.materialized === true) {
      collector.append("MATERIALIZED ");
    } else if (o.materialized === false) {
      collector.append("NOT MATERIALIZED ");
    }
    this.visit(o.relation, collector);
    return collector;
  }

  private visitArelAttributesAttribute(o: Nodes.Attribute, collector: SQLString): SQLString {
    const joinName = o.relation.tableAlias || o.relation.name;
    collector.append(this.quoteTableName(joinName));
    collector.append(".");
    collector.append(this.quoteColumnName(o.name));
    return collector;
  }

  protected bindBlock(): (index: number) => string {
    return DEFAULT_BIND_BLOCK;
  }

  protected visitActiveModelAttribute(o: ModelAttribute, collector: SQLString): SQLString {
    collector.addBind(o, this.bindBlock());
    return collector;
  }

  protected visitArelNodesBindParam(o: Nodes.BindParam, collector: SQLString): SQLString {
    collector.addBind(o.value, this.bindBlock());
    return collector;
  }

  private visitArelNodesSqlLiteral(o: Nodes.SqlLiteral, collector: SQLString): SQLString {
    if (!(o as { retryable?: boolean }).retryable) {
      collector.retryable = false;
    }
    collector.preparable = false;
    collector.append(o.value);
    return collector;
  }

  private visitArelNodesBoundSqlLiteral(o: Nodes.BoundSqlLiteral, collector: SQLString): SQLString {
    collector.retryable = false;
    const sql = o.sqlWithPlaceholders;

    if (o.positionalBinds) {
      const positionalBinds = o.positionalBinds;
      const segments = sql.split("?");
      for (let i = 0; i < segments.length; i++) {
        if (segments[i]) collector.append(segments[i]);
        if (i < segments.length - 1) this.visitBindValue(positionalBinds[i] ?? null, collector);
      }
    } else {
      const namedBinds = o.namedBinds ?? {};
      const re = /:(?<!::)([a-zA-Z]\w*)|([^:]+|.)/gy;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        if (m[2] !== undefined) {
          collector.append(m[2]);
        } else {
          this.visitBindValue(namedBinds[m[1]] ?? null, collector);
        }
      }
    }

    return collector;
  }

  protected visitInteger(o: number | bigint, collector: SQLString): SQLString {
    collector.append(String(o));
    return collector;
  }

  protected unsupported(o: unknown, _collector: SQLString): never {
    throw new UnsupportedVisitError(o);
  }

  protected visitActiveSupportMultibyteChars(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitActiveSupportStringInquirer(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitBigDecimal(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitClass(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitDate(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitDateTime(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitFalseClass(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitFloat(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitHash(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitNilClass(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitString(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitSymbol(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitTime(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  protected visitTrueClass(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  private visitArelNodesInfixOperation(o: Nodes.InfixOperation, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(` ${o.operator} `);
    this.visit(o.right, collector);
    return collector;
  }

  private visitArelNodesUnaryOperation(o: Nodes.UnaryOperation, collector: SQLString): SQLString {
    collector.append(` ${o.operator} `);
    this.visit(o.expr, collector);
    return collector;
  }

  protected visitArray(o: ReadonlyArray<Nodes.NodeOrValue>, collector: SQLString): SQLString {
    return this.injectJoin(o, collector, ", ");
  }

  protected visitSet(o: ReadonlySet<Nodes.NodeOrValue>, collector: SQLString): SQLString {
    return this.visitArray([...o], collector);
  }

  protected visitArelNodesFragments(o: Nodes.Fragments, collector: SQLString): SQLString {
    return this.injectJoin(o.values, collector, " ");
  }

  protected quote(value: unknown): string {
    if (value instanceof Nodes.SqlLiteral) return value.value;
    return this.connection.quote(value);
  }

  /** @internal */
  protected quoteTableName(name: string | Node | null): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return this.connection.quoteTableName(name);
  }

  /** @internal */
  protected quoteColumnName(name: string | Node | null): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return this.connection.quoteColumnName(name);
  }

  protected sanitizeAsSqlComment(value: string | Nodes.SqlLiteral): string {
    if (value instanceof Nodes.SqlLiteral) return value.value;
    return this.connection.sanitizeAsSqlComment(String(value));
  }

  protected collectOptimizerHints(o: Nodes.SelectCore, collector: SQLString): SQLString {
    return this.maybeVisit(o.optimizerHints, collector);
  }

  protected maybeVisit(thing: Node | null | undefined, collector: SQLString): SQLString {
    if (!thing) return collector;
    collector.append(" ");
    this.visit(thing, collector);
    return collector;
  }

  protected injectJoin(
    list: ReadonlyArray<Nodes.NodeOrValue>,
    collector: SQLString,
    joinStr: string,
  ): SQLString {
    list.forEach((x, i) => {
      if (i > 0) collector.append(joinStr);
      this.visit(x, collector);
    });
    return collector;
  }

  protected isUnboundable(value: unknown): boolean {
    return this.unboundableSign(value) !== 0;
  }

  protected hasJoinSources(o: { relation: Node | Table | null }): boolean {
    return o.relation instanceof Nodes.JoinSource && o.relation.right.length > 0;
  }

  protected hasLimitOrOffsetOrOrders(o: {
    limit: Node | null;
    offset: Node | null;
    orders: Node[];
  }): boolean {
    return !!(o.limit || o.offset || o.orders.length > 0);
  }

  protected hasGroupByAndHaving(o: { groups: unknown[]; havings: unknown[] }): boolean {
    return o.groups.length > 0 && o.havings.length > 0;
  }

  protected prepareUpdateStatement(o: Nodes.UpdateStatement): Nodes.UpdateStatement {
    if (o.key && (this.hasLimitOrOffsetOrOrders(o) || this.hasJoinSources(o))) {
      const stmt = o.clone();
      stmt.limit = null;
      stmt.offset = null;
      stmt.orders = [];
      const key = Array.isArray(o.key)
        ? o.key.map((k) => this.subselectKey(k))
        : this.subselectKey(o.key);
      const columns = new Nodes.Grouping(key);
      stmt.wheres = [new Nodes.In(columns, [this.buildSubselect(key, o)])];
      if (this.hasJoinSources(o)) {
        stmt.relation = (o.relation as Nodes.JoinSource).left;
      }
      return stmt;
    }
    return o;
  }

  protected prepareDeleteStatement(o: Nodes.DeleteStatement): Nodes.DeleteStatement {
    if (o.key && (this.hasLimitOrOffsetOrOrders(o) || this.hasJoinSources(o))) {
      const stmt = o.clone();
      stmt.limit = null;
      stmt.offset = null;
      stmt.orders = [];
      const key = Array.isArray(o.key)
        ? o.key.map((k) => this.subselectKey(k))
        : this.subselectKey(o.key);
      const columns = new Nodes.Grouping(key);
      stmt.wheres = [new Nodes.In(columns, [this.buildSubselect(key, o)])];
      if (this.hasJoinSources(o)) {
        stmt.relation = (o.relation as Nodes.JoinSource).left;
      }
      return stmt;
    }
    return o;
  }

  protected buildSubselect(
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
    const stmt = new Nodes.SelectStatement();
    const core = stmt.cores[0];
    if (o.relation) core.source = new Nodes.JoinSource(o.relation);
    core.wheres = [...o.wheres];
    core.projections = Array.isArray(key) ? [...key] : [key];
    core.groups = [...o.groups];
    core.havings = [...o.havings];
    stmt.limit = o.limit;
    stmt.offset = o.offset;
    stmt.orders = [...o.orders];
    return stmt;
  }

  protected infixValue(
    o: { left: Nodes.NodeOrValue; right: Nodes.NodeOrValue },
    collector: SQLString,
    value: string,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(value);
    this.visit(o.right, collector);
    return collector;
  }

  protected infixValueWithParen(
    o: Node & { left: Node; right: Node },
    collector: SQLString,
    value: string,
    suppressParens = false,
  ): SQLString {
    const sameClass = (child: Node): child is typeof o =>
      Object.getPrototypeOf(child) === Object.getPrototypeOf(o);

    if (!suppressParens) collector.append("( ");
    if (sameClass(o.left)) {
      this.infixValueWithParen(o.left, collector, value, true);
    } else {
      this.groupingParentheses(o.left, collector, false);
    }
    collector.append(value);
    if (sameClass(o.right)) {
      this.infixValueWithParen(o.right, collector, value, true);
    } else {
      this.groupingParentheses(o.right, collector, false);
    }
    if (!suppressParens) collector.append(" )");
    return collector;
  }

  protected groupingParentheses(
    o: Node,
    collector: SQLString,
    alwaysWrapSelects = true,
  ): SQLString {
    if (o instanceof Nodes.SelectStatement && (alwaysWrapSelects || this.isRequireParentheses(o))) {
      collector.append("(");
      this.visit(o, collector);
      collector.append(")");
      return collector;
    }
    this.visit(o, collector);
    return collector;
  }

  protected isRequireParentheses(o: Nodes.SelectStatement): boolean {
    return o.orders.length > 0 || Boolean(o.limit) || Boolean(o.offset);
  }

  protected aggregate(name: string, o: Nodes.Function, collector: SQLString): SQLString {
    collector.retryable = false;
    collector.append(`${name}(`);
    if (o.distinct) collector.append("DISTINCT ");
    this.injectJoin(o.expressions as Nodes.NodeOrValue[], collector, ", ");
    collector.append(")");
    if (o.alias) {
      collector.append(" AS ");
      this.visit(o.alias, collector);
    }
    return collector;
  }

  protected isDistinctFrom(
    o: { left: Nodes.NodeOrValue; right: Nodes.NodeOrValue },
    collector: SQLString,
  ): SQLString {
    collector.append("CASE WHEN ");
    this.visit(o.left, collector);
    collector.append(" = ");
    this.visit(o.right, collector);
    collector.append(" OR (");
    this.visit(o.left, collector);
    collector.append(" IS NULL AND ");
    this.visit(o.right, collector);
    collector.append(" IS NULL)");
    collector.append(" THEN 0 ELSE 1 END");
    return collector;
  }

  protected collectCtes(
    children: ReadonlyArray<{ toCte(): Node }>,
    collector: SQLString,
  ): SQLString {
    children.forEach((child, i) => {
      if (i > 0) collector.append(", ");
      this.visit(child.toCte(), collector);
    });
    return collector;
  }

  /** @internal */
  static registerDispatch(): void {
    const d = ToSql.dispatchCache();
    const reg = (ctor: NodeCtor, m: string) => d.set(ctor, m);
    reg(Nodes.SelectStatement, "visitArelNodesSelectStatement");
    reg(Nodes.SelectCore, "visitArelNodesSelectCore");
    reg(Nodes.InsertStatement, "visitArelNodesInsertStatement");
    reg(Nodes.UpdateStatement, "visitArelNodesUpdateStatement");
    reg(Nodes.DeleteStatement, "visitArelNodesDeleteStatement");
    reg(Nodes.UnionAll, "visitArelNodesUnionAll");
    reg(Nodes.Union, "visitArelNodesUnion");
    reg(Nodes.Intersect, "visitArelNodesIntersect");
    reg(Nodes.Except, "visitArelNodesExcept");
    reg(Nodes.WithRecursive, "visitArelNodesWithRecursive");
    reg(Nodes.With, "visitArelNodesWith");
    reg(Nodes.TableAlias, "visitArelNodesTableAlias");
    reg(Nodes.Cte, "visitArelNodesCte");
    reg(Nodes.JoinSource, "visitArelNodesJoinSource");
    reg(Nodes.InnerJoin, "visitArelNodesInnerJoin");
    reg(Nodes.OuterJoin, "visitArelNodesOuterJoin");
    reg(Nodes.RightOuterJoin, "visitArelNodesRightOuterJoin");
    reg(Nodes.FullOuterJoin, "visitArelNodesFullOuterJoin");
    reg(Nodes.StringJoin, "visitArelNodesStringJoin");
    reg(Nodes.On, "visitArelNodesOn");
    reg(Nodes.Equality, "visitArelNodesEquality");
    reg(Nodes.NotEqual, "visitArelNodesNotEqual");
    reg(Nodes.GreaterThan, "visitArelNodesGreaterThan");
    reg(Nodes.GreaterThanOrEqual, "visitArelNodesGreaterThanOrEqual");
    reg(Nodes.LessThan, "visitArelNodesLessThan");
    reg(Nodes.LessThanOrEqual, "visitArelNodesLessThanOrEqual");
    reg(Nodes.Matches, "visitArelNodesMatches");
    reg(Nodes.DoesNotMatch, "visitArelNodesDoesNotMatch");
    reg(Nodes.In, "visitArelNodesIn");
    reg(Nodes.NotIn, "visitArelNodesNotIn");
    reg(Nodes.Between, "visitArelNodesBetween");
    reg(Nodes.Regexp, "visitArelNodesRegexp");
    reg(Nodes.NotRegexp, "visitArelNodesNotRegexp");
    reg(Nodes.IsDistinctFrom, "visitArelNodesIsDistinctFrom");
    reg(Nodes.IsNotDistinctFrom, "visitArelNodesIsNotDistinctFrom");
    reg(Nodes.Assignment, "visitArelNodesAssignment");
    reg(Nodes.As, "visitArelNodesAs");
    reg(Nodes.Ascending, "visitArelNodesAscending");
    reg(Nodes.Descending, "visitArelNodesDescending");
    reg(Nodes.Offset, "visitArelNodesOffset");
    reg(Nodes.Limit, "visitArelNodesLimit");
    reg(Nodes.Lock, "visitArelNodesLock");
    reg(Nodes.DistinctOn, "visitArelNodesDistinctOn");
    reg(Nodes.Bin, "visitArelNodesBin");
    reg(Nodes.NullsFirst, "visitArelNodesNullsFirst");
    reg(Nodes.NullsLast, "visitArelNodesNullsLast");
    reg(Nodes.UnaryOperation, "visitArelNodesUnaryOperation");
    reg(Nodes.And, "visitArelNodesAnd");
    reg(Nodes.Or, "visitArelNodesOr");
    reg(Nodes.Not, "visitArelNodesNot");
    reg(Nodes.Grouping, "visitArelNodesGrouping");
    reg(Nodes.Over, "visitArelNodesOver");
    reg(Nodes.NamedWindow, "visitArelNodesNamedWindow");
    reg(Nodes.Window, "visitArelNodesWindow");
    reg(Nodes.Rows, "visitArelNodesRows");
    reg(Nodes.Range, "visitArelNodesRange");
    reg(Nodes.Preceding, "visitArelNodesPreceding");
    reg(Nodes.Following, "visitArelNodesFollowing");
    reg(Nodes.CurrentRow, "visitArelNodesCurrentRow");
    reg(Nodes.Filter, "visitArelNodesFilter");
    reg(Nodes.Case, "visitArelNodesCase");
    reg(Nodes.When, "visitArelNodesWhen");
    reg(Nodes.Else, "visitArelNodesElse");
    reg(Nodes.Extract, "visitArelNodesExtract");
    reg(Nodes.Concat, "visitArelNodesConcat");
    reg(Nodes.InfixOperation, "visitArelNodesInfixOperation");
    reg(Nodes.BoundSqlLiteral, "visitArelNodesBoundSqlLiteral");
    reg(Nodes.BindParam, "visitArelNodesBindParam");
    reg(ModelAttribute, "visitActiveModelAttribute");
    reg(Nodes.Fragments, "visitArelNodesFragments");
    reg(Nodes.NamedFunction, "visitArelNodesNamedFunction");
    reg(Nodes.Exists, "visitArelNodesExists");
    reg(Nodes.Count, "visitArelNodesCount");
    reg(Nodes.Sum, "visitArelNodesSum");
    reg(Nodes.Max, "visitArelNodesMax");
    reg(Nodes.Min, "visitArelNodesMin");
    reg(Nodes.Avg, "visitArelNodesAvg");
    reg(Nodes.Group, "visitArelNodesGroup");
    reg(Nodes.Comment, "visitArelNodesComment");
    reg(Nodes.OptimizerHints, "visitArelNodesOptimizerHints");
    reg(Nodes.HomogeneousIn, "visitArelNodesHomogeneousIn");
    reg(Nodes.True, "visitArelNodesTrue");
    reg(Nodes.False, "visitArelNodesFalse");
    reg(Nodes.Distinct, "visitArelNodesDistinct");
    reg(Nodes.SqlLiteral, "visitArelNodesSqlLiteral");
    reg(Nodes.Quoted, "visitArelNodesQuoted");
    reg(Nodes.Casted, "visitArelNodesCasted");
    reg(Nodes.UnqualifiedColumn, "visitArelNodesUnqualifiedColumn");
    reg(Nodes.Attribute, "visitArelAttributesAttribute");
    reg(Nodes.ValuesList, "visitArelNodesValuesList");
    reg(Table, "visitArelTable");
  }

  private subselectKey(key: Node): Node {
    if (key instanceof Nodes.Equality) {
      return key.left as Node;
    }
    return key;
  }

  protected visitBinaryOp(o: Nodes.Binary, op: string, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(` ${op} `);
    this.visit(o.right, collector);
    return collector;
  }

  protected addDateBind(value: unknown, collector: SQLString): void {
    collector.addBind(value, this.bindBlock());
  }

  private visitBindValue(value: unknown, collector: SQLString): void {
    if (arelNode(value)) {
      this.visit(value as Node, collector);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        collector.append(this.quote(null));
      } else if (!value.some((v) => arelNode(v))) {
        collector.addBinds(
          value.map((v) => this.connection.castBoundValue(v)),
          null,
          this.bindBlock(),
        );
      } else {
        value.forEach((v, i) => {
          if (i > 0) collector.append(", ");
          if (arelNode(v)) {
            this.visit(v as Node, collector);
          } else {
            collector.addBind(this.connection.castBoundValue(v), this.bindBlock());
          }
        });
      }
    } else {
      collector.addBind(this.connection.castBoundValue(value), this.bindBlock());
    }
  }

  protected visitArelNodesConcat(o: Nodes.Concat, collector: SQLString): SQLString {
    this.visit(o.left, collector);
    collector.append(" || ");
    this.visit(o.right, collector);
    return collector;
  }

  protected unboundableSign(value: unknown): 1 | -1 | 0 {
    const v = value as { isUnboundable?: () => unknown } | null | undefined;
    if (typeof v?.isUnboundable !== "function") return 0;
    const r = v.isUnboundable();
    if (r === 1) return 1;
    if (r === -1) return -1;
    return 0;
  }

  protected rightIsNull(right: unknown): boolean {
    if (right === null || right === undefined) return true;
    const maybe = right as { isNil?: () => boolean };
    return typeof maybe?.isNil === "function" && maybe.isNil();
  }
}
