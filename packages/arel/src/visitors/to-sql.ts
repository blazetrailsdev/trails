import { Node } from "../nodes/node.js";
import { SQLString } from "../collectors/sql-string.js";
import * as Nodes from "../nodes/index.js";
import { Table } from "../table.js";
import { Visitor, type NodeCtor } from "./visitor.js";
import { BindError } from "../errors.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";

/**
 * Mirrors Arel::Visitors::UnsupportedVisitError (to_sql.rb:5-9) — a
 * `StandardError`, not an `ArelError`, declared in this file exactly as Rails
 * declares it, and built from the offending object.
 */
export class UnsupportedVisitError extends Error {
  constructor(object: unknown) {
    super(`Unsupported argument type: ${constructorName(object)}. Construct an Arel node instead.`);
    this.name = "UnsupportedVisitError";
  }
}

/**
 * Mirrors Ruby's core `NotImplementedError`, which `to_sql.rb` raises from the
 * three strategy hooks below (:195, :521, :525). Ruby gets the class from the
 * language, so `arel/errors.rb` declares nothing for it and neither does
 * `errors.ts`; it stays file-local here, exactly where Rails raises it.
 */
class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export type { ArelConnection } from "./connection.js";
import type { ArelConnection } from "./connection.js";

// -- Raw-value dispatch helpers --
//
// Rails dispatches a raw value on its Ruby class (visitor.rb:29-30). These map
// each JS analogue onto the class Rails would pick; the mapping itself lives
// in `rubyClassName` (ruby-class.ts), which `Visitor#visit` consults.

// The analogue of Rails' `ActiveModel::Attribute` case in the ValuesList /
// Assignment visitors (to_sql.rb:110, 632). Rails dispatches on the class, and
// so does trails — the same predicate `Nodes.build_quoted` uses (casted.ts).
// Arel's own Casted/Quoted expose `valueForDatabase` but are Nodes, not
// ActiveModel::Attributes, so they keep falling to `quote()` in ValuesList as
// rb:110's narrow `when` requires.
function isActiveModelAttribute(v: unknown): boolean {
  return v instanceof ModelAttribute;
}

// Rails' UnsupportedVisitError message interpolates `object.class.name`
// (to_sql.rb:5-8). `null`/`undefined` have no constructor; Ruby's analogue for
// both is NilClass.
//
// Folding `undefined` in here is deliberate, and survives `undefined` being
// dropped from `NodeOrValue` (binary.ts). The two are complementary rather than
// contradictory: the union declines to *declare* `undefined` a legal slot
// occupant, while this normalizes one that arrives anyway. It can still arrive,
// because `update-manager.ts` launders values into a slot via one boundary
// `as NodeOrValue` cast from `unknown` — the `math.ts` / `attribute.ts` casts
// were removed once their operands were narrowed to `NodeOrValue`, but
// `UpdateManager#set` sits on the ActiveRecord edge and cannot be (see the note
// at its call site). The primary normalization is
// `rubyClassName` (ruby-class.ts:32), which maps `undefined` to `"NilClass"` at
// the dispatch boundary so it routes to `visitNilClass`; this helper just keeps
// the downstream message consistent with that.
// Removing it would be strictly less faithful — an `undefined` would read its
// `.constructor` off nothing and surface as a "Cannot visit" TypeError instead
// of Rails' NilClass UnsupportedVisitError.
function constructorName(v: unknown): string {
  if (v === null || v === undefined) return "NilClass";
  return (v as { constructor?: { name?: string } }).constructor?.name ?? typeof v;
}

/** Default placeholder block; mirrors Rails' module-level `BIND_BLOCK`. */
const DEFAULT_BIND_BLOCK: (index: number) => string = () => "?";

/**
 * ToSql visitor — walks the AST and produces SQL strings.
 *
 * Mirrors: Arel::Visitors::ToSql
 */
export class ToSql extends Visitor {
  protected readonly connection: ArelConnection;

  constructor(connection: ArelConnection) {
    super();
    this.connection = connection;
  }

