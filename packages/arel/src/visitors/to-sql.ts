import { Node, NodeVisitor } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import { Bind } from "../collectors/bind.js";
import { Composite } from "../collectors/composite.js";
import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";

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

export class UnsupportedVisitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedVisitError";
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/**
 * ToSql visitor — walks the AST and produces SQL strings.
 *
 * Mirrors: Arel::Visitors::ToSql
 */
export class ToSql implements NodeVisitor<SQLString> {
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

  visit(node: Node): SQLString {
    if (node instanceof Nodes.SelectStatement) return this.visitSelectStatement(node);
    if (node instanceof Nodes.SelectCore) return this.visitSelectCore(node);
    if (node instanceof Nodes.InsertStatement) return this.visitInsertStatement(node);
    if (node instanceof Nodes.UpdateStatement) return this.visitUpdateStatement(node);
    if (node instanceof Nodes.DeleteStatement) return this.visitDeleteStatement(node);

    // Set operations
    if (node instanceof Nodes.UnionAll) return this.visitUnionAll(node);
    if (node instanceof Nodes.Union) return this.visitUnion(node);
    if (node instanceof Nodes.Intersect) return this.visitIntersect(node);
    if (node instanceof Nodes.Except) return this.visitExcept(node);

    // CTE
    if (node instanceof Nodes.WithRecursive) return this.visitWithRecursive(node);
    if (node instanceof Nodes.With) return this.visitWith(node);
    if (node instanceof Nodes.TableAlias) return this.visitTableAlias(node);

    // Joins
    if (node instanceof Nodes.JoinSource) return this.visitJoinSource(node);
    if (node instanceof Nodes.InnerJoin) return this.visitInnerJoin(node);
    if (node instanceof Nodes.OuterJoin) return this.visitOuterJoin(node);
    if (node instanceof Nodes.RightOuterJoin) return this.visitRightOuterJoin(node);
    if (node instanceof Nodes.FullOuterJoin) return this.visitFullOuterJoin(node);
    if (node instanceof Nodes.CrossJoin) return this.visitCrossJoin(node);
    if (node instanceof Nodes.StringJoin) return this.visitStringJoin(node);
    if (node instanceof Nodes.On) return this.visitOn(node);

    // Predicates (must check specific subclasses before Binary)
    if (node instanceof Nodes.Equality) return this.visitEquality(node);
    if (node instanceof Nodes.NotEqual) return this.visitNotEqual(node);
    if (node instanceof Nodes.GreaterThan) return this.visitBinaryOp(node, ">");
    if (node instanceof Nodes.GreaterThanOrEqual) return this.visitBinaryOp(node, ">=");
    if (node instanceof Nodes.LessThan) return this.visitBinaryOp(node, "<");
    if (node instanceof Nodes.LessThanOrEqual) return this.visitBinaryOp(node, "<=");
    if (node instanceof Nodes.Matches) return this.visitMatches(node);
    if (node instanceof Nodes.DoesNotMatch) return this.visitDoesNotMatch(node);
    if (node instanceof Nodes.In) return this.visitIn(node);
    if (node instanceof Nodes.NotIn) return this.visitNotIn(node);
    if (node instanceof Nodes.Between) return this.visitBetween(node);
    if (node instanceof Nodes.Regexp) return this.visitRegexp(node);
    if (node instanceof Nodes.NotRegexp) return this.visitNotRegexp(node);
    if (node instanceof Nodes.IsDistinctFrom) return this.visitBinaryOp(node, "IS DISTINCT FROM");
    if (node instanceof Nodes.IsNotDistinctFrom)
      return this.visitBinaryOp(node, "IS NOT DISTINCT FROM");
    if (node instanceof Nodes.Assignment) return this.visitAssignment(node);
    if (node instanceof Nodes.As) return this.visitAs(node);

    // Unary
    if (node instanceof Nodes.Ascending) return this.visitAscending(node);
    if (node instanceof Nodes.Descending) return this.visitDescending(node);
    if (node instanceof Nodes.Offset) return this.visitOffset(node);
    if (node instanceof Nodes.Limit) return this.visitLimit(node);
    if (node instanceof Nodes.Top) return this.visitTop(node);
    if (node instanceof Nodes.Lock) return this.visitLock(node);
    if (node instanceof Nodes.DistinctOn) return this.visitDistinctOn(node);
    if (node instanceof Nodes.Bin) return this.visitBin(node);

    // Boolean
    if (node instanceof Nodes.And) return this.visitAnd(node);
    if (node instanceof Nodes.Or) return this.visitOr(node);
    if (node instanceof Nodes.Not) return this.visitNot(node);
    if (node instanceof Nodes.Grouping) return this.visitGrouping(node);

    // Window
    if (node instanceof Nodes.Over) return this.visitOver(node);
    if (node instanceof Nodes.NamedWindow) return this.visitNamedWindow(node);
    if (node instanceof Nodes.Window) return this.visitWindow(node);
    if (node instanceof Nodes.Rows) return this.visitRows(node);
    if (node instanceof Nodes.Range) return this.visitRange(node);
    if (node instanceof Nodes.Preceding) return this.visitPreceding(node);
    if (node instanceof Nodes.Following) return this.visitFollowing(node);
    if (node instanceof Nodes.CurrentRow) return this.visitCurrentRow(node);

    // Nulls ordering (must be before generic Unary)
    if (node instanceof Nodes.NullsFirst) return this.visitNullsFirst(node);
    if (node instanceof Nodes.NullsLast) return this.visitNullsLast(node);

    // CTE node
    if (node instanceof Nodes.Cte) return this.visitCte(node);

    // UnaryOperation (must be before InfixOperation check)
    if (node instanceof Nodes.UnaryOperation) return this.visitUnaryOperation(node);

    // Filter
    if (node instanceof Nodes.Filter) return this.visitFilter(node);

    // Case / Extract / InfixOperation
    if (node instanceof Nodes.Case) return this.visitCase(node);
    if (node instanceof Nodes.Extract) return this.visitExtract(node);
    if (node instanceof Nodes.Concat) return this.visitConcat(node);
    if (node instanceof Nodes.InfixOperation) return this.visitInfixOperation(node);
    if (node instanceof Nodes.BoundSqlLiteral) return this.visitBoundSqlLiteral(node);
    if (node instanceof Nodes.BindParam) return this.visitBindParam(node);
    if (node instanceof Nodes.Fragments) return this.visitFragments(node);

    // Functions
    if (node instanceof Nodes.NamedFunction) return this.visitNamedFunction(node);
    if (node instanceof Nodes.Exists) return this.visitExists(node);

    // Advanced grouping
    if (node instanceof Nodes.Cube) return this.visitCube(node);
    if (node instanceof Nodes.Rollup) return this.visitRollup(node);
    if (node instanceof Nodes.GroupingSet) return this.visitGroupingSet(node);
    if (node instanceof Nodes.Group) return this.visitGroup(node);
    if (node instanceof Nodes.GroupingElement) return this.visitGroupingElement(node);
    if (node instanceof Nodes.Lateral) return this.visitLateral(node);
    if (node instanceof Nodes.Comment) return this.visitComment(node);
    if (node instanceof Nodes.HomogeneousIn) return this.visitHomogeneousIn(node);

    // Boolean literals
    if (node instanceof Nodes.True) return this.visitTrue(node);
    if (node instanceof Nodes.False) return this.visitFalse(node);

    // Leaf nodes
    if (node instanceof Nodes.Distinct) return this.visitDistinct(node);
    if (node instanceof Nodes.SqlLiteral) return this.visitSqlLiteral(node);
    if (node instanceof Nodes.Quoted) return this.visitQuoted(node);
    if (node instanceof Nodes.Casted) return this.visitCasted(node);
    if (node instanceof Nodes.UnqualifiedColumn) return this.visitUnqualifiedColumn(node);
    if (node instanceof Nodes.Attribute) return this.visitAttribute(node);
    if (node instanceof Nodes.ValuesList) return this.visitValuesList(node);
    if (node instanceof Table) return this.visitTable(node);

    throw new UnsupportedVisitError(`Unknown node type: ${node.constructor.name}`);
  }

