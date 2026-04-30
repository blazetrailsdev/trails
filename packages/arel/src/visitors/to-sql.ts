import { Node, NodeVisitor } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import { Bind } from "../collectors/bind.js";
import { Composite } from "../collectors/composite.js";
import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";
import { Visitor, type NodeCtor } from "./visitor.js";
import { UnsupportedVisitError, NotImplementedError } from "../errors.js";

/**
 * Resolve a bind's database value. QueryAttribute exposes
 * `valueForDatabase` as a method; ActiveModel::Attribute (TS port)
 * exposes it as a getter. A normal property read handles both shapes —
 * the getter evaluates to its value, a method reference yields a
 * function that we then invoke.
 */
export function resolveValueForDatabase(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("valueForDatabase" in value)) return value;
  const v = (value as Record<string, unknown>).valueForDatabase;
  return typeof v === "function" ? (v as () => unknown).call(value) : v;
}

/** Default placeholder block; mirrors Rails' module-level `BIND_BLOCK`. */
const DEFAULT_BIND_BLOCK: (index: number) => string = () => "?";

/**
 * ToSql visitor — walks the AST and produces SQL strings.
 *
 * Mirrors: Arel::Visitors::ToSql
 */
export class ToSql extends Visitor implements NodeVisitor<SQLString> {
  protected collector!: SQLString;
  private _inUpdateSet = false;
  protected _extractBinds = false;

  compile(node: Node): string {
    this.collector = new SQLString();
    this.visit(node);
    return this.collector.value;
  }

  compileWithCollector(node: Node, externalCollector?: unknown): SQLString {
    if (externalCollector) {
      this.collector = externalCollector as SQLString;
      this._extractBinds = true;
      try {
        this.visit(node);
      } finally {
        this._extractBinds = false;
      }
      return this.collector;
    }
    this.collector = new SQLString();
    this.visit(node);
    return this.collector;
  }

  /**
   * Compile an AST node and extract bind values separately.
   * Returns [sql_with_placeholders, bind_values].
   *
   * Mirrors: Rails' compilation with Arel::Collectors::Composite
   */
  compileWithBinds(node: Node): [string, unknown[]] {
    const sqlCollector = new SQLString();
    const bindCollector = new Bind();
    this.collector = new Composite(sqlCollector, bindCollector) as unknown as SQLString;
    this._extractBinds = true;
    try {
      this.visit(node);
    } finally {
      this._extractBinds = false;
    }
    const binds = bindCollector.value.map((b) => (b instanceof Nodes.BindParam ? b.value : b));
    return [sqlCollector.value, binds];
  }

  /**
   * Rails passes the collector as a second arg through the visit chain;
   * we route SQL through `this.collector` instance state instead, so the
   * base's collector argument is unused here by design.
   *
   * @internal
   */
  visit(node: Node): SQLString {
    return super.visit(node) as SQLString;
  }

