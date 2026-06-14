import { Node } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import { Bind } from "../collectors/bind.js";
import { Composite } from "../collectors/composite.js";
import { SubstituteBinds } from "../collectors/substitute-binds.js";
import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";
import { Visitor, type NodeCtor } from "./visitor.js";
import { UnsupportedVisitError, NotImplementedError, BindError } from "../errors.js";

// Mirrors Arel::Visitors::UnsupportedVisitError (defined in to_sql.rb:5
// in Rails as `class UnsupportedVisitError < StandardError`). Trails
// declares the class in ../errors.ts so it can sit on the ArelError
// hierarchy alongside BindError/EmptyJoinError, but re-exports it from
// here so api:compare finds it where Rails defines it.
export { UnsupportedVisitError };
import { defaultQuoter } from "./default-quoter.js";
import { substituteBoundValues } from "./substitute-bound-values.js";
export type { ArelConnection } from "./connection.js";
import type { ArelConnection } from "./connection.js";

/**
 * Connection-quoting surface exposed to the Arel visitor.
 *
 * Mirrors Rails' `@connection` object passed to `Arel::Visitors::ToSql`.
 * Rails dispatches every quoting decision through the connection so adapters
 * can specialise (PG hex-escapes binary, MySQL backtick-quotes identifiers,
 * etc.).  We accept this subset so `arel` stays dependency-free from
 * `activerecord`; `AbstractAdapter` is a structural superset and always
 * satisfies this interface.
 *
 * @deprecated Use `ArelConnection` — this alias will be removed in a future release.
 */
export type ArelQuoter = ArelConnection;

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
 * True when a CTE body node renders its own surrounding parentheses (a
 * `Grouping` or a set-operation node), so `visit_Arel_Nodes_Cte` must not add
 * another pair. A bare `SelectStatement` / `SqlLiteral` returns false — those
 * need the explicit `AS (...)` wrap.
 */
export function cteRelationSelfWraps(relation: Node): boolean {
  return (
    relation instanceof Nodes.Grouping ||
    relation instanceof Nodes.Union ||
    relation instanceof Nodes.UnionAll ||
    relation instanceof Nodes.Intersect ||
    relation instanceof Nodes.Except
  );
}

/**
 * ToSql visitor — walks the AST and produces SQL strings.
 *
 * Mirrors: Arel::Visitors::ToSql
 */
export class ToSql extends Visitor {
  protected readonly connection: ArelConnection;

  constructor(connection: ArelConnection = defaultQuoter) {
    super();
    this.connection = connection;
  }

  compile(node: Node): string;
  compile(
    node: Node | ReadonlyArray<Nodes.NodeOrValue>,
    collector: SQLString | SubstituteBinds,
  ): string;
  compile(
    node: Node | ReadonlyArray<Nodes.NodeOrValue>,
    collector?: SQLString | SubstituteBinds,
  ): string {
    // Rails-faithful `compile(node, collector)`: drive the supplied collector
    // (so callers control its bind state) and return the rendered SQL. An array
    // node renders as a comma-joined list, mirroring Arel's `visit_Array` — this
    // is what bind_parameter_test's `bind_params` helper relies on to compile a
    // list of `BindParam` nodes through a single shared collector. The collector
    // type covers the string-rendering collectors (`SQLString` keeps `?`
    // placeholders, `SubstituteBinds` inlines quoted values); the visitor's
    // dispatch is typed against `SQLString`, so cast at the boundary as the rest
    // of this file does.
    if (collector !== undefined) {
      const c = collector as unknown as SQLString;
      if (Array.isArray(node)) {
        this.visitArray(node as ReadonlyArray<Nodes.NodeOrValue>, c);
      } else {
        this.visit(node as Node, c);
      }
      return collector.value;
    }
    const sqlCollector = new SQLString();
    const bindCollector = new Bind();
    const composite = new Composite(sqlCollector, bindCollector);
    this.visit(node as Node, composite as unknown as SQLString);
    const sql = sqlCollector.value;
    const binds = bindCollector.value;
    if (binds.length === 0) return sql;
    return substituteBoundValues(sql, (match, i) => {
      const raw = binds[i];
      // BindParam collects a placeholder rather than inlining its value —
      // mirrors Rails `visit_Arel_Nodes_BindParam` (`BIND_BLOCK = proc { "?" }`),
      // so `Nodes::BindParam.new(v).to_sql` is always `?`. Casted/Quoted/date
      // values still inline below (Rails inlines those via `quote`).
      if (raw instanceof Nodes.BindParam || raw === undefined) return match;
      const val = resolveValueForDatabase(raw);
      return this.quote(val);
    });
  }

  protected visitArelNodesDeleteStatement(
    o: Nodes.DeleteStatement,
    collector: SQLString,
  ): SQLString {
    const node = this.prepareDeleteStatement(o);
    collector.retryable = false;
    const joinSourceLeft = this.hasJoinSources(node)
      ? (node.relation as Nodes.JoinSource).left
      : null;
    if (joinSourceLeft) {
      collector.append("DELETE ");
      this.visit(joinSourceLeft, collector);
      collector.append(" FROM ");
    } else {
      collector.append("DELETE FROM ");
    }
    if (node.relation) this.visit(node.relation, collector);

    if (node.wheres.length > 0) {
      collector.append(" WHERE ");
      const conditions = node.wheres.length === 1 ? node.wheres[0] : new Nodes.And(node.wheres);
      this.visit(conditions, collector);
    }

    if (node.orders.length > 0) {
      collector.append(" ORDER BY ");
      this.injectJoin(node.orders, ", ", collector);
    }

    if (node.limit) {
      collector.append(" ");
      this.visit(node.limit, collector);
    }

    return collector;
  }

  protected visitArelNodesUpdateStatement(
    o: Nodes.UpdateStatement,
    collector: SQLString,
  ): SQLString {
    const node = this.prepareUpdateStatement(o);
    collector.retryable = false;
    collector.append("UPDATE ");
    if (node.relation) this.visit(node.relation, collector);

    if (node.values.length > 0) {
      collector.append(" SET ");
      this.injectJoin(node.values, ", ", collector);
    }

    if (node.wheres.length > 0) {
      collector.append(" WHERE ");
      const conditions = node.wheres.length === 1 ? node.wheres[0] : new Nodes.And(node.wheres);
      this.visit(conditions, collector);
    }

    if (node.orders.length > 0) {
      collector.append(" ORDER BY ");
      this.injectJoin(node.orders, ", ", collector);
    }

    if (node.limit) {
      collector.append(" ");
      this.visit(node.limit, collector);
    }

    return collector;
  }

