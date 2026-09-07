import { Nodes } from "@blazetrails/arel";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { inOrderOf, wrap } from "@blazetrails/activesupport";
import { pluralize } from "@blazetrails/activesupport/core-ext/string/inflections";
import {
  ArgumentError,
  RangeError as ActiveModelRangeError,
  sanitizeForMassAssignment as sanitizeForbiddenAttributes,
} from "@blazetrails/activemodel";
import { RecordNotFound, SoleRecordExceeded } from "../errors.js";
import { queryConstraintsList as _queryConstraintsListFn } from "../persistence.js";
import { compactUniqIds, compactUniqTuples } from "./compact-uniq-ids.js";
import { isBaseInstance } from "./predicate-builder/is-base-instance.js";

const ONE_AS_ONE = "1 AS one";

export interface NormalizedFindIds {
  readonly ids: unknown[];

  readonly wantArray: boolean;

  readonly tuples: unknown[][] | null;

  readonly emptyArray?: boolean;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function normalizeFindArgs(
  modelName: string,
  pk: string | string[],
  args: unknown[],
): NormalizedFindIds {
  const composite = Array.isArray(pk);

  if (args.length === 0) {
    throw new RecordNotFound(`Couldn't find ${modelName} without an ID`, modelName, String(pk));
  }

  const [first, ...rest] = args;

  if (!composite && Array.isArray(first) && first.length === 0) {
    return { ids: [], wantArray: true, tuples: null, emptyArray: true };
  }

  let ids: unknown[];
  let wantArray: boolean;

  if (composite) {
    const expectsArray = Array.isArray(first) && Array.isArray(first[0]);
    if (rest.length > 0 && args.every((x) => !Array.isArray(x))) {
      ids = [args];
    } else {
      ids = compactUniqTuples(expectsArray ? (first as unknown[]) : args);
    }
    wantArray = expectsArray || ids.length !== 1;
  } else if (rest.length > 0) {
    ids = compactUniqIds(args.flat(Infinity));
    wantArray = true;
  } else if (Array.isArray(first)) {
    ids = compactUniqIds((first as unknown[]).flat(Infinity));
    wantArray = true;
  } else {
    ids = [first];
    wantArray = false;
  }

  if (ids.length === 0) {
    throw new RecordNotFound(`Couldn't find ${modelName} without an ID`, modelName, String(pk));
  }

  if (composite) {
    const pkArity = pk.length;
    for (const id of ids) {
      if (!Array.isArray(id) || id.length !== pkArity) {
        throw new RecordNotFound(
          `${modelName}: composite primary key requires a ${pkArity}-element array, got ${String(id)}`,
          modelName,
          String(pk),
          id,
        );
      }
    }
    return { ids, wantArray, tuples: ids as unknown[][] };
  }

  return { ids, wantArray, tuples: null };
}

function formatNotFoundAllMessage(
  name: string,
  key: string,
  messageIds: string,
  conditions: string,
  resultSize: number | undefined,
  expectedSize: number | undefined,
  notFoundIds: unknown[] | undefined,
): string {
  let error = `Couldn't find all ${pluralize(name)} with '${key}': `;
  error += `(${messageIds})${conditions} (found ${resultSize} results, but was looking for ${expectedSize}).`;
  if (notFoundIds) {
    error +=
      ` Couldn't find ${pluralize(name, notFoundIds.length)}` +
      ` with ${pluralize(key, notFoundIds.length)} ${notFoundIds.flat(Infinity).join(", ")}.`;
  }
  return error;
}

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
  /** @internal */
  _conn(): { isTransactionOpen(): boolean };
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
    key?: string,
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
  exists(conditions?: unknown): Promise<boolean>;
  /** @internal */
  constructRelationForExists(conditions: unknown): any;
  /** @internal */
  readonly isEagerLoading: boolean;
  /** @internal */
  _checkEagerLoadable(): void;
  /** @internal */
  applyJoinDependency<R>(
    options: { eagerLoading?: boolean },
    block: (relation: any) => R | Promise<R>,
  ): Promise<R>;
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

export async function find(this: FinderRelation, ...args: unknown[]): Promise<any> {
  return findWithIds.call(this, args);
}

export async function findBy(
  this: FinderRelation,
  arg: unknown,
  ...args: unknown[]
): Promise<any | null> {
  try {
    return await this.where(arg, ...args).take();
  } catch (err) {
    if (err instanceof ActiveModelRangeError) return null;
    throw err;
  }
}

export async function findByBang(
  this: FinderRelation,
  arg: unknown,
  ...args: unknown[]
): Promise<any> {
  const record = await findBy.call(this, arg, ...args);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this.where(arg, ...args));
  }
  return record;
}

