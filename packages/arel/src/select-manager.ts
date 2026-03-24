import { Node } from "./nodes/node.js";
import { SelectStatement } from "./nodes/select-statement.js";
import { SelectCore } from "./nodes/select-core.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Distinct } from "./nodes/terminal.js";
import { Offset, Limit, Lock, On, DistinctOn } from "./nodes/unary.js";
import { CrossJoin } from "./nodes/binary.js";
import type { Join } from "./nodes/binary.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { OuterJoin } from "./nodes/outer-join.js";
import { RightOuterJoin } from "./nodes/right-outer-join.js";
import { FullOuterJoin } from "./nodes/full-outer-join.js";
import { StringJoin } from "./nodes/string-join.js";
import { Quoted } from "./nodes/casted.js";
import { Union, UnionAll, Intersect, Except } from "./nodes/binary.js";
import { With, WithRecursive } from "./nodes/with.js";
import { TableAlias } from "./nodes/table-alias.js";
import { Exists } from "./nodes/function.js";
import { NamedWindow } from "./nodes/window.js";
import { Table } from "./table.js";
import { ToSql } from "./visitors/to-sql.js";
import { UpdateStatement } from "./nodes/update-statement.js";
import { Assignment } from "./nodes/binary.js";
import { DeleteStatement } from "./nodes/delete-statement.js";
import { Comment } from "./nodes/comment.js";
import { Lateral } from "./nodes/unary.js";
import { True } from "./nodes/true.js";
import { False } from "./nodes/false.js";
import { And } from "./nodes/and.js";
import { Grouping } from "./nodes/grouping.js";
import { NamedFunction } from "./nodes/named-function.js";
import { JoinSource } from "./nodes/join-source.js";
import { InsertManager } from "./insert-manager.js";

/**
 * SelectManager — the chainable API for building SELECT queries.
 *
 * Mirrors: Arel::SelectManager
 */
export class SelectManager {
  readonly ast: SelectStatement;

  constructor(table?: Table | null) {
    this.ast = new SelectStatement();
    if (table) {
      this.from(table);
    }
  }

  private get core(): SelectCore {
    return this.ast.cores[this.ast.cores.length - 1];
  }

  /**
   * Set the FROM table.
   */
  from(table: Table | Node | string): this {
    if (typeof table === "string") {
      this.core.source.left = new SqlLiteral(table);
    } else {
      this.core.source.left = table;
    }
    return this;
  }

