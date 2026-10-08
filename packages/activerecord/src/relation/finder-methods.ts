import { Nodes } from "@blazetrails/arel";
import {
  NoMethodError,
  rbObjClassname,
  rbInspect,
  compact,
  first as aryFirst,
  isEmpty,
  last as aryLast,
  take as aryTake,
  uniq,
  arySlice,
  cmp,
  numericMinus,
  rbCmpint,
} from "@blazetrails/ruby-compat";
import { inOrderOf, isPlainObject, wrap } from "@blazetrails/activesupport";
import { pluralize } from "@blazetrails/activesupport/core-ext/string/inflections";
import {
  ArgumentError,
  sanitizeForMassAssignment as sanitizeForbiddenAttributes,
} from "@blazetrails/activemodel";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { RecordNotFound, SoleRecordExceeded, UnknownPrimaryKey } from "../errors.js";
import { queryConstraintsList as _queryConstraintsListFn } from "../persistence.js";
import { ActiveRecord } from "../namespaces.js";
import type { JoinDependency } from "../associations/join-dependency.js";
import { stripThenable } from "@blazetrails/activesupport";

export const ONE_AS_ONE = "1 AS one";

interface FinderRelation {
  model: FinderRelation["_model"];
  table: { get(name: string): Nodes.Node };
  primaryKey: string | string[];
  _model: {
    name: string;
    primaryKey: string | string[];
    compositePrimaryKey: boolean;
    implicitOrderColumn?: string | null;
    createBang(attrs: any): Promise<any>;
    connectionPool(): { withConnectionSync<R>(block: (c: DatabaseAdapter) => R): R };
    transaction<R>(
      fn: (tx: any) => Promise<R>,
      options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
    ): Promise<R | undefined>;
  };
  _isNone: boolean;
  /** @internal */
  isNullRelation(): boolean;
  limitValue: number | string | null;
  offsetValue: number | string | null;
  orderValues: unknown[];
  createWithValue: Record<string, unknown>;
  scopeForCreate(): Record<string, unknown>;
  clone(): any;
  whereClause: { isEmpty(): boolean; isContradiction(): boolean };
  havingClause: { isEmpty(): boolean };
  arel(): { whereSql(engine: unknown): Nodes.SqlLiteral | null };
  where(conditions: unknown, ...rest: unknown[]): any;
  findBy(conditions: unknown): Promise<any>;
  findByBang(conditions: unknown): Promise<any>;
  limit(n: number): any;
  order(...args: any[]): any;
  reverseOrder(): any;
  toArray(): Promise<any[]>;
  isLoaded: boolean;
  records(): Promise<any[]>;
  raiseRecordNotFoundExceptionBang(
    ids?: unknown,
    resultSize?: number,
    expectedSize?: number,
    key?: string | string[],
    notFoundIds?: unknown[],
  ): never;
  /** @internal */
  findTake(): Promise<any | null>;
  /** @internal */
  findTakeWithLimit(limit: number): Promise<any[]>;
  /** @internal */
  findNthWithLimit(index: number, limit: number): Promise<any[]>;
  /** @internal */
  findNthFromLast(index: number): Promise<any | null>;
  /** @internal */
  isExists(conditions?: unknown): Promise<boolean>;
  /** @internal */
  constructRelationForExists(conditions: unknown): any;
  /** @internal */
  readonly isEagerLoading: boolean;
  /** @internal */
  applyJoinDependency<R>(
    options: { eagerLoading?: boolean },
    block: (relation: any) => R | Promise<R>,
  ): Promise<R>;
  /** @internal */
  usingLimitableReflections(reflections: Array<{ isCollection(): boolean }>): boolean;
  readonly hasLimitOrOffset: boolean;
  groupValues: unknown[];
  eagerLoadValues: unknown[];
  includesValues: unknown[];
  joinsValues: unknown[];
  leftOuterJoinsValues: unknown[];
  except(...skips: string[]): FinderRelation;
  joinsBang(...args: unknown[]): FinderRelation;
  /** @internal */
  constructJoinDependency(associations: unknown[], joinType: unknown): JoinDependency;
  /** @internal */
  selectAssociationList(associations: unknown[]): unknown[];
  /** @internal */
  _materializeDeferredDistinctPkPredicates(): Promise<void>;
  arel(): { ast: unknown };
  skipQueryCacheIfNecessary<R>(block: () => R): R;
  withConnection<R>(block: (c: any) => R): R;
}