export async function findSoleBy(this: FinderRelation, ...conditions: unknown[]): Promise<any> {
  return sole.call((this.where as any)(...conditions));
}

export async function first(this: FinderRelation, n?: number): Promise<any> {
  if (n !== undefined) return this.findNthWithLimit(0, n);
  return findNth.call(this, 0);
}

export async function firstBang(this: FinderRelation): Promise<any> {
  const record = await first.call(this);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this);
  }
  return record;
}

export async function last(this: FinderRelation, n?: number): Promise<any> {
  if (this.isLoaded || (this as any).limitValue != null || (this as any).offsetValue != null) {
    return findLast.call(this, n);
  }
  let result: any = orderedRelation.call(this).limit(n ?? null);
  result = result.reverseOrderBang();
  if (n !== undefined) return (await result.toArray()).reverse();
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

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export async function findNthFromLast(this: FinderRelation, index: number): Promise<any | null> {
  if (this.isLoaded) {
    const records: any[] = await this.records();
    return records[records.length - index] ?? null;
  }
  const relation: any = orderedRelation.call(this);
  if (
    relation.orderValues.length === 0 ||
    relation.limitValue != null ||
    relation.offsetValue != null
  ) {
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

/** @missingRailsCall size — PERMANENT */
export async function exists(
  this: FinderRelation,
  conditions?: Record<string, unknown> | unknown,
): Promise<boolean> {
  if (this.isNullRelation()) return false;
  if (isBaseInstance(conditions)) {
    throw new ArgumentError(
      "You are passing an instance of ActiveRecord::Base to `exists?`. " +
        "Please pass the id of the object by calling `.id`.",
    );
  }
  if (conditions === false || conditions === null || this.limitValue === 0) return false;
  this._checkEagerLoadable();
  if (this.isEagerLoading) {
    return this.applyJoinDependency({ eagerLoading: false }, (relation) =>
      relation.exists(conditions),
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

export async function include(this: FinderRelation, record: any): Promise<boolean> {
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

  return this.exists(id);
}

export const member = include;

/** @noRailsEquivalent PERMANENT */
function whereCompositePrimaryKeyIn(relation: any, pk: string[], ids: unknown[]): any {
  const tuples = ids as unknown[][];
  let rel = relation.where(buildPkWhere(pk, tuples[0]));
  for (let i = 1; i < tuples.length; i++) {
    rel = rel.or(relation.where(buildPkWhere(pk, tuples[i])));
  }
  return rel;
}

/** @missingRailsCall size — PERMANENT */
export function raiseRecordNotFoundExceptionBang(
  this: FinderRelation,
  ids?: unknown,
  resultSize?: number,
  expectedSize?: number,
  key?: string,
  notFoundIds?: unknown[],
): never {
  const conditions = this.whereClause.isEmpty()
    ? ""
    : ` [${this.arel().whereSql(this.model)?.value ?? ""}]`;

  const name = this.model.name;
  key ??= String(this.model.primaryKey);

  if (ids === undefined || ids === null) {
    throw new RecordNotFound(
      `Couldn't find ${name}${conditions ? ` with${conditions}` : ""}`,
      name,
      key,
    );
  }

  const wrapped = wrap(ids);
  if (wrapped.length === 1) {
    throw new RecordNotFound(
      `Couldn't find ${name} with '${key}'=${ids}${conditions}`,
      name,
      key,
      ids,
    );
  }

  const error = formatNotFoundAllMessage(
    name,
    key,
    (ids as unknown[]).flat(Infinity).join(", "),
    conditions,
    resultSize,
    expectedSize,
    notFoundIds,
  );
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
  exists,
  include,
  member,
  raiseRecordNotFoundExceptionBang,
  constructRelationForExists,
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
  if (Array.isArray(conditions)) {
    const [sql, ...binds] = conditions as unknown[];
    if (sql !== undefined) relation = relation.where(sql, ...binds);
  } else if (conditions instanceof Nodes.Node) {
    relation = relation.where(conditions);
  } else if (conditions !== null && typeof conditions === "object") {
    if (Object.keys(conditions).length > 0) relation = relation.where(conditions);
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

/** @internal */
export function usingLimitableReflections(
  this: FinderRelation,
  reflections: Array<{ isCollection(): boolean }>,
): boolean {
  return reflections.every((r) => !r.isCollection());
}

/**
 * @internal
 * @missingRailsCall first — PERMANENT
 */
export async function findWithIds(this: FinderRelation, ids: unknown[]): Promise<any> {
  const normalized = normalizeFindArgs(this.model.name, this.primaryKey, ids);
  if (normalized.emptyArray) return [];
  const expectsArray = normalized.wantArray;
  if (normalized.ids.length === 1) {
    const result = await findOne.call(this, normalized.ids[0]);
    return expectsArray ? [result] : result;
  }
  return (this as any).findSome(normalized.ids);
}

/** @internal */
export async function findOne(this: FinderRelation, id: unknown): Promise<any> {
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

/** @internal */
export async function findSome(this: FinderRelation, ids: unknown[]): Promise<any[]> {
  if (this.orderValues.length === 0) return (this as any).findSomeOrdered(ids);

  const pk = this.primaryKey;
  let relation = Array.isArray(pk)
    ? whereCompositePrimaryKeyIn(this, pk, ids)
    : (this as any).where({ [pk]: ids });
  if ((this as any).selectValues.length > 0) {
    relation = relation.select(this.table.get(pk as string));
  }
  const records = await relation.toArray();

  let expectedSize = ids.length;
  const limitValue: number | string | null = (this as any).limitValue ?? null;
  const offsetValue: number | string | null = (this as any).offsetValue ?? null;
  if (limitValue !== null && typeof limitValue !== "number") {
    throw new ArgumentError("comparison of Integer with String failed");
  }
  if (offsetValue !== null && typeof offsetValue !== "number") {
    throw new TypeError("String can't be coerced into Integer");
  }
  if (limitValue !== null && ids.length > limitValue) expectedSize = limitValue;
  if (offsetValue !== null && ids.length - offsetValue < expectedSize)
    expectedSize = ids.length - offsetValue;

  if (records.length !== expectedSize) {
    this.raiseRecordNotFoundExceptionBang(ids, records.length, expectedSize);
  }
  return records;
}

/** @internal */
export async function findSomeOrdered(this: FinderRelation, ids: unknown[]): Promise<any[]> {
  const offsetValue: number | string = (this as any).offsetValue ?? 0;
  const limitValue: number | string | null = (this as any).limitValue ?? null;
  if (typeof offsetValue !== "number" || (limitValue !== null && typeof limitValue !== "number")) {
    throw new TypeError("no implicit conversion of String into Integer");
  }
  ids = ids.slice(offsetValue, offsetValue + (limitValue ?? ids.length));

  let relation = (this as any).except("limit", "offset");
  const pk = this.model.primaryKey;
  relation = Array.isArray(pk)
    ? whereCompositePrimaryKeyIn(relation, pk, ids)
    : relation.where({ [this.model.primaryKey as string]: ids });
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

/**
 * @internal
 * @missingRailsCall first — PERMANENT
 */
export async function findTake(this: FinderRelation): Promise<any | null> {
  if (this.isLoaded) return (await this.records())[0] ?? null;
  (this as any)._take ??= (await (this as any).limit(1).records())[0] ?? null;
  return (this as any)._take;
}

/**
 * @internal
 * @missingRailsCall take — PERMANENT
 */
export async function findTakeWithLimit(this: FinderRelation, limit: number): Promise<any[]> {
  if (this.isLoaded) return (await this.records()).slice(0, limit);
  return (this as any).limit(limit).toArray();
}

/**
 * @internal
 * @missingRailsCall first — PERMANENT
 */
export async function findNth(this: FinderRelation, index: number): Promise<any | null> {
  const offsets = ((this as any)._offsets ??= new Map<number, any>());
  let record = offsets.get(index) ?? null;
  if (record == null) {
    record = (await this.findNthWithLimit(index, 1))[0] ?? null;
    offsets.set(index, record);
  }
  return record;
}

/**
 * @internal
 * @missingRailsCall last — PERMANENT
 */
export async function findLast(this: FinderRelation, limit?: number): Promise<any> {
  const records: any[] = await this.records();
  if (limit === undefined) return records[records.length - 1] ?? null;
  return limit === 0 ? [] : records.slice(-limit);
}

/**
 * @internal
 * @missingRailsCall empty? — PERMANENT
 */
export function orderedRelation(this: FinderRelation): any {
  const mc = this.model as any;
  const pk = this.primaryKey;
  const implicitOrder: string | null | undefined = mc?.implicitOrderColumn;
  const constraintsList: string[] | null = mc ? _queryConstraintsListFn.call(mc) : null;
  if (this.orderValues.length === 0 && (implicitOrder || constraintsList != null || pk)) {
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
