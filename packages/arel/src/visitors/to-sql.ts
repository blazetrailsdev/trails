import { Node, NodeVisitor } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";

export class UnsupportedVisitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedVisitError";
  }
}

/**
 * ToSql visitor — walks the AST and produces SQL strings.
 *
 * Mirrors: Arel::Visitors::ToSql
 */
export class ToSql implements NodeVisitor<SQLString> {
  protected collector!: SQLString;

  compile(node: Node): string {
    this.collector = new SQLString();
    this.visit(node);
    return this.collector.value;
  }

  compileWithCollector(node: Node): SQLString {
    this.collector = new SQLString();
    this.visit(node);
    return this.collector;
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
    if (node instanceof Nodes.Regexp) return this.visitBinaryOp(node, "~");
    if (node instanceof Nodes.NotRegexp) return this.visitBinaryOp(node, "!~");
    if (node instanceof Nodes.IsDistinctFrom) return this.visitBinaryOp(node, "IS DISTINCT FROM");
    if (node instanceof Nodes.IsNotDistinctFrom)
      return this.visitBinaryOp(node, "IS NOT DISTINCT FROM");
    if (node instanceof Nodes.Assignment) return this.visitAssignment(node);
    if (node instanceof Nodes.As) return this.visitAs(node);

    // Math
    if (node instanceof Nodes.Addition) return this.visitBinaryOp(node, "+");
    if (node instanceof Nodes.Subtraction) return this.visitBinaryOp(node, "-");
    if (node instanceof Nodes.Multiplication) return this.visitBinaryOp(node, "*");
    if (node instanceof Nodes.Division) return this.visitBinaryOp(node, "/");

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
    if (node instanceof Nodes.InfixOperation) return this.visitInfixOperation(node);
    if (node instanceof Nodes.BoundSqlLiteral) return this.visitBoundSqlLiteral(node);
    if (node instanceof Nodes.BindParam) return this.visitBindParam(node);
    if (node instanceof Nodes.Concat) return this.visitConcat(node);
    if (node instanceof Nodes.Fragments) return this.visitFragments(node);

    // Functions
    if (node instanceof Nodes.NamedFunction) return this.visitNamedFunction(node);
    if (node instanceof Nodes.Exists) return this.visitExists(node);

    // Advanced grouping
    if (node instanceof Nodes.Cube) return this.visitCube(node);
    if (node instanceof Nodes.Rollup) return this.visitRollup(node);
    if (node instanceof Nodes.GroupingSet) return this.visitGroupingSet(node);
    if (node instanceof Nodes.Lateral) return this.visitLateral(node);
    if (node instanceof Nodes.Comment) return this.visitComment(node);

    // Boolean literals
    if (node instanceof Nodes.True) return this.visitTrue(node);
    if (node instanceof Nodes.False) return this.visitFalse(node);

    // Leaf nodes
    if (node instanceof Nodes.Distinct) return this.visitDistinct(node);
    if (node instanceof Nodes.SqlLiteral) return this.visitSqlLiteral(node);
    if (node instanceof Nodes.Quoted) return this.visitQuoted(node);
    if (node instanceof Nodes.Casted) return this.visitCasted(node);
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

    if ((node as any).comment) {
      this.visit((node as any).comment);
    }

    return this.collector;
  }

  protected visitSelectCore(node: Nodes.SelectCore): SQLString {
    this.collector.append("SELECT");

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
      this.visitArray(node.havings, ", ");
    }

    if (node.windows.length > 0) {
      this.collector.append(" WINDOW ");
      this.visitArray(node.windows, ", ");
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

    if (node.values) {
      this.collector.append(" ");
      this.visit(node.values);
    }

    return this.collector;
  }