function buildPkWhere(pk: string[], tuple: unknown[]): Record<string, unknown> {
  const conditions: Record<string, unknown> = {};
  pk.forEach((col, i) => {
    conditions[col] = tuple[i];
  });
  return conditions;
}

export function find(this: FinderRelation, block: (record: any) => unknown): Promise<any>;
export function find(this: FinderRelation, ...args: unknown[]): Promise<any>;
export async function find(this: FinderRelation, ...args: unknown[]): Promise<any> {
  const block = args[args.length - 1];
  if (typeof block === "function") {
    const ifnoneArgs = args.slice(0, -1);
    if (ifnoneArgs.length > 1) {
      throw new ArgumentError(
        `wrong number of arguments (given ${ifnoneArgs.length}, expected 0..1)`,
      );
    }
    const ifnone = ifnoneArgs[0];
    for (const record of await this.toArray()) {
      if (await (block as (record: unknown) => unknown)(record)) return record;
    }
    if (ifnone == null) return null;
    if (typeof ifnone !== "function") {
      const desc =
        typeof ifnone === "boolean" ? String(ifnone) : `an instance of ${rbObjClassname(ifnone)}`;
      throw new NoMethodError(`undefined method \`call' for ${desc}`);
    }
    return await ifnone();
  }
  return findWithIds.call(this, ...args);
}

export async function findBy(
  this: FinderRelation,
  arg: unknown,
  ...args: unknown[]
): Promise<any | null> {
  if (arguments.length === 0) {
    throw new ArgumentError("wrong number of arguments (given 0, expected 1+)");
  }
  return this.where(arg, ...args).take();
}

export async function findByBang(
  this: FinderRelation,
  arg: unknown,
  ...args: unknown[]
): Promise<any> {
  if (arguments.length === 0) {
    throw new ArgumentError("wrong number of arguments (given 0, expected 1+)");
  }
  return this.where(arg, ...args).takeBang();
}

export async function findSoleBy(this: FinderRelation, ...conditions: unknown[]): Promise<any> {
  return sole.call((this.where as any)(...conditions));
}

export async function first(this: FinderRelation, limit?: number): Promise<any> {
  if (limit !== undefined) return this.findNthWithLimit(0, limit);
  return findNth.call(this, 0);
}

export async function firstBang(this: FinderRelation): Promise<any> {
  const record = await first.call(this);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this);
  }
  return record;
}

export async function last(this: FinderRelation, limit?: number): Promise<any> {
  if (this.isLoaded || (this as any).limitValue != null || (this as any).offsetValue != null) {
    return findLast.call(this, limit);
  }
  let result: any = orderedRelation.call(this).limit(limit ?? null);
  result = result.reverseOrderBang();
  if (limit !== undefined) return (await result.toArray()).reverse();
  return await first.call(result);
}

export async function lastBang(this: FinderRelation): Promise<any> {
  const record = await last.call(this);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this);
  }
  return record;
}

export async function sole(this: FinderRelation): Promise<any> {
  const [found, undesired] = await first.call(this, 2);

  if (found == null) {
    raiseRecordNotFoundExceptionBang.call(this);
  } else if (undesired == null) {
    return found;
  } else {
    throw new SoleRecordExceeded(this._model);
  }
}

export async function take(this: FinderRelation, limit?: number): Promise<any> {
  return limit !== undefined ? this.findTakeWithLimit(limit) : this.findTake();
}

export async function takeBang(this: FinderRelation): Promise<any> {
  const record = await take.call(this);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this);
  }
  return record;
}

