import { Notifications, isPlainObject as _isPlainObject } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { threadedConnectionFor } from "./connection-handling.js";
import type { Relation } from "./relation.js";
import type { Result } from "./result.js";
import type { AssociationSpec, JoinSpec } from "./relation/query-methods.js";
import type { SumBlock } from "./relation/calculations.js";

export async function findBySql<T extends typeof Base>(
  this: T,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
  opts:
    | { allowRetry?: boolean; preparable?: boolean | null }
    | ((record: InstanceType<T>) => void)
    | null = {},
  block?: (record: InstanceType<T>) => void,
): Promise<InstanceType<T>[]> {
  const resolvedOpts = typeof opts === "function" ? {} : (opts ?? {});
  const resolvedBlock = typeof opts === "function" ? opts : block;
  return this.withConnection(async () => {
    const result = await _queryBySql.call(this, sql, binds, {
      allowRetry: resolvedOpts.allowRetry,
      preparable: resolvedOpts.preparable,
    });
    return _loadFromSql.call<T, [Result, typeof resolvedBlock], InstanceType<T>[]>(
      this,
      result,
      resolvedBlock,
    );
  });
}

export async function asyncFindBySql<T extends typeof Base>(
  this: T,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
  opts:
    | { allowRetry?: boolean; preparable?: boolean | null }
    | ((record: InstanceType<T>) => void)
    | null = {},
  block?: (record: InstanceType<T>) => void,
): Promise<InstanceType<T>[]> {
  return findBySql.call<T, Parameters<typeof findBySql<T>>, Promise<InstanceType<T>[]>>(
    this,
    sql,
    binds,
    opts as any,
    block,
  );
}

export async function countBySql(
  this: typeof Base,
  sql: string | [string, ...unknown[]],
): Promise<number> {
  const sanitized = typeof sql === "string" ? sql : (this.sanitizeSql(sql) ?? "");
  return this.withConnection(async (adapter) => {
    const rows = await adapter.execute(sanitized);
    if (!rows[0]) return 0;
    const firstValue = Object.values(rows[0])[0];
    return Number(firstValue) || 0;
  });
}

export function asyncCountBySql(
  this: typeof Base,
  sql: string | [string, ...unknown[]],
): Promise<number> {
  return countBySql.call(this, sql);
}

/** @internal */
export async function _queryBySql(
  this: typeof Base,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
  opts: { preparable?: boolean | null; async?: boolean; allowRetry?: boolean } = {},
): Promise<Result> {
  const resolvedSql = Array.isArray(sql) ? (this.sanitizeSql(sql) ?? "") : sql;
  const resolvedBinds = Array.isArray(sql) ? [] : binds;
  const selectOpts: { allowRetry: boolean; preparable?: boolean | null } = {
    allowRetry: opts.allowRetry ?? false,
  };
  if (opts.preparable != null) selectOpts.preparable = opts.preparable;
  const adapter = threadedConnectionFor(this) ?? this.connection;
  return adapter.selectAll(resolvedSql, `${this.name} Load`, resolvedBinds, selectOpts);
}

/** @internal */
export function _loadFromSql<T extends typeof Base>(
  this: T,
  resultSet: Result,
  block?: (record: InstanceType<T>) => void,
): InstanceType<T>[] {
  if (resultSet.isEmpty()) return [];

  let columnTypes = resultSet.columnTypes as Record<
    string,
    { deserialize(value: unknown): unknown }
  >;

  if (Object.keys(columnTypes).length !== 0) {
    const attributeTypes = this.attributeTypes();
    columnTypes = Object.fromEntries(
      Object.entries(columnTypes).filter(([k]) => !Object.hasOwn(attributeTypes, k)),
    );
  }

  const messageBus = Notifications.instrumenter;

  const payload = { record_count: resultSet.length, class_name: this.name };

  return messageBus.instrument("instantiation.active_record", payload, () => {
    if (resultSet.includesColumn(this.inheritanceColumn)) {
      return resultSet.toArray().map((record) => this.instantiate(record, columnTypes, block));
    } else {
      return resultSet.toArray().map((record) => this._instantiate(record, block, columnTypes));
    }
  });
}

export function from<T extends typeof Base>(
  this: T,
  source: string | Relation<any> | import("@blazetrails/arel").Nodes.Node,
  subqueryName?: string,
): Relation<InstanceType<T>> {
  return this.all().from(source, subqueryName);
}