  private visitUpdateStatement(node: Nodes.UpdateStatement): SQLString {
    this.collector.retryable = false;
    this.collector.append("UPDATE ");
    if (node.relation) this.visit(node.relation);

    if (node.values.length > 0) {
      this.collector.append(" SET ");
      this.visitArray(node.values, ", ");
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

  private visitDeleteStatement(node: Nodes.DeleteStatement): SQLString {
    this.collector.retryable = false;
    this.collector.append("DELETE FROM ");
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

  private visitBinaryOp(node: Nodes.Binary, op: string): SQLString {
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
      "ast" in (node.right as any) &&
      "toSql" in (node.right as any)
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
    this.visitNodeOrValue(node.left);
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
    this.visit(node.left);
    this.collector.append(" OR ");
    this.visit(node.right);
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
    let inner: Node = node.expr;
    while (inner instanceof Nodes.Grouping) inner = inner.expr;
    this.visit(inner);
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

  protected visitDistinctOn(node: Nodes.DistinctOn): SQLString {
    this.collector.append("DISTINCT ON (");
    if (node.expr instanceof Node) {
      this.visit(node.expr);
    } else if (node.expr !== null) {
      this.collector.append(String(node.expr));
    }
    this.collector.append(")");
    return this.collector;
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
    if (node.framingNode) {
      this.collector.append(" ");
      this.visit(node.framingNode);
    }
    this.collector.append(")");
    return this.collector;
  }

  private visitNamedWindow(node: Nodes.NamedWindow): SQLString {
    this.collector.append(`"${node.name}" AS `);
    return this.visitWindow(node);
  }

  private visitOver(node: Nodes.Over): SQLString {
    this.visit(node.left);
    this.collector.append(" OVER ");
    if (node.right) {
      this.visit(node.right);
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
    if (node.operand) {
      this.collector.append(" ");
      this.visit(node.operand);
    }
    for (const cond of node.conditions) {
      this.collector.append(" WHEN ");
      this.visit(cond.when);
      this.collector.append(" THEN ");
      this.visit(cond.then);
    }
    if (node.defaultValue) {
      this.collector.append(" ELSE ");
      this.visit(node.defaultValue);
    }
    this.collector.append(" END");
    return this.collector;
  }

  // -- BindParam --

  protected visitBindParam(node: Nodes.BindParam): SQLString {
    if (node.value !== undefined) {
      this.collector.append(this.quote(node.value));
    } else {
      this.collector.append("?");
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
    this.visit(node.expr);
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

  private visitLateral(node: Nodes.Lateral): SQLString {
    this.collector.append("LATERAL (");
    this.visit(node.subquery);
    this.collector.append(")");
    return this.collector;
  }

  private visitComment(node: Nodes.Comment): SQLString {
    for (const value of node.values) {
      this.collector.append(` /* ${value} */`);
    }
    return this.collector;
  }

  // -- Matches with ESCAPE --

  private visitMatches(node: Nodes.Matches): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" LIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  private visitDoesNotMatch(node: Nodes.DoesNotMatch): SQLString {
    this.visitNodeOrValue(node.left);
    this.collector.append(" NOT LIKE ");
    this.visitNodeOrValue(node.right);
    if (node.escape) {
      this.collector.append(` ESCAPE '${node.escape}'`);
    }
    return this.collector;
  }

  // -- NullsFirst / NullsLast --

  private visitNullsFirst(node: Nodes.NullsFirst): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr);
    this.collector.append(" NULLS FIRST");
    return this.collector;
  }

  private visitNullsLast(node: Nodes.NullsLast): SQLString {
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
    this.visit(node.expression);
    this.collector.append(" FILTER (WHERE ");
    this.visit(node.filter);
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

  private visitSqlLiteral(node: Nodes.SqlLiteral): SQLString {
    if (!(node as any).retryableFlag) {
      this.collector.retryable = false;
    }
    this.collector.append(node.value);
    return this.collector;
  }

  private visitQuoted(node: Nodes.Quoted): SQLString {
    this.collector.append(this.quote(node.value));
    return this.collector;
  }

  private visitCasted(node: Nodes.Casted): SQLString {
    this.collector.append(this.quote(node.value));
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

  private visitNodeOrValue(v: Nodes.NodeOrValue): SQLString {
    // Duck-type check for SelectManager (not a Node, but has ast/toSql)
    if (v !== null && v !== undefined && typeof v === "object" && "ast" in v && "toSql" in v) {
      this.collector.append("(");
      this.visit((v as any).ast);
      this.collector.append(")");
      return this.collector;
    }
    if (v instanceof Node) {
      // Duck-type check to avoid circular dependency (SelectManager → ToSql → SelectManager)
      if ("ast" in v && "toSql" in v) {
        this.collector.append("(");
        this.visit((v as any).ast);
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
      this.collector.append(v ? "TRUE" : "FALSE");
    } else if (typeof v === "bigint") {
      this.collector.append(v.toString());
    } else if (v instanceof Date) {
      // Format as 'YYYY-MM-DD'
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const d = String(v.getDate()).padStart(2, "0");
      this.collector.append(`'${y}-${m}-${d}'`);
    } else if (
      typeof v === "object" &&
      v !== null &&
      "toISOString" in v &&
      typeof (v as any).toISOString === "function"
    ) {
      this.collector.append(`'${(v as any).toISOString()}'`);
    } else {
      this.collector.append(String(v));
    }
    return this.collector;
  }

  private visitArray(nodes: Node[], separator: string): void {
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
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return `'${y}-${m}-${d}'`;
    }
    if (
      typeof value === "object" &&
      value !== null &&
      "toISOString" in value &&
      typeof (value as any).toISOString === "function"
    ) {
      return `'${(value as any).toISOString()}'`;
    }
    const escaped = String(value).replace(/'/g, "''");
    return `'${escaped}'`;
  }
}