/** @internal */
export async function findNthWithLimit(
  this: FinderRelation,
  index: number,
  limit: number,
): Promise<any[]> {
  if (this.isLoaded) {
    return (await this.records()).slice(index, index + limit) ?? [];
  }
  let relation: any = orderedRelation.call(this);
  const limitValue = (this as any).limitValue;
  if (limitValue != null) {
    if (typeof limitValue !== "number") {
      throw new NoMethodError("undefined method `-' for an instance of String");
    }
    limit = Math.min(limitValue - index, limit);
  }
  if (limit <= 0) return [];
  if (index > 0) {
    relation = relation.offset(((this as any).offsetValue ?? 0) + index);
  }
  return relation.limit(limit).toArray();
}

/** @internal */
export async function findNthFromLast(this: FinderRelation, index: number): Promise<any | null> {
  if (this.isLoaded) {
    const records: any[] = await this.records();
    return records[records.length - index] ?? null;
  }
  const relation: any = orderedRelation.call(this);
  if (isEmpty(relation.orderValues) || relation.hasLimitOrOffset) {
    const records = await relation.records();
    return records[records.length - index] ?? null;
  }
  return relation
    .reverseOrder()
    .offset(index - 1)
    .first();
}

export async function second(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 1);
}

export async function third(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 2);
}

export async function fourth(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 3);
}

export async function fifth(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 4);
}

export async function fortyTwo(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 41);
}

export async function secondToLast(this: FinderRelation): Promise<any | null> {
  return this.findNthFromLast(2);
}

export async function thirdToLast(this: FinderRelation): Promise<any | null> {
  return this.findNthFromLast(3);
}

function bangFinder(finder: (this: FinderRelation) => Promise<any | null>) {
  return async function (this: FinderRelation): Promise<any> {
    const record = await finder.call(this);
    if (!record) {
      raiseRecordNotFoundExceptionBang.call(this);
    }
    return record;
  };
}

export const secondBang = bangFinder(second);
export const thirdBang = bangFinder(third);
export const fourthBang = bangFinder(fourth);
export const fifthBang = bangFinder(fifth);
export const fortyTwoBang = bangFinder(fortyTwo);
export const secondToLastBang = bangFinder(secondToLast);
export const thirdToLastBang = bangFinder(thirdToLast);

export async function isExists(
  this: FinderRelation,
  conditions?: Record<string, unknown> | unknown,
): Promise<boolean> {
  if (this.isNullRelation()) return false;
  if (conditions instanceof ActiveRecord.Base) {
    throw new ArgumentError(
      "You are passing an instance of ActiveRecord::Base to `exists?`. " +
        "Please pass the id of the object by calling `.id`.",
    );
  }
  if (conditions === false || conditions === null || this.limitValue === 0) return false;
  if (this.isEagerLoading) {
    return this.applyJoinDependency({ eagerLoading: false }, (relation) =>
      relation.isExists(conditions),
    );
  }
  const relation = this.constructRelationForExists(conditions);
  await relation._materializeDeferredDistinctPkPredicates();
  if (relation.whereClause.isContradiction()) return false;
  return await this.skipQueryCacheIfNecessary(() =>
    this.withConnection(
      async (c) => (await c.selectRows(relation.arel(), `${this.model.name} Exists?`)).length === 1,
    ),
  );
}

export async function isInclude(this: FinderRelation, record: any): Promise<boolean> {
  if (!(record instanceof (this.model as unknown as new (...args: any[]) => any))) return false;
  if (
    this.isLoaded ||
    this.offsetValue !== null ||
    this.limitValue !== null ||
    !this.havingClause.isEmpty()
  ) {
    const records = await this.toArray();
    return records.some((r) => r.equals(record));
  }
  const recordClass = record.constructor;
  const id = recordClass.compositePrimaryKey
    ? Object.fromEntries(
        (recordClass.primaryKey as string[]).map((column, index) => [column, record.id[index]]),
      )
    : record.id;

  return this.isExists(id);
}

export const isMember = isInclude;