  /**
   * Add projections (columns to SELECT).
   */
  project(...projections: (Node | string)[]): this {
    for (const p of projections) {
      if (typeof p === "string") {
        this.core.projections.push(new SqlLiteral(p));
      } else {
        this.core.projections.push(p);
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
   * Return the current WHERE conditions.
   *
   * Mirrors: Arel::SelectManager#constraints
   */
  get constraints(): Node[] {
    return [...this.core.wheres];
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
   * Add a WHERE condition.
   */
  where(condition: Node): this {
    this.core.wheres.push(condition);
    return this;
  }

  /**
   * Add ORDER BY clauses.
   */
  order(...exprs: Node[]): this {
    this.ast.orders.push(...exprs);
    return this;
  }

  /**
   * Set LIMIT.
   */
  take(amount: number | Node): this {
    if (amount instanceof Node) {
      this.ast.limit = amount;
    } else {
      this.ast.limit = new Limit(new Quoted(amount));
    }
    return this;
  }

  /**
   * Set OFFSET.
   */
  skip(amount: number | Node): this {
    if (amount instanceof Node) {
      this.ast.offset = amount;
    } else {
      this.ast.offset = new Offset(new Quoted(amount));
    }
    return this;
  }

  /**
   * Add GROUP BY.
   */
  group(...exprs: (Node | string)[]): this {
    for (const e of exprs) {
      if (typeof e === "string") {
        this.core.groups.push(new SqlLiteral(e));
      } else {
        this.core.groups.push(e);
      }
    }
    return this;
  }

  /**
   * Add HAVING.
   */
  having(condition: Node): this {
    this.core.havings.push(condition);
    return this;
  }

  /**
   * INNER JOIN.
   */
  join(
    table: Node | string,
    klassOrCondition?: (new (left: Node, right: Node | null) => Join) | Node,
  ): this {
    const tableNode = typeof table === "string" ? new SqlLiteral(table) : table;
    if (klassOrCondition && typeof klassOrCondition === "function" && klassOrCondition.prototype) {
      const JoinClass = klassOrCondition as new (left: Node, right: Node | null) => Join;
      this.core.source.right.push(new JoinClass(tableNode, null));
    } else if (klassOrCondition instanceof Node) {
      const onNode = new On(klassOrCondition);
      this.core.source.right.push(new InnerJoin(tableNode, onNode));
    } else {
      this.core.source.right.push(new InnerJoin(tableNode, null));
    }
    return this;
  }

  /**
   * LEFT OUTER JOIN.
   */
  outerJoin(table: Node | string, onCondition?: Node): this {
    const tableNode = typeof table === "string" ? new SqlLiteral(table) : table;
    const onNode = onCondition ? new On(onCondition) : null;
    this.core.source.right.push(new OuterJoin(tableNode, onNode));
    return this;
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
   * Define a named window.
   */
  window(name: string): NamedWindow {
    const win = new NamedWindow(name);
    this.core.windows.push(win);
    return win;
  }

  /**
   * Make the SELECT DISTINCT.
   */
  distinct(): this {
    this.core.setQuantifier = new Distinct();
    return this;
  }

  /**
   * Add a lock clause (FOR UPDATE by default).
   */
  lock(lockClause?: string): this {
    this.ast.lock = new Lock(lockClause ?? null);
    return this;
  }

  /**
   * Set WITH (CTE).
   */
  with(...ctes: Node[]): this {
    this.ast.with = new With(ctes);
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
   * UNION with another manager.
   */
  union(other: SelectManager | SelectStatement): Node {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new Union(this.ast, otherAst);
  }

  /**
   * UNION ALL with another manager.
   */
  unionAll(other: SelectManager | SelectStatement): Node {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new UnionAll(this.ast, otherAst);
  }

  /**
   * INTERSECT with another manager.
   */
  intersect(other: SelectManager | SelectStatement): Node {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new Intersect(this.ast, otherAst);
  }

  /**
   * EXCEPT with another manager.
   */
  except(other: SelectManager | SelectStatement): Node {
    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new Except(this.ast, otherAst);
  }

  /**
   * Wrap as EXISTS(subquery).
   */
  exists(): Exists {
    return new Exists(this.ast);
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
   * Return the current join sources (right side of the source).
   *
   * Mirrors: Arel::SelectManager#join_sources
   */
  get joinSources(): Node[] {
    return [...this.core.source.right];
  }

  /**
   * Return the FROM sources (left side of the source).
   *
   * Mirrors: Arel::SelectManager#froms
   */
  get froms(): (Node | null)[] {
    return [this.core.source.left];
  }

  /**
   * Alias the entire subquery with a name, returning a TableAlias.
   *
   * Mirrors: Arel::SelectManager#as
   */
  as(alias: string): TableAlias {
    return new TableAlias(this.ast, alias);
  }

  /**
   * Return the current LIMIT node.
   *
   * Mirrors: Arel::SelectManager#limit
   */
  get limit(): Node | null {
    return this.ast.limit;
  }

  /**
   * Return the current OFFSET node.
   *
   * Mirrors: Arel::SelectManager#offset
   */
  get offset(): Node | null {
    return this.ast.offset;
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
  on(...exprs: Node[]): this {
    const joins = this.core.source.right;
    if (joins.length > 0) {
      const lastJoin = joins[joins.length - 1];
      if (exprs.length === 1) {
        (lastJoin as unknown as { right: Node | null }).right = new On(exprs[0]);
      } else {
        (lastJoin as unknown as { right: Node | null }).right = new On(new And(exprs));
      }
    }
    return this;
  }

  /**
   * Add optimizer hints to the query.
   *
   * Mirrors: Arel::SelectManager#optimizer_hints
   */
  optimizerHints(...hints: string[]): this {
    this.core.optimizerHints = hints;
    return this;
  }

  /**
   * Set DISTINCT ON quantifier.
   *
   * Mirrors: Arel::SelectManager#distinct_on
   */
  distinctOn(value: Node): this {
    this.core.setQuantifier = new DistinctOn(value);
    return this;
  }

  /**
   * Compile just the WHERE clause to SQL.
   *
   * Mirrors: Arel::SelectManager#where_sql
   */
  whereSql(): string | null {
    if (this.core.wheres.length === 0) return null;
    const visitor = new ToSql();
    const parts = this.core.wheres.map((w) => visitor.compile(w));
    return `WHERE ${parts.join(" AND ")}`;
  }

  /**
   * Wrap the AST in a LATERAL subquery.
   *
   * Mirrors: Arel::SelectManager#lateral
   */
  lateral(alias?: string): Lateral | TableAlias {
    const lat = new Lateral(this.ast);
    if (alias) {
      return new TableAlias(lat, alias);
    }
    return lat;
  }

  /**
   * Add SQL comments to the query.
   *
   * Mirrors: Arel::SelectManager#comment
   */
  comment(...values: string[]): this {
    this.ast.comment = new Comment(...values);
    return this;
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
   * Create an UpdateStatement from values.
   *
   * Mirrors: Arel::SelectManager#compile_update
   */
  compileUpdate(values: [Node, unknown][], key?: Node): UpdateStatement {
    const stmt = new UpdateStatement();
    stmt.relation = this.core.source.left;
    stmt.values = values.map(([col, val]) => {
      const right = val instanceof Node ? val : new Quoted(val);
      return new Assignment(col, right);
    });
    stmt.wheres = [...this.core.wheres];
    if (key) stmt.key = key;
    return stmt;
  }

  /**
   * Create a DeleteStatement from this SelectManager.
   *
   * Mirrors: Arel::SelectManager#compile_delete
   */
  compileDelete(): DeleteStatement {
    const stmt = new DeleteStatement();
    stmt.relation = this.core.source.left;
    stmt.wheres = [...this.core.wheres];
    return stmt;
  }

  // -- FactoryMethods (via TreeManager) --

  /**
   * Factory: create a TRUE node.
   */
  createTrue(): True {
    return new True();
  }

  /**
   * Factory: create a FALSE node.
   */
  createFalse(): False {
    return new False();
  }

  /**
   * Factory: create a TableAlias node.
   */
  createTableAlias(relation: Node, name: string): TableAlias {
    return new TableAlias(relation, name);
  }

  /**
   * Factory: create a join node.
   */
  private static readonly defaultJoinConstructor = InnerJoin;

  private static isJoinConstructor(
    value: unknown,
  ): value is new (left: Node, right: Node | null) => Join {
    return typeof value === "function";
  }

  createJoin(
    to: Node,
    constraint?: Node,
    klass?: new (left: Node, right: Node | null) => Join,
  ): Join {
    const JoinKlass =
      klass && SelectManager.isJoinConstructor(klass)
        ? klass
        : SelectManager.defaultJoinConstructor;
    return new JoinKlass(to, constraint ? new On(constraint) : null);
  }

  /**
   * Factory: create a StringJoin node.
   */
  createStringJoin(to: string | Node): StringJoin {
    const node = typeof to === "string" ? new SqlLiteral(to) : to;
    return new StringJoin(node, null);
  }

  /**
   * Factory: create an AND node.
   */
  createAnd(nodes: Node[]): And {
    return new And(nodes);
  }

  /**
   * Factory: create an On node.
   */
  createOn(expr: Node): On {
    return new On(expr);
  }

  /**
   * Factory: create a Grouping node.
   */
  grouping(expr: Node): Grouping {
    return new Grouping(expr);
  }

  /**
   * Factory: LOWER function.
   */
  lower(column: Node): NamedFunction {
    return new NamedFunction("LOWER", [column]);
  }

  /**
   * Factory: COALESCE function.
   */
  coalesce(...args: Node[]): NamedFunction {
    return new NamedFunction("COALESCE", args);
  }

  /**
   * Factory: CAST function.
   */
  cast(expr: Node, type: string): NamedFunction {
    return new NamedFunction("CAST", [new SqlLiteral(`${expr} AS ${type}`)]);
  }

  /**
   * Generate SQL string.
   */
  toSql(): string {
    return new ToSql().compile(this.ast);
  }
}
