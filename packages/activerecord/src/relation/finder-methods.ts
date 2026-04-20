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
import { normalizeFindArgs, raiseNotFoundAll, raiseNotFoundSingle } from "./find-normalization.js";

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

function buildPkWhere(pk: string[], tuple: unknown[]): Record<string, unknown> {
  const conditions: Record<string, unknown> = {};
  pk.forEach((col, i) => {
    conditions[col] = tuple[i];
  });
  return conditions;
}

export async function performFind(this: FinderRelation, ...args: unknown[]): Promise<any> {
  const pk = this._modelClass.primaryKey;
  const modelName = this._modelClass.name;
  const normalized = normalizeFindArgs(modelName, pk, args);
  const { ids, wantArray, tuples } = normalized;

  // Composite PK: OR over per-tuple WHERE conditions. The
  // `Array.isArray(pk)` guard narrows `pk` to `string[]` via
  // control flow instead of a cast. `tuples !== null` is a
  // stronger invariant (the normalizer only returns tuples when pk
  // is composite) but TS can't correlate them, so we check both.
  if (tuples && Array.isArray(pk)) {
    const orConditions = tuples.map((tuple) => buildPkWhere(pk, tuple));
    let rel: any = this.where(orConditions[0]);
    for (let i = 1; i < orConditions.length; i++) {
      rel = rel.or(this.where(orConditions[i]));
    }
    const records = await rel.toArray();
    if (records.length !== tuples.length) raiseNotFoundAll(modelName, pk, normalized);
    return wantArray ? records : records[0];
  }

  // Simple PK from here on — pk is narrowed to `string`.
  if (Array.isArray(pk)) {
    // Unreachable: tuples-null + pk-array would mean the normalizer
    // violated its contract.
    throw new Error("performFind: composite PK without tuples (normalizer invariant violation)");
  }

  // Simple PK, single scalar: find(1)
  if (!wantArray) {
    const id = ids[0];
    const records = await this.where({ [pk]: id })
      .limit(1)
      .toArray();
    if (records.length === 0) raiseNotFoundSingle(modelName, pk, id);
    return records[0];
  }

  // Simple PK, multiple: find(1, 2, 3) or find([1, 2, 3]).
  const records = await this.where({ [pk]: ids }).toArray();
  if (records.length !== ids.length) raiseNotFoundAll(modelName, pk, normalized);
  return records;
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
