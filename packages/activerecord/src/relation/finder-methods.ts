/**
 * Finder methods: find, findBy, first, last, take, sole, and ordinal accessors.
 *
 * These are the real implementations behind Relation's finder methods.
 * Each function uses this-typing and is mixed into Relation via interface
 * merge + prototype assignment.
 *
 * Mirrors: ActiveRecord::FinderMethods
 */

import { RecordNotFound, SoleRecordExceeded } from "../errors.js";
import { RecordInvalid } from "../validations.js";

interface FinderRelation {
  _modelClass: {
    name: string;
    primaryKey: string | string[];
    compositePrimaryKey: boolean;
    createBang(attrs: any): Promise<any>;
  };
  _isNone: boolean;
  _limitValue: number | null;
  _offsetValue: number | null;
  _orderClauses: any[];
  _rawOrderClauses: string[];
  _createWithAttrs: Record<string, unknown>;
  _scopeAttributes(): Record<string, unknown>;
  _clone(): any;
  where(conditions: Record<string, unknown>): any;
  limit(n: number): any;
  order(...args: any[]): any;
  reverseOrder(): any;
  toArray(): Promise<any[]>;
}

function buildPkWhere(rel: FinderRelation, id: unknown): Record<string, unknown> {
  const pk = rel._modelClass.primaryKey;
  if (Array.isArray(pk)) {
    if (!Array.isArray(id) || id.length !== pk.length) {
      throw new RecordNotFound(
        `${rel._modelClass.name}: composite primary key requires a ${pk.length}-element array, got ${String(id)}`,
        rel._modelClass.name,
        String(pk),
        id,
      );
    }
    const conditions: Record<string, unknown> = {};
    pk.forEach((col, i) => {
      conditions[col] = id[i];
    });
    return conditions;
  }
  return { [pk]: id };
}

export async function performFind(this: FinderRelation, ...ids: unknown[]): Promise<any> {
  const pk = this._modelClass.primaryKey;
  const isCpk = this._modelClass.compositePrimaryKey;

  // Simple PK, single scalar: find(1)
  if (!isCpk && ids.length === 1 && !Array.isArray(ids[0])) {
    const records = await this.where({ [pk as string]: ids[0] })
      .limit(1)
      .toArray();
    if (records.length === 0) {
      throw new RecordNotFound(
        `Couldn't find ${this._modelClass.name} with '${pk}'=${ids[0]}`,
        this._modelClass.name,
        pk as string,
        ids[0],
      );
    }
    return records[0];
  }

  // Simple PK, multiple: find(1, 2, 3) or find([1, 2, 3])
  if (!isCpk) {
    const flatIds = (ids as unknown[]).flat();
    if (flatIds.length === 0) {
      throw new RecordNotFound(
        `Couldn't find ${this._modelClass.name} with an empty list of ids`,
        this._modelClass.name,
        pk as string,
        [],
      );
    }
    const records = await this.where({ [pk as string]: flatIds }).toArray();
    if (records.length !== flatIds.length) {
      throw new RecordNotFound(
        `Couldn't find all ${this._modelClass.name} with '${pk}': (${flatIds.join(", ")})`,
        this._modelClass.name,
        pk as string,
        flatIds,
      );
    }
    return records;
  }

  // CPK: find([shop_id, id]) — single tuple
  // CPK: find([[shop_id, id], [shop_id2, id2]]) — array of tuples
  // Distinguish by checking if first element is an array
  if (ids.length === 0) {
    throw new RecordNotFound(
      `Couldn't find ${this._modelClass.name} with an empty list of ids`,
      this._modelClass.name,
      String(pk),
      [],
    );
  }
  const input = ids.length === 1 && Array.isArray(ids[0]) ? ids[0] : ids;
  if (Array.isArray(input) && input.length === 0) {
    throw new RecordNotFound(
      `Couldn't find ${this._modelClass.name} with an empty list of ids`,
      this._modelClass.name,
      String(pk),
      [],
    );
  }
  const isArrayOfTuples = Array.isArray(input[0]);
  const tuples: unknown[][] = isArrayOfTuples ? (input as unknown[][]) : [input as unknown[]];

  // Build OR conditions for all tuples in a single query
  const orConditions = tuples.map((tuple) => buildPkWhere(this, tuple));
  let rel: any = this.where(orConditions[0]);
  for (let i = 1; i < orConditions.length; i++) {
    rel = rel.or(this.where(orConditions[i]));
  }
  const records = await rel.toArray();
  if (records.length !== tuples.length) {
    throw new RecordNotFound(
      `Couldn't find all ${this._modelClass.name} with '${pk}': (${String(tuples)})`,
      this._modelClass.name,
      String(pk),
      tuples,
    );
  }
  return isArrayOfTuples ? records : records[0];
}

