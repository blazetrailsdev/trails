import { ArelEngine, Node, _engine } from "./nodes/node.js";
import { TreeManager } from "./tree-manager.js";
import { SelectStatement } from "./nodes/select-statement.js";
import { SelectCore } from "./nodes/select-core.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Distinct } from "./nodes/terminal.js";
import { Offset, Limit, Lock, On, DistinctOn, Group, OptimizerHints } from "./nodes/unary.js";
import { CrossJoin, Join } from "./nodes/binary.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { OuterJoin } from "./nodes/outer-join.js";
import { RightOuterJoin } from "./nodes/right-outer-join.js";
import { FullOuterJoin } from "./nodes/full-outer-join.js";
import { StringJoin } from "./nodes/string-join.js";
import { EmptyJoinError } from "./errors.js";
import { Union, UnionAll, Intersect, Except } from "./nodes/binary.js";
import { With, WithRecursive } from "./nodes/with.js";
import { TableAlias } from "./nodes/table-alias.js";
import { Exists } from "./nodes/function.js";
import { NamedWindow } from "./nodes/window.js";
import { Table } from "./table.js";
import { UpdateManager } from "./update-manager.js";
import { DeleteManager } from "./delete-manager.js";
import type { UpdateValues } from "./crud.js";
import { Comment } from "./nodes/comment.js";
import { Lateral } from "./nodes/unary.js";
import { And } from "./nodes/and.js";
import { JoinSource } from "./nodes/join-source.js";
import { InsertManager } from "./insert-manager.js";