  protected visitArelNodesInsertStatement(
    node: Nodes.InsertStatement,
    collector: SQLString,
  ): SQLString {
    collector.retryable = false;
    collector.append("INSERT INTO ");
    if (node.relation) this.visit(node.relation, collector);

    if (node.columns.length > 0) {
      collector.append(" (");
      const colNames = node.columns.map((c) => {
        if (c instanceof Nodes.SqlLiteral) return c.value;
        const name =
          c instanceof Nodes.Attribute ? c.name : String((c as { name?: string }).name ?? c);
        return this.quoteColumnName(name);
      });
      collector.append(colNames.join(", "));
      collector.append(")");
    }

    // Mirrors Rails: prefer `node.values` when both are present
    // (insert_statement.rb / to_sql.rb pattern). Routes through
    // `visitNodeOrValue` so a SelectManager-shaped duck-type (the form
    // `InsertManager#select` stores) lands in `visitArelSelectManager`.
    if (node.values) {
      collector.append(" ");
      this.visit(node.values, collector);
    } else if (node.select) {
      collector.append(" ");
      this.visitNodeOrValue(node.select as Nodes.NodeOrValue, collector);
    }

    return collector;
  }

  protected visitArelNodesExists(node: Nodes.Exists, collector: SQLString): SQLString {
    collector.append("EXISTS (");
    this.visit(node.expressions[0], collector);
    collector.append(")");
    if (node.alias) {
      collector.append(" AS ");
      this.visit(node.alias, collector);
    }
    return collector;
  }

  protected visitArelNodesCasted(node: Nodes.Casted, collector: SQLString): SQLString {
    // Mirrors Rails to_sql.rb `visit_Arel_Nodes_Casted`: collector.add_bind(o, &bind_block).
    // Quoted nodes (null comparisons, hard-coded literals) inline via visitQuoted.
    const value = resolveValueForDatabase(node.valueForDatabase());
    collector.addBind(value, this.bindBlock());
    return collector;
  }

  // -- Boolean literals --

  protected visitArelNodesTrue(_node: Nodes.True, collector: SQLString): SQLString {
    collector.append("TRUE");
    return collector;
  }

  protected visitArelNodesFalse(_node: Nodes.False, collector: SQLString): SQLString {
    collector.append("FALSE");
    return collector;
  }

  private visitArelNodesValuesList(node: Nodes.ValuesList, collector: SQLString): SQLString {
    collector.append("VALUES ");
    for (let i = 0; i < node.rows.length; i++) {
      if (i > 0) collector.append(", ");
      collector.append("(");
      for (let j = 0; j < node.rows[i].length; j++) {
        if (j > 0) collector.append(", ");
        this.visitNodeOrValue(node.rows[i][j] as Nodes.NodeOrValue, collector);
      }
      collector.append(")");
    }
    return collector;
  }

  // -- Statements --

  protected visitArelNodesSelectStatement(
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
    }

    if (node.offset) {
      collector.append(" ");
      this.visit(node.offset, collector);
    }

    if (node.lock) {
      collector.append(" ");
      this.visit(node.lock, collector);
    }