export async function performFindBy(
  this: FinderRelation,
  conditions: Record<string, unknown>,
): Promise<any | null> {
  const records = await this.where(conditions).limit(1).toArray();
  return records[0] ?? null;
}

export async function performFindByBang(
  this: FinderRelation,
  conditions: Record<string, unknown>,
): Promise<any> {
  const record = await performFindBy.call(this, conditions);
  if (!record) {
    throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
  }
  return record;
}

export async function performFindSoleBy(
  this: FinderRelation,
  conditions: Record<string, unknown>,
): Promise<any> {
  return performSole.call(this.where(conditions));
}

function hasOrder(rel: FinderRelation): boolean {
  return rel._orderClauses.length > 0 || rel._rawOrderClauses.length > 0;
}

function hasReversibleOrder(rel: FinderRelation): boolean {
  // Only _orderClauses can be reversed by reverseOrder().
  // _rawOrderClauses (e.g. from inOrderOf) contain arbitrary SQL
  // that can't be reliably reversed.
  return rel._orderClauses.length > 0;
}

export async function performFirst(this: FinderRelation, n?: number): Promise<any> {
  if (this._isNone) return n !== undefined ? [] : null;
  if (n !== undefined) {
    const rel = this._clone();
    rel._limitValue = n;
    return rel.toArray();
  }
  const rel = this._clone();
  rel._limitValue = 1;
  const records = await rel.toArray();
  return records[0] ?? null;
}

export async function performFirstBang(this: FinderRelation): Promise<any> {
  const record = await performFirst.call(this);
  if (!record) {
    throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
  }
  return record;
}

function orderByPk(rel: FinderRelation, direction: "asc" | "desc"): any {
  const pk = rel._modelClass.primaryKey;
  if (Array.isArray(pk)) {
    return rel.order(...pk.map((col: string) => ({ [col]: direction })));
  }
  return rel.order({ [pk]: direction });
}

export async function performLast(this: FinderRelation, n?: number): Promise<any> {
  if (this._isNone) return n !== undefined ? [] : null;
  let rel: any;
  if (!hasReversibleOrder(this)) {
    rel = orderByPk(this, "desc");
  } else {
    rel = this.reverseOrder();
  }
  if (n !== undefined) {
    rel = rel.limit(n);
    const records = await rel.toArray();
    return records.reverse();
  }
  rel = rel.limit(1);
  const records = await rel.toArray();
  return records[0] ?? null;
}

export async function performLastBang(this: FinderRelation): Promise<any> {
  const record = await performLast.call(this);
  if (!record) {
    throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
  }
  return record;
}

export async function performSole(this: FinderRelation): Promise<any> {
  const rel = this._clone();
  rel._limitValue = 2;
  const records = await rel.toArray();
  if (records.length === 0) {
    throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
  }
  if (records.length > 1) {
    throw new SoleRecordExceeded(this._modelClass);
  }
  return records[0];
}

export async function performTake(this: FinderRelation, limit?: number): Promise<any> {
  const rel = this._clone();
  if (limit !== undefined) {
    rel._limitValue = limit;
    return rel.toArray();
  }
  rel._limitValue = 1;
  const records = await rel.toArray();
  return records[0] ?? null;
}

export async function performTakeBang(this: FinderRelation): Promise<any> {
  const record = await performTake.call(this);
  if (!record) {
    throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
  }
  return record;
}

async function findNthWithLimit(this: FinderRelation, index: number): Promise<any | null> {
  let rel = this._clone();
  rel._limitValue = 1;
  rel._offsetValue = (this._offsetValue ?? 0) + index;
  if (!hasOrder(rel)) {
    rel = orderByPk(rel, "asc");
  }
  const records = await rel.toArray();
  return records[0] ?? null;
}