export function select<T extends typeof Base>(
  this: T,
  ...columns: (string | import("@blazetrails/arel").Nodes.Node | Record<string, unknown>)[]
): Relation<InstanceType<T>> {
  return this.all().select(...columns);
}

export function order<T extends typeof Base>(
  this: T,
  ...args: Parameters<Relation<InstanceType<T>>["order"]>
): Relation<InstanceType<T>> {
  return this.all().order(...args);
}

export function group<T extends typeof Base>(
  this: T,
  ...columns: (string | import("@blazetrails/arel").Nodes.Node)[]
): Relation<InstanceType<T>> {
  return this.all().group(...columns);
}

export function limit<T extends typeof Base>(
  this: T,
  value: number | string | null,
): Relation<InstanceType<T>> {
  return this.all().limit(value);
}

export function offset<T extends typeof Base>(this: T, value: number): Relation<InstanceType<T>> {
  return this.all().offset(value);
}

export function distinct<T extends typeof Base>(this: T): Relation<InstanceType<T>> {
  return this.all().distinct();
}

export function joins<T extends typeof Base>(
  this: T,
  ...nodes: import("@blazetrails/arel").Nodes.Join[]
): Relation<InstanceType<T>>;
export function joins<T extends typeof Base>(
  this: T,
  specArray: JoinSpec[],
): Relation<InstanceType<T>>;
export function joins<T extends typeof Base>(
  this: T,
  hashSpec: Record<string, AssociationSpec | AssociationSpec[]>,
): Relation<InstanceType<T>>;
export function joins<T extends typeof Base>(
  this: T,
  ...args: Array<JoinSpec>
): Relation<InstanceType<T>>;
export function joins<T extends typeof Base>(
  this: T,
  ...args: Array<JoinSpec>
): Relation<InstanceType<T>> {
  const relation = this.all();
  if (args.length === 1 && Array.isArray(args[0])) {
    return relation.joins(args[0]);
  }
  if (args.length === 1 && _isPlainObject(args[0])) {
    return relation.joins(args[0]);
  }
  if (args.length === 0 || typeof args[0] === "string" || args[0] === undefined) {
    return relation.joins(...(args as Array<string>));
  }
  return relation.joins(...(args as import("@blazetrails/arel").Nodes.Join[]));
}

export function optimizerHints<T extends typeof Base>(
  this: T,
  ...hints: string[]
): Relation<InstanceType<T>> {
  return this.all().optimizerHints(...hints);
}

export function leftJoins<T extends typeof Base>(
  this: T,
  ...args: Array<AssociationSpec | AssociationSpec[]>
): Relation<InstanceType<T>> {
  return this.all().leftJoins(...args);
}

export function leftOuterJoins<T extends typeof Base>(
  this: T,
  ...args: Array<AssociationSpec | AssociationSpec[]>
): Relation<InstanceType<T>> {
  return this.all().leftOuterJoins(...args);
}

export function none<T extends typeof Base>(this: T): Relation<InstanceType<T>> {
  return this.all().none();
}

export function insert<T extends typeof Base>(
  this: T,
  record: Record<string, unknown>,
  options?: Parameters<Relation<InstanceType<T>>["insert"]>[1],
): Promise<Result> {
  return this.all().insert(record, options);
}

export function insertBang<T extends typeof Base>(
  this: T,
  record: Record<string, unknown>,
  options?: Parameters<Relation<InstanceType<T>>["insertBang"]>[1],
): Promise<Result> {
  return this.all().insertBang(record, options);
}

export function insertAll<T extends typeof Base>(
  this: T,
  records: Record<string, unknown>[],
  options?: Parameters<Relation<InstanceType<T>>["insertAll"]>[1],
): Promise<Result> {
  return this.all().insertAll(records, options);
}

export function insertAllBang<T extends typeof Base>(
  this: T,
  records: Record<string, unknown>[],
  options?: Parameters<Relation<InstanceType<T>>["insertAllBang"]>[1],
): Promise<Result> {
  return this.all().insertAllBang(records, options);
}

export function upsert<T extends typeof Base>(
  this: T,
  attrs: Record<string, unknown>,
  options?: Parameters<Relation<InstanceType<T>>["upsert"]>[1],
): Promise<Result> {
  return this.all().upsert(attrs, options);
}

export function upsertAll<T extends typeof Base>(
  this: T,
  records: Record<string, unknown>[],
  options?: Parameters<Relation<InstanceType<T>>["upsertAll"]>[1],
): Promise<Result> {
  return this.all().upsertAll(records, options);
}