/** @missingRailsName size — PERMANENT */
export function raiseRecordNotFoundExceptionBang(
  this: FinderRelation,
  ids?: unknown,
  resultSize?: number,
  expectedSize?: number,
  key?: string | string[],
  notFoundIds?: unknown[],
): never {
  const model = this.model;
  const conditions = this.whereClause.isEmpty()
    ? ""
    : ` [${
        this.arel()
          .whereSql({
            withConnection: <T>(block: (connection: DatabaseAdapter) => T): T =>
              (model as any).connectionPool().withConnectionSync(block),
          })
          ?.toString() ?? ""
      }]`;

  const name = this.model.name;
  key ??= this.model.primaryKey;
  const keyToS = Array.isArray(key) ? rbInspect(key) : key;
  const idsToS = Array.isArray(ids) ? rbInspect(ids) : ids;

  if (ids === undefined || ids === null) {
    throw new RecordNotFound(
      `Couldn't find ${name}${conditions ? ` with${conditions}` : ""}`,
      name,
      key,
    );
  }

  if (wrap(ids).length === 1) {
    throw new RecordNotFound(
      `Couldn't find ${name} with '${keyToS}'=${idsToS}${conditions}`,
      name,
      key,
      ids,
    );
  }

  let error = `Couldn't find all ${pluralize(name)} with '${keyToS}': `;
  error += `(${(ids as unknown[]).flat(Infinity).join(", ")})${conditions} (found ${resultSize} results, but was looking for ${expectedSize}).`;
  if (notFoundIds) {
    error +=
      ` Couldn't find ${pluralize(name, notFoundIds.length)}` +
      ` with ${pluralize(keyToS, notFoundIds.length)} ${notFoundIds.flat(Infinity).join(", ")}.`;
  }
  throw new RecordNotFound(error, name, key, ids);
}

export const FinderMethods = {
  find,
  findBy,
  findByBang,
  findSoleBy,
  first,
  firstBang,
  last,
  lastBang,
  sole,
  take,
  takeBang,
  second,
  secondBang,
  third,
  thirdBang,
  fourth,
  fourthBang,
  fifth,
  fifthBang,
  fortyTwo,
  fortyTwoBang,
  secondToLast,
  secondToLastBang,
  thirdToLast,
  thirdToLastBang,
  isExists,
  isInclude,
  isMember,
  raiseRecordNotFoundExceptionBang,
  constructRelationForExists,
  applyJoinDependency,
  usingLimitableReflections,
  findWithIds,
  findOne,
  findSome,
  findSomeOrdered,
  findTake,
  findTakeWithLimit,
  findNth,
  findNthWithLimit,
  findNthFromLast,
  findLast,
  orderedRelation,
  _orderColumns,
} as const;

/** @internal */
export function constructRelationForExists(this: FinderRelation, conditions: unknown): any {
  if (conditions !== undefined) {
    conditions = sanitizeForbiddenAttributes(conditions as Record<string, unknown>);
  }
  let relation: any;
  if ((this as any).distinctValue && (this as any).offsetValue != null) {
    relation = (this as any).except("order").limitBang(1);
  } else {
    relation = (this as any)
      .except("select", "distinct", "order")
      ._selectBang(new Nodes.SqlLiteral(ONE_AS_ONE))
      .limitBang(1);
  }
  if (conditions === undefined) {
    return relation;
  }
  if (Array.isArray(conditions) || isPlainObject(conditions) || conditions instanceof Map) {
    if (!isEmpty(conditions)) relation = relation.where(conditions);
  } else {
    const pk = this.primaryKey;
    if (Array.isArray(pk)) {
      relation = relation.where(buildPkWhere(pk, conditions as unknown[]));
    } else {
      relation = relation.where({ [pk]: conditions });
    }
  }
  return relation;
}

/**
 * @internal
 * @missingRailsCall with_connection — CONVERGEABLE relation-layer-with-connection-receipts-are-not-the-tosql-sites
 */