async function findNthFromLast(this: FinderRelation, index: number): Promise<any | null> {
  let rel: any;
  if (!hasReversibleOrder(this)) {
    rel = orderByPk(this, "desc");
  } else {
    rel = this.reverseOrder();
  }
  return findNthWithLimit.call(rel, index);
}

export async function performSecond(this: FinderRelation): Promise<any | null> {
  return findNthWithLimit.call(this, 1);
}

export async function performThird(this: FinderRelation): Promise<any | null> {
  return findNthWithLimit.call(this, 2);
}

export async function performFourth(this: FinderRelation): Promise<any | null> {
  return findNthWithLimit.call(this, 3);
}

export async function performFifth(this: FinderRelation): Promise<any | null> {
  return findNthWithLimit.call(this, 4);
}

export async function performFortyTwo(this: FinderRelation): Promise<any | null> {
  return findNthWithLimit.call(this, 41);
}

export async function performSecondToLast(this: FinderRelation): Promise<any | null> {
  return findNthFromLast.call(this, 1);
}

export async function performThirdToLast(this: FinderRelation): Promise<any | null> {
  return findNthFromLast.call(this, 2);
}

function bangFinder(finder: (this: FinderRelation) => Promise<any | null>) {
  return async function (this: FinderRelation): Promise<any> {
    const record = await finder.call(this);
    if (!record) {
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    }
    return record;
  };
}

export const performSecondBang = bangFinder(performSecond);
export const performThirdBang = bangFinder(performThird);
export const performFourthBang = bangFinder(performFourth);
export const performFifthBang = bangFinder(performFifth);
export const performFortyTwoBang = bangFinder(performFortyTwo);
export const performSecondToLastBang = bangFinder(performSecondToLast);
export const performThirdToLastBang = bangFinder(performThirdToLast);

export async function performFindOrCreateByBang(
  this: FinderRelation,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<any> {
  const records = await this.where(conditions).limit(1).toArray();
  if (records.length > 0) return records[0];
  return this._modelClass.createBang({
    ...this._createWithAttrs,
    ...this._scopeAttributes(),
    ...conditions,
    ...extra,
  });
}

export async function performCreateOrFindByBang(
  this: FinderRelation,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<any> {
  try {
    return await this._modelClass.createBang({
      ...this._createWithAttrs,
      ...this._scopeAttributes(),
      ...conditions,
      ...extra,
    });
  } catch (error) {
    if (error instanceof RecordInvalid) throw error;
    const records = await this.where(conditions).limit(1).toArray();
    if (records.length > 0) return records[0];
    throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
  }
}

export function raiseRecordNotFoundExceptionBang(
  this: FinderRelation,
  message?: string,
  modelName?: string,
  primaryKey?: string,
  id?: unknown,
): never {
  throw new RecordNotFound(
    message ?? `Couldn't find ${this._modelClass.name}`,
    modelName ?? this._modelClass.name,
    primaryKey ?? String(this._modelClass.primaryKey),
    id,
  );
}

export const FinderMethods = {
  find: performFind,
  findBy: performFindBy,
  findByBang: performFindByBang,
  findSoleBy: performFindSoleBy,
  first: performFirst,
  firstBang: performFirstBang,
  last: performLast,
  lastBang: performLastBang,
  sole: performSole,
  take: performTake,
  takeBang: performTakeBang,
  second: performSecond,
  third: performThird,
  fourth: performFourth,
  fifth: performFifth,
  fortyTwo: performFortyTwo,
  secondToLast: performSecondToLast,
  thirdToLast: performThirdToLast,
  secondBang: performSecondBang,
  thirdBang: performThirdBang,
  fourthBang: performFourthBang,
  fifthBang: performFifthBang,
  fortyTwoBang: performFortyTwoBang,
  secondToLastBang: performSecondToLastBang,
  thirdToLastBang: performThirdToLastBang,
  findOrCreateByBang: performFindOrCreateByBang,
  createOrFindByBang: performCreateOrFindByBang,
  raiseRecordNotFoundExceptionBang,
} as const;