export async function updateAll<T extends typeof Base>(
  this: T,
  updates: Record<string, unknown>,
): Promise<number> {
  if (this.abstractClass) {
    throw new Error(`Cannot call updateAll on abstract class ${this.name}`);
  }
  return this.all().updateAll(updates);
}

export async function deleteAll<T extends typeof Base>(this: T): Promise<number> {
  if (this.abstractClass) {
    throw new Error(`Cannot call deleteAll on abstract class ${this.name}`);
  }
  return this.all().deleteAll();
}

export function destroyAll<T extends typeof Base>(this: T): Promise<InstanceType<T>[]> {
  return this.all().destroyAll();
}

export function destroyBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
): Promise<InstanceType<T>[]> {
  return this.all().where(conditions).destroyAll();
}

export function deleteBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
): Promise<number> {
  return this.all().where(conditions).deleteAll();
}

export function second<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().second();
}

export function secondBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().secondBang();
}

export function third<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().third();
}

export function thirdBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().thirdBang();
}

export function fourth<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().fourth();
}

export function fourthBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().fourthBang();
}

export function fifth<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().fifth();
}

export function fifthBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().fifthBang();
}

export function fortyTwo<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().fortyTwo();
}

export function fortyTwoBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().fortyTwoBang();
}

export function secondToLast<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().secondToLast();
}

export function secondToLastBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().secondToLastBang();
}

export function thirdToLast<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().thirdToLast();
}

export function thirdToLastBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().thirdToLastBang();
}

export function count<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["count"]>
): ReturnType<ReturnType<T["all"]>["count"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.count(...args) as ReturnType<ReturnType<T["all"]>["count"]>;
}

export function minimum<T extends typeof Base>(
  this: T,
  column: Parameters<ReturnType<T["all"]>["minimum"]>[0],
): ReturnType<ReturnType<T["all"]>["minimum"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.minimum(column) as ReturnType<ReturnType<T["all"]>["minimum"]>;
}

export function maximum<T extends typeof Base>(
  this: T,
  column: Parameters<ReturnType<T["all"]>["maximum"]>[0],
): ReturnType<ReturnType<T["all"]>["maximum"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.maximum(column) as ReturnType<ReturnType<T["all"]>["maximum"]>;
}

export function average<T extends typeof Base>(
  this: T,
  column: Parameters<ReturnType<T["all"]>["average"]>[0],
): ReturnType<ReturnType<T["all"]>["average"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.average(column) as ReturnType<ReturnType<T["all"]>["average"]>;
}

export function sum<T extends typeof Base>(this: T, block: SumBlock): Promise<number | bigint>;
export function sum<T extends typeof Base>(
  this: T,
  initialValue: number,
  block: SumBlock,
): Promise<number | bigint>;
export function sum<T extends typeof Base>(
  this: T,
  column?: string | import("@blazetrails/arel").Nodes.Node | number,
): Promise<number | bigint | Map<unknown, number | bigint>>;
export function sum<T extends typeof Base>(
  this: T,
  column?: string | import("@blazetrails/arel").Nodes.Node | number | SumBlock,
  block?: SumBlock,
): Promise<number | bigint | Map<unknown, number | bigint>> {
  const rel = this.all() as ReturnType<T["all"]>;
  return (
    rel.sum as (
      c?: unknown,
      b?: unknown,
    ) => Promise<number | bigint | Map<unknown, number | bigint>>
  )(column, block);
}

export function pluck<T extends typeof Base>(
  this: T,
  ...columns: Parameters<ReturnType<T["all"]>["pluck"]>
): ReturnType<ReturnType<T["all"]>["pluck"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.pluck(...columns) as ReturnType<ReturnType<T["all"]>["pluck"]>;
}

export function ids<T extends typeof Base>(this: T): Promise<unknown[]> {
  return this.all().ids();
}

export function pick<T extends typeof Base>(
  this: T,
  ...columns: Parameters<ReturnType<T["all"]>["pick"]>
): ReturnType<ReturnType<T["all"]>["pick"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.pick(...columns) as ReturnType<ReturnType<T["all"]>["pick"]>;
}

export function first<T extends typeof Base>(this: T): Promise<InstanceType<T> | null>;
export function first<T extends typeof Base>(this: T, n: number): Promise<InstanceType<T>[]>;
export function first<T extends typeof Base>(
  this: T,
  n?: number,
): Promise<InstanceType<T> | InstanceType<T>[] | null> {
  return n === undefined ? this.all().first() : this.all().first(n);
}