export function applyJoinDependency<R>(
  this: FinderRelation,
  { eagerLoading = this.groupValues.length === 0 }: { eagerLoading?: boolean } = {},
  block?: (relation: any, joinDependency: JoinDependency) => R | Promise<R>,
): unknown {
  const yieldRelation = (): unknown => {
    if (block) {
      return block(relation, joinDependency);
    } else {
      return stripThenable(relation);
    }
  };
  const joinDependency = this.constructJoinDependency(
    [...new Set([...this.eagerLoadValues, ...this.includesValues])],
    Nodes.OuterJoin,
  );
  const relation = this.except("includes", "eagerLoad", "preload").joinsBang(joinDependency);

  if (
    eagerLoading &&
    this.hasLimitOrOffset &&
    !(
      this.usingLimitableReflections(joinDependency.reflections as never) &&
      this.usingLimitableReflections(
        this.constructJoinDependency(
          this.selectAssociationList(this.joinsValues).concat(
            this.selectAssociationList(this.leftOuterJoinsValues),
          ),
          null,
        ).reflections as never,
      )
    )
  ) {
    return Promise.resolve(
      this.skipQueryCacheIfNecessary(() =>
        this.model.connectionPool().withConnectionSync((c: DatabaseAdapter) =>
          (
            c as unknown as {
              distinctRelationForPrimaryKey(rel: unknown): Promise<void>;
            }
          ).distinctRelationForPrimaryKey(relation),
        ),
      ),
    ).then(yieldRelation);
  }

  return yieldRelation();
}

/** @internal */
export function usingLimitableReflections(
  this: FinderRelation,
  reflections: Array<{ isCollection(): boolean }>,
): boolean {
  return reflections.every((r) => !r.isCollection());
}

/** @internal */
export async function findWithIds(this: FinderRelation, ...ids: unknown[]): Promise<any> {
  if (this.primaryKey == null) throw new UnknownPrimaryKey(this.model as any);

  if (this.model.compositePrimaryKey && !Array.isArray(ids[0])) {
    throw new NoMethodError(
      ids[0] == null
        ? "undefined method 'first' for nil"
        : `undefined method 'first' for an instance of ${rbObjClassname(ids[0])}`,
    );
  }
  const expectsArray = this.model.compositePrimaryKey
    ? Array.isArray(aryFirst(aryFirst(ids) as unknown[]))
    : Array.isArray(aryFirst(ids));

  if (expectsArray && isEmpty(aryFirst(ids) as unknown[])) return [];

  if (expectsArray) ids = aryFirst(ids) as unknown[];

  ids = uniq(compact(ids));

  const modelName = this.model.name;

  switch (ids.length) {
    case 0: {
      const errorMessage = `Couldn't find ${modelName} without an ID`;
      throw new RecordNotFound(errorMessage, modelName, this.primaryKey);
    }
    case 1: {
      const result = await findOne.call(this, aryFirst(ids));
      return expectsArray ? [result] : result;
    }
    default:
      return (this as any).findSome(ids);
  }
}

/** @internal */
export async function findOne(this: FinderRelation, id: unknown): Promise<any> {
  if (id instanceof ActiveRecord.Base) {
    throw new ArgumentError(
      "You are passing an instance of ActiveRecord::Base to `find`. " +
        "Please pass the id of the object by calling `.id`.",
    );
  }

  const pk = this.primaryKey;
  const relation = Array.isArray(pk)
    ? (this as any).where(buildPkWhere(pk, id as unknown[]))
    : (this as any).where({ [pk]: id });
  const record = await relation.take();
  if (!record) {
    this.raiseRecordNotFoundExceptionBang(id, 0, 1);
  }
  return record;
}

/**
 * @internal
 * @missingRailsName size — PERMANENT
 */
export async function findSome(this: FinderRelation, ids: unknown[]): Promise<any[]> {
  if (this.orderValues.length === 0) return (this as any).findSomeOrdered(ids);

  const pk = this.primaryKey;
  let relation = (this as any).where(new Map([[pk, ids]]));
  if ((this as any).selectValues.length > 0) {
    relation = relation.select(this.table.get(pk as string));
  }
  const result = await relation.toArray();

  const limitValue = this.limitValue;
  const offsetValue = this.offsetValue;
  let expectedSize: unknown;
  if (limitValue != null && rbCmpint(cmp(ids.length, limitValue), ids.length, limitValue) > 0) {
    expectedSize = limitValue;
  } else {
    expectedSize = ids.length;
  }

  if (
    offsetValue != null &&
    rbCmpint(cmp(numericMinus(ids.length, offsetValue), expectedSize), ids.length, expectedSize) < 0
  ) {
    expectedSize = numericMinus(ids.length, offsetValue);
  }

  if (result.length === expectedSize) {
    return result;
  } else {
    this.raiseRecordNotFoundExceptionBang(ids, result.length, expectedSize as number);
  }
}