/**
 * SelectManager — the chainable API for building SELECT queries.
 *
 * Mirrors: Arel::SelectManager
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SelectManager extends TreeManager {
  readonly ast: SelectStatement;

  constructor(table?: Table | null) {
    super();
    this.ast = new SelectStatement();
    if (table) {
      this.from(table);
    }
  }

  /**
   * Return the current LIMIT amount (the inner expression of the Limit node),
   * or null when no limit is set.
   *
   * Mirrors: Arel::SelectManager#limit
   */
  get limit(): Limit["expr"] | null {
    return (this.ast.limit as Limit | null)?.expr ?? null;
  }

  /**
   * Mirrors: Arel::SelectManager `alias limit= take` (select_manager.rb).
   */
  set limit(value: number | Node | null) {
    this.take(value);
  }

  /** @internal */
  get taken(): Limit["expr"] | null {
    return this.limit;
  }

  /**
   * Return the current WHERE conditions.
   *
   * Mirrors: Arel::SelectManager#constraints
   */
  get constraints(): Node[] {
    return [...this.core.wheres];
  }

  /**
   * Return the current OFFSET amount (the inner expression of the Offset node),
   * or null when no offset is set.
   *
   * Mirrors: Arel::SelectManager#offset
   */
  get offset(): Offset["expr"] | null {
    return (this.ast.offset as Offset | null)?.expr ?? null;
  }

  /**
   * Mirrors: Arel::SelectManager `alias offset= skip` (select_manager.rb).
   */
  set offset(value: number | Node | null) {
    this.skip(value);
  }

  /**
   * Set OFFSET.
   *
   * Mirrors: Arel::SelectManager#skip (select_manager.rb). Pass `null`
   * to clear; raw amounts flow through `new Offset(amount)` unwrapped.
   */
  skip(amount: number | Node | null): this {
    this.ast.offset = amount == null ? null : new Offset(amount);
    return this;
  }

  /**
   * Wrap as EXISTS(subquery).
   */
  exists(): Exists {
    return new Exists(this.ast);
  }

  /**
   * Alias the entire subquery with a name, returning a TableAlias.
   *
   * Mirrors: Arel::SelectManager#as
   */
  as(other: string): TableAlias {
    return this.createTableAlias(
      this.grouping(this.ast),
      new SqlLiteral(other, { retryable: true }),
    );
  }

  /**
   * Add a lock clause (FOR UPDATE by default).
   *
   * Mirrors: Arel::SelectManager#lock (select_manager.rb:52-63). The
   * `SqlLiteral` arm is Rails' empty `when` — a literal passes through
   * unwrapped — and it precedes the `String` arm because Ruby's SqlLiteral is
   * a String subclass. `true` is how ActiveRecord's `lock!` / `with_lock`
   * express the default lock.
   *
   * `Arel.sql` lives in `index.ts`, which re-exports this file; importing it
   * here would close a module cycle over index.ts's top-level `include()`
   * side effects, so its one-line body (`new SqlLiteral(...)`) is inlined.
   */
  lock(locking: string | Node | boolean = new SqlLiteral("FOR UPDATE")): this {
    if (locking === true) {
      locking = new SqlLiteral("FOR UPDATE");
    } else if (locking instanceof SqlLiteral) {
      // Rails' empty `when Arel::Nodes::SqlLiteral` arm (select_manager.rb:56).
    } else if (typeof locking === "string") {
      locking = new SqlLiteral(locking);
    }

    this.ast.lock = new Lock(locking as Node);
    return this;
  }

  /**
   * Return the current LOCK node.
   *
   * Mirrors: Arel::SelectManager#locked
   */
  get locked(): Node | null {
    return this.ast.lock;
  }

  /**
   * Set the ON condition on the last join.
   *
   * Mirrors: Arel::SelectManager#on
   */
  on(...exprs: (Node | string | null | undefined)[]): this {
    const joins = this.core.source.right;
    const lastJoin = joins[joins.length - 1] as unknown as { right: Node | null };
    lastJoin.right = new On(this.collapse(exprs));
    return this;
  }

  /**
   * Add GROUP BY.
   */
  group(...columns: (Node | string)[]): this {
    for (const column of columns) {
      if (typeof column === "string") {
        this.core.groups.push(new Group(new SqlLiteral(column)));
      } else {
        this.core.groups.push(new Group(column));
      }
    }
    return this;
  }

  /**
   * Set the FROM table.
   */
  from(table: Table | Node | string): this {
    const node = typeof table === "string" ? new SqlLiteral(table) : table;
    if (node instanceof Join) {
      this.core.source.right.push(node);
    } else {
      this.core.source.left = node;
    }
    return this;
  }

  /**
   * Return the FROM sources (left side of the source).
   *
   * Mirrors: Arel::SelectManager#froms
   */
  get froms(): Node[] {
    return this.ast.cores.map((c) => c.from).filter((x): x is Node => x !== null);
  }

  /**
   * INNER JOIN (or the join class passed as `klass`).
   *
   * Mirrors: Arel::SelectManager#join (select_manager.rb:102-113).
   */
  join(
    relation: Node | string | null | undefined,
    klass: new (left: Node, right: Node | null) => Join = InnerJoin,
  ): this {
    if (relation == null) return this;

    // Rails: `case relation when String, Nodes::SqlLiteral` (select_manager.rb:105-109).
    // SqlLiteral subclasses String in Ruby, so both arms share the emptiness
    // check and the StringJoin promotion.
    if (typeof relation === "string" || relation instanceof SqlLiteral) {
      const text = typeof relation === "string" ? relation : relation.value;
      if (text.length === 0) throw new EmptyJoinError();
      klass = StringJoin as unknown as new (left: Node, right: Node | null) => Join;
    }

    if (typeof relation === "string") relation = new SqlLiteral(relation);

    this.core.source.right.push(this.createJoin(relation, null, klass));
    return this;
  }

  /**
   * LEFT OUTER JOIN.
   *
   * Mirrors: Arel::SelectManager#outer_join (select_manager.rb:115-117).
   */
  outerJoin(relation: Node | string | null | undefined): this {
    return this.join(relation, OuterJoin);
  }

  /**
   * Add HAVING.
   */
  having(condition: Node): this {
    this.core.havings.push(condition);
    return this;
  }

  /**
   * Define a named window.
   */
  window(name: string): NamedWindow {
    const window = new NamedWindow(name);
    this.core.windows.push(window);
    return window;
  }

  /**
   * Add projections (columns to SELECT).
   */
  project(...projections: (Node | string)[]): this {
    for (const x of projections) {
      if (typeof x === "string") {
        this.core.projections.push(new SqlLiteral(x));
      } else {
        this.core.projections.push(x);
      }
    }
    return this;
  }

  /**
   * Return the current list of projections.
   *
   * Mirrors: Arel::SelectManager#projections
   */
  get projections(): Node[] {
    return [...this.core.projections];
  }

  /**
   * Replace all projections.
   *
   * Mirrors: Arel::SelectManager#projections=
   */
  set projections(value: Node[]) {
    this.core.projections.length = 0;
    this.core.projections.push(...value);
  }

  /**
   * Add optimizer hints to the query.
   *
   * Mirrors: Arel::SelectManager#optimizer_hints (select_manager.rb).
   * Rails wraps the splat in `Nodes::OptimizerHints.new(hints)` and only
   * assigns when at least one hint is provided.
   */
  optimizerHints(...hints: (string | SqlLiteral)[]): this {
    if (hints.length > 0) {
      this.core.optimizerHints = new OptimizerHints(hints);
    }
    return this;
  }

  /**
   * Make the SELECT DISTINCT (or clear DISTINCT when `value` is `false`
   * or `null`).
   *
   * Mirrors: Arel::SelectManager#distinct (select_manager.rb). Ruby's
   * `if value` treats only `false` and `nil` as falsy, so we test those
   * exactly — `0`, `""`, etc. enable DISTINCT in Rails.
   */
  distinct(value: unknown = true): this {
    this.core.setQuantifier = value === false || value == null ? null : new Distinct();
    return this;
  }

  /**
   * Set DISTINCT ON quantifier.
   *
   * Mirrors: Arel::SelectManager#distinct_on
   */
  distinctOn(value: Node | false | null): this {
    this.core.setQuantifier = value === false || value == null ? null : new DistinctOn(value);
    return this;
  }

  /**
   * Add ORDER BY clauses.
   */
  order(...exprs: (Node | string | symbol)[]): this {
    this.ast.orders.push(
      ...exprs.map((x) =>
        typeof x === "string"
          ? new SqlLiteral(x)
          : typeof x === "symbol"
            ? new SqlLiteral(x.description ?? x.toString())
            : x,
      ),
    );
    return this;
  }

  /**
   * Return the current ORDER BY expressions.
   *
   * Mirrors: Arel::SelectManager#orders
   */
  get orders(): Node[] {
    return [...this.ast.orders];
  }

  /**
   * Add a WHERE condition.
   */
  where(condition: Node | TreeManager): this {
    this.core.wheres.push(condition instanceof TreeManager ? condition.ast : condition);
    return this;
  }

  /**
   * Compile just the WHERE clause to SQL.
   *
   * Mirrors: Arel::SelectManager#where_sql
   */
  whereSql(engine: ArelEngine | null = _engine.current): SqlLiteral | null {
    if (this.core.wheres.length === 0) return null;
    return new SqlLiteral(`WHERE ${new And(this.core.wheres).toSql(engine)}`);
  }

  /**
   * UNION with another manager.
   */
  union(other: SelectManager | SelectStatement): Union {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new Union(this.ast, otherAst);
  }

  /**
   * INTERSECT with another manager.
   */
  intersect(other: SelectManager | SelectStatement): Intersect {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new Intersect(this.ast, otherAst);
  }

  /**
   * EXCEPT with another manager.
   */
  except(other: SelectManager | SelectStatement): Except {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new Except(this.ast, otherAst);
  }

  /** @internal */
  minus(other: SelectManager | SelectStatement): Except {
    return this.except(other);
  }

  /**
   * Wrap the AST in a LATERAL subquery.
   *
   * Mirrors: Arel::SelectManager#lateral
   */
  lateral(tableName?: string): Lateral {
    // Mirrors Rails: `lateral(table_name = nil)` builds the base — either the
    // raw AST or `as(table_name)` (a TableAlias wrapping a Grouping) — and
    // wraps it in a Lateral. The TableAlias lives inside the Lateral, not
    // outside (select_manager.rb).
    const base = tableName === undefined ? this.ast : this.as(tableName);
    return new Lateral(base);
  }

  /**
   * Set WITH (CTE).
   */
  with(...ctes: Node[]): this {
    this.ast.with = new With(ctes);
    return this;
  }

  /**
   * Set LIMIT.
   *
   * Mirrors: Arel::SelectManager#take (select_manager.rb). Pass `null`
   * to clear; raw amounts flow through `new Limit(amount)` unwrapped.
   */
  take(limit: number | Node | null): this {
    this.ast.limit = limit == null ? null : new Limit(limit);
    return this;
  }

  /**
   * Return the current join sources (right side of the source).
   *
   * Mirrors: Arel::SelectManager#join_sources
   */
  joinSources(): Join[] {
    return this.core.source.right as Join[];
  }

  /**
   * Return the source (FROM clause).
   *
   * Mirrors: Arel::SelectManager#source
   */
  get source(): JoinSource {
    return this.core.source;
  }

  /**
   * Add SQL comments to the query.
   *
   * Mirrors: Arel::SelectManager#comment
   */
  comment(...values: string[]): this {
    // Mirrors Rails: `@ctx.comment = Nodes::Comment.new(values)`
    // (select_manager.rb) — sets on the current SelectCore, not on the
    // statement. `Nodes::Comment.new(values)` takes a single array arg.
    this.core.comment = new Comment(values);
    return this;
  }

  // Mirrors Arel::SelectManager#collapse (select_manager.rb:256-268).
  protected collapse(exprs: unknown[]): Node {
    exprs = exprs
      .filter((expr) => expr !== null && expr !== undefined)
      .map((expr) => (typeof expr === "string" ? new SqlLiteral(expr) : (expr as Node)));
    if (exprs.length === 1) return exprs[0] as Node;
    return this.createAnd(exprs as Node[]);
  }

  private get core(): SelectCore {
    return this.ast.cores[this.ast.cores.length - 1];
  }

  /**
   * RIGHT OUTER JOIN.
   */
  rightOuterJoin(table: Node | string, onCondition?: Node): this {
    const tableNode = typeof table === "string" ? new SqlLiteral(table) : table;
    const onNode = onCondition ? new On(onCondition) : null;
    this.core.source.right.push(new RightOuterJoin(tableNode, onNode));
    return this;
  }

  /**
   * FULL OUTER JOIN.
   */
  fullOuterJoin(table: Node | string, onCondition?: Node): this {
    const tableNode = typeof table === "string" ? new SqlLiteral(table) : table;
    const onNode = onCondition ? new On(onCondition) : null;
    this.core.source.right.push(new FullOuterJoin(tableNode, onNode));
    return this;
  }

  /**
   * CROSS JOIN.
   */
  crossJoin(table: Node | string): this {
    const tableNode = typeof table === "string" ? new SqlLiteral(table) : table;
    this.core.source.right.push(new CrossJoin(tableNode, null));
    return this;
  }

  /**
   * Set WITH RECURSIVE.
   */
  withRecursive(...ctes: Node[]): this {
    this.ast.with = new WithRecursive(ctes);
    return this;
  }

  /**
   * UNION ALL with another manager.
   */
  unionAll(other: SelectManager | SelectStatement): UnionAll {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new UnionAll(this.ast, otherAst);
  }

  /**
   * Create an InsertManager from a SELECT.
   *
   * Mirrors: Arel::SelectManager#compile_insert
   */
  compileInsert(values: [Node, unknown][]): InsertManager {
    const im = new InsertManager();
    im.insert(values);
    return im;
  }

  /**
   * Create a new InsertManager.
   *
   * Mirrors: Arel::SelectManager#create_insert
   */
  createInsert(): InsertManager {
    return new InsertManager();
  }

  /**
   * Build an UpdateManager that applies this SELECT's constraints,
   * ordering, limit, offset, and grouping to an UPDATE.
   *
   * Mirrors: Arel::SelectManager#compile_update
   */
  compileUpdate(
    values: UpdateValues,
    key: Node | Node[] | null = null,
    havingClause: Node | null = null,
    groupValuesColumns: Node[] = [],
  ): UpdateManager {
    const um = new UpdateManager(this.source);
    um.set(values);
    um.take((this.ast.limit as Limit | null)?.expr ?? null);
    um.offset((this.ast.offset as Offset | null)?.expr ?? null);
    um.order(...this.orders);
    um.wheres = this.constraints;
    um.key = key;
    if (groupValuesColumns.length > 0) um.group(groupValuesColumns);
    if (havingClause !== null) um.having(havingClause);
    return um;
  }

  // -- FactoryMethods (via TreeManager) --
  // createTrue/createFalse/createTableAlias/createJoin/createStringJoin/
  // createAnd/createOn/grouping/lower/coalesce/cast are mixed in from
  // Arel::FactoryMethods (see ./factory-methods.ts and the include() call
  // in ./index.ts).

  /**
   * Build a DeleteManager that applies this SELECT's constraints,
   * ordering, limit, offset, and grouping to a DELETE.
   *
   * Mirrors: Arel::SelectManager#compile_delete
   */
  compileDelete(
    key: Node | Node[] | null = null,
    havingClause: Node | null = null,
    groupValuesColumns: Node[] = [],
  ): DeleteManager {
    const dm = new DeleteManager(this.source);
    dm.take((this.ast.limit as Limit | null)?.expr ?? null);
    dm.offset((this.ast.offset as Offset | null)?.expr ?? null);
    dm.order(...this.orders);
    dm.wheres = this.constraints;
    dm.key = key;
    if (groupValuesColumns.length > 0) dm.group(groupValuesColumns);
    if (havingClause !== null) dm.having(havingClause);
    return dm;
  }

  /**
   * Append a raw-SQL join fragment (a StringJoin) to the FROM sources.
   * Use this instead of reaching into `core.source.right` directly when
   * you need to add a pre-built JOIN string (e.g. `LEFT OUTER JOIN … ON …`).
   *
   * Mirrors: the join_sources mutation pattern in Rails' JoinDependency
   * (relation.joins!(join_dependency) calls join_constraints which pushes
   * StringJoin nodes onto the Arel manager's join_sources).
   */
  appendStringJoin(sql: string): this {
    this.core.source.right.push(new StringJoin(new SqlLiteral(sql), null));
    return this;
  }

  /**
   * Insert existing Arel join nodes at the front of join_sources, preserving
   * their relative order. Mirrors the leading_join bucket in Rails' build_joins,
   * which places LeadingJoin nodes before any alias-tracker-generated joins.
   */
  prependJoinNodes(...nodes: Join[]): this {
    this.core.source.right.unshift(...nodes);
    return this;
  }

  /**
   * Append an existing Arel join node to join_sources.
   *
   * Mirrors: join_sources.concat(join_nodes) in Rails build_joins.
   */
  appendJoinNode(node: Join): this {
    this.core.source.right.push(node);
    return this;
  }
}

// Surface the inherited FactoryMethods on select-manager.ts so parity:api
// matches them against select_manager.rb.
type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface SelectManager extends _FactoryMethodsModule {}