export function firstBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().firstBang();
}

export function last<T extends typeof Base>(this: T): Promise<InstanceType<T> | null>;
export function last<T extends typeof Base>(this: T, n: number): Promise<InstanceType<T>[]>;
export function last<T extends typeof Base>(
  this: T,
  n?: number,
): Promise<InstanceType<T> | InstanceType<T>[] | null> {
  return n === undefined ? this.all().last() : this.all().last(n);
}

export function lastBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().lastBang();
}

export function take<T extends typeof Base>(this: T): Promise<InstanceType<T> | null>;
export function take<T extends typeof Base>(this: T, n: number): Promise<InstanceType<T>[]>;
export function take<T extends typeof Base>(
  this: T,
  n?: number,
): Promise<InstanceType<T> | InstanceType<T>[] | null> {
  return n === undefined ? this.all().take() : this.all().take(n);
}

export function takeBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().takeBang();
}

export function sole<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().sole();
}

export async function exists<T extends typeof Base>(
  this: T,
  idOrConditions?: unknown,
): Promise<boolean> {
  if (idOrConditions === false || idOrConditions === null) {
    return false;
  }
  return this.all().exists(idOrConditions);
}

export function findOrCreateBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<InstanceType<T>> {
  return this.all().findOrCreateBy(conditions, extra);
}

export function findOrCreateByBang<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<InstanceType<T>> {
  return this.all().findOrCreateByBang(conditions, extra);
}

export function findOrInitializeBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<InstanceType<T>> {
  return this.all().findOrInitializeBy(conditions, extra);
}

export function isAny<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["isAny"]>
): Promise<boolean> {
  return this.all().isAny(...args);
}

export function isMany<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["isMany"]>
): Promise<boolean> {
  return this.all().isMany(...args);
}

export function isOne<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["isOne"]>
): Promise<boolean> {
  return this.all().isOne(...args);
}

export function isNone<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["isNone"]>
): Promise<boolean> {
  return this.all().isNone(...args);
}

export async function isEmpty<T extends typeof Base>(this: T): Promise<boolean> {
  return this.all().isEmpty();
}

export function firstOrCreate<T extends typeof Base>(
  this: T,
  extra?: Parameters<ReturnType<T["all"]>["firstOrCreate"]>[0],
): ReturnType<ReturnType<T["all"]>["firstOrCreate"]> {
  return this.all().firstOrCreate(extra) as ReturnType<ReturnType<T["all"]>["firstOrCreate"]>;
}

export function firstOrCreateBang<T extends typeof Base>(
  this: T,
  extra?: Parameters<ReturnType<T["all"]>["firstOrCreateBang"]>[0],
): ReturnType<ReturnType<T["all"]>["firstOrCreateBang"]> {
  return this.all().firstOrCreateBang(extra) as ReturnType<
    ReturnType<T["all"]>["firstOrCreateBang"]
  >;
}

export function firstOrInitialize<T extends typeof Base>(
  this: T,
  extra?: Parameters<ReturnType<T["all"]>["firstOrInitialize"]>[0],
): ReturnType<ReturnType<T["all"]>["firstOrInitialize"]> {
  return this.all().firstOrInitialize(extra) as ReturnType<
    ReturnType<T["all"]>["firstOrInitialize"]
  >;
}

export function findEach<T extends typeof Base>(
  this: T,
  opts?: Parameters<ReturnType<T["all"]>["findEach"]>[0],
): ReturnType<ReturnType<T["all"]>["findEach"]> {
  return this.all().findEach(opts) as ReturnType<ReturnType<T["all"]>["findEach"]>;
}

export function findInBatches<T extends typeof Base>(
  this: T,
  opts?: Parameters<ReturnType<T["all"]>["findInBatches"]>[0],
): ReturnType<ReturnType<T["all"]>["findInBatches"]> {
  return this.all().findInBatches(opts) as ReturnType<ReturnType<T["all"]>["findInBatches"]>;
}

