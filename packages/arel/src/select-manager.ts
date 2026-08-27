import { ArelEngine, Node, _engine } from "./nodes/node.js";
import { TreeManager } from "./tree-manager.js";
import { SelectStatement } from "./nodes/select-statement.js";
import { SelectCore } from "./nodes/select-core.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Distinct } from "./nodes/terminal.js";
import { Offset, Limit, Lock, On, DistinctOn, Group, OptimizerHints } from "./nodes/unary.js";
import { Join } from "./nodes/binary.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { OuterJoin } from "./nodes/outer-join.js";
import { StringJoin } from "./nodes/string-join.js";
import { EmptyJoinError } from "./errors.js";
import { Union, UnionAll, Intersect, Except } from "./nodes/binary.js";
import { With, WithRecursive } from "./nodes/with.js";
import { TableAlias } from "./nodes/table-alias.js";
import { Exists } from "./nodes/function.js";
import { NamedWindow } from "./nodes/window.js";
import { Table } from "./table.js";
import { sql } from "./arel.js";
import { UpdateManager } from "./update-manager.js";
import { DeleteManager } from "./delete-manager.js";
import type { UpdateValues } from "./crud.js";
import { Comment } from "./nodes/comment.js";
import { Lateral } from "./nodes/unary.js";
import { And } from "./nodes/nary.js";
import { JoinSource } from "./nodes/join-source.js";
import { InsertManager } from "./insert-manager.js";

const UNION_NODE_CLASSES: Record<
  string,
  new (left: SelectStatement, right: SelectStatement) => Union