  // Per-class dispatch wrappers for shared helpers — mirrors Rails' per-method
  // form (each operator/aggregate has its own visit method).
  protected visitArelNodesGreaterThan(node: Nodes.GreaterThan): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return this.collector.append("1=0");
    if (sign === -1) return this.collector.append("1=1");
    return this.visitBinaryOp(node, ">");
  }
  protected visitArelNodesGreaterThanOrEqual(node: Nodes.GreaterThanOrEqual): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return this.collector.append("1=0");
    if (sign === -1) return this.collector.append("1=1");
    return this.visitBinaryOp(node, ">=");
  }
  protected visitArelNodesLessThan(node: Nodes.LessThan): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return this.collector.append("1=1");
    if (sign === -1) return this.collector.append("1=0");
    return this.visitBinaryOp(node, "<");
  }
  protected visitArelNodesLessThanOrEqual(node: Nodes.LessThanOrEqual): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return this.collector.append("1=1");
    if (sign === -1) return this.collector.append("1=0");
    return this.visitBinaryOp(node, "<=");
  }
  protected visitArelNodesCount(node: Nodes.Count): SQLString {
    return this.aggregate("COUNT", node);
  }
  protected visitArelNodesSum(node: Nodes.Sum): SQLString {
    return this.aggregate("SUM", node);
  }
  protected visitArelNodesMax(node: Nodes.Max): SQLString {
    return this.aggregate("MAX", node);
  }
  protected visitArelNodesMin(node: Nodes.Min): SQLString {
    return this.aggregate("MIN", node);
  }
  protected visitArelNodesAvg(node: Nodes.Avg): SQLString {
    return this.aggregate("AVG", node);
  }

  static {
    const d = ToSql.dispatchCache();
    // Runtime guard: TS `keyof T` only exposes public members, and the
    // visit methods are mostly protected, so we can't constrain `m` at
    // compile time. Asserting here catches typos/renames the next time
    // the static block runs (i.e. as soon as the file is imported).
    const reg = (ctor: NodeCtor, m: string) => {
      if (typeof (ToSql.prototype as unknown as Record<string, unknown>)[m] !== "function") {
        throw new Error(`ToSql dispatch: method '${m}' is not defined on the prototype`);
      }
      d.set(ctor, m);
    };
    // Statements
    reg(Nodes.SelectStatement, "visitArelNodesSelectStatement");
    reg(Nodes.SelectOptions, "visitArelNodesSelectOptions");
    reg(Nodes.SelectCore, "visitArelNodesSelectCore");
    reg(Nodes.InsertStatement, "visitArelNodesInsertStatement");
    reg(Nodes.UpdateStatement, "visitArelNodesUpdateStatement");
    reg(Nodes.DeleteStatement, "visitArelNodesDeleteStatement");
    // Set operations
    reg(Nodes.UnionAll, "visitArelNodesUnionAll");
    reg(Nodes.Union, "visitArelNodesUnion");
    reg(Nodes.Intersect, "visitArelNodesIntersect");
    reg(Nodes.Except, "visitArelNodesExcept");
    // CTE
    reg(Nodes.WithRecursive, "visitArelNodesWithRecursive");
    reg(Nodes.With, "visitArelNodesWith");
    reg(Nodes.TableAlias, "visitArelNodesTableAlias");
    reg(Nodes.Cte, "visitArelNodesCte");
    // Joins
    reg(Nodes.JoinSource, "visitArelNodesJoinSource");
    reg(Nodes.InnerJoin, "visitArelNodesInnerJoin");
    reg(Nodes.OuterJoin, "visitArelNodesOuterJoin");
    reg(Nodes.RightOuterJoin, "visitArelNodesRightOuterJoin");
    reg(Nodes.FullOuterJoin, "visitArelNodesFullOuterJoin");
    reg(Nodes.CrossJoin, "visitCrossJoin");
    reg(Nodes.StringJoin, "visitArelNodesStringJoin");
    reg(Nodes.On, "visitArelNodesOn");
    // Predicates
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
    // Unary
    reg(Nodes.Ascending, "visitArelNodesAscending");
    reg(Nodes.Descending, "visitArelNodesDescending");
    reg(Nodes.Offset, "visitArelNodesOffset");
    reg(Nodes.Limit, "visitArelNodesLimit");
    reg(Nodes.Top, "visitTop");
    reg(Nodes.Lock, "visitArelNodesLock");
    reg(Nodes.DistinctOn, "visitArelNodesDistinctOn");
    reg(Nodes.Bin, "visitArelNodesBin");
    reg(Nodes.NullsFirst, "visitArelNodesNullsFirst");
    reg(Nodes.NullsLast, "visitArelNodesNullsLast");
    reg(Nodes.UnaryOperation, "visitArelNodesUnaryOperation");
    // Boolean
    reg(Nodes.And, "visitArelNodesAnd");
    reg(Nodes.Or, "visitArelNodesOr");
    reg(Nodes.Not, "visitArelNodesNot");
    reg(Nodes.Grouping, "visitArelNodesGrouping");
    // Window
    reg(Nodes.Over, "visitArelNodesOver");
    reg(Nodes.NamedWindow, "visitArelNodesNamedWindow");
    reg(Nodes.Window, "visitArelNodesWindow");
    reg(Nodes.Rows, "visitArelNodesRows");
    reg(Nodes.Range, "visitArelNodesRange");
    reg(Nodes.Preceding, "visitArelNodesPreceding");
    reg(Nodes.Following, "visitArelNodesFollowing");
    reg(Nodes.CurrentRow, "visitArelNodesCurrentRow");
    // Filter / Case / Extract / Infix
    reg(Nodes.Filter, "visitArelNodesFilter");
    reg(Nodes.Case, "visitArelNodesCase");
    reg(Nodes.When, "visitArelNodesWhen");
    reg(Nodes.Else, "visitArelNodesElse");
    reg(Nodes.Extract, "visitArelNodesExtract");
    reg(Nodes.Concat, "visitArelNodesConcat");
    reg(Nodes.InfixOperation, "visitArelNodesInfixOperation");
    reg(Nodes.BoundSqlLiteral, "visitArelNodesBoundSqlLiteral");
    reg(Nodes.BindParam, "visitArelNodesBindParam");
    reg(Nodes.Fragments, "visitArelNodesFragments");
    // Functions
    reg(Nodes.NamedFunction, "visitArelNodesNamedFunction");
    reg(Nodes.Exists, "visitArelNodesExists");
    reg(Nodes.Count, "visitArelNodesCount");
    reg(Nodes.Sum, "visitArelNodesSum");
    reg(Nodes.Max, "visitArelNodesMax");
    reg(Nodes.Min, "visitArelNodesMin");
    reg(Nodes.Avg, "visitArelNodesAvg");
    // Advanced grouping
    reg(Nodes.Cube, "visitArelNodesCube");
    reg(Nodes.Rollup, "visitArelNodesRollUp");
    reg(Nodes.GroupingSet, "visitArelNodesGroupingSet");
    reg(Nodes.Group, "visitArelNodesGroup");
    reg(Nodes.GroupingElement, "visitArelNodesGroupingElement");
    reg(Nodes.Lateral, "visitArelNodesLateral");
    reg(Nodes.Comment, "visitArelNodesComment");
    reg(Nodes.OptimizerHints, "visitArelNodesOptimizerHints");
    reg(Nodes.HomogeneousIn, "visitArelNodesHomogeneousIn");
    // Boolean literals
    reg(Nodes.True, "visitArelNodesTrue");
    reg(Nodes.False, "visitArelNodesFalse");
    // Leaf nodes
    reg(Nodes.Distinct, "visitArelNodesDistinct");
    reg(Nodes.SqlLiteral, "visitArelNodesSqlLiteral");
    reg(Nodes.Quoted, "visitQuoted");
    reg(Nodes.Casted, "visitArelNodesCasted");
    reg(Nodes.UnqualifiedColumn, "visitArelNodesUnqualifiedColumn");
    reg(Nodes.Attribute, "visitArelAttributesAttribute");
    reg(Nodes.ValuesList, "visitArelNodesValuesList");
    reg(Table, "visitArelTable");
  }

  // -- Statements --

  protected visitArelNodesSelectStatement(node: Nodes.SelectStatement): SQLString {
    if (node.with) {
      this.visit(node.with);
      this.collector.append(" ");
    }

    for (let i = 0; i < node.cores.length; i++) {
      if (i > 0) this.collector.append(" ");
      this.visit(node.cores[i]);
    }

    if (node.orders.length > 0) {
      this.collector.append(" ORDER BY ");
      this.injectJoin(node.orders, ", ");
    }

    if (node.limit) {
      this.collector.append(" ");
      this.visit(node.limit);
    }

    if (node.offset) {
      this.collector.append(" ");
      this.visit(node.offset);
    }

    if (node.lock) {
      this.collector.append(" ");
      this.visit(node.lock);
    }

    this.maybeVisit(node.comment ?? null);

    return this.collector;
  }

  protected emitOptimizerHints(node: Nodes.SelectCore): void {
    if (node.optimizerHints.length === 0) return;
    const sanitized = node.optimizerHints
      .map((h) => this.sanitizeHint(h))
      .filter((h) => h.length > 0);
    if (sanitized.length > 0) {
      this.collector.append(` /*+ ${sanitized.join(" ")} */`);
    }
  }

  // Mirrors Rails: visit_Arel_Nodes_SelectCore (to_sql.rb:149). Where Rails
  // uses collect_nodes_for to emit `spacer` + injectJoin in one call, we do
  // the same; wheres/havings collapse multiple predicates with " AND " via
  // collect_nodes_for's connector arg.
  protected visitArelNodesSelectCore(node: Nodes.SelectCore): SQLString {
    this.collector.append("SELECT");

    this.collectOptimizerHints(node);
    this.maybeVisit(node.setQuantifier ?? null);

    this.collectNodesFor(node.projections, " ");

    if (node.source.left) {
      this.collector.append(" FROM ");
      this.visit(node.source);
    }

    this.collectNodesFor(node.wheres, " WHERE ", " AND ");
    this.collectNodesFor(node.groups, " GROUP BY ");
    this.collectNodesFor(node.havings, " HAVING ", " AND ");
    this.collectNodesFor(node.windows, " WINDOW ");

    this.maybeVisit(node.comment ?? null);

    return this.collector;
  }

  protected visitArelNodesInsertStatement(node: Nodes.InsertStatement): SQLString {
    this.collector.retryable = false;
    this.collector.append("INSERT INTO ");
    if (node.relation) this.visit(node.relation);

    if (node.columns.length > 0) {
      this.collector.append(" (");
      const colNames = node.columns.map((c) => {
        if (c instanceof Nodes.Attribute) return `"${c.name}"`;
        if (c instanceof Nodes.SqlLiteral) return c.value;
        return String(c);
      });
      this.collector.append(colNames.join(", "));
      this.collector.append(")");
    }

    if (node.select) {
      this.collector.append(" ");
      this.visit(node.select);
    } else if (node.values) {
      this.collector.append(" ");
      this.visit(node.values);
    }

    return this.collector;
  }

  protected visitArelNodesUpdateStatement(o: Nodes.UpdateStatement): SQLString {
    const node = this.prepareUpdateStatement(o);
    this.collector.retryable = false;
    this.collector.append("UPDATE ");
    if (node.relation) this.visit(node.relation);

    if (node.values.length > 0) {
      this.collector.append(" SET ");
      this._inUpdateSet = true;
      try {
        this.injectJoin(node.values, ", ");
      } finally {
        this._inUpdateSet = false;
      }
    }

    if (node.wheres.length > 0) {
      this.collector.append(" WHERE ");
      const conditions = node.wheres.length === 1 ? node.wheres[0] : new Nodes.And(node.wheres);
      this.visit(conditions);
    }

    if (node.orders.length > 0) {
      this.collector.append(" ORDER BY ");
      this.injectJoin(node.orders, ", ");
    }

    if (node.limit) {
      this.collector.append(" ");
      this.visit(node.limit);
    }

    return this.collector;
  }

  protected visitArelNodesDeleteStatement(o: Nodes.DeleteStatement): SQLString {
    const node = this.prepareDeleteStatement(o);
    this.collector.retryable = false;
    this.collector.append("DELETE ");
    if (this.hasJoinSources(node)) {
      const joinSource = node.relation as Nodes.JoinSource;
      if (joinSource.left) {
        const table = joinSource.left;
        if (table instanceof Nodes.TableAlias) {
          this.collector.append(`"${table.name}"`);
        } else if (table instanceof Table && table.tableAlias) {
          this.collector.append(`"${table.tableAlias}"`);
        } else if (table instanceof Table) {
          this.collector.append(`"${table.name}"`);
        } else {
          this.visit(table);
        }
        this.collector.append(" FROM ");
      } else {
        this.collector.append("FROM ");
      }
    } else {
      this.collector.append("FROM ");
    }
    if (node.relation) this.visit(node.relation);

    if (node.wheres.length > 0) {
      this.collector.append(" WHERE ");
      const conditions = node.wheres.length === 1 ? node.wheres[0] : new Nodes.And(node.wheres);
      this.visit(conditions);
    }

    if (node.orders.length > 0) {
      this.collector.append(" ORDER BY ");
      this.injectJoin(node.orders, ", ");
    }

    if (node.limit) {
      this.collector.append(" ");
      this.visit(node.limit);
    }

    return this.collector;
  }

  protected prepareUpdateStatement(o: Nodes.UpdateStatement): Nodes.UpdateStatement {
    if (o.key && (this.hasLimitOrOffsetOrOrders(o) || this.hasJoinSources(o))) {
      const stmt = o.clone();
      stmt.limit = null;
      stmt.offset = null;
      stmt.orders = [];
      const key = this.subselectKey(o.key);
      const columns = new Nodes.Grouping(key);
      stmt.wheres = [new Nodes.In(columns, this.buildSubselect(key, o))];
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
      const rawKey = Array.isArray(o.key) ? o.key[0] : o.key;
      const key = this.subselectKey(rawKey);
      const columns = new Nodes.Grouping(key);
      stmt.wheres = [new Nodes.In(columns, this.buildSubselect(key, o))];
      if (this.hasJoinSources(o)) {
        stmt.relation = (o.relation as Nodes.JoinSource).left;
      }
      return stmt;
    }
    return o;
  }

  protected buildSubselect(
    key: Node,
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
    const stmt = new Nodes.SelectStatement();
    const core = stmt.cores[0];
    if (o.relation) core.source = new Nodes.JoinSource(o.relation);
    core.wheres = [...o.wheres];
    core.projections = [key];
    core.groups = [...o.groups];
    core.havings = [...o.havings];
    stmt.limit = o.limit;
    stmt.offset = o.offset;
    stmt.orders = [...o.orders];
    return stmt;
  }

  private subselectKey(key: Node): Node {
    if (key instanceof Nodes.Equality) {
      return key.left as Node;
    }
    return key;
  }

  protected hasJoinSources(o: { relation: Node | null }): boolean {
    return o.relation instanceof Nodes.JoinSource && o.relation.right.length > 0;
  }

  protected hasLimitOrOffsetOrOrders(o: {
    limit: Node | null;
    offset: Node | null;
    orders: Node[];
  }): boolean {
    return !!(o.limit || o.offset || o.orders.length > 0);
  }

  // -- Joins --

  private visitArelNodesJoinSource(node: Nodes.JoinSource): SQLString {
    if (node.left) this.visit(node.left);
    for (const join of node.right) {
      this.collector.append(" ");
      this.visit(join);
    }
    return this.collector;
  }

  private visitArelNodesInnerJoin(node: Nodes.InnerJoin): SQLString {
    this.collector.append("INNER JOIN ");
    this.visit(node.left);
    if (node.right) {
      this.collector.append(" ");
      this.visit(node.right);
    }
    return this.collector;
  }

  private visitArelNodesOuterJoin(node: Nodes.OuterJoin): SQLString {
    this.collector.append("LEFT OUTER JOIN ");
    this.visit(node.left);
    if (node.right) {
      this.collector.append(" ");
      this.visit(node.right);
    }
    return this.collector;
  }

  private visitArelNodesRightOuterJoin(node: Nodes.RightOuterJoin): SQLString {
    this.collector.append("RIGHT OUTER JOIN ");
    this.visit(node.left);
    if (node.right) {
      this.collector.append(" ");
      this.visit(node.right);
    }
    return this.collector;
  }

  private visitArelNodesFullOuterJoin(node: Nodes.FullOuterJoin): SQLString {
    this.collector.append("FULL OUTER JOIN ");
    this.visit(node.left);
    if (node.right) {
      this.collector.append(" ");
      this.visit(node.right);
    }
    return this.collector;
  }

  private visitCrossJoin(node: Nodes.CrossJoin): SQLString {
    this.collector.append("CROSS JOIN ");
    this.visit(node.left);
    return this.collector;
  }

  private visitArelNodesStringJoin(node: Nodes.StringJoin): SQLString {
    this.visit(node.left);
    return this.collector;
  }

  private visitArelNodesOn(node: Nodes.On): SQLString {
    this.collector.append("ON ");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    }
    return this.collector;
  }

  // -- Predicates --

  private visitArelNodesEquality(node: Nodes.Equality): SQLString {
    if (this.unboundableSign(node.right) !== 0) {
      return this.collector.append("1=0");
    }
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left);
      this.collector.append(" IS NULL");
      return this.collector;
    }
    this.visitNodeOrValue(node.left);
    this.collector.append(" = ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  private visitArelNodesNotEqual(node: Nodes.NotEqual): SQLString {
    if (this.unboundableSign(node.right) !== 0) {
      return this.collector.append("1=1");
    }
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left);
      this.collector.append(" IS NOT NULL");
      return this.collector;
    }
    this.visitNodeOrValue(node.left);
    this.collector.append(" != ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  protected visitBinaryOp(node: Nodes.Binary, op: string): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(` ${op} `);
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  protected visitArelNodesIsDistinctFrom(node: Nodes.IsDistinctFrom): SQLString {
    return this.visitBinaryOp(node, "IS DISTINCT FROM");
  }

  protected visitArelNodesIsNotDistinctFrom(node: Nodes.IsNotDistinctFrom): SQLString {
    return this.visitBinaryOp(node, "IS NOT DISTINCT FROM");
  }

  private visitArelNodesIn(node: Nodes.In): SQLString {
    let values = node.right;
    if (Array.isArray(values)) {
      if (values.length > 0) {
        values = values.filter((v) => this.unboundableSign(v) === 0);
      }
      if (values.length === 0) {
        // Empty IN is always false — Rails uses 1=0
        this.collector.append("1=0");
        return this.collector;
      }
    }
    this.visitNodeOrValue(node.left);
    // Duck-type check for SelectManager subquery - visitNodeOrValue wraps it in parens
    if (
      values &&
      typeof values === "object" &&
      !Array.isArray(values) &&
      "ast" in (values as unknown as Record<string, unknown>) &&
      "toSql" in (values as unknown as Record<string, unknown>)
    ) {
      this.collector.append(" IN ");
      this.visitNodeOrValue(values);
      return this.collector;
    }
    this.collector.append(" IN (");
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; i++) {
        if (i > 0) this.collector.append(", ");
        this.visit(values[i]);
      }
    } else {
      this.visitNodeOrValue(values);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitArelNodesNotIn(node: Nodes.NotIn): SQLString {
    let values = node.right;
    if (Array.isArray(values)) {
      if (values.length > 0) {
        values = values.filter((v) => this.unboundableSign(v) === 0);
      }
      if (values.length === 0) {
        // Empty NOT IN is always true — Rails uses 1=1
        this.collector.append("1=1");
        return this.collector;
      }
    }
    this.visitNodeOrValue(node.left);
    if (Array.isArray(values)) {
      this.collector.append(" NOT IN (");
      for (let i = 0; i < values.length; i++) {
        if (i > 0) this.collector.append(", ");
        this.visit(values[i]);
      }
      this.collector.append(")");
    } else {
      this.collector.append(" NOT IN (");
      this.visitNodeOrValue(values);
      this.collector.append(")");
    }
    return this.collector;
  }

  private visitArelNodesHomogeneousIn(node: Nodes.HomogeneousIn): SQLString {
    if (node.values.length === 0) {
      this.collector.append(node.type === "in" ? "1=0" : "1=1");
      return this.collector;
    }
    this.visit(node.attribute);
    this.collector.append(node.type === "in" ? " IN (" : " NOT IN (");
    const values = node.right;
    for (let i = 0; i < values.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(values[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitArelNodesBetween(node: Nodes.Between): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" BETWEEN ");
    if (node.right instanceof Nodes.And) {
      const and = node.right;
      this.visit(and.children[0]);
      this.collector.append(" AND ");
      this.visit(and.children[1]);
    } else {
      this.visitNodeOrValue(node.right);
    }
    return this.collector;
  }

  private visitArelNodesAssignment(node: Nodes.Assignment): SQLString {
    if (this._inUpdateSet && node.left instanceof Nodes.Attribute) {
      this.collector.append(this.quoteColumnName(node.left.name));
    } else {
      this.visitNodeOrValue(node.left);
    }
    this.collector.append(" = ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  private visitArelNodesAs(node: Nodes.As): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" AS ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  // -- Boolean --

  private visitArelNodesAnd(node: Nodes.And): SQLString {
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) this.collector.append(" AND ");
      this.visit(node.children[i]);
    }
    return this.collector;
  }

  private visitArelNodesOr(node: Nodes.Or): SQLString {
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) this.collector.append(" OR ");
      this.visit(node.children[i]);
    }
    return this.collector;
  }

  private visitArelNodesNot(node: Nodes.Not): SQLString {
    this.collector.append("NOT (");
    this.visit(node.expr);
    this.collector.append(")");
    return this.collector;
  }

  private visitArelNodesGrouping(node: Nodes.Grouping): SQLString {
    this.collector.append("(");
    let inner = node.expr;
    while (inner instanceof Nodes.Grouping) inner = inner.expr;
    if (inner instanceof Node) {
      this.visit(inner);
    } else if (inner !== null && inner !== undefined) {
      this.collector.append(String(inner));
    }
    this.collector.append(")");
    return this.collector;
  }

  // -- Unary --

  private visitArelNodesAscending(node: Nodes.Ascending): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" ASC");
    return this.collector;
  }

  private visitArelNodesDescending(node: Nodes.Descending): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" DESC");
    return this.collector;
  }

  protected visitArelNodesOffset(node: Nodes.Offset): SQLString {
    this.collector.append("OFFSET ");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  protected visitArelNodesLimit(node: Nodes.Limit): SQLString {
    this.collector.append("LIMIT ");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  protected visitTop(node: Nodes.Top): SQLString {
    this.collector.append("TOP ");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  protected visitArelNodesLock(node: Nodes.Lock): SQLString {
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (typeof node.expr === "string") {
      this.collector.append(node.expr);
    } else {
      this.collector.append("FOR UPDATE");
    }
    return this.collector;
  }

  protected visitArelNodesDistinctOn(_node: Nodes.DistinctOn): SQLString {
    throw new NotImplementedError(
      "DISTINCT ON is not supported by the base ToSql visitor. Use the PostgreSQL visitor instead.",
    );
  }

  protected visitArelNodesRegexp(_node: Nodes.Regexp): SQLString {
    throw new NotImplementedError(
      "Regexp (~ operator) is not supported by the base ToSql visitor. Use a database-specific visitor (e.g. PostgreSQL) instead.",
    );
  }

  protected visitArelNodesNotRegexp(_node: Nodes.NotRegexp): SQLString {
    throw new NotImplementedError(
      "NotRegexp (!~ operator) is not supported by the base ToSql visitor. Use a database-specific visitor (e.g. PostgreSQL) instead.",
    );
  }

  protected visitArelNodesBin(node: Nodes.Bin): SQLString {
    // Generic visitor: just emit the inner expression.
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  // -- Functions --

  private visitArelNodesNamedFunction(node: Nodes.NamedFunction): SQLString {
    this.collector.retryable = false;
    this.collector.append(node.name);
    this.collector.append("(");
    if (node.distinct) this.collector.append("DISTINCT ");
    this.injectJoin(node.expressions, ", ");
    this.collector.append(")");
    if (node.alias) {
      this.collector.append(" AS ");
      this.visit(node.alias);
    }
    return this.collector;
  }

  protected visitArelNodesExists(node: Nodes.Exists): SQLString {
    this.collector.append("EXISTS (");
    this.visit(node.expressions);
    this.collector.append(")");
    if (node.alias) {
      this.collector.append(" AS ");
      this.visit(node.alias);
    }
    return this.collector;
  }

  // -- Window --

  private visitArelNodesWindow(node: Nodes.Window): SQLString {
    this.collector.append("(");
    if (node.partitions.length > 0) {
      this.collector.append("PARTITION BY ");
      this.injectJoin(node.partitions, ", ");
    }
    if (node.orders.length > 0) {
      if (node.partitions.length > 0) this.collector.append(" ");
      this.collector.append("ORDER BY ");
      this.injectJoin(node.orders, ", ");
    }
    if (node.framing) {
      this.collector.append(" ");
      this.visit(node.framing);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitArelNodesNamedWindow(node: Nodes.NamedWindow): SQLString {
    this.collector.append(`${this.quoteColumnName(node.name)} AS `);
    return this.visitArelNodesWindow(node);
  }

  private visitArelNodesOver(node: Nodes.Over): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" OVER ");
    if (node.right) {
      this.visitNodeOrValue(node.right);
    } else {
      this.collector.append("()");
    }
    return this.collector;
  }

  private visitArelNodesPreceding(node: Nodes.Preceding): SQLString {
    if (node.expr) {
      this.visit(node.expr);
      this.collector.append(" PRECEDING");
    } else {
      this.collector.append("UNBOUNDED PRECEDING");
    }
    return this.collector;
  }

  private visitArelNodesFollowing(node: Nodes.Following): SQLString {
    if (node.expr) {
      this.visit(node.expr);
      this.collector.append(" FOLLOWING");
    } else {
      this.collector.append("UNBOUNDED FOLLOWING");
    }
    return this.collector;
  }

  private visitArelNodesCurrentRow(_node: Nodes.CurrentRow): SQLString {
    this.collector.append("CURRENT ROW");
    return this.collector;
  }

  private visitArelNodesRows(node: Nodes.Rows): SQLString {
    this.collector.append("ROWS");
    if (node.expr) {
      this.collector.append(" ");
      this.visit(node.expr);
    }
    return this.collector;
  }

  private visitArelNodesRange(node: Nodes.Range): SQLString {
    this.collector.append("RANGE");
    if (node.expr) {
      this.collector.append(" ");
      this.visit(node.expr);
    }
    return this.collector;
  }

  // -- Case --

  private visitArelNodesCase(node: Nodes.Case): SQLString {
    this.collector.append("CASE");
    if (node.case) {
      this.collector.append(" ");
      this.visit(node.case);
    }
    for (const when of node.conditions) {
      this.collector.append(" ");
      this.visitArelNodesWhen(when);
    }
    if (node.default) {
      this.collector.append(" ");
      this.visitArelNodesElse(node.default);
    }
    this.collector.append(" END");
    return this.collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_When (to_sql.rb).
  protected visitArelNodesWhen(node: Nodes.When): SQLString {
    this.collector.append("WHEN ");
    this.visitNodeOrValue(node.left);
    this.collector.append(" THEN ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_Else (to_sql.rb).
  protected visitArelNodesElse(node: Nodes.Else): SQLString {
    this.collector.append("ELSE ");
    this.visitNodeOrValue(node.expr);
    return this.collector;
  }

  // -- BindParam --

  // Overridable hook for date bind insertion so PostgreSQLWithBinds can
  // emit $N placeholders instead of ?.
  protected addDateBind(value: unknown): void {
    this.collector.addBind(value, this.bindBlock());
  }

  protected visitArelNodesBindParam(node: Nodes.BindParam): SQLString {
    if (this._extractBinds) {
      this.collector.addBind(node.value !== undefined ? node.value : node, this.bindBlock());
    } else if (node.value !== undefined) {
      this.collector.append(this.quote(resolveValueForDatabase(node.value)));
    } else {
      this.collector.addBind(node, this.bindBlock());
    }
    return this.collector;
  }

  // -- BoundSqlLiteral --

  private visitArelNodesBoundSqlLiteral(node: Nodes.BoundSqlLiteral): SQLString {
    this.collector.retryable = false;
    for (const part of node.parts) {
      this.visit(part);
    }
    return this.collector;
  }

  // -- Concat --

  protected visitArelNodesConcat(node: Nodes.Concat): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" || ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  protected visitArelNodesFragments(node: Nodes.Fragments): SQLString {
    for (const part of node.values) this.visit(part);
    return this.collector;
  }

  // -- Extract --

  private visitArelNodesExtract(node: Nodes.Extract): SQLString {
    this.collector.append(`EXTRACT(${String(node.field).toUpperCase()} FROM `);
    if (Array.isArray(node.expr)) {
      this.visitArray(node.expr);
    } else if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null && node.expr !== undefined) {
      this.collector.append(String(node.expr));
    }
    this.collector.append(")");
    return this.collector;
  }

  // -- InfixOperation --

  private visitArelNodesInfixOperation(node: Nodes.InfixOperation): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(` ${node.operator} `);
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  // -- Set operations --

  protected visitArelNodesUnion(node: Nodes.Union): SQLString {
    return this.infixValueWithParen(node, " UNION ");
  }

  protected visitArelNodesUnionAll(node: Nodes.UnionAll): SQLString {
    return this.infixValueWithParen(node, " UNION ALL ");
  }

  protected visitArelNodesIntersect(node: Nodes.Intersect): SQLString {
    return this.infixValueWithParen(node, " INTERSECT ");
  }

  protected visitArelNodesExcept(node: Nodes.Except): SQLString {
    return this.infixValueWithParen(node, " EXCEPT ");
  }

  // -- CTE --

  private visitArelNodesWith(node: Nodes.With): SQLString {
    this.collector.append("WITH ");
    this.injectJoin(node.children, ", ");
    return this.collector;
  }

  private visitArelNodesWithRecursive(node: Nodes.WithRecursive): SQLString {
    this.collector.append("WITH RECURSIVE ");
    this.injectJoin(node.children, ", ");
    return this.collector;
  }

  private visitArelNodesTableAlias(node: Nodes.TableAlias): SQLString {
    this.visit(node.relation);
    // Rails: `SelectManager#as` wraps the alias name in a SqlLiteral,
    // and `AbstractAdapter#quote_table_name` returns SqlLiterals
    // unchanged — so subquery aliases render bare. We approximate the
    // same outcome at the visitor layer by checking whether the
    // relation is a Grouping (the shape `SelectManager#as` produces);
    // plain `Table#alias("foo")` keeps `"foo"`. Caveat: callers that
    // construct a TableAlias on a Table with a SqlLiteral name
    // wouldn't get the bare form here — Rails would. The runtime
    // signature of `TableAlias.name` is `string`, so that path isn't
    // currently reachable, but it's a Rails-fidelity divergence to
    // revisit if the type widens.
    if (node.relation instanceof Nodes.Grouping) {
      this.collector.append(` ${node.name}`);
    } else {
      this.collector.append(` ${this.quoteTableName(node.name)}`);
    }
    return this.collector;
  }

  // -- Boolean literals --

  protected visitArelNodesTrue(_node: Nodes.True): SQLString {
    this.collector.append("TRUE");
    return this.collector;
  }

  protected visitArelNodesFalse(_node: Nodes.False): SQLString {
    this.collector.append("FALSE");
    return this.collector;
  }

  // -- Advanced grouping --

  protected visitArelNodesCube(node: Nodes.Cube): SQLString {
    this.collector.append("CUBE(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  protected visitArelNodesRollUp(node: Nodes.Rollup): SQLString {
    this.collector.append("ROLLUP(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  protected visitArelNodesGroupingElement(node: Nodes.GroupingElement): SQLString {
    this.collector.append("(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  protected visitArelNodesGroupingSet(node: Nodes.GroupingSet): SQLString {
    this.collector.append("GROUPING SETS(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitArelNodesGroup(node: Nodes.Group): SQLString {
    if (node.expr instanceof Node) {
      return this.visit(node.expr);
    }
    this.collector.append(String(node.expr));
    return this.collector;
  }

  protected visitArelNodesLateral(node: Nodes.Lateral): SQLString {
    this.collector.append("LATERAL (");
    this.visit(node.subquery);
    this.collector.append(")");
    return this.collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_Comment (to_sql.rb:175) — emits the
  // joined `/* ... */` blocks without a leading space. Callers add the
  // leading separator (typically via `maybeVisit`).
  protected visitArelNodesComment(node: Nodes.Comment): SQLString {
    const blocks = node.values.map((v) => `/* ${this.sanitizeAsSqlComment(v)} */`);
    this.collector.append(blocks.join(" "));
    return this.collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_OptimizerHints (to_sql.rb:170). The
  // OptimizerHints node carries a list of hint strings (Rails' `o.expr` is
  // an array); each hint is sanitized and the joined result wrapped in
  // /*+ ... */. Trails' SelectCore also stores hints inline as `string[]`
  // — this method exists for callers that build an OptimizerHints node
  // explicitly.
  protected visitArelNodesOptimizerHints(node: Nodes.OptimizerHints): SQLString {
    const hints = node.hints.map((v) => this.sanitizeAsSqlComment(v)).join(" ");
    this.collector.append(` /*+ ${hints} */`);
    return this.collector;
  }

  // -- Matches with ESCAPE --

  protected visitArelNodesMatches(node: Nodes.Matches): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" LIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  protected visitArelNodesDoesNotMatch(node: Nodes.DoesNotMatch): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" NOT LIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  // -- NullsFirst / NullsLast --

  protected visitArelNodesNullsFirst(node: Nodes.NullsFirst): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" NULLS FIRST");
    return this.collector;
  }

  protected visitArelNodesNullsLast(node: Nodes.NullsLast): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" NULLS LAST");
    return this.collector;
  }

  // -- Cte --

  protected visitArelNodesCte(node: Nodes.Cte): SQLString {
    this.collector.append(`${this.quoteTableName(node.name)} AS `);
    if (node.materialized === "materialized") {
      this.collector.append("MATERIALIZED ");
    } else if (node.materialized === "not_materialized") {
      this.collector.append("NOT MATERIALIZED ");
    }
    this.collector.append("(");
    this.visit(node.relation);
    this.collector.append(")");
    return this.collector;
  }

  // -- UnaryOperation --

  private visitArelNodesUnaryOperation(node: Nodes.UnaryOperation): SQLString {
    // Mirrors Rails: `collector << " #{o.operator} "` (visitors/to_sql.rb).
    // The operator is emitted verbatim with a space on each side; callers
    // are responsible for the operator's own whitespace.
    this.collector.append(` ${node.operator} `);
    this.visit(node.operand);
    return this.collector;
  }

  // -- Filter --

  private visitArelNodesFilter(node: Nodes.Filter): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" FILTER (WHERE ");
    this.visitNodeOrValue(node.right);
    this.collector.append(")");
    return this.collector;
  }

  // -- Leaf nodes --

  private visitArelNodesDistinct(_node: Nodes.Distinct): SQLString {
    this.collector.append("DISTINCT");
    return this.collector;
  }

  private visitArelTable(node: Table): SQLString {
    const quoted = this.quoteTableName(node.name);
    if (node.tableAlias) {
      this.collector.append(`${quoted} ${this.quoteTableName(node.tableAlias)}`);
    } else {
      this.collector.append(quoted);
    }
    return this.collector;
  }

  private visitArelAttributesAttribute(node: Nodes.Attribute): SQLString {
    const tbl = node.relation.tableAlias || node.relation.name;
    this.collector.append(`${this.quoteTableName(tbl)}.${this.quoteColumnName(node.name)}`);
    return this.collector;
  }

  protected visitArelNodesUnqualifiedColumn(node: Nodes.UnqualifiedColumn): SQLString {
    // Mirrors Arel's visit_Arel_Nodes_UnqualifiedColumn — strips the table
    // qualifier so `SET col = col + 1` works in UPDATE statements.
    const attr = node.attribute as Partial<Nodes.Attribute> | undefined;
    if (!attr || typeof attr.name !== "string") {
      throw new UnsupportedVisitError("UnqualifiedColumn must wrap an Attribute node with a name");
    }
    this.collector.append(this.quoteColumnName(attr.name));
    return this.collector;
  }

  private visitArelNodesSqlLiteral(node: Nodes.SqlLiteral): SQLString {
    if (!(node as { retryableFlag?: boolean }).retryableFlag) {
      this.collector.retryable = false;
    }
    this.collector.append(node.value);
    return this.collector;
  }

  private visitQuoted(node: Nodes.Quoted): SQLString {
    if (
      this._extractBinds &&
      node.value !== null &&
      node.value !== undefined &&
      typeof node.value === "object" &&
      "toISOString" in node.value &&
      typeof (node.value as { toISOString: unknown }).toISOString === "function"
    ) {
      // boundary: bind real Date instances directly (drivers handle them
      // natively). For other objects with a `toISOString()` method, bind the
      // formatted string so drivers don't receive an unsupported object type.
      const bind =
        node.value instanceof Date
          ? node.value
          : this.quotedDate(node.value as { toISOString(): string }).slice(1, -1);
      this.addDateBind(bind);
    } else {
      this.collector.append(this.quote(node.value));
    }
    return this.collector;
  }

  protected visitArelNodesCasted(node: Nodes.Casted): SQLString {
    const value = node.valueForDatabase();
    if (this._extractBinds) {
      this.collector.addBind(value, this.bindBlock());
    } else {
      this.collector.append(this.quote(value));
    }
    return this.collector;
  }

  private visitArelNodesValuesList(node: Nodes.ValuesList): SQLString {
    this.collector.append("VALUES ");
    for (let i = 0; i < node.rows.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.collector.append("(");
      for (let j = 0; j < node.rows[i].length; j++) {
        if (j > 0) this.collector.append(", ");
        this.visit(node.rows[i][j]);
      }
      this.collector.append(")");
    }
    return this.collector;
  }

  // -- Helpers --

  protected visitNodeOrValue(v: Nodes.NodeOrValue): SQLString {
    // Duck-type check for SelectManager (not a Node, but has ast/toSql).
    // Delegates to visitArelSelectManager — the Rails-named visitor for
    // a bare SelectManager — so the wrapping behavior lives in one place.
    if (v !== null && v !== undefined && typeof v === "object" && "ast" in v && "toSql" in v) {
      return this.visitArelSelectManager(v as unknown as { ast: Node });
    }
    if (Array.isArray(v)) {
      // Mirrors Rails: `visit_Array` (to_sql.rb) — primitives and Nodes in
      // arrays both flow through here, joined by ", ".
      return this.visitArray(v);
    }
    if (v instanceof Node) {
      // Duck-type check to avoid circular dependency (SelectManager → ToSql → SelectManager)
      if ("ast" in v && "toSql" in v) {
        return this.visitArelSelectManager(v as unknown as { ast: Node });
      }
      return this.visit(v);
    }
    if (v === null || v === undefined) {
      this.collector.append("NULL");
    } else if (typeof v === "string") {
      this.collector.append(this.quote(v));
    } else if (typeof v === "number") {
      this.collector.append(String(v));
    } else if (typeof v === "boolean") {
      this.collector.append(this.quote(v));
    } else if (typeof v === "bigint") {
      this.collector.append(v.toString());
    } else if (
      typeof v === "object" &&
      v !== null &&
      "toISOString" in v &&
      typeof (v as { toISOString: unknown }).toISOString === "function"
    ) {
      if (this._extractBinds) {
        // boundary: see addDateBind branch above — Date binds pass through
        // natively; non-Date values with toISOString() stringify first.
        const bind =
          v instanceof Date ? v : this.quotedDate(v as { toISOString(): string }).slice(1, -1);
        this.addDateBind(bind);
      } else {
        this.collector.append(this.quotedDate(v as { toISOString(): string }));
      }
    } else {
      this.collector.append(String(v));
    }
    return this.collector;
  }

  // Formats a date-like value as a SQL datetime string matching Rails'
  // AbstractAdapter#quoted_date: 'YYYY-MM-DD HH:MM:SS[.microseconds]'.
  // When ms > 0 the fractional part is emitted as 6-digit microseconds,
  // matching AR quoting.ts and preserving sub-second DB precision. When ms = 0
  // the bare seconds form is used — matching Rails' default output for
  // whole-second values.
  //
  // UTC handling: JS Date#toISOString() always appends Z; the regex also
  // accepts strings without a trailing Z (treating absent timezone as UTC),
  // which covers non-standard date-like objects. The Arel layer has no access
  // to AR's defaultTimezone — adapter-level quoting in
  // packages/activerecord/src/connection-adapters/abstract/quoting.ts is the
  // authoritative path for timezone-aware bound values.
  protected quotedDate(d: { toISOString(): string }): string {
    // Matches "YYYY-MM-DDTHH:MM:SS.mmmZ", "YYYY-MM-DDTHH:MM:SSZ", or
    // the same without trailing Z (treated as UTC).
    const match = d.toISOString().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z?$/);
    if (!match) return `'${d.toISOString().replace(/'/g, "''")}'`;
    const [, date, time, frac] = match;
    // Normalise to exactly 6 digits: pad short fractions, truncate long ones.
    // "729" → "729000" (μs), "7" → "700000", "1234" → "123400", "729000" → "729000".
    const micros = frac ? parseInt((frac + "000000").slice(0, 6), 10) : 0;
    return micros > 0
      ? `'${date} ${time}.${String(micros).padStart(6, "0")}'`
      : `'${date} ${time}'`;
  }

  protected quote(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "bigint") return value.toString();
    if (
      typeof value === "object" &&
      value !== null &&
      "toISOString" in value &&
      typeof (value as { toISOString: unknown }).toISOString === "function"
    ) {
      return this.quotedDate(value as { toISOString(): string });
    }
    if (typeof value === "object" && value !== null) {
      const proto = Object.getPrototypeOf(value);
      const hasCustomToString =
        proto === Object.prototype && value.toString !== Object.prototype.toString;
      if ((proto === Object.prototype || proto === null) && !hasCustomToString) {
        try {
          const json = JSON.stringify(value);
          if (json !== undefined) {
            return `'${json.replace(/'/g, "''")}'`;
          }
        } catch {
          // circular references, BigInt, etc. — fall through to String()
        }
      }
    }
    const escaped = String(value).replace(/'/g, "''");
    return `'${escaped}'`;
  }

  private sanitizeHint(hint: string): string {
    return hint
      .replace(/[\r\n]+/g, " ")
      .replace(/\/\*/g, "")
      .replace(/\*\//g, "")
      .replace(/--/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------------------------------------------------------------------
  // Rails-mirrored private helpers (to_sql.rb).
  // ---------------------------------------------------------------------

  /**
   * Mirrors `to_sql.rb#collect_nodes_for`. Emits `spacer` then visits each
   * node separated by `connector` (default `", "`). No-op when empty.
   */
  protected collectNodesFor(nodes: Node[], spacer: string, connector = ", "): SQLString {
    if (nodes.length === 0) return this.collector;
    this.collector.append(spacer);
    this.injectJoin(nodes, connector);
    return this.collector;
  }

  /**
   * Mirrors `to_sql.rb#inject_join`: visits `list[0]`, then for each
   * subsequent node emits `joinStr` and visits.
   */
  protected injectJoin(list: Node[], joinStr: string): SQLString {
    list.forEach((n, i) => {
      if (i > 0) this.collector.append(joinStr);
      this.visit(n);
    });
    return this.collector;
  }

  /**
   * Mirrors `to_sql.rb#maybe_visit`: if `thing` is non-null, emits a leading
   * space and visits it; otherwise no-op. Used to thread optional clauses
   * (limit/offset/lock/comment) through select-statement visitors.
   */
  protected maybeVisit(thing: Node | null | undefined): SQLString {
    if (!thing) return this.collector;
    this.collector.append(" ");
    this.visit(thing);
    return this.collector;
  }

  /**
   * Mirrors `to_sql.rb#collect_optimizer_hints`. Rails delegates to
   * `maybe_visit o.optimizer_hints` since hints are an Arel node;
   * Trails' SelectCore stores hints inline as `string[]`, so we call into
   * the existing `emitOptimizerHints` formatter for parity at the seam.
   */
  protected collectOptimizerHints(o: Nodes.SelectCore): SQLString {
    this.emitOptimizerHints(o);
    return this.collector;
  }

  /**
   * Mirrors `to_sql.rb#sanitize_as_sql_comment`. SqlLiteral values pass
   * through unchanged; otherwise strip newlines and `/*`/`* /` so the value
   * is safe to embed inside a `/* … * /` SQL comment.
   */
  protected sanitizeAsSqlComment(value: string | Nodes.SqlLiteral): string {
    if (value instanceof Nodes.SqlLiteral) return value.value;
    return String(value)
      .replace(/[\r\n]+/g, " ")
      .replace(/\/\*/g, "")
      .replace(/\*\//g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Mirrors `to_sql.rb#quote_table_name`. SqlLiteral pass-through; otherwise
   * default double-quoted identifier with embedded `"` doubled. Schema-
   * qualified names (e.g. `"schema.table"`) are split on `.` and each
   * segment is quoted independently — same behavior the connection adapter
   * provides in Rails. MySQL overrides to backtick-quote (deferred — see
   * project memory `arel MySQL identifier quoting`).
   */
  protected quoteTableName(name: string | Nodes.SqlLiteral): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return String(name)
      .split(".")
      .map((p) => `"${p.replace(/"/g, '""')}"`)
      .join(".");
  }

  /**
   * Mirrors `to_sql.rb#quote_column_name`. Column names are not schema-
   * qualified, so a plain double-quote suffices.
   */
  protected quoteColumnName(name: string | Nodes.SqlLiteral): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return `"${String(name).replace(/"/g, '""')}"`;
  }

  /**
   * Mirrors `to_sql.rb#bind_block` (which returns Rails' `BIND_BLOCK = proc { "?" }`).
   * Returns the placeholder-rendering callback the SQLString collector calls
   * for each unbound bind. Dialects override to emit numbered placeholders
   * (e.g. `$1`, `$2` for Postgres-with-binds).
   *
   * The default callback is cached at module load (Rails caches it under
   * `BIND_BLOCK`) so the hot bind path doesn't allocate a closure per call.
   */
  protected bindBlock(): (index: number) => string {
    return DEFAULT_BIND_BLOCK;
  }

  /**
   * Mirrors `to_sql.rb#unboundable?` returning a sign — `1` for +∞, `-1`
   * for -∞, `0` for bounded values. Comparison visitors `case` on the
   * sign; equality/IN visitors use a truthy check (`sign !== 0`).
   *
   * Unwraps Quoted/Casted/BindParam to inspect the wrapped value, and
   * recognises `Float::INFINITY` analogues (`±Infinity`) plus any value
   * exposing `isInfinite()` / `isUnboundable()`.
   */
  protected unboundableSign(value: unknown): 1 | -1 | 0 {
    if (value === Infinity) return 1;
    if (value === -Infinity) return -1;
    if (value && typeof value === "object") {
      const v = value as {
        value?: unknown;
        isInfinite?: () => unknown;
        isUnboundable?: () => unknown;
      };
      if (typeof v.isInfinite === "function") {
        const r = v.isInfinite();
        if (r === 1) return 1;
        if (r === -1) return -1;
      }
      if (typeof v.isUnboundable === "function") {
        const r = v.isUnboundable();
        if (r === 1 || r === true) return 1;
        if (r === -1) return -1;
      }
      if ("value" in v) return this.unboundableSign(v.value);
    }
    return 0;
  }

  /** Mirrors `to_sql.rb#unboundable?` as a truthy check. */
  protected isUnboundable(value: unknown): boolean {
    return this.unboundableSign(value) !== 0;
  }

  /** Mirrors `to_sql.rb#has_group_by_and_having?`. */
  protected hasGroupByAndHaving(o: { groups: unknown[]; havings: unknown[] }): boolean {
    return o.groups.length > 0 && o.havings.length > 0;
  }

  /** Mirrors `to_sql.rb#infix_value`. Visits left, emits literal, visits right. */
  protected infixValue(o: { left: Node; right: Node }, value: string): SQLString {
    this.visit(o.left);
    this.collector.append(value);
    this.visit(o.right);
    return this.collector;
  }

  /**
   * Mirrors `to_sql.rb#infix_value_with_paren`. Recursively wraps adjacent
   * same-class infix nodes in `( ... )` per Rails' shape — Rails compares
   * `o.left.class == o.class` to keep nested same-operator chains flat.
   */
  protected infixValueWithParen(
    o: Node & { left: Node; right: Node },
    value: string,
    suppressParens = false,
  ): SQLString {
    const sameClass = (child: Node): child is typeof o =>
      Object.getPrototypeOf(child) === Object.getPrototypeOf(o);

    if (!suppressParens) this.collector.append("( ");
    if (sameClass(o.left)) {
      this.infixValueWithParen(o.left, value, true);
    } else {
      this.groupingParentheses(o.left, false);
    }
    this.collector.append(value);
    if (sameClass(o.right)) {
      this.infixValueWithParen(o.right, value, true);
    } else {
      this.groupingParentheses(o.right, false);
    }
    if (!suppressParens) this.collector.append(" )");
    return this.collector;
  }

  /**
   * Mirrors `to_sql.rb#grouping_parentheses`. Wraps a SelectStatement in
   * parens when it would otherwise emit ambiguously; otherwise plain visit.
   */
  protected groupingParentheses(o: Node, alwaysWrapSelects = true): SQLString {
    if (o instanceof Nodes.SelectStatement && (alwaysWrapSelects || this.isRequireParentheses(o))) {
      this.collector.append("(");
      this.visit(o);
      this.collector.append(")");
      return this.collector;
    }
    this.visit(o);
    return this.collector;
  }

  /** Mirrors `to_sql.rb#require_parentheses?`. */
  protected isRequireParentheses(o: Nodes.SelectStatement): boolean {
    return o.orders.length > 0 || Boolean(o.limit) || Boolean(o.offset);
  }

  /**
   * Mirrors `to_sql.rb#aggregate`. Renders `NAME(DISTINCT? expr, ...) AS alias?`.
   */
  protected aggregate(name: string, o: Nodes.Function): SQLString {
    // Trails-specific: aggregate calls aren't safe to retry against a
    // detached connection. Rails has no equivalent (the retryable flag is
    // a Trails collector concern), so this is the one piece of behavior we
    // carry alongside the Rails-shaped body.
    this.collector.retryable = false;
    this.collector.append(`${name}(`);
    if (o.distinct) this.collector.append("DISTINCT ");
    this.injectJoin(o.expressions, ", ");
    this.collector.append(")");
    if (o.alias) {
      this.collector.append(" AS ");
      this.visit(o.alias);
    }
    return this.collector;
  }

  /**
   * Mirrors `to_sql.rb#is_distinct_from`. CASE-form fallback for adapters
   * that lack native `IS [NOT] DISTINCT FROM`.
   */
  protected isDistinctFrom(o: { left: Node; right: Node }): SQLString {
    this.collector.append("CASE WHEN ");
    this.visit(o.left);
    this.collector.append(" = ");
    this.visit(o.right);
    this.collector.append(" OR (");
    this.visit(o.left);
    this.collector.append(" IS NULL AND ");
    this.visit(o.right);
    this.collector.append(" IS NULL)");
    this.collector.append(" THEN 0 ELSE 1 END");
    return this.collector;
  }

  /** Mirrors `to_sql.rb#collect_ctes`. Visits each CTE child joined by ", ". */
  protected collectCtes(children: ReadonlyArray<{ toCte(): Node } | Node>): SQLString {
    children.forEach((child, i) => {
      if (i > 0) this.collector.append(", ");
      const node =
        typeof (child as { toCte?: () => Node }).toCte === "function"
          ? (child as { toCte: () => Node }).toCte()
          : (child as Node);
      this.visit(node);
    });
    return this.collector;
  }

  /** Mirrors `to_sql.rb#unsupported`. */
  protected unsupported(o: Node): never {
    throw new UnsupportedVisitError(`Unknown node type: ${o.constructor.name}`);
  }

  // ---------------------------------------------------------------------
  // Non-Arel visit dispatchers (Rails dispatches on Ruby native classes
  // for stray values that drift into the visitor).
  // ---------------------------------------------------------------------

  /** Mirrors Rails: `visit_Integer`. */
  protected visitInteger(o: number): SQLString {
    this.collector.append(String(o));
    return this.collector;
  }

  /**
   * Mirrors Rails: `visit_Array` (to_sql.rb:858). Rails delegates to
   * `inject_join` which calls `visit` on each element; in Ruby `visit` of
   * a primitive routes through `visit_Integer`/`visit_String`/etc. Trails
   * doesn't dispatch on JS primitives — `visitNodeOrValue` is the
   * equivalent path that handles both Node and non-Node entries.
   */
  protected visitArray(items: ReadonlyArray<Nodes.NodeOrValue>): SQLString {
    items.forEach((item, i) => {
      if (i > 0) this.collector.append(", ");
      this.visitNodeOrValue(item);
    });
    return this.collector;
  }

  /**
   * Mirrors Rails: `visit_ActiveModel_Attribute` (to_sql.rb:756).
   * Rails calls `collector.add_bind(o, &bind_block)` — always emits an
   * unbound placeholder regardless of bind-extraction state. We do the
   * same: the dispatch never delegates to the BindParam visitor (which
   * would inline-quote when `_extractBinds` is false).
   */
  protected visitActiveModelAttribute(o: unknown): SQLString {
    this.collector.addBind(o, this.bindBlock());
    return this.collector;
  }

  /**
   * Mirrors Rails: `visit_Arel_SelectManager` — visits the manager's AST
   * wrapped in parens so it can be embedded as a subquery.
   */
  protected visitArelSelectManager(o: { ast: Node }): SQLString {
    this.collector.append("(");
    this.visit(o.ast);
    this.collector.append(")");
    return this.collector;
  }

  /**
   * Mirrors Rails: `visit_Arel_Nodes_SelectOptions` (to_sql.rb:143). Emits
   * limit/offset/lock via `maybeVisit`. Trails' SelectStatement carries
   * those fields directly, so this fires only when a caller constructs a
   * `Nodes.SelectOptions` explicitly. Reachable through the dispatch table.
   */
  protected visitArelNodesSelectOptions(o: Nodes.SelectOptions): SQLString {
    this.maybeVisit(o.limit);
    this.maybeVisit(o.offset);
    this.maybeVisit(o.lock);
    return this.collector;
  }
}