export function inBatches<T extends typeof Base>(
  this: T,
  opts: Parameters<ReturnType<T["all"]>["inBatches"]>[0],
  block: (relation: any) => void | Promise<void>,
): Promise<void>;
export function inBatches<T extends typeof Base>(
  this: T,
  opts?: Parameters<ReturnType<T["all"]>["inBatches"]>[0],
): ReturnType<ReturnType<T["all"]>["inBatches"]>;
export function inBatches<T extends typeof Base>(
  this: T,
  opts?: Parameters<ReturnType<T["all"]>["inBatches"]>[0],
  block?: (relation: any) => void | Promise<void>,
): ReturnType<ReturnType<T["all"]>["inBatches"]> | Promise<void> {
  return (this.all() as any).inBatches(opts, block);
}

export function includes<T extends typeof Base>(
  this: T,
  ...associations: AssociationSpec[]
): Relation<InstanceType<T>> {
  return this.all().includes(...associations);
}

export function preload<T extends typeof Base>(
  this: T,
  ...associations: AssociationSpec[]
): Relation<InstanceType<T>> {
  return this.all().preload(...associations);
}

export function eagerLoad<T extends typeof Base>(
  this: T,
  ...associations: AssociationSpec[]
): Relation<InstanceType<T>> {
  return this.all().eagerLoad(...associations);
}

export function references<T extends typeof Base>(
  this: T,
  ...tables: string[]
): Relation<InstanceType<T>> {
  return this.all().references(...tables);
}

export function extending<T extends typeof Base, M extends Record<string, (...args: any[]) => any>>(
  this: T,
  mod: M,
): Relation<InstanceType<T>> & M;
export function extending<T extends typeof Base>(
  this: T,
  fn: (rel: Relation<InstanceType<T>>) => void,
): Relation<InstanceType<T>>;
export function extending<T extends typeof Base>(this: T): Relation<InstanceType<T>>;
export function extending<T extends typeof Base>(
  this: T,
  mod?: Record<string, (...args: any[]) => any> | ((rel: Relation<InstanceType<T>>) => void),
): Relation<InstanceType<T>> {
  return mod
    ? this.all().extending(mod as Record<string, (...args: any[]) => any>)
    : this.all().extending();
}

export function unscope<T extends typeof Base>(
  this: T,
  ...args: Parameters<Relation<InstanceType<T>>["unscope"]>
): Relation<InstanceType<T>> {
  return this.all().unscope(...args);
}

export function reselect<T extends typeof Base>(
  this: T,
  ...columns: Parameters<Relation<InstanceType<T>>["reselect"]>
): Relation<InstanceType<T>> {
  return this.all().reselect(...columns);
}

export function reorder<T extends typeof Base>(
  this: T,
  ...args: Parameters<Relation<InstanceType<T>>["reorder"]>
): Relation<InstanceType<T>> {
  return this.all().reorder(...args);
}

export function rewhere<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
): Relation<InstanceType<T>> {
  return this.all().rewhere(conditions);
}

export function regroup<T extends typeof Base>(
  this: T,
  ...columns: string[]
): Relation<InstanceType<T>> {
  return this.all().regroup(...columns);
}

export function having<T extends typeof Base>(
  this: T,
  condition: string,
  ...binds: unknown[]
): Relation<InstanceType<T>>;
export function having<T extends typeof Base>(
  this: T,
  condition: Record<string, unknown>,
): Relation<InstanceType<T>>;
export function having<T extends typeof Base>(
  this: T,
  condition: import("@blazetrails/arel").Nodes.Node,
): Relation<InstanceType<T>>;
export function having<T extends typeof Base>(
  this: T,
  condition: string | Record<string, unknown> | import("@blazetrails/arel").Nodes.Node,
  ...binds: unknown[]
): Relation<InstanceType<T>> {
  if (typeof condition === "string") return this.all().having(condition, ...binds);
  return this.all().having(condition as Record<string, unknown>);
}

export function lock<T extends typeof Base>(
  this: T,
  clause?: string | boolean,
): Relation<InstanceType<T>> {
  return this.all().lock(clause);
}

export function readonly<T extends typeof Base>(
  this: T,
  value?: boolean,
): Relation<InstanceType<T>> {
  return this.all().readonly(value);
}

export function withCte<T extends typeof Base>(
  this: T,
  ...ctes: Parameters<Relation<InstanceType<T>>["with"]>
): Relation<InstanceType<T>> {
  return this.all().with(...ctes);
}

export function withRecursive<T extends typeof Base>(
  this: T,
  ...ctes: Parameters<Relation<InstanceType<T>>["withRecursive"]>
): Relation<InstanceType<T>> {
  return this.all().withRecursive(...ctes);
}