> = { UnionAll };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SelectManager extends TreeManager {
  ast: SelectStatement;

  constructor(table?: Table | Node | null) {
    super();
    this.ast = new SelectStatement(table ?? null);
  }

  get limit(): Limit["expr"] | null {
    return (this.ast.limit as Limit | null)?.expr ?? null;
  }

  set limit(value: number | Node | null) {
    this.take(value);
  }

  /** @internal */
  get taken(): Limit["expr"] | null {
    return this.limit;
  }

  get constraints(): Node[] {
    return [...this.core.wheres];
  }

  get offset(): Offset["expr"] | null {
    return (this.ast.offset as Offset | null)?.expr ?? null;
  }

  set offset(value: number | Node | null) {
    this.skip(value);
  }

  skip(amount: unknown): this {
    this.ast.offset = amount == null ? null : new Offset(amount);
    return this;
  }

  exists(): Exists {
    return new Exists(this.ast);
  }

  as(other: string | SqlLiteral): TableAlias {
    return this.createTableAlias(
      this.grouping(this.ast),
      new SqlLiteral(other, { retryable: true }),
    );
  }

  lock(locking: string | Node | boolean = sql("FOR UPDATE")): this {
    if (locking === true) {
      locking = sql("FOR UPDATE");
    } else if (locking instanceof SqlLiteral) {
      /** @empty */
    } else if (typeof locking === "string") {
      locking = sql(locking);
    }

    this.ast.lock = new Lock(locking as Node);
    return this;
  }

  get locked(): Node | null {
    return this.ast.lock;
  }

  on(...exprs: (Node | string | null | undefined)[]): this {
    const joins = this.core.source.right;
    const lastJoin = joins[joins.length - 1] as unknown as { right: Node | null };
    lastJoin.right = new On(this.collapse(exprs));
    return this;
  }

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

  from(table: Table | Node | string): this {
    const node = typeof table === "string" ? new SqlLiteral(table) : table;
    if (node instanceof Join) {
      this.core.source.right.push(node);
    } else {
      this.core.source.left = node;
    }
    return this;
  }

  get froms(): Node[] {
    return this.ast.cores.map((c) => c.from).filter((x): x is Node => x !== null);
  }

  join(
    relation: Node | Table | string | null | undefined,
    klass: new (left: Node | Table, right: Node | null) => Join = InnerJoin,
  ): this {
    if (relation == null) return this;

    if (typeof relation === "string" || relation instanceof SqlLiteral) {
      const text = typeof relation === "string" ? relation : relation.value;
      if (text.length === 0) throw new EmptyJoinError();
      klass = StringJoin as unknown as new (left: Node | Table, right: Node | null) => Join;
    }

    this.core.source.right.push(this.createJoin(relation, null, klass));
    return this;
  }

  outerJoin(relation: Node | Table | string | null | undefined): this {
    return this.join(relation, OuterJoin);
  }

  having(expr: Node): this {
    this.core.havings.push(expr);
    return this;
  }

  window(name: string): NamedWindow {
    const window = new NamedWindow(name);
    this.core.windows.push(window);
    return window;
  }

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

  get projections(): Node[] {
    return [...this.core.projections];
  }

  set projections(value: Node[]) {
    this.core.projections.length = 0;
    this.core.projections.push(...value);
  }

  optimizerHints(...hints: (string | SqlLiteral)[]): this {
    if (hints.length > 0) {
      this.core.optimizerHints = new OptimizerHints(hints);
    }
    return this;
  }

  distinct(value: unknown = true): this {
    this.core.setQuantifier = value === false || value == null ? null : new Distinct();
    return this;
  }

  distinctOn(value: Node | false | null): this {
    this.core.setQuantifier = value === false || value == null ? null : new DistinctOn(value);
    return this;
  }

  order(...expr: (Node | string)[]): this {
    this.ast.orders.push(...expr.map((x) => (typeof x === "string" ? new SqlLiteral(x) : x)));
    return this;
  }

  get orders(): Node[] {
    return [...this.ast.orders];
  }

  where(expr: Node | TreeManager): this {
    this.core.wheres.push(expr instanceof TreeManager ? expr.ast : expr);
    return this;
  }

  whereSql(engine: ArelEngine | null = _engine.current): SqlLiteral | null {
    if (this.core.wheres.length === 0) return null;
    return new SqlLiteral(`WHERE ${new And(this.core.wheres).toSql(engine)}`);
  }

  union(
    operation: string | SelectManager | SelectStatement,
    other: SelectManager | SelectStatement | null = null,
  ): Union {
    let nodeClass: new (left: SelectStatement, right: SelectStatement) => Union;
    if (other) {
      const name = String(operation).slice(1);
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      nodeClass = UNION_NODE_CLASSES[`Union${capitalized}`];
    } else {
      other = operation as SelectManager | SelectStatement;
      nodeClass = Union;
    }

    const otherAst = other instanceof SelectManager ? other.ast : other;
    return new nodeClass(this.ast, otherAst);
  }

  intersect(other: SelectManager): Intersect {
    return new Intersect(this.ast, other.ast);
  }

  except(other: SelectManager): Except {
    return new Except(this.ast, other.ast);
  }

  minus(other: SelectManager): Except {
    return this.except(other);
  }

  lateral(tableName?: string): Lateral {
    const base = tableName === undefined ? this.ast : this.as(tableName);
    return new Lateral(base);
  }

  with(...subqueries: Node[]): this {
    this.ast.with = new With(subqueries);
    return this;
  }

  take(limit: unknown): this {
    this.ast.limit = limit == null ? null : new Limit(limit);
    return this;
  }

  joinSources(): Join[] {
    return this.core.source.right as Join[];
  }

  get source(): JoinSource {
    return this.core.source;
  }

  comment(...values: string[]): this {
    this.core.comment = new Comment(values);
    return this;
  }

  protected collapse(exprs: unknown[]): Node {
    exprs = exprs
      .filter((expr) => expr !== null && expr !== undefined)
      .map((expr) => (typeof expr === "string" ? sql(expr) : (expr as Node)));
    if (exprs.length === 1) return exprs[0] as Node;
    return this.createAnd(exprs as Node[]);
  }

  private get core(): SelectCore {
    return this.ast.cores[this.ast.cores.length - 1];
  }

  withRecursive(...ctes: Node[]): this {
    this.ast.with = new WithRecursive(ctes);
    return this;
  }

  compileInsert(values: [Node, unknown][]): InsertManager {
    const im = new InsertManager();
    im.insert(values);
    return im;
  }

  createInsert(): InsertManager {
    return new InsertManager();
  }

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
}

type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface SelectManager extends _FactoryMethodsModule {}