  // -- Statements --

  protected visitSelectStatement(node: Nodes.SelectStatement): SQLString {
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
      this.visitArray(node.orders, ", ");
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

    if (node.comment) {
      this.visit(node.comment);
    }

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

  protected visitSelectCore(node: Nodes.SelectCore): SQLString {
    this.collector.append("SELECT");

    this.emitOptimizerHints(node);

    if (node.setQuantifier) {
      this.collector.append(" ");
      this.visit(node.setQuantifier);
    }

    if (node.projections.length > 0) {
      this.collector.append(" ");
      this.visitArray(node.projections, ", ");
    }

    if (node.source.left) {
      this.collector.append(" FROM ");
      this.visit(node.source);
    }

    if (node.wheres.length > 0) {
      this.collector.append(" WHERE ");
      const conditions = node.wheres.length === 1 ? node.wheres[0] : new Nodes.And(node.wheres);
      this.visit(conditions);
    }

    if (node.groups.length > 0) {
      this.collector.append(" GROUP BY ");
      this.visitArray(node.groups, ", ");
    }

    if (node.havings.length > 0) {
      this.collector.append(" HAVING ");
      const conditions = node.havings.length === 1 ? node.havings[0] : new Nodes.And(node.havings);
      this.visit(conditions);
    }

    if (node.windows.length > 0) {
      this.collector.append(" WINDOW ");
      this.visitArray(node.windows, ", ");
    }

    if (node.comment) {
      this.visit(node.comment);
    }

    return this.collector;
  }

  private visitInsertStatement(node: Nodes.InsertStatement): SQLString {
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

  private visitUpdateStatement(o: Nodes.UpdateStatement): SQLString {
    const node = this.prepareUpdateStatement(o);
    this.collector.retryable = false;
    this.collector.append("UPDATE ");
    if (node.relation) this.visit(node.relation);

    if (node.values.length > 0) {
      this.collector.append(" SET ");
      this._inUpdateSet = true;
      try {
        this.visitArray(node.values, ", ");
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
      this.visitArray(node.orders, ", ");
    }

    if (node.limit) {
      this.collector.append(" ");
      this.visit(node.limit);
    }

    return this.collector;
  }

  protected visitDeleteStatement(o: Nodes.DeleteStatement): SQLString {
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
      this.visitArray(node.orders, ", ");
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

  private buildSubselect(
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

  private hasJoinSources(o: { relation: Node | null }): boolean {
    return o.relation instanceof Nodes.JoinSource && o.relation.right.length > 0;
  }

  private hasLimitOrOffsetOrOrders(o: {
    limit: Node | null;
    offset: Node | null;
    orders: Node[];
  }): boolean {
    return !!(o.limit || o.offset || o.orders.length > 0);
  }

  // -- Joins --

  private visitJoinSource(node: Nodes.JoinSource): SQLString {
    if (node.left) this.visit(node.left);
    for (const join of node.right) {
      this.collector.append(" ");
      this.visit(join);
    }
    return this.collector;
  }

  private visitInnerJoin(node: Nodes.InnerJoin): SQLString {
    this.collector.append("INNER JOIN ");
    this.visit(node.left);
    if (node.right) {
      this.collector.append(" ");
      this.visit(node.right);
    }
    return this.collector;
  }

  private visitOuterJoin(node: Nodes.OuterJoin): SQLString {
    this.collector.append("LEFT OUTER JOIN ");
    this.visit(node.left);
    if (node.right) {
      this.collector.append(" ");
      this.visit(node.right);
    }
    return this.collector;
  }

  private visitRightOuterJoin(node: Nodes.RightOuterJoin): SQLString {
    this.collector.append("RIGHT OUTER JOIN ");
    this.visit(node.left);
    if (node.right) {
      this.collector.append(" ");
      this.visit(node.right);
    }
    return this.collector;
  }

  private visitFullOuterJoin(node: Nodes.FullOuterJoin): SQLString {
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

  private visitStringJoin(node: Nodes.StringJoin): SQLString {
    this.visit(node.left);
    return this.collector;
  }

  private visitOn(node: Nodes.On): SQLString {
    this.collector.append("ON ");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    }
    return this.collector;
  }

  // -- Predicates --

  private visitEquality(node: Nodes.Equality): SQLString {
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

  private visitNotEqual(node: Nodes.NotEqual): SQLString {
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

  private visitIn(node: Nodes.In): SQLString {
    if (Array.isArray(node.right) && node.right.length === 0) {
      // Empty IN is always false — Rails uses 1=0
      this.collector.append("1=0");
      return this.collector;
    }
    this.visitNodeOrValue(node.left);
    // Duck-type check for SelectManager subquery - visitNodeOrValue wraps it in parens
    if (
      node.right &&
      typeof node.right === "object" &&
      !Array.isArray(node.right) &&
      "ast" in (node.right as unknown as Record<string, unknown>) &&
      "toSql" in (node.right as unknown as Record<string, unknown>)
    ) {
      this.collector.append(" IN ");
      this.visitNodeOrValue(node.right);
      return this.collector;
    }
    this.collector.append(" IN (");
    if (Array.isArray(node.right)) {
      for (let i = 0; i < node.right.length; i++) {
        if (i > 0) this.collector.append(", ");
        this.visit(node.right[i]);
      }
    } else {
      this.visitNodeOrValue(node.right);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitNotIn(node: Nodes.NotIn): SQLString {
    if (Array.isArray(node.right) && node.right.length === 0) {
      // Empty NOT IN is always true — Rails uses 1=1
      this.collector.append("1=1");
      return this.collector;
    }
    this.visitNodeOrValue(node.left);
    if (Array.isArray(node.right)) {
      this.collector.append(" NOT IN (");
      for (let i = 0; i < node.right.length; i++) {
        if (i > 0) this.collector.append(", ");
        this.visit(node.right[i]);
      }
      this.collector.append(")");
    } else {
      this.collector.append(" NOT IN (");
      this.visitNodeOrValue(node.right);
      this.collector.append(")");
    }
    return this.collector;
  }

  private visitHomogeneousIn(node: Nodes.HomogeneousIn): SQLString {
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

  private visitBetween(node: Nodes.Between): SQLString {
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

  private visitAssignment(node: Nodes.Assignment): SQLString {
    if (this._inUpdateSet && node.left instanceof Nodes.Attribute) {
      this.collector.append(`"${node.left.name}"`);
    } else {
      this.visitNodeOrValue(node.left);
    }
    this.collector.append(" = ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  private visitAs(node: Nodes.As): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" AS ");
    this.visitNodeOrValue(node.right);
    return this.collector;
  }

  // -- Boolean --

  private visitAnd(node: Nodes.And): SQLString {
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) this.collector.append(" AND ");
      this.visit(node.children[i]);
    }
    return this.collector;
  }

  private visitOr(node: Nodes.Or): SQLString {
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) this.collector.append(" OR ");
      this.visit(node.children[i]);
    }
    return this.collector;
  }

  private visitNot(node: Nodes.Not): SQLString {
    this.collector.append("NOT (");
    this.visit(node.expr);
    this.collector.append(")");
    return this.collector;
  }

  private visitGrouping(node: Nodes.Grouping): SQLString {
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

  private visitAscending(node: Nodes.Ascending): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" ASC");
    return this.collector;
  }

  private visitDescending(node: Nodes.Descending): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" DESC");
    return this.collector;
  }

  protected visitOffset(node: Nodes.Offset): SQLString {
    this.collector.append("OFFSET ");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  protected visitLimit(node: Nodes.Limit): SQLString {
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

  protected visitLock(node: Nodes.Lock): SQLString {
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (typeof node.expr === "string") {
      this.collector.append(node.expr);
    } else {
      this.collector.append("FOR UPDATE");
    }
    return this.collector;
  }

  protected visitDistinctOn(_node: Nodes.DistinctOn): SQLString {
    throw new NotImplementedError(
      "DISTINCT ON is not supported by the base ToSql visitor. Use the PostgreSQL visitor instead.",
    );
  }

  protected visitRegexp(_node: Nodes.Regexp): SQLString {
    throw new NotImplementedError(
      "Regexp (~ operator) is not supported by the base ToSql visitor. Use a database-specific visitor (e.g. PostgreSQL) instead.",
    );
  }

  protected visitNotRegexp(_node: Nodes.NotRegexp): SQLString {
    throw new NotImplementedError(
      "NotRegexp (!~ operator) is not supported by the base ToSql visitor. Use a database-specific visitor (e.g. PostgreSQL) instead.",
    );
  }

  protected visitBin(node: Nodes.Bin): SQLString {
    // Generic visitor: just emit the inner expression.
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    return this.collector;
  }

  // -- Functions --

  private visitNamedFunction(node: Nodes.NamedFunction): SQLString {
    this.collector.retryable = false;
    this.collector.append(node.name);
    this.collector.append("(");
    if (node.distinct) this.collector.append("DISTINCT ");
    this.visitArray(node.expressions, ", ");
    this.collector.append(")");
    if (node.alias) {
      this.collector.append(" AS ");
      this.visit(node.alias);
    }
    return this.collector;
  }

  private visitExists(node: Nodes.Exists): SQLString {
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

  private visitWindow(node: Nodes.Window): SQLString {
    this.collector.append("(");
    if (node.partitions.length > 0) {
      this.collector.append("PARTITION BY ");
      this.visitArray(node.partitions, ", ");
    }
    if (node.orders.length > 0) {
      if (node.partitions.length > 0) this.collector.append(" ");
      this.collector.append("ORDER BY ");
      this.visitArray(node.orders, ", ");
    }
    if (node.framing) {
      this.collector.append(" ");
      this.visit(node.framing);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitNamedWindow(node: Nodes.NamedWindow): SQLString {
    this.collector.append(`"${node.name}" AS `);
    return this.visitWindow(node);
  }

  private visitOver(node: Nodes.Over): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" OVER ");
    if (node.right) {
      this.visitNodeOrValue(node.right);
    } else {
      this.collector.append("()");
    }
    return this.collector;
  }

  private visitPreceding(node: Nodes.Preceding): SQLString {
    if (node.expr) {
      this.visit(node.expr);
      this.collector.append(" PRECEDING");
    } else {
      this.collector.append("UNBOUNDED PRECEDING");
    }
    return this.collector;
  }

  private visitFollowing(node: Nodes.Following): SQLString {
    if (node.expr) {
      this.visit(node.expr);
      this.collector.append(" FOLLOWING");
    } else {
      this.collector.append("UNBOUNDED FOLLOWING");
    }
    return this.collector;
  }

  private visitCurrentRow(_node: Nodes.CurrentRow): SQLString {
    this.collector.append("CURRENT ROW");
    return this.collector;
  }

  private visitRows(node: Nodes.Rows): SQLString {
    this.collector.append("ROWS");
    if (node.expr) {
      this.collector.append(" ");
      this.visit(node.expr);
    }
    return this.collector;
  }

  private visitRange(node: Nodes.Range): SQLString {
    this.collector.append("RANGE");
    if (node.expr) {
      this.collector.append(" ");
      this.visit(node.expr);
    }
    return this.collector;
  }

  // -- Case --

  private visitCase(node: Nodes.Case): SQLString {
    this.collector.append("CASE");
    if (node.case) {
      this.collector.append(" ");
      this.visit(node.case);
    }
    for (const when of node.conditions) {
      this.collector.append(" WHEN ");
      this.visitNodeOrValue(when.left);
      this.collector.append(" THEN ");
      this.visitNodeOrValue(when.right);
    }
    if (node.default) {
      this.collector.append(" ELSE ");
      this.visitNodeOrValue(node.default.expr);
    }
    this.collector.append(" END");
    return this.collector;
  }

  // -- BindParam --

  protected visitBindParam(node: Nodes.BindParam): SQLString {
    if (this._extractBinds) {
      this.collector.addBind(node.value !== undefined ? node.value : node);
    } else if (node.value !== undefined) {
      this.collector.append(this.quote(resolveValueForDatabase(node.value)));
    } else {
      this.collector.addBind(node);
    }
    return this.collector;
  }

  // -- BoundSqlLiteral --

  private visitBoundSqlLiteral(node: Nodes.BoundSqlLiteral): SQLString {
    this.collector.retryable = false;
    for (const part of node.parts) {
      this.visit(part);
    }
    return this.collector;
  }

  // -- Concat --

  protected visitConcat(node: Nodes.Concat): SQLString {
    this.visit(node.left);
    this.collector.append(" || ");
    this.visit(node.right);
    return this.collector;
  }

  protected visitFragments(node: Nodes.Fragments): SQLString {
    for (const part of node.values) this.visit(part);
    return this.collector;
  }

  // -- Extract --

  private visitExtract(node: Nodes.Extract): SQLString {
    this.collector.append(`EXTRACT(${node.field} FROM `);
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null && node.expr !== undefined) {
      this.collector.append(String(node.expr));
    }
    this.collector.append(")");
    return this.collector;
  }

  // -- InfixOperation --

  private visitInfixOperation(node: Nodes.InfixOperation): SQLString {
    this.visit(node.left);
    this.collector.append(` ${node.operator} `);
    this.visit(node.right);
    return this.collector;
  }

  // -- Set operations --

  private visitUnion(node: Nodes.Union): SQLString {
    this.collector.append("(");
    this.visit(node.left);
    this.collector.append(" UNION ");
    this.visit(node.right);
    this.collector.append(")");
    return this.collector;
  }

  private visitUnionAll(node: Nodes.UnionAll): SQLString {
    this.collector.append("(");
    this.visit(node.left);
    this.collector.append(" UNION ALL ");
    this.visit(node.right);
    this.collector.append(")");
    return this.collector;
  }

  private visitIntersect(node: Nodes.Intersect): SQLString {
    this.collector.append("(");
    this.visit(node.left);
    this.collector.append(" INTERSECT ");
    this.visit(node.right);
    this.collector.append(")");
    return this.collector;
  }

  private visitExcept(node: Nodes.Except): SQLString {
    this.collector.append("(");
    this.visit(node.left);
    this.collector.append(" EXCEPT ");
    this.visit(node.right);
    this.collector.append(")");
    return this.collector;
  }

  // -- CTE --

  private visitWith(node: Nodes.With): SQLString {
    this.collector.append("WITH ");
    this.visitArray(node.children, ", ");
    return this.collector;
  }

  private visitWithRecursive(node: Nodes.WithRecursive): SQLString {
    this.collector.append("WITH RECURSIVE ");
    this.visitArray(node.children, ", ");
    return this.collector;
  }

  private visitTableAlias(node: Nodes.TableAlias): SQLString {
    this.visit(node.relation);
    this.collector.append(` "${node.name}"`);
    return this.collector;
  }

  // -- Boolean literals --

  protected visitTrue(_node: Nodes.True): SQLString {
    this.collector.append("TRUE");
    return this.collector;
  }

  protected visitFalse(_node: Nodes.False): SQLString {
    this.collector.append("FALSE");
    return this.collector;
  }

  // -- Advanced grouping --

  private visitCube(node: Nodes.Cube): SQLString {
    this.collector.append("CUBE(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitRollup(node: Nodes.Rollup): SQLString {
    this.collector.append("ROLLUP(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitGroupingElement(node: Nodes.GroupingElement): SQLString {
    this.collector.append("(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitGroupingSet(node: Nodes.GroupingSet): SQLString {
    this.collector.append("GROUPING SETS(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) this.collector.append(", ");
      this.visit(exprs[i]);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitGroup(node: Nodes.Group): SQLString {
    if (node.expr instanceof Node) {
      return this.visit(node.expr);
    }
    this.collector.append(String(node.expr));
    return this.collector;
  }

  private visitLateral(node: Nodes.Lateral): SQLString {
    this.collector.append("LATERAL (");
    this.visit(node.subquery);
    this.collector.append(")");
    return this.collector;
  }

  private visitComment(node: Nodes.Comment): SQLString {
    for (const value of node.values) {
      const sanitized = value.replace(/\/\*/g, "").replace(/\*\//g, "").replace(/\s+/g, " ").trim();
      this.collector.append(` /* ${sanitized} */`);
    }
    return this.collector;
  }

  // -- Matches with ESCAPE --

  protected visitMatches(node: Nodes.Matches): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" LIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  protected visitDoesNotMatch(node: Nodes.DoesNotMatch): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" NOT LIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  // -- NullsFirst / NullsLast --

  protected visitNullsFirst(node: Nodes.NullsFirst): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" NULLS FIRST");
    return this.collector;
  }

  protected visitNullsLast(node: Nodes.NullsLast): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" NULLS LAST");
    return this.collector;
  }

  // -- Cte --

  protected visitCte(node: Nodes.Cte): SQLString {
    this.collector.append(`"${node.name}" AS `);
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

  private visitUnaryOperation(node: Nodes.UnaryOperation): SQLString {
    this.collector.append(node.operator);
    this.visit(node.operand);
    return this.collector;
  }

  // -- Filter --

  private visitFilter(node: Nodes.Filter): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" FILTER (WHERE ");
    this.visitNodeOrValue(node.right);
    this.collector.append(")");
    return this.collector;
  }

  // -- Leaf nodes --

  private visitDistinct(_node: Nodes.Distinct): SQLString {
    this.collector.append("DISTINCT");
    return this.collector;
  }

  private visitTable(node: Table): SQLString {
    if (node.tableAlias) {
      this.collector.append(`"${node.name}" "${node.tableAlias}"`);
    } else {
      this.collector.append(`"${node.name}"`);
    }
    return this.collector;
  }

  private visitAttribute(node: Nodes.Attribute): SQLString {
    this.collector.append(`"${node.relation.tableAlias || node.relation.name}"."${node.name}"`);
    return this.collector;
  }

  private visitUnqualifiedColumn(node: Nodes.UnqualifiedColumn): SQLString {
    // Mirrors Arel's visit_Arel_Nodes_UnqualifiedColumn — strips the table
    // qualifier so `SET col = col + 1` works in UPDATE statements.
    const attr = node.attribute as Partial<Nodes.Attribute> | undefined;
    if (!attr || typeof attr.name !== "string") {
      throw new UnsupportedVisitError("UnqualifiedColumn must wrap an Attribute node with a name");
    }
    this.collector.append(`"${attr.name}"`);
    return this.collector;
  }

  private visitSqlLiteral(node: Nodes.SqlLiteral): SQLString {
    if (!(node as { retryableFlag?: boolean }).retryableFlag) {
      this.collector.retryable = false;
    }
    this.collector.append(node.value);
    return this.collector;
  }

  private visitQuoted(node: Nodes.Quoted): SQLString {
    this.collector.append(this.quote(node.value));
    return this.collector;
  }

  protected visitCasted(node: Nodes.Casted): SQLString {
    const value = node.valueForDatabase();
    if (this._extractBinds) {
      this.collector.addBind(value);
    } else {
      this.collector.append(this.quote(value));
    }
    return this.collector;
  }

  private visitValuesList(node: Nodes.ValuesList): SQLString {
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
    // Duck-type check for SelectManager (not a Node, but has ast/toSql)
    if (v !== null && v !== undefined && typeof v === "object" && "ast" in v && "toSql" in v) {
      this.collector.append("(");
      this.visit((v as { ast: Node }).ast);
      this.collector.append(")");
      return this.collector;
    }
    if (v instanceof Node) {
      // Duck-type check to avoid circular dependency (SelectManager → ToSql → SelectManager)
      if ("ast" in v && "toSql" in v) {
        this.collector.append("(");
        this.visit((v as unknown as { ast: Node }).ast);
        this.collector.append(")");
        return this.collector;
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
      this.collector.append(`'${(v as { toISOString: () => string }).toISOString()}'`);
    } else {
      this.collector.append(String(v));
    }
    return this.collector;
  }

  protected visitArray(nodes: Node[], separator: string): void {
    for (let i = 0; i < nodes.length; i++) {
      if (i > 0) this.collector.append(separator);
      this.visit(nodes[i]);
    }
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
      return `'${(value as { toISOString: () => string }).toISOString()}'`;
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
}