export function annotate<T extends typeof Base>(
  this: T,
  ...comments: string[]
): Relation<InstanceType<T>> {
  return this.all().annotate(...comments);
}

export function excluding<T extends typeof Base>(
  this: T,
  ...records: unknown[]
): Relation<InstanceType<T>> {
  return this.all().excluding(...records);
}

export function or<T extends typeof Base>(
  this: T,
  other: Relation<InstanceType<T>>,
): Relation<InstanceType<T>> {
  return this.all().or(other);
}

export function and<T extends typeof Base>(
  this: T,
  other: Relation<InstanceType<T>>,
): Relation<InstanceType<T>> {
  return this.all().and(other);
}

export function inOrderOf<T extends typeof Base>(
  this: T,
  column: string | import("@blazetrails/arel").Nodes.Node,
  values: unknown[],
  filter?: boolean,
): Relation<InstanceType<T>> {
  return this.all().inOrderOf(column, values, filter);
}

export function strictLoading<T extends typeof Base>(
  this: T,
  value?: boolean,
): Relation<InstanceType<T>> {
  return this.all().strictLoading(value);
}

export function createWith<T extends typeof Base>(
  this: T,
  attrs: Record<string, unknown> | null,
): Relation<InstanceType<T>> {
  return this.all().createWith(attrs);
}

export function invertWhere<T extends typeof Base>(this: T): Relation<InstanceType<T>> {
  return this.all().invertWhere();
}

export function without<T extends typeof Base>(
  this: T,
  ...records: unknown[]
): Relation<InstanceType<T>> {
  return this.all().without(...records);
}

export function only<T extends typeof Base>(
  this: T,
  ...types: Parameters<Relation<InstanceType<T>>["only"]>
): Relation<InstanceType<T>> {
  return this.all().only(...types);
}

export function merge<T extends typeof Base, U extends Base>(
  this: T,
  other: Relation<U>,
): Relation<InstanceType<T>> {
  return this.all().merge(other);
}

export function asyncIds<T extends typeof Base>(this: T): Promise<unknown[]> {
  return this.all().asyncIds();
}

export function extractAssociated<T extends typeof Base>(this: T, name: string): Promise<Base[]> {
  return this.all().extractAssociated(name);
}

export function except<T extends typeof Base>(
  this: T,
  ...skips: Array<import("./relation/query-methods.js").ExceptSkip>
): Relation<InstanceType<T>> {
  return this.all().except(...skips);
}

export function calculate<T extends typeof Base>(
  this: T,
  operation: "count" | "sum" | "average" | "minimum" | "maximum",
  column?: Parameters<Relation<InstanceType<T>>["calculate"]>[1],
): ReturnType<Relation<InstanceType<T>>["calculate"]> {
  const rel = this.all();
  return rel.calculate(operation, column);
}

export function asyncCount<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["asyncCount"]>
): ReturnType<ReturnType<T["all"]>["asyncCount"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.asyncCount(...args) as ReturnType<ReturnType<T["all"]>["asyncCount"]>;
}

export function asyncAverage<T extends typeof Base>(
  this: T,
  column: string,
): ReturnType<Relation<InstanceType<T>>["asyncAverage"]> {
  return this.all().asyncAverage(column);
}

export function asyncMinimum<T extends typeof Base>(
  this: T,
  column: string,
): ReturnType<Relation<InstanceType<T>>["asyncMinimum"]> {
  return this.all().asyncMinimum(column);
}

export function asyncMaximum<T extends typeof Base>(
  this: T,
  column: string,
): ReturnType<Relation<InstanceType<T>>["asyncMaximum"]> {
  return this.all().asyncMaximum(column);
}

export function asyncSum<T extends typeof Base>(
  this: T,
  identityOrColumn?: Parameters<Relation<InstanceType<T>>["asyncSum"]>[0],
): ReturnType<Relation<InstanceType<T>>["asyncSum"]> {
  return this.all().asyncSum(identityOrColumn);
}

export function asyncPluck<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["asyncPluck"]>
): ReturnType<ReturnType<T["all"]>["asyncPluck"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.asyncPluck(...args) as ReturnType<ReturnType<T["all"]>["asyncPluck"]>;
}

export function asyncPick<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["asyncPick"]>
): ReturnType<ReturnType<T["all"]>["asyncPick"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.asyncPick(...args) as ReturnType<ReturnType<T["all"]>["asyncPick"]>;
}

export { withCte as with };
