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
import { Union, Intersect, Except } from "./nodes/binary.js";
import { With } from "./nodes/with.js";
import { TableAlias } from "./nodes/table-alias.js";
import { Exists } from "./nodes/function.js";
import { NamedWindow } from "./nodes/window.js";
import { Table } from "./table.js";
import { sql } from "./arel.js";
import { Arel, Nodes } from "./namespaces.js";
import {
  capitalize,
  isEmpty,
  isSymbol,
  rbConstGet,
  rbModConstSet,
  rbObjAsString,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { Comment } from "./nodes/comment.js";
import { Lateral } from "./nodes/unary.js";
import { And } from "./nodes/nary.js";
import { JoinSource } from "./nodes/join-source.js";
import { Crud } from "./crud.js";
import { include } from "@blazetrails/activesupport";
import type { ArelNode } from "./arel.js";

type Subqueries = Node | Subqueries[];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SelectManager extends TreeManager<SelectStatement> {
  /** @internal */
  private ctx: SelectCore;

  constructor(table?: Table | ArelNode | null) {
    super();
    this.ast = new SelectStatement(table ?? null);
    this.ctx = this.ast.cores.at(-1)!;
  }

  get limit(): Limit["expr"] | null {
    return (this.ast.limit as Limit | null)?.expr ?? null;
  }

  set limit(value: number | Node | null) {
    this.take(value);
  }

  get taken(): Limit["expr"] | null {
    return this.limit;
  }

  get constraints(): ArelNode[] {
    return [...this.ctx.wheres];
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

  lock(locking: string | ArelNode | boolean = sql("FOR UPDATE")): this {
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

  on(...exprs: (ArelNode | string | null | undefined)[]): this {
    const joins = this.ctx.source.right;
    const lastJoin = joins[joins.length - 1] as unknown as { right: Node | null };
    lastJoin.right = new On(this.collapse(exprs));
    return this;
  }

  group(...columns: (ArelNode | string)[]): this {
    for (let column of columns) {
      if (typeof column === "string" && !isSymbol(column)) column = new SqlLiteral(column);
      if (isSymbol(column)) column = new SqlLiteral(symbolToS(column));

      this.ctx.groups.push(new Group(column));
    }
    return this;
  }

  from(table: Table | ArelNode | string): this {
    const node = typeof table === "string" ? new SqlLiteral(table) : table;
    if (node instanceof Join) {
      this.ctx.source.right.push(node);
    } else {
      this.ctx.source.left = node;
    }
    return this;
  }

  get froms(): ArelNode[] {
    return this.ast.cores.map((c) => c.from).filter((x): x is ArelNode => x !== null);
  }

  join(
    relation: ArelNode | Table | string | null | undefined,
    klass: new (left: ArelNode | Table, right: ArelNode | null) => Join = InnerJoin,
  ): this {
    if (relation == null) return this;

    if (typeof relation === "string" || relation instanceof SqlLiteral) {
      if (isEmpty(relation)) throw new EmptyJoinError();
      klass = StringJoin as unknown as new (left: ArelNode | Table, right: ArelNode | null) => Join;
    }

    this.ctx.source.right.push(this.createJoin(relation, null, klass));
    return this;
  }

  outerJoin(relation: ArelNode | Table | string | null | undefined): this {
    return this.join(relation, OuterJoin);
  }

  having(expr: ArelNode): this {
    this.ctx.havings.push(expr);
    return this;
  }

  window(name: string): NamedWindow {
    const window = new NamedWindow(name);
    this.ctx.windows.push(window);
    return window;
  }

  project(...projections: (ArelNode | string)[]): this {
    for (const x of projections) {
      if (typeof x === "string") {
        this.ctx.projections.push(new SqlLiteral(x));
      } else {
        this.ctx.projections.push(x);
      }
    }
    return this;
  }

  get projections(): (ArelNode | ArelNode[])[] {
    return [...this.ctx.projections];
  }

  set projections(value: (ArelNode | ArelNode[])[]) {
    this.ctx.projections.length = 0;
    this.ctx.projections.push(...value);
  }

  optimizerHints(...hints: (string | SqlLiteral)[]): this {
    if (hints.length > 0) {
      this.ctx.optimizerHints = new OptimizerHints(hints);
    }
    return this;
  }

  distinct(value: unknown = true): this {
    this.ctx.setQuantifier = value === false || value == null ? null : new Distinct();
    return this;
  }

  distinctOn(value: ArelNode | false | null): this {
    this.ctx.setQuantifier = value === false || value == null ? null : new DistinctOn(value);
    return this;
  }

  order(...expr: (ArelNode | string)[]): this {
    this.ast.orders.push(...expr.map((x) => (typeof x === "string" ? new SqlLiteral(x) : x)));
    return this;
  }

  get orders(): ArelNode[] {
    return [...this.ast.orders];
  }

  where(expr: ArelNode | TreeManager): this {
    this.ctx.wheres.push(expr instanceof TreeManager ? expr.ast : expr);
    return this;
  }

  whereSql(engine: ArelEngine | null = _engine.current): SqlLiteral | null {
    if (this.ctx.wheres.length === 0) return null;
    return new SqlLiteral(`WHERE ${new And(this.ctx.wheres).toSql(engine)}`);
  }

  union(operation: string | SelectManager, other: SelectManager | null = null): Union {
    let nodeClass: typeof Union;
    if (other != null) {
      nodeClass = rbConstGet(
        Nodes,
        `Union${capitalize(isSymbol(operation) ? symbolToS(operation) : rbObjAsString(operation), [])}`,
      ) as typeof Union;
    } else {
      other = operation as SelectManager;
      nodeClass = Union;
    }

    return new nodeClass(this.ast, other.ast);
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

  with(...subqueries: (string | Subqueries)[]): this {
    let nodeClass: typeof With;
    if (isSymbol(subqueries[0])) {
      nodeClass = rbConstGet(
        Nodes,
        `With${capitalize(symbolToS(subqueries.shift() as string), [])}`,
      ) as typeof With;
    } else {
      nodeClass = With;
    }
    this.ast.with = new nodeClass((subqueries as unknown[]).flat(Infinity) as Node[]);

    return this;
  }

  take(limit: unknown): this {
    this.ast.limit = limit == null ? null : new Limit(limit);
    return this;
  }

  joinSources(): Join[] {
    return this.ctx.source.right as Join[];
  }

  get source(): JoinSource {
    return this.ctx.source;
  }

  comment(...values: string[]): this {
    this.ctx.comment = new Comment(values);
    return this;
  }

  protected collapse(exprs: unknown[]): ArelNode {
    exprs = exprs
      .filter((expr) => expr !== null && expr !== undefined)
      .map((expr) => (typeof expr === "string" ? sql(expr) : (expr as Node)));
    if (exprs.length === 1) return exprs[0] as Node;
    return this.createAnd(exprs as Node[]);
  }

  override initializeCopy(other: SelectManager): void {
    super.initializeCopy(other);
    this.ctx = this.ast.cores.at(-1)!;
  }
}

type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface SelectManager extends _FactoryMethodsModule, Crud {}

include(SelectManager, Crud);

rbModConstSet(Arel, "SelectManager", SelectManager);