/**
 * @internal
 * @missingRailsName size — PERMANENT
 */
export async function findSomeOrdered(this: FinderRelation, ids: unknown[]): Promise<any[]> {
  ids =
    (arySlice(ids, this.offsetValue ?? 0, this.limitValue ?? ids.length) as unknown[] | null) ?? [];

  let relation = (this as any).except("limit", "offset");
  const pk = this.model.primaryKey;
  relation = relation.where(new Map([[pk, ids]]));
  if ((this as any).selectValues.length > 0) {
    relation = relation.select(this.table.get(this.model.primaryKey as string));
  }
  const result: any[] = await relation.records();

  if (result.length === ids.length) {
    const composite = Array.isArray(pk);
    const keyOf = (id: unknown): unknown => (composite ? String(id) : id);
    return inOrderOf(
      result,
      (record: any) => keyOf(record.id),
      ids.map((id) => keyOf((this.model as any).typeForAttribute(String(pk)).cast(id))),
    );
  } else {
    this.raiseRecordNotFoundExceptionBang(ids, result.length, ids.length);
  }
}

/** @internal */
export async function findTake(this: FinderRelation): Promise<any | null> {
  if (this.isLoaded) return aryFirst(await this.records()) ?? null;
  (this as any)._take ??= aryFirst(await (this as any).limit(1).records()) ?? null;
  return (this as any)._take;
}

/** @internal */
export async function findTakeWithLimit(this: FinderRelation, limit: number): Promise<any[]> {
  if (this.isLoaded) return aryTake(await this.records(), limit);
  return (this as any).limit(limit).toArray();
}

/** @internal */
export async function findNth(this: FinderRelation, index: number): Promise<any | null> {
  const offsets = ((this as any)._offsets ??= new Map<number, any>());
  let record = offsets.get(index) ?? null;
  if (record == null) {
    record = aryFirst(await this.findNthWithLimit(index, 1)) ?? null;
    offsets.set(index, record);
  }
  return record;
}

/** @internal */
export async function findLast(this: FinderRelation, limit?: number): Promise<any> {
  const records: any[] = await this.records();
  return limit != null ? aryLast(records, limit) : (aryLast(records) ?? null);
}

/** @internal */
export function orderedRelation(this: FinderRelation): any {
  const mc = this.model as any;
  const pk = this.primaryKey;
  const implicitOrder: string | null | undefined = mc?.implicitOrderColumn;
  const constraintsList: string[] | null = mc ? _queryConstraintsListFn.call(mc) : null;
  if (isEmpty(this.orderValues) && (implicitOrder || constraintsList != null || pk)) {
    const cols = _orderColumns.call(this);
    if (cols.length > 0) {
      return (this as any).order(
        cols.map((column: string) => (this as any).table.get(column).asc()),
      );
    }
  }
  return this;
}

/** @internal */
export function _orderColumns(this: FinderRelation): string[] {
  const mc = this.model as any;
  const pk = mc?.primaryKey;
  const implicitOrder: string | null | undefined = mc?.implicitOrderColumn;
  const constraintsList: string[] | null = mc ? _queryConstraintsListFn.call(mc) : null;

  const oc: string[] = [];
  if (implicitOrder) oc.push(implicitOrder);
  if (constraintsList) oc.push(...constraintsList);
  if (pk && constraintsList == null) {
    const pkCols = Array.isArray(pk) ? pk : [pk];
    oc.push(...pkCols);
  }
  return [...new Set(oc.filter(Boolean))];
}