  compile(node: Node | ReadonlyArray<Nodes.NodeOrValue>): string;
  compile<T>(node: Node | ReadonlyArray<Nodes.NodeOrValue>, collector: { value: T }): T;
  compile(
    node: Node | ReadonlyArray<Nodes.NodeOrValue>,
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

    // Mirrors Rails: prefer `o.values` when both are present
    // (insert_statement.rb / to_sql.rb pattern). Routes through
    // `visit` so a SelectManager-shaped duck-type (the form
    // `InsertManager#select` stores) lands in `visitArelSelectManager`.
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
    this.visit(o.expressions[0], collector);
    collector.append(")");
    if (o.alias) {
      collector.append(" AS ");
      this.visit(o.alias, collector);
    }
    return collector;
  }

  protected visitArelNodesCasted(o: Nodes.Casted, collector: SQLString): SQLString {
    // Mirrors Rails to_sql.rb:87-88 `visit_Arel_Nodes_Casted`:
    // collector << quote(o.value_for_database).to_s — the quoted literal is
    // appended directly (visit_Arel_Nodes_Quoted is an alias). Only BindParam
    // uses add_bind. Inlines exactly like visitQuoted.
    //
    // Ruby's `value_for_database` is one zero-arg method however the receiver
    // spells it; in TS a QueryAttribute answers with a method and an
    // ActiveModel::Attribute with a getter, so the call half is applied here.
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

  /**
   * Rails: `alias :visit_Arel_Nodes_Quoted :visit_Arel_Nodes_Casted`
   * (to_sql.rb:90). Quoted and Casted both inline their quoted literal
   * (`collector << quote(o.value_for_database)`); only BindParam uses
   * add_bind. Delegates to the shared Casted visitor.
   */
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
        // Mirrors Rails' `case` exactly (to_sql.rb:106-114): only SqlLiteral,
        // BindParam and ActiveModel::Attribute are visited; every other row
        // entry is a raw value and is quoted directly, never dispatched
        // through `visit`.
        //
        // The list is deliberately narrower than Assignment's (which visits any
        // Node, to_sql.rb:631). Rails' rows carry raw values — see
        // `create_values_list([%w{ a b }, ...])`, insert_manager_test.rb:10 —
        // so a Casted/Quoted row falls to `quote()`, which has no node branch
        // (to_sql.rb:867-870 → quoting.rb:86 `else raise TypeError`) and
        // raises. Keeping the list narrow preserves that.
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

  /**
   * Mirrors Rails: `visit_Arel_Nodes_SelectOptions` (to_sql.rb:143). Emits
   * limit/offset/lock via `maybeVisit`. As in Rails it is called with the
   * `SelectStatement` itself, which carries those three fields.
   */
  protected visitArelNodesSelectOptions(o: Nodes.SelectStatement, collector: SQLString): SQLString {
    this.maybeVisit(o.limit, collector);
    this.maybeVisit(o.offset, collector);
    this.maybeVisit(o.lock, collector);
    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_SelectCore (to_sql.rb:149). Where Rails
  // uses collect_nodes_for to emit `spacer` + injectJoin in one call, we do
  // the same; wheres/havings collapse multiple predicates with " AND " via
  // collect_nodes_for's connector arg.
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

  // Mirrors Rails: visit_Arel_Nodes_OptimizerHints (to_sql.rb:170). The
  // OptimizerHints node carries a list of hint strings (Rails' `o.expr` is
  // an array); each hint is sanitized and the joined result wrapped in
  // /*+ ... */. SelectCore stores its optimizer hints as an OptimizerHints
  // node, which `collect_optimizer_hints` threads here through `maybeVisit`.
  protected visitArelNodesOptimizerHints(o: Nodes.OptimizerHints, collector: SQLString): SQLString {
    // Each hint routes through `sanitizeAsSqlComment` — the same
    // connection-delegating helper `visitArelNodesComment` uses (to_sql.rb:171).
    // Rails maps every hint through the sanitizer and ALWAYS wraps the joined
    // result in `/*+ ... */` (to_sql.rb:170-172) — there is no post-sanitization
    // empty filter, so hints that sanitize to empty still emit the comment. The
    // node only exists when `optimizer_hints(*hints)` got a non-empty splat
    // (select_manager.rb:147-149), which is the only emptiness Rails guards.
    const hints = o.expr.map((v) => this.sanitizeAsSqlComment(v)).join(" ");
    collector.append(`/*+ ${hints} */`);
    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_Comment (to_sql.rb:175) — emits the
  // joined `/* ... */` blocks without a leading space. Callers add the
  // leading separator (typically via `maybeVisit`).
  protected visitArelNodesComment(o: Nodes.Comment, collector: SQLString): SQLString {
    const blocks = o.values.map((v) => `/* ${this.sanitizeAsSqlComment(v)} */`);
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
      // Rails' `when String, Symbol` arm quotes a bare window name as an
      // identifier (to_sql.rb:306-307). A SqlLiteral right, by contrast,
      // renders bare — `over("foo")` is `OVER "foo"` but
      // `over(Arel.sql("foo"))` is `OVER foo`.
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
    // Mirrors Rails to_sql.rb:346-351 exactly: branch on the *casted* list, not
    // the raw values, and emit `quote(nil)` (→ `NULL`) when it is empty. This
    // matters once every value is filtered out — e.g. an all-out-of-range
    // multi-value array (`id IN [2^63, 2^63+1]`) whose `castedValues` collapse
    // to `[]` — so we render `IN (NULL)` rather than the invalid `IN ()` that
    // `addBinds([])` would produce.
    const values = o.castedValues;
    if (values.length === 0) {
      collector.append(this.quote(null));
    } else {
      collector.addBinds(values, o.procForBinds, this.bindBlock());
    }
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
    this.injectJoin(o.expressions, collector, ", ");
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
    // Mirrors Rails `visit_Arel_Nodes_TableAlias`: `quote_table_name(o.name)`
    // renders a `SqlLiteral` name bare and quotes a plain string. The bare-alias
    // cases come from the *value*, not the relation shape: `SelectManager#as`
    // and the set-op `from()` path both name the alias with a `SqlLiteral`
    // (`quoteTableName` returns its `value` unchanged), while `Table#alias("foo")`
    // keeps `"foo"`.
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

  // Per-class dispatch wrappers for shared helpers — mirrors Rails' per-method
  // form (each operator/aggregate has its own visit method).
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
    // Mirrors Rails visit_Arel_Table (to_sql.rb): if name is a Node, visit
    // it (subquery-as-table); else quote as identifier.
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
        // Empty IN is always false — Rails uses 1=0
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
        // Empty NOT IN is always true — Rails uses 1=1
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
    // Mirrors Rails (to_sql.rb:630-641): a Node/Attribute right is visited; a
    // raw value is quoted directly rather than dispatched through `visit`.
    // `instanceof Node` covers rb:631's `Arel::Attributes::Attribute` arm too —
    // Arel's Attribute extends Node here (attributes/attribute.ts).
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
      this.visitArelNodesElse(o.default, collector);
    }
    collector.append(" END");
    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_When (to_sql.rb).
  protected visitArelNodesWhen(o: Nodes.When, collector: SQLString): SQLString {
    collector.append("WHEN ");
    this.visit(o.left, collector);
    collector.append(" THEN ");
    this.visit(o.right, collector);
    return collector;
  }

  // Mirrors Rails: visit_Arel_Nodes_Else (to_sql.rb).
  protected visitArelNodesElse(o: Nodes.Else, collector: SQLString): SQLString {
    collector.append("ELSE ");
    this.visit(o.expr as Nodes.NodeOrValue, collector);
    return collector;
  }

  protected visitArelNodesUnqualifiedColumn(
    o: Nodes.UnqualifiedColumn,
    collector: SQLString,
  ): SQLString {
    // Rails strips the table qualifier so `SET col = col + 1` works in UPDATE
    // statements: `collector << quote_column_name(o.name)` (to_sql.rb:728-730),
    // where `UnqualifiedColumn#name` delegates to `@expr.name`.
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
    // No parens here: `Cte#relation` holds a SelectManager / Grouping /
    // set-operation node, each of which supplies its own (to_sql.rb:732-744).
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
  protected visitActiveModelAttribute(o: ModelAttribute, collector: SQLString): SQLString {
    collector.addBind(o, this.bindBlock());
    return collector;
  }

  /** Mirrors Rails: `visit_Arel_Nodes_BindParam` (to_sql.rb:760-762). */
  protected visitArelNodesBindParam(o: Nodes.BindParam, collector: SQLString): SQLString {
    collector.addBind(o.value, this.bindBlock());
    return collector;
  }

  private visitArelNodesSqlLiteral(o: Nodes.SqlLiteral, collector: SQLString): SQLString {
    if (!(o as { retryable?: boolean }).retryable) {
      collector.retryable = false;
    }
    // Mirrors to_sql.rb:764-767: plain SqlLiteral is non-preparable.
    // where("col = ?", val) now creates BoundSqlLiteral (which stays preparable).
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
      const expected = segments.length - 1;
      if (positionalBinds.length !== expected) {
        throw new BindError(
          `wrong number of bind variables (${positionalBinds.length} for ${expected})`,
          sql,
        );
      }
      for (let i = 0; i < segments.length; i++) {
        if (segments[i]) collector.append(segments[i]);
        if (i < positionalBinds.length) this.visitBindValue(positionalBinds[i], collector);
      }
    } else {
      const namedBinds = o.namedBinds ?? {};
      const re = /:(?<!::)([a-zA-Z]\w*)|([^:]+|.)/gy;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        if (m[2] !== undefined) {
          collector.append(m[2]);
        } else {
          const name = m[1];
          if (!(name in namedBinds)) {
            throw new BindError(`missing value for :${name}`, sql);
          }
          this.visitBindValue(namedBinds[name], collector);
        }
      }
    }

    return collector;
  }

  // ---------------------------------------------------------------------
  // Non-Arel visit dispatchers (Rails dispatches on Ruby native classes
  // for stray values that drift into the visitor).
  // ---------------------------------------------------------------------

  /**
   * Mirrors Rails: `visit_Integer` (to_sql.rb:824-826) — a bare
   * `collector << o.to_s`, with no `@connection` involvement. Accepts `bigint`
   * as well as `number`: Ruby's `Integer` is arbitrary-precision and Arel has
   * no separate bignum visitor, so both JS numeric types land here.
   *
   * Callers: `Visitor#visit` routes every `bigint` here, and every
   * *integral* `number` — the `Number.isInteger` split mirrors Ruby's
   * Integer-vs-Float, so a `1.5` reaches `visitFloat` and raises (rb:839) as
   * it does in Rails.
   */
  protected visitInteger(o: number | bigint, collector: SQLString): SQLString {
    collector.append(String(o));
    return collector;
  }

  /**
   * Mirrors `to_sql.rb#unsupported` (to_sql.rb:828-830) — `collector` is
   * required to match the Rails signature even though it's unused after the
   * raise.
   */
  protected unsupported(o: unknown, _collector: SQLString): never {
    throw new UnsupportedVisitError(o);
  }

  // Rails aliases every Ruby value class with no SQL rendering to
  // `unsupported` (to_sql.rb:832-845): visiting one raises
  // `UnsupportedVisitError`. TS has no method-alias, so each delegates to
  // the shared helper. Each keeps the Rails `(o, collector)` shape.
  //
  // `Visitor#visit` class-dispatches raw values onto these, so the unsupported
  // contract is enforced on the one path that can reach it — they are not
  // documentation-only. The exception is the Ruby-specific string classes
  // (Multibyte::Chars, StringInquirer), which have no JS analogue to dispatch
  // from and stand as the documented contract, directly testable.

  /** Rails: `alias :visit_ActiveSupport_Multibyte_Chars :unsupported`. */
  protected visitActiveSupportMultibyteChars(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_ActiveSupport_StringInquirer :unsupported`. */
  protected visitActiveSupportStringInquirer(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_BigDecimal :unsupported` (to_sql.rb:834). */
  protected visitBigDecimal(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_Class :unsupported`. */
  protected visitClass(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_Date :unsupported`. */
  protected visitDate(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_DateTime :unsupported`. */
  protected visitDateTime(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_FalseClass :unsupported`. */
  protected visitFalseClass(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_Float :unsupported`. */
  protected visitFloat(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_Hash :unsupported`. */
  protected visitHash(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_NilClass :unsupported`. */
  protected visitNilClass(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_String :unsupported`. */
  protected visitString(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_Symbol :unsupported` (to_sql.rb:843). */
  protected visitSymbol(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_Time :unsupported`. */
  protected visitTime(o: unknown, collector: SQLString): never {
    return this.unsupported(o, collector);
  }

  /** Rails: `alias :visit_TrueClass :unsupported`. */
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
    // Mirrors Rails: `collector << " #{o.operator} "` (visitors/to_sql.rb).
    // The operator is emitted verbatim with a space on each side; callers
    // are responsible for the operator's own whitespace.
    collector.append(` ${o.operator} `);
    this.visit(o.expr, collector);
    return collector;
  }

  /**
   * Mirrors Rails: `visit_Array` (to_sql.rb:858). Rails delegates to
   * `inject_join` which calls `visit` on each element; in Ruby `visit` of
   * a primitive routes through `visit_Integer`/`visit_String`/etc. Trails
   * doesn't dispatch on JS primitives — `rubyClassName` (ruby-class.ts) is the
   * equivalent path that handles both Node and non-Node entries.
   */
  protected visitArray(o: ReadonlyArray<Nodes.NodeOrValue>, collector: SQLString): SQLString {
    return this.injectJoin(o, collector, ", ");
  }

  /** Rails: `alias :visit_Set :visit_Array` (to_sql.rb:861). */
  protected visitSet(o: ReadonlySet<Nodes.NodeOrValue>, collector: SQLString): SQLString {
    return this.visitArray([...o], collector);
  }

  protected visitArelNodesFragments(o: Nodes.Fragments, collector: SQLString): SQLString {
    return this.injectJoin(o.values, collector, " ");
  }

  /**
   * Mirrors `to_sql.rb#quote` (to_sql.rb:867-870): SqlLiteral passes through,
   * everything else is handed to the connection. Rails' Arel does no value
   * formatting of its own — every date/array/binary decision lives in the
   * adapter's `quote`.
   */
  protected quote(value: unknown): string {
    if (value instanceof Nodes.SqlLiteral) return value.value;
    return this.connection.quote(value);
  }

  /**
   * Mirrors: to_sql.rb:872-875 `def quote_table_name(name)`.
   * @internal
   */
  protected quoteTableName(name: string | Node | null): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return this.connection.quoteTableName(name);
  }

  /**
   * Mirrors: to_sql.rb:877-880 `def quote_column_name(name)`.
   * @internal
   */
  protected quoteColumnName(name: string | Node | null): string {
    if (name instanceof Nodes.SqlLiteral) return name.value;
    return this.connection.quoteColumnName(name);
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

  /** Mirrors `to_sql.rb#collect_optimizer_hints` (to_sql.rb:887-889). */
  protected collectOptimizerHints(o: Nodes.SelectCore, collector: SQLString): SQLString {
    return this.maybeVisit(o.optimizerHints, collector);
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
      // A composite primary key arrives as an array of column nodes, rendered as
      // a row-value tuple `(pk1, pk2) IN (SELECT pk1, pk2 ...)`. Mirrors Rails
      // `prepare_update_statement`'s `Grouping.new(o.key)`.
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
      // A composite primary key arrives as an array of column nodes; the
      // visitor renders it as a row-value tuple `(pk1, pk2) IN (SELECT pk1, pk2
      // ...)`. Mirrors Rails `prepare_delete_statement`'s `Grouping.new(o.key)`.
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
    // A composite key projects each column (`SELECT pk1, pk2`); Rails relies on
    // `visit_Array` to comma-join, here we spread for the same SQL.
    core.projections = Array.isArray(key) ? [...key] : [key];
    core.groups = [...o.groups];
    core.havings = [...o.havings];
    stmt.limit = o.limit;
    stmt.offset = o.offset;
    stmt.orders = [...o.orders];
    return stmt;
  }

  /** Mirrors `to_sql.rb#infix_value`. Visits left, emits literal, visits right. */
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

  /**
   * Mirrors `to_sql.rb#infix_value_with_paren`. Recursively wraps adjacent
   * same-class infix nodes in `( ... )` per Rails' shape — Rails compares
   * `o.left.class == o.class` to keep nested same-operator chains flat.
   */
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

  /**
   * Mirrors `to_sql.rb#grouping_parentheses`. Wraps a SelectStatement in
   * parens when it would otherwise emit ambiguously; otherwise plain visit.
   */
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
    this.injectJoin(o.expressions, collector, ", ");
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

  /** Mirrors `to_sql.rb#collect_ctes`. Visits each CTE child joined by ", ". */
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

  /**
   * Seeds this visitor's dispatch cache. Called once, lazily, the first time
   * the cache is built — see the note in `Visitor.dispatchCache`.
   *
   * @internal
   */
  static registerDispatch(): void {
    const d = ToSql.dispatchCache();
    const reg = (ctor: NodeCtor, m: string) => {
      if (typeof (ToSql.prototype as unknown as Record<string, unknown>)[m] !== "function") {
        throw new Error(`ToSql dispatch: method '${m}' is not defined on the prototype`);
      }
      d.set(ctor, m);
    };
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
    // Not an Arel node, but Rails' dispatch is by class for every object it
    // visits (visitor.rb:29-30) and to_sql.rb:756 defines a handler for it,
    // so ValuesList/Assignment's visit branch resolves here rather than
    // raising UnsupportedVisitError.
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
    // Mirrors Rails' `new_bind` lambda inside `visit_Arel_Nodes_BoundSqlLiteral`
    // (to_sql.rb:774-795, Rails 8.0.2): non-Arel values are routed through
    // `collector.add_bind` / `add_binds`, NOT inline-quoted. On the Composite
    // path this yields parameterized SQL (`topics.id = ?`) plus a bind list — so
    // the prepared-statement template is reused across values — while the
    // inlining `SubstituteBinds` collector still renders the quoted literal for
    // `to_sql`.
    //
    // Each non-Arel scalar is wrapped in `@connection.cast_bound_value(value)`
    // before `add_bind`, mirroring Rails' `new_bind` lambda (to_sql.rb:775-778).
    if (value instanceof Node) {
      this.visit(value, collector);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        // Rails (to_sql.rb:779): `collector << @connection.quote(nil)` — empty
        // list → NULL.
        collector.append(this.quote(null));
      } else if (value.every((v) => !(v instanceof Node))) {
        collector.addBinds(
          value.map((v) => this.connection.castBoundValue(v)),
          null,
          this.bindBlock(),
        );
      } else {
        // Mixed Arel-node / scalar list (to_sql.rb:784-791): visit nodes,
        // single-`add_bind` every other element. A *nested* array here is bound
        // as one value (one `?`), NOT re-expanded — that's why this branch calls
        // `addBind` directly instead of recursing through `visitBindValue`.
        value.forEach((v, i) => {
          if (i > 0) collector.append(", ");
          if (v instanceof Node) {
            this.visit(v, collector);
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

  /**
   * Mirrors `to_sql.rb#unboundable?` (to_sql.rb:905-907), returning the sign
   * the Ruby predicate yields so the comparison visitors can `case` on it:
   *
   *     value.respond_to?(:unboundable?) && value.unboundable?
   *
   * It is purely duck-typed. Only two types answer it: `BindParam`
   * (bind_param.rb:39-40, itself delegating to its value) and
   * `QueryAttribute` (query_attribute.rb:46-51), where it means "serializes
   * out of the column's range" (`value <=> 0`) — NOT "is infinite".
   *
   * `infinite?` is a different predicate and is never consulted by the visitor;
   * it serves `Predications#open_ended?` (predications.rb:256-258). Note it is
   * defined on `Quoted` (casted.rb:43-45 — the `Quoted` class lives in
   * casted.rb), NOT on `Casted`, which defines no `infinite?` at all
   * (casted.rb:5-35). So a raw `Float::INFINITY`, or a `Quoted`/`Casted`
   * wrapping one, is bounded here and renders as a value rather than
   * collapsing.
   */
  protected unboundableSign(value: unknown): 1 | -1 | 0 {
    const v = value as { isUnboundable?: () => unknown } | null | undefined;
    if (typeof v?.isUnboundable !== "function") return 0;
    const r = v.isUnboundable();
    if (r === 1) return 1;
    if (r === -1) return -1;
    return 0;
  }

  /**
   * Mirrors Rails' `right.nil?` guard in the equality visitors: a nil right
   * emits `IS NULL` rather than `= ?`. Ruby needs no type switch here because
   * every wrapper defines `nil?` as `value.nil?` — Casted (casted.rb:15),
   * Quoted (casted.rb:41), BindParam (bind_param.rb:23-25) — so the single
   * polymorphic call covers explicit nils and binds that *serialize* to nil (a
   * null-mapped or unknown enum label, or a normalizer that blanks the value).
   */
  protected rightIsNull(right: unknown): boolean {
    // A raw nil that never got wrapped has no `isNil()` to dispatch to; Ruby's
    // `nil.nil?` is just true. A bare null therefore renders IS NULL and never
    // reaches the raw-value dispatch, even though visit_NilClass is aliased to
    // `unsupported` for the paths that do reach it.
    if (right === null || right === undefined) return true;
    // Everything else answers Rails' `right.nil?` (to_sql.rb:649) duck-typed.
    const maybe = right as { isNil?: () => boolean };
    return typeof maybe?.isNil === "function" && maybe.isNil();
  }
}