    return collector;
  }

  /**
   * Mirrors Rails: `visit_Arel_Nodes_SelectOptions` (to_sql.rb:143). Emits
   * limit/offset/lock via `maybeVisit`. Trails' SelectStatement carries
   * those fields directly, so this fires only when a caller constructs a
   * `Nodes.SelectOptions` explicitly. Reachable through the dispatch table.
   */
  protected visitArelNodesSelectOptions(o: Nodes.SelectOptions, collector: SQLString): SQLString {
    this.maybeVisit(o.limit, collector);
    this.maybeVisit(o.offset, collector);
    this.maybeVisit(o.lock, collector);
    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_SelectCore (to_sql.rb:149). Where Rails
  // uses collect_nodes_for to emit `spacer` + injectJoin in one call, we do
  // the same; wheres/havings collapse multiple predicates with " AND " via
  // collect_nodes_for's connector arg.
  protected visitArelNodesSelectCore(node: Nodes.SelectCore, collector: SQLString): SQLString {
    collector.append("SELECT");

    this.collectOptimizerHints(node, collector);
    this.maybeVisit(node.setQuantifier ?? null, collector);

    this.collectNodesFor(node.projections, " ", ", ", collector);

    if (node.source.left) {
      collector.append(" FROM ");
      this.visit(node.source, collector);
    }

    this.collectNodesFor(node.wheres, " WHERE ", " AND ", collector);
    this.collectNodesFor(node.groups, " GROUP BY ", ", ", collector);
    this.collectNodesFor(node.havings, " HAVING ", " AND ", collector);
    this.collectNodesFor(node.windows, " WINDOW ", ", ", collector);

    this.maybeVisit(node.comment ?? null, collector);

    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_OptimizerHints (to_sql.rb:170). The
  // OptimizerHints node carries a list of hint strings (Rails' `o.expr` is
  // an array); each hint is sanitized and the joined result wrapped in
  // /*+ ... */. SelectCore stores its optimizer hints as an OptimizerHints
  // node and `emitOptimizerHints` delegates here.
  protected visitArelNodesOptimizerHints(
    node: Nodes.OptimizerHints,
    collector: SQLString,
  ): SQLString {
    // Each hint routes through `sanitizeAsSqlComment` — the same
    // connection-delegating helper `visitArelNodesComment` uses (to_sql.rb:171).
    const sanitized = node.hints
      .map((h) => this.sanitizeAsSqlComment(h))
      .filter((h) => h.length > 0);
    if (sanitized.length === 0) return collector;
    collector.append(` /*+ ${sanitized.join(" ")} */`);
    return collector;
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
    reg(Nodes.RollUp, "visitArelNodesRollUp");
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

  // Mirrors Rails: visit_Arel_Nodes_Comment (to_sql.rb:175) — emits the
  // joined `/* ... */` blocks without a leading space. Callers add the
  // leading separator (typically via `maybeVisit`).
  protected visitArelNodesComment(node: Nodes.Comment, collector: SQLString): SQLString {
    const blocks = node.values.map((v) => `/* ${this.sanitizeAsSqlComment(v)} */`);
    collector.append(blocks.join(" "));
    return collector;
  }

  // ---------------------------------------------------------------------
  // Rails-mirrored private helpers (to_sql.rb).
  // ---------------------------------------------------------------------

  /**
   * Mirrors `to_sql.rb#collect_nodes_for`. Emits `spacer` then visits each
   * node separated by `connector` (default `", "`). No-op when empty.
   */
  protected collectNodesFor(
    nodes: Node[],
    spacer: string,
    connector = ", ",
    collector: SQLString,
  ): SQLString {
    if (nodes.length === 0) return collector;
    collector.append(spacer);
    this.injectJoin(nodes, connector, collector);
    return collector;
  }

  protected visitArelNodesBin(node: Nodes.Bin, collector: SQLString): SQLString {
    // Generic visitor: just emit the inner expression.
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else if (node.expr !== null) {
      collector.append(String(node.expr));
    }
    return collector;
  }

  // -- Leaf nodes --

  private visitArelNodesDistinct(_node: Nodes.Distinct, collector: SQLString): SQLString {
    collector.append("DISTINCT");
    return collector;
  }

  protected visitArelNodesDistinctOn(_node: Nodes.DistinctOn, _collector: SQLString): SQLString {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/arel/visitors/to_sql.rb:194 cluster=arel-visitor-strategy
    throw new NotImplementedError(
      "DISTINCT ON is not supported by the base ToSql visitor. Use the PostgreSQL visitor instead.",
    );
  }

  // -- CTE --

  private visitArelNodesWith(node: Nodes.With, collector: SQLString): SQLString {
    collector.append("WITH ");
    this.injectJoin(node.children, ", ", collector);
    return collector;
  }

  private visitArelNodesWithRecursive(node: Nodes.WithRecursive, collector: SQLString): SQLString {
    collector.append("WITH RECURSIVE ");
    this.injectJoin(node.children, ", ", collector);
    return collector;
  }

  // -- Set operations --

  protected visitArelNodesUnion(node: Nodes.Union, collector: SQLString): SQLString {
    return this.infixValueWithParen(node, " UNION ", false, collector);
  }

  protected visitArelNodesUnionAll(node: Nodes.UnionAll, collector: SQLString): SQLString {
    return this.infixValueWithParen(node, " UNION ALL ", false, collector);
  }

  protected visitArelNodesIntersect(node: Nodes.Intersect, collector: SQLString): SQLString {
    collector.append("( ");
    this.infixValue(node, " INTERSECT ", collector);
    collector.append(" )");
    return collector;
  }

  protected visitArelNodesExcept(node: Nodes.Except, collector: SQLString): SQLString {
    collector.append("( ");
    this.infixValue(node, " EXCEPT ", collector);
    collector.append(" )");
    return collector;
  }

  private visitArelNodesNamedWindow(node: Nodes.NamedWindow, collector: SQLString): SQLString {
    collector.append(`${this.quoteColumnName(node.name)} AS `);
    return this.visitArelNodesWindow(node, collector);
  }

  // -- Window --

  private visitArelNodesWindow(node: Nodes.Window, collector: SQLString): SQLString {
    collector.append("(");
    if (node.partitions.length > 0) {
      collector.append("PARTITION BY ");
      this.injectJoin(node.partitions, ", ", collector);
    }
    if (node.orders.length > 0) {
      if (node.partitions.length > 0) collector.append(" ");
      collector.append("ORDER BY ");
      this.injectJoin(node.orders, ", ", collector);
    }
    if (node.framing) {
      collector.append(" ");
      this.visit(node.framing, collector);
    }
    collector.append(")");
    return collector;
  }

  // -- Filter --

  private visitArelNodesFilter(node: Nodes.Filter, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" FILTER (WHERE ");
    this.visitNodeOrValue(node.right, collector);
    collector.append(")");
    return collector;
  }

  private visitArelNodesRows(node: Nodes.Rows, collector: SQLString): SQLString {
    collector.append("ROWS");
    if (node.expr) {
      collector.append(" ");
      this.visit(node.expr, collector);
    }
    return collector;
  }

  private visitArelNodesRange(node: Nodes.Range, collector: SQLString): SQLString {
    collector.append("RANGE");
    if (node.expr) {
      collector.append(" ");
      this.visit(node.expr, collector);
    }
    return collector;
  }

  private visitArelNodesPreceding(node: Nodes.Preceding, collector: SQLString): SQLString {
    if (node.expr) {
      this.visit(node.expr, collector);
      collector.append(" PRECEDING");
    } else {
      collector.append("UNBOUNDED PRECEDING");
    }
    return collector;
  }

  private visitArelNodesFollowing(node: Nodes.Following, collector: SQLString): SQLString {
    if (node.expr) {
      this.visit(node.expr, collector);
      collector.append(" FOLLOWING");
    } else {
      collector.append("UNBOUNDED FOLLOWING");
    }
    return collector;
  }

  private visitArelNodesCurrentRow(_node: Nodes.CurrentRow, collector: SQLString): SQLString {
    collector.append("CURRENT ROW");
    return collector;
  }

  private visitArelNodesOver(node: Nodes.Over, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" OVER ");
    if (node.right) {
      this.visitNodeOrValue(node.right, collector);
    } else {
      collector.append("()");
    }
    return collector;
  }

  protected visitArelNodesOffset(node: Nodes.Offset, collector: SQLString): SQLString {
    collector.append("OFFSET ");
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else {
      collector.append(String(node.expr));
    }
    return collector;
  }

  protected visitArelNodesLimit(node: Nodes.Limit, collector: SQLString): SQLString {
    collector.append("LIMIT ");
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else {
      collector.append(String(node.expr));
    }
    return collector;
  }

  protected visitArelNodesLock(node: Nodes.Lock, collector: SQLString): SQLString {
    this.visit(node.expr as Node, collector);
    return collector;
  }

  private visitArelNodesGrouping(node: Nodes.Grouping, collector: SQLString): SQLString {
    collector.append("(");
    let inner = node.expr;
    while (inner instanceof Nodes.Grouping) inner = inner.expr;
    if (inner instanceof Node) {
      this.visit(inner, collector);
    } else if (inner !== null && inner !== undefined) {
      collector.append(String(inner));
    }
    collector.append(")");
    return collector;
  }

  private visitArelNodesHomogeneousIn(node: Nodes.HomogeneousIn, collector: SQLString): SQLString {
    collector.preparable = false;
    if (node.values.length === 0) {
      collector.append(node.type === "in" ? "1=0" : "1=1");
      return collector;
    }
    this.visit(node.attribute, collector);
    collector.append(node.type === "in" ? " IN (" : " NOT IN (");
    // Mirrors Rails to_sql.rb: `collector.add_binds(o.casted_values, o.proc_for_binds, &bind_block)`
    collector.addBinds(node.castedValues, node.procForBinds, this.bindBlock());
    collector.append(")");
    return collector;
  }

  /**
   * Mirrors `to_sql.rb#visit_Arel_SelectManager` — visits the manager's AST
   * wrapped in parens so it can be embedded as a subquery.
   */
  protected visitArelSelectManager(o: { ast: Node }, collector: SQLString): SQLString {
    collector.append("(");
    this.visit(o.ast, collector);
    collector.append(")");
    return collector;
  }

  // -- Unary --

  private visitArelNodesAscending(node: Nodes.Ascending, collector: SQLString): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr, collector);
    collector.append(" ASC");
    return collector;
  }

  private visitArelNodesDescending(node: Nodes.Descending, collector: SQLString): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr, collector);
    collector.append(" DESC");
    return collector;
  }

  // -- NullsFirst / NullsLast --

  protected visitArelNodesNullsFirst(node: Nodes.NullsFirst, collector: SQLString): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr, collector);
    collector.append(" NULLS FIRST");
    return collector;
  }

  protected visitArelNodesNullsLast(node: Nodes.NullsLast, collector: SQLString): SQLString {
    if (node.expr instanceof Node) this.visit(node.expr, collector);
    collector.append(" NULLS LAST");
    return collector;
  }

  private visitArelNodesGroup(node: Nodes.Group, collector: SQLString): SQLString {
    if (node.expr instanceof Node) {
      return this.visit(node.expr, collector);
    }
    collector.append(String(node.expr));
    return collector;
  }

  // -- Functions --

  private visitArelNodesNamedFunction(node: Nodes.NamedFunction, collector: SQLString): SQLString {
    collector.retryable = false;
    collector.append(node.name);
    collector.append("(");
    if (node.distinct) collector.append("DISTINCT ");
    this.injectJoin(node.expressions, ", ", collector);
    collector.append(")");
    if (node.alias) {
      collector.append(" AS ");
      this.visit(node.alias, collector);
    }
    return collector;
  }

  // -- Extract --

  private visitArelNodesExtract(node: Nodes.Extract, collector: SQLString): SQLString {
    collector.append(`EXTRACT(${String(node.field).toUpperCase()} FROM `);
    if (Array.isArray(node.expr)) {
      this.visitArray(node.expr, collector);
    } else if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else if (node.expr !== null && node.expr !== undefined) {
      collector.append(String(node.expr));
    }
    collector.append(")");
    return collector;
  }

  protected visitArelNodesCount(node: Nodes.Count, collector: SQLString): SQLString {
    return this.aggregate("COUNT", node, collector);
  }

  protected visitArelNodesSum(node: Nodes.Sum, collector: SQLString): SQLString {
    return this.aggregate("SUM", node, collector);
  }

  protected visitArelNodesMax(node: Nodes.Max, collector: SQLString): SQLString {
    return this.aggregate("MAX", node, collector);
  }

  protected visitArelNodesMin(node: Nodes.Min, collector: SQLString): SQLString {
    return this.aggregate("MIN", node, collector);
  }

  protected visitArelNodesAvg(node: Nodes.Avg, collector: SQLString): SQLString {
    return this.aggregate("AVG", node, collector);
  }

  private visitArelNodesTableAlias(node: Nodes.TableAlias, collector: SQLString): SQLString {
    this.visit(node.relation, collector);
    // Mirrors Rails `visit_Arel_Nodes_TableAlias`: `quote_table_name(o.name)`
    // renders a `SqlLiteral` name bare and quotes a plain string. The bare-alias
    // cases come from the *value*, not the relation shape: `SelectManager#as`
    // and the set-op `from()` path both name the alias with a `SqlLiteral`
    // (`quoteTableName` returns its `value` unchanged), while `Table#alias("foo")`
    // keeps `"foo"`. The legacy `SelectManager#as` plain-string subquery alias
    // (relation is a Grouping) is still emitted bare for back-compat.
    if (node.relation instanceof Nodes.Grouping && !(node.name instanceof Nodes.SqlLiteral)) {
      collector.append(` ${node.name}`);
    } else {
      collector.append(` ${this.quoteTableName(node.name)}`);
    }
    return collector;
  }

  private visitArelNodesBetween(node: Nodes.Between, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" BETWEEN ");
    if (node.right instanceof Nodes.And) {
      const and = node.right;
      this.visit(and.children[0], collector);
      collector.append(" AND ");
      this.visit(and.children[1], collector);
    } else {
      this.visitNodeOrValue(node.right, collector);
    }
    return collector;
  }

  protected visitArelNodesGreaterThanOrEqual(
    node: Nodes.GreaterThanOrEqual,
    collector: SQLString,
  ): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return collector.append("1=0");
    if (sign === -1) return collector.append("1=1");
    return this.visitBinaryOp(node, ">=", collector);
  }

  // Per-class dispatch wrappers for shared helpers — mirrors Rails' per-method
  // form (each operator/aggregate has its own visit method).
  protected visitArelNodesGreaterThan(node: Nodes.GreaterThan, collector: SQLString): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return collector.append("1=0");
    if (sign === -1) return collector.append("1=1");
    return this.visitBinaryOp(node, ">", collector);
  }

  protected visitArelNodesLessThanOrEqual(
    node: Nodes.LessThanOrEqual,
    collector: SQLString,
  ): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return collector.append("1=1");
    if (sign === -1) return collector.append("1=0");
    return this.visitBinaryOp(node, "<=", collector);
  }

  protected visitArelNodesLessThan(node: Nodes.LessThan, collector: SQLString): SQLString {
    const sign = this.unboundableSign(node.right);
    if (sign === 1) return collector.append("1=1");
    if (sign === -1) return collector.append("1=0");
    return this.visitBinaryOp(node, "<", collector);
  }

  // -- Matches with ESCAPE --

  protected visitArelNodesMatches(node: Nodes.Matches, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" LIKE ");
    this.visitNodeOrValue(node.right, collector);
    this.appendEscape(node.escape, collector);
    return collector;
  }

  protected visitArelNodesDoesNotMatch(node: Nodes.DoesNotMatch, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" NOT LIKE ");
    this.visitNodeOrValue(node.right, collector);
    this.appendEscape(node.escape, collector);
    return collector;
  }

  // -- Joins --

  private visitArelNodesJoinSource(node: Nodes.JoinSource, collector: SQLString): SQLString {
    if (node.left) this.visit(node.left, collector);
    for (const join of node.right) {
      collector.append(" ");
      this.visit(join, collector);
    }
    return collector;
  }

  protected visitArelNodesRegexp(_node: Nodes.Regexp, _collector: SQLString): SQLString {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/arel/visitors/to_sql.rb:520 cluster=arel-visitor-strategy
    throw new NotImplementedError(
      "Regexp (~ operator) is not supported by the base ToSql visitor. Use a database-specific visitor (e.g. PostgreSQL) instead.",
    );
  }

  protected visitArelNodesNotRegexp(_node: Nodes.NotRegexp, _collector: SQLString): SQLString {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/arel/visitors/to_sql.rb:524 cluster=arel-visitor-strategy
    throw new NotImplementedError(
      "NotRegexp (!~ operator) is not supported by the base ToSql visitor. Use a database-specific visitor (e.g. PostgreSQL) instead.",
    );
  }

  private visitArelNodesStringJoin(node: Nodes.StringJoin, collector: SQLString): SQLString {
    this.visit(node.left, collector);
    return collector;
  }

  private visitArelNodesFullOuterJoin(node: Nodes.FullOuterJoin, collector: SQLString): SQLString {
    collector.append("FULL OUTER JOIN ");
    this.visit(node.left, collector);
    collector.append(" ");
    this.visit(node.right as Node, collector);
    return collector;
  }

  private visitArelNodesOuterJoin(node: Nodes.OuterJoin, collector: SQLString): SQLString {
    collector.append("LEFT OUTER JOIN ");
    this.visit(node.left, collector);
    collector.append(" ");
    this.visit(node.right as Node, collector);
    return collector;
  }

  private visitArelNodesRightOuterJoin(
    node: Nodes.RightOuterJoin,
    collector: SQLString,
  ): SQLString {
    collector.append("RIGHT OUTER JOIN ");
    this.visit(node.left, collector);
    collector.append(" ");
    this.visit(node.right as Node, collector);
    return collector;
  }

  private visitArelNodesInnerJoin(node: Nodes.InnerJoin, collector: SQLString): SQLString {
    collector.append("INNER JOIN ");
    this.visit(node.left, collector);
    if (node.right) {
      collector.append(" ");
      this.visit(node.right, collector);
    }
    return collector;
  }

  private visitArelNodesOn(node: Nodes.On, collector: SQLString): SQLString {
    collector.append("ON ");
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    }
    return collector;
  }

  private visitArelNodesNot(node: Nodes.Not, collector: SQLString): SQLString {
    collector.append("NOT (");
    this.visit(node.expr, collector);
    collector.append(")");
    return collector;
  }

  private visitArelTable(node: Table, collector: SQLString): SQLString {
    // Mirrors Rails visit_Arel_Table (to_sql.rb): if name is a Node, visit
    // it (subquery-as-table); else quote as identifier. Trails types
    // `Table.name` as `string`; callers smuggling a Node in must cast.
    const name = node.name as unknown;
    if (name instanceof Node) {
      this.visit(name, collector);
    } else {
      collector.append(this.quoteTableName(node.name));
    }
    if (node.tableAlias) {
      collector.append(` ${this.quoteTableName(node.tableAlias)}`);
    }
    return collector;
  }

  private visitArelNodesIn(node: Nodes.In, collector: SQLString): SQLString {
    let values = node.right;
    if (Array.isArray(values)) {
      collector.preparable = false;
      if (values.length > 0) {
        values = values.filter((v) => this.unboundableSign(v) === 0);
      }
      if (values.length === 0) {
        // Empty IN is always false — Rails uses 1=0
        collector.append("1=0");
        return collector;
      }
    }
    this.visitNodeOrValue(node.left, collector);
    // Duck-type check for SelectManager subquery - visitNodeOrValue wraps it in parens
    if (
      values &&
      typeof values === "object" &&
      !Array.isArray(values) &&
      "ast" in (values as unknown as Record<string, unknown>) &&
      "toSql" in (values as unknown as Record<string, unknown>)
    ) {
      collector.append(" IN ");
      this.visitNodeOrValue(values, collector);
      return collector;
    }
    collector.append(" IN (");
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; i++) {
        if (i > 0) collector.append(", ");
        this.visit(values[i], collector);
      }
    } else {
      this.visitNodeOrValue(values, collector);
    }
    collector.append(")");
    return collector;
  }

  private visitArelNodesNotIn(node: Nodes.NotIn, collector: SQLString): SQLString {
    let values = node.right;
    if (Array.isArray(values)) {
      collector.preparable = false;
      if (values.length > 0) {
        values = values.filter((v) => this.unboundableSign(v) === 0);
      }
      if (values.length === 0) {
        // Empty NOT IN is always true — Rails uses 1=1
        collector.append("1=1");
        return collector;
      }
    }
    this.visitNodeOrValue(node.left, collector);
    if (Array.isArray(values)) {
      collector.append(" NOT IN (");
      for (let i = 0; i < values.length; i++) {
        if (i > 0) collector.append(", ");
        this.visit(values[i], collector);
      }
      collector.append(")");
    } else {
      collector.append(" NOT IN (");
      this.visitNodeOrValue(values, collector);
      collector.append(")");
    }
    return collector;
  }

  // -- Boolean --

  private visitArelNodesAnd(node: Nodes.And, collector: SQLString): SQLString {
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) collector.append(" AND ");
      this.visit(node.children[i], collector);
    }
    return collector;
  }

  private visitArelNodesOr(node: Nodes.Or, collector: SQLString): SQLString {
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) collector.append(" OR ");
      this.visit(node.children[i], collector);
    }
    return collector;
  }

  private visitArelNodesAssignment(node: Nodes.Assignment, collector: SQLString): SQLString {
    // Mirrors Rails: bare `visit(left) = visit(right)`. Column-name
    // unqualification is the responsibility of `UnqualifiedColumn`,
    // which `UpdateManager#set` wraps each LHS in.
    this.visitNodeOrValue(node.left, collector);
    collector.append(" = ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  // -- Predicates --

  private visitArelNodesEquality(node: Nodes.Equality, collector: SQLString): SQLString {
    if (this.unboundableSign(node.right) !== 0) {
      return collector.append("1=0");
    }
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left, collector);
      collector.append(" IS NULL");
      return collector;
    }
    this.visitNodeOrValue(node.left, collector);
    collector.append(" = ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  protected visitArelNodesIsNotDistinctFrom(
    node: Nodes.IsNotDistinctFrom,
    collector: SQLString,
  ): SQLString {
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left, collector);
      collector.append(" IS NULL");
      return collector;
    }
    return this.visitBinaryOp(node, "IS NOT DISTINCT FROM", collector);
  }

  protected visitArelNodesIsDistinctFrom(
    node: Nodes.IsDistinctFrom,
    collector: SQLString,
  ): SQLString {
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left, collector);
      collector.append(" IS NOT NULL");
      return collector;
    }
    return this.visitBinaryOp(node, "IS DISTINCT FROM", collector);
  }

  private visitArelNodesNotEqual(node: Nodes.NotEqual, collector: SQLString): SQLString {
    if (this.unboundableSign(node.right) !== 0) {
      return collector.append("1=1");
    }
    if (node.right instanceof Nodes.Quoted && (node.right as Nodes.Quoted).value === null) {
      this.visitNodeOrValue(node.left, collector);
      collector.append(" IS NOT NULL");
      return collector;
    }
    this.visitNodeOrValue(node.left, collector);
    collector.append(" != ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  private visitArelNodesAs(node: Nodes.As, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" AS ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  // -- Case --

  private visitArelNodesCase(node: Nodes.Case, collector: SQLString): SQLString {
    collector.append("CASE");
    if (node.case) {
      collector.append(" ");
      this.visit(node.case, collector);
    }
    for (const when of node.conditions) {
      collector.append(" ");
      this.visitArelNodesWhen(when, collector);
    }
    if (node.default) {
      collector.append(" ");
      this.visitArelNodesElse(node.default, collector);
    }
    collector.append(" END");
    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_When (to_sql.rb).
  protected visitArelNodesWhen(node: Nodes.When, collector: SQLString): SQLString {
    collector.append("WHEN ");
    this.visitNodeOrValue(node.left, collector);
    collector.append(" THEN ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_Else (to_sql.rb).
  protected visitArelNodesElse(node: Nodes.Else, collector: SQLString): SQLString {
    collector.append("ELSE ");
    this.visitNodeOrValue(node.expr as Nodes.NodeOrValue, collector);
    return collector;
  }

  protected visitArelNodesUnqualifiedColumn(
    node: Nodes.UnqualifiedColumn,
    collector: SQLString,
  ): SQLString {
    // Mirrors Arel's visit_Arel_Nodes_UnqualifiedColumn — strips the table
    // qualifier so `SET col = col + 1` works in UPDATE statements.
    const attr = node.attribute as Partial<Nodes.Attribute> | undefined;
    if (!attr || typeof attr.name !== "string") {
      throw new UnsupportedVisitError("UnqualifiedColumn must wrap an Attribute node with a name");
    }
    collector.append(this.quoteColumnName(attr.name));
    return collector;
  }

  // -- Cte --

  protected visitArelNodesCte(node: Nodes.Cte, collector: SQLString): SQLString {
    collector.append(`${this.quoteTableName(node.name)} AS `);
    if (node.materialized === true) {
      collector.append("MATERIALIZED ");
    } else if (node.materialized === false) {
      collector.append("NOT MATERIALIZED ");
    }
    // Rails' visit_Arel_Nodes_Cte emits only `AS ` and visits the relation,
    // relying on the Grouping / SelectManager / set-operation visitors to supply
    // their own parentheses (arel/visitors/to_sql.rb:732). Trails also stores
    // bare SelectStatement / SqlLiteral relations, which don't self-wrap, so add
    // the parens explicitly only for those — otherwise an array CTE
    // (UnionAll) or a SqlLiteral CTE (Grouping) double-wraps to `AS ((…))`.
    if (cteRelationSelfWraps(node.relation)) {
      this.visit(node.relation, collector);
    } else {
      collector.append("(");
      this.visit(node.relation, collector);
      collector.append(")");
    }
    return collector;
  }

  private visitArelAttributesAttribute(node: Nodes.Attribute, collector: SQLString): SQLString {
    const tbl = node.relation.tableAlias || node.relation.name;
    // Rails: `quote_column_name(Arel.star)` returns the `SqlLiteral("*")`
    // unchanged. We model `Arel.star` as the string sentinel `"*"` on the
    // Attribute, so short-circuit identifier quoting here.
    const col = node.name === "*" ? "*" : this.quoteColumnName(node.name);
    collector.append(`${this.quoteTableName(tbl)}.${col}`);
    return collector;
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
   * Mirrors Rails: `visit_ActiveModel_Attribute` (to_sql.rb:756).
   * Rails calls `collector.add_bind(o, &bind_block)` — always emits an
   * unbound placeholder; the dispatch never delegates to the BindParam visitor.
   */
  protected visitActiveModelAttribute(o: unknown, collector: SQLString): SQLString {
    collector.addBind(o, this.bindBlock());
    return collector;
  }

  protected visitArelNodesBindParam(node: Nodes.BindParam, collector: SQLString): SQLString {
    // Push the node itself (not its value) so `compile` can render `?` while
    // `compileWithBinds` unwraps to `node.value` for the bind array. Mirrors
    // Rails' `visit_Arel_Nodes_BindParam`: `collector.add_bind(o.value, &bind_block)`
    // emits the placeholder and records the value separately.
    collector.addBind(node, this.bindBlock());
    return collector;
  }

  private visitArelNodesSqlLiteral(node: Nodes.SqlLiteral, collector: SQLString): SQLString {
    if (!(node as { retryableFlag?: boolean }).retryableFlag) {
      collector.retryable = false;
    }
    collector.append(node.value);
    return collector;
  }

  // -- BoundSqlLiteral --

  private visitArelNodesBoundSqlLiteral(
    node: Nodes.BoundSqlLiteral,
    collector: SQLString,
  ): SQLString {
    collector.retryable = false;
    const sql = node.sqlWithPlaceholders;

    if (node.positionalBinds.length > 0) {
      const segments = sql.split("?");
      const expected = segments.length - 1;
      if (node.positionalBinds.length !== expected) {
        throw new BindError(
          `wrong number of bind variables (${node.positionalBinds.length} for ${expected})`,
          sql,
        );
      }
      for (let i = 0; i < segments.length; i++) {
        if (segments[i]) collector.append(segments[i]);
        if (i < node.positionalBinds.length)
          this.visitBindValue(node.positionalBinds[i], collector);
      }
    } else if (Object.keys(node.namedBinds).length > 0) {
      const re = /:(?<!::)([a-zA-Z]\w*)|([^:]+|.)/gy;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        if (m[2] !== undefined) {
          collector.append(m[2]);
        } else {
          const name = m[1];
          if (!(name in node.namedBinds)) {
            throw new BindError(`missing value for :${name}`, sql);
          }
          this.visitBindValue(node.namedBinds[name], collector);
        }
      }
    } else {
      collector.append(sql);
    }

    return collector;
  }

  // ---------------------------------------------------------------------
  // Non-Arel visit dispatchers (Rails dispatches on Ruby native classes
  // for stray values that drift into the visitor).
  // ---------------------------------------------------------------------

  /** Mirrors Rails: `visit_Integer`. */
  protected visitInteger(o: number, collector: SQLString): SQLString {
    collector.append(String(o));
    return collector;
  }

  /** Mirrors `to_sql.rb#unsupported`. */
  protected unsupported(o: Node): never {
    throw new UnsupportedVisitError(`Unknown node type: ${o.constructor.name}`);
  }

  // -- InfixOperation --

  private visitArelNodesInfixOperation(
    node: Nodes.InfixOperation,
    collector: SQLString,
  ): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(` ${node.operator} `);
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  // -- UnaryOperation --

  private visitArelNodesUnaryOperation(
    node: Nodes.UnaryOperation,
    collector: SQLString,
  ): SQLString {
    // Mirrors Rails: `collector << " #{o.operator} "` (visitors/to_sql.rb).
    // The operator is emitted verbatim with a space on each side; callers
    // are responsible for the operator's own whitespace.
    collector.append(` ${node.operator} `);
    this.visit(node.operand, collector);
    return collector;
  }

  /**
   * Mirrors Rails: `visit_Array` (to_sql.rb:858). Rails delegates to
   * `inject_join` which calls `visit` on each element; in Ruby `visit` of
   * a primitive routes through `visit_Integer`/`visit_String`/etc. Trails
   * doesn't dispatch on JS primitives — `visitNodeOrValue` is the
   * equivalent path that handles both Node and non-Node entries.
   */
  protected visitArray(items: ReadonlyArray<Nodes.NodeOrValue>, collector: SQLString): SQLString {
    items.forEach((item, i) => {
      if (i > 0) collector.append(", ");
      this.visitNodeOrValue(item, collector);
    });
    return collector;
  }

  protected visitArelNodesFragments(node: Nodes.Fragments, collector: SQLString): SQLString {
    return this.injectJoin(node.values, " ", collector);
  }

  protected quote(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") {
      // Non-finite numbers (Float::INFINITY / NaN) must be string-quoted so
      // PostgreSQL parses them as float literals rather than identifiers.
      // SQLite/MySQL reject the values either way; delegate to connection.quote
      // for adapter-specific handling.
      if (!Number.isFinite(value)) return this.connection.quote(value);
      return String(value);
    }
    if (typeof value === "boolean")
      return value ? this.connection.quotedTrue() : this.connection.quotedFalse();
    if (typeof value === "bigint") return value.toString();
    // Normalise all typed-array views (ArrayBuffer, SharedArrayBuffer) to
    // Uint8Array before handing off so adapters' quotedBinary can rely on a
    // consistent shape. Uint8Array itself passes through unchanged.
    if (ArrayBuffer.isView(value)) {
      const bytes =
        value instanceof Uint8Array
          ? value
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return this.connection.quotedBinary(bytes);
    }
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
          // circular references, BigInt, etc. — fall through
        }
      }
    }
    // Unknown object types (custom classes, Temporal types without toISOString,
    // etc.) — delegate to the connection, which knows the adapter-specific rules.
    return this.connection.quote(value);
  }

  /** @internal */
  protected quoteTableName(name: string | Nodes.SqlLiteral): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return this.connection.quoteTableName(String(name));
  }

  /** @internal */
  protected quoteColumnName(name: string | Nodes.SqlLiteral): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return this.connection.quoteColumnName(String(name));
  }

  /**
   * Mirrors `to_sql.rb#sanitize_as_sql_comment` (to_sql.rb:882): SqlLiteral
   * passes through; everything else delegates to the connection so the
   * adapter's comment-escaping rules apply. Both `visitArelNodesComment` and
   * `visitArelNodesOptimizerHints` route through here (real adapters
   * neutralize-and-space delimiters; the default quoters strip them).
   */
  protected sanitizeAsSqlComment(value: string | Nodes.SqlLiteral): string {
    if (value instanceof Nodes.SqlLiteral) return value.value;
    return this.connection.sanitizeAsSqlComment(String(value));
  }

  /**
   * Mirrors `to_sql.rb#collect_optimizer_hints`. Rails delegates to
   * `maybe_visit o.optimizer_hints`; Trails' SelectCore now stores an
   * `OptimizerHints` node (or null), and `emitOptimizerHints` does the
   * `maybe_visit` no-op-when-nil dispatch.
   */
  protected collectOptimizerHints(o: Nodes.SelectCore, collector: SQLString): SQLString {
    this.emitOptimizerHints(o, collector);
    return collector;
  }

  /**
   * Mirrors `to_sql.rb#maybe_visit`: if `thing` is non-null, emits a leading
   * space and visits it; otherwise no-op. Used to thread optional clauses
   * (limit/offset/lock/comment) through select-statement visitors.
   */
  protected maybeVisit(thing: Node | null | undefined, collector: SQLString): SQLString {
    if (!thing) return collector;
    collector.append(" ");
    this.visit(thing, collector);
    return collector;
  }

  /**
   * Mirrors `to_sql.rb#inject_join`: visits `list[0]`, then for each
   * subsequent node emits `joinStr` and visits.
   */
  protected injectJoin(list: Node[], joinStr: string, collector: SQLString): SQLString {
    list.forEach((n, i) => {
      if (i > 0) collector.append(joinStr);
      this.visit(n, collector);
    });
    return collector;
  }

  /** Mirrors `to_sql.rb#unboundable?` as a truthy check. */
  protected isUnboundable(value: unknown): boolean {
    return this.unboundableSign(value) !== 0;
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

  /** Mirrors `to_sql.rb#has_group_by_and_having?`. */
  protected hasGroupByAndHaving(o: { groups: unknown[]; havings: unknown[] }): boolean {
    return o.groups.length > 0 && o.havings.length > 0;
  }

  protected prepareUpdateStatement(o: Nodes.UpdateStatement): Nodes.UpdateStatement {
    if (o.key && (this.hasLimitOrOffsetOrOrders(o) || this.hasJoinSources(o))) {
      const stmt = o.clone();
      stmt.limit = null;
      stmt.offset = null;
      stmt.orders = [];
      const key = this.subselectKey(o.key);
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

  /** Mirrors `to_sql.rb#infix_value`. Visits left, emits literal, visits right. */
  protected infixValue(
    o: { left: Node; right: Node },
    value: string,
    collector: SQLString,
  ): SQLString {
    this.visit(o.left, collector);
    collector.append(value);
    this.visit(o.right, collector);
    return collector;
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
    collector: SQLString,
  ): SQLString {
    const sameClass = (child: Node): child is typeof o =>
      Object.getPrototypeOf(child) === Object.getPrototypeOf(o);

    if (!suppressParens) collector.append("( ");
    if (sameClass(o.left)) {
      this.infixValueWithParen(o.left, value, true, collector);
    } else {
      this.groupingParentheses(o.left, false, collector);
    }
    collector.append(value);
    if (sameClass(o.right)) {
      this.infixValueWithParen(o.right, value, true, collector);
    } else {
      this.groupingParentheses(o.right, false, collector);
    }
    if (!suppressParens) collector.append(" )");
    return collector;
  }

  /**
   * Mirrors `to_sql.rb#grouping_parentheses`. Wraps a SelectStatement in
   * parens when it would otherwise emit ambiguously; otherwise plain visit.
   */
  protected groupingParentheses(
    o: Node,
    alwaysWrapSelects = true,
    collector: SQLString,
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

  /** Mirrors `to_sql.rb#require_parentheses?`. */
  protected isRequireParentheses(o: Nodes.SelectStatement): boolean {
    return o.orders.length > 0 || Boolean(o.limit) || Boolean(o.offset);
  }

  /**
   * Mirrors `to_sql.rb#aggregate`. Renders `NAME(DISTINCT? expr, ...) AS alias?`.
   */
  protected aggregate(name: string, o: Nodes.Function, collector: SQLString): SQLString {
    // Trails-specific: aggregate calls aren't safe to retry against a
    // detached connection. Rails has no equivalent (the retryable flag is
    // a Trails collector concern), so this is the one piece of behavior we
    // carry alongside the Rails-shaped body.
    collector.retryable = false;
    collector.append(`${name}(`);
    if (o.distinct) collector.append("DISTINCT ");
    this.injectJoin(o.expressions, ", ", collector);
    collector.append(")");
    if (o.alias) {
      collector.append(" AS ");
      this.visit(o.alias, collector);
    }
    return collector;
  }

  /**
   * Mirrors `to_sql.rb#is_distinct_from`. CASE-form fallback for adapters
   * that lack native `IS [NOT] DISTINCT FROM`.
   */
  protected isDistinctFrom(o: { left: Node; right: Node }, collector: SQLString): SQLString {
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

  /** Mirrors `to_sql.rb#collect_ctes`. Visits each CTE child joined by ", ". */
  protected collectCtes(
    children: ReadonlyArray<{ toCte(): Node } | Node>,
    collector: SQLString,
  ): SQLString {
    children.forEach((child, i) => {
      if (i > 0) collector.append(", ");
      const node =
        typeof (child as { toCte?: () => Node }).toCte === "function"
          ? (child as { toCte: () => Node }).toCte()
          : (child as Node);
      this.visit(node, collector);
    });
    return collector;
  }

  compileWithCollector(node: Node, externalCollector?: unknown): SQLString {
    return this.visit(node, (externalCollector ?? new SQLString()) as SQLString);
  }

  /**
   * Compile an AST node and extract bind values separately.
   * Returns [sql_with_placeholders, bind_values, retryable].
   *
   * Mirrors: Rails' compilation with Arel::Collectors::Composite
   */
  compileWithBinds(node: Node): [string, unknown[], boolean] {
    const sqlCollector = new SQLString();
    const bindCollector = new Bind();
    const composite = new Composite(sqlCollector, bindCollector);
    this.visit(node, composite as unknown as SQLString);
    const binds = bindCollector.value.map((b) => (b instanceof Nodes.BindParam ? b.value : b));
    return [sqlCollector.value, binds, sqlCollector.retryable];
  }

  protected emitOptimizerHints(node: Nodes.SelectCore, collector: SQLString): void {
    // Mirrors Rails: `@ctx.optimizer_hints` is now an `OptimizerHints`
    // node (or null); the visitor delegates to the dedicated visitor
    // which sanitizes + wraps in `/*+ ... */`.
    if (node.optimizerHints === null) return;
    this.visit(node.optimizerHints, collector);
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
      stmt.wheres = [new Nodes.In(columns, [this.buildSubselect(key, o)])];
      if (this.hasJoinSources(o)) {
        stmt.relation = (o.relation as Nodes.JoinSource).left;
      }
      return stmt;
    }
    return o;
  }

  private subselectKey(key: Node): Node {
    if (key instanceof Nodes.Equality) {
      return key.left as Node;
    }
    return key;
  }

  private visitCrossJoin(node: Nodes.CrossJoin, collector: SQLString): SQLString {
    collector.append("CROSS JOIN ");
    this.visit(node.left, collector);
    return collector;
  }

  protected visitBinaryOp(node: Nodes.Binary, op: string, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(` ${op} `);
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  protected visitTop(node: Nodes.Top, collector: SQLString): SQLString {
    collector.append("TOP ");
    if (node.expr instanceof Node) {
      this.visit(node.expr, collector);
    } else {
      collector.append(String(node.expr));
    }
    return collector;
  }

  // -- BindParam --

  // Overridable hook for date bind insertion so PostgreSQLWithBinds can
  // emit $N placeholders instead of ?.
  protected addDateBind(value: unknown, collector: SQLString): void {
    collector.addBind(value, this.bindBlock());
  }

  private visitBindValue(value: unknown, collector: SQLString): void {
    if (value instanceof Node) {
      this.visit(value, collector);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (i > 0) collector.append(", ");
        this.visitBindValue(v, collector);
      });
    } else {
      collector.append(this.quote(value));
    }
  }

  // -- Concat --

  protected visitArelNodesConcat(node: Nodes.Concat, collector: SQLString): SQLString {
    this.visitNodeOrValue(node.left, collector);
    collector.append(" || ");
    this.visitNodeOrValue(node.right, collector);
    return collector;
  }

  // -- Advanced grouping --

  protected visitArelNodesCube(node: Nodes.Cube, collector: SQLString): SQLString {
    collector.append("CUBE(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) collector.append(", ");
      this.visit(exprs[i], collector);
    }
    collector.append(")");
    return collector;
  }

  protected visitArelNodesRollUp(node: Nodes.RollUp, collector: SQLString): SQLString {
    collector.append("ROLLUP(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) collector.append(", ");
      this.visit(exprs[i], collector);
    }
    collector.append(")");
    return collector;
  }

  protected visitArelNodesGroupingElement(
    node: Nodes.GroupingElement,
    collector: SQLString,
  ): SQLString {
    collector.append("(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) collector.append(", ");
      this.visit(exprs[i], collector);
    }
    collector.append(")");
    return collector;
  }

  protected visitArelNodesGroupingSet(node: Nodes.GroupingSet, collector: SQLString): SQLString {
    collector.append("GROUPING SETS(");
    const exprs = node.expressions;
    for (let i = 0; i < exprs.length; i++) {
      if (i > 0) collector.append(", ");
      this.visit(exprs[i], collector);
    }
    collector.append(")");
    return collector;
  }

  protected visitArelNodesLateral(node: Nodes.Lateral, collector: SQLString): SQLString {
    // Mirrors Rails: `collector << "LATERAL "; grouping_parentheses(o.expr, ...)`.
    collector.append("LATERAL ");
    return this.groupingParentheses(node.subquery, true, collector);
  }

  protected appendEscape(escape: Node | null, collector: SQLString): void {
    if (escape == null) return;
    collector.append(" ESCAPE ");
    this.visit(escape, collector);
  }

  private visitQuoted(node: Nodes.Quoted, collector: SQLString): SQLString {
    // Mirrors Rails to_sql.rb `visit_Arel_Nodes_Quoted`: collector << quote(o.value_for_database).
    // Quoted nodes (null, hard-coded literals) are always inlined; only Casted uses add_bind.
    const value = resolveValueForDatabase(node.valueForDatabase());
    collector.append(this.quote(value));
    return collector;
  }

  // -- Helpers --

  protected visitNodeOrValue(v: Nodes.NodeOrValue, collector: SQLString): SQLString {
    // Duck-type check for SelectManager (not a Node, but has ast/toSql).
    // Delegates to visitArelSelectManager — the Rails-named visitor for
    // a bare SelectManager — so the wrapping behavior lives in one place.
    if (v !== null && v !== undefined && typeof v === "object" && "ast" in v && "toSql" in v) {
      return this.visitArelSelectManager(v as unknown as { ast: Node }, collector);
    }
    if (Array.isArray(v)) {
      // Mirrors Rails: `visit_Array` (to_sql.rb) — primitives and Nodes in
      // arrays both flow through here, joined by ", ".
      return this.visitArray(v, collector);
    }
    if (v instanceof Node) {
      // Duck-type check to avoid circular dependency (SelectManager → ToSql → SelectManager)
      if ("ast" in v && "toSql" in v) {
        return this.visitArelSelectManager(v as unknown as { ast: Node }, collector);
      }
      return this.visit(v, collector);
    }
    if (v === null || v === undefined) {
      collector.append("NULL");
    } else if (typeof v === "string") {
      collector.append(this.quote(v));
    } else if (typeof v === "number") {
      // Non-finite numbers must route through quote() so the adapter can emit
      // a string literal ('Infinity' / 'NaN') rather than a bareword identifier.
      collector.append(Number.isFinite(v) ? String(v) : this.quote(v));
    } else if (typeof v === "boolean") {
      collector.append(this.quote(v));
    } else if (typeof v === "bigint") {
      collector.append(v.toString());
    } else if (
      typeof v === "object" &&
      v !== null &&
      "toISOString" in v &&
      typeof (v as { toISOString: unknown }).toISOString === "function"
    ) {
      // Mirrors Rails quote behavior: date-like values are formatted and inlined.
      // Only BindParam/ActiveModel::Attribute go through addBind.
      collector.append(this.quotedDate(v as { toISOString(): string }));
    } else {
      // Unknown object types (e.g. Temporal.Instant) — defer to `quote()`
      // so the value is properly escaped/quoted rather than concatenated
      // raw, matching the visitQuoted path.
      collector.append(this.quote(v));
    }
    return collector;
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
}
