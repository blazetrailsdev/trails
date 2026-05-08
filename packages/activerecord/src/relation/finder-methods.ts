/**
 * Finder methods: find, findBy, first, last, take, sole, and ordinal accessors.
 *
 * These are the real implementations behind Relation's finder methods.
 * Each function uses this-typing and is mixed into Relation via interface
 * merge + prototype assignment.
 *
 * Mirrors: ActiveRecord::FinderMethods
 */

import { Nodes } from "@blazetrails/arel";
import { ActiveModelRangeError } from "@blazetrails/activemodel";
import { RecordNotFound, RecordNotSaved, RecordNotUnique, SoleRecordExceeded } from "../errors.js";
import { queryConstraintsList as _queryConstraintsListFn } from "../persistence.js";

// ---------------------------------------------------------------------------
// Shared id-normalization + not-found helpers.
//
// Both `Relation.performFind` (SQL path — below) and
// `CollectionProxy#find` (in-memory association path — associations/
// collection-proxy.ts) accept the same polymorphic arg set and must
// produce identical `RecordNotFound` messages and `.id` payloads.
// Centralizing the normalization + raise helpers here prevents drift.
//
// Simple-PK flattening uses `flat(Infinity)`, matching Ruby's
// `Array#flatten` default — Rails contract (`Post.find([[1, [2]]])`
// works as `Post.find(1, 2)`).
//
// Mirrors: ActiveRecord::FinderMethods' private
// `find_with_ids` / `raise_record_not_found_exception!` helpers.
// ---------------------------------------------------------------------------

export interface NormalizedFindIds {
  /**
   * Canonical id list for the lookup backend:
   *   - simple PK → flat scalar ids (never arrays).
   *   - composite PK → array of tuples (always `unknown[][]`).
   */
  readonly ids: unknown[];

  /**
   * `true` when the caller provided a list-form (variadic ≥2, a
   * single array arg, or composite list-of-tuples) and therefore
   * wants `T[]` back. `false` for the single-id / single-tuple case.
   */
  readonly wantArray: boolean;

  /**
   * For composite PKs: the tuple list (same shape as `ids`). For
   * simple PKs: `null`. Used to format error messages + payload
   * exactly like Rails (`String(tuples)` vs `flatIds.join(", ")`).
   */
  readonly tuples: unknown[][] | null;
}

/**
 * Normalize the varargs of a `.find(...)` call into the canonical
 * `NormalizedFindIds` shape.
 *
 * Raises `RecordNotFound` for the deterministic input errors:
 *   - zero-arg call                     → "empty list of ids", `id: []`
 *   - explicit `find([])`               → same
 *   - composite PK + scalar or wrong-arity tuple →
 *     "`<Model>: composite primary key requires a <N>-element array, got <id>`"
 *
 * Does NOT do the actual lookup or the "couldn't find all" aggregate
 * error — that stays at the call site (SQL vs in-memory each have
 * their own count-comparison logic).
 */
export function normalizeFindArgs(
  modelName: string,
  pk: string | string[],
  args: unknown[],
): NormalizedFindIds {
  const composite = Array.isArray(pk);

  if (args.length === 0) {
    throw new RecordNotFound(
      `Couldn't find ${modelName} with an empty list of ids`,
      modelName,
      String(pk),
      [],
    );
  }

  const [first, ...rest] = args;
  let ids: unknown[];
  let wantArray: boolean;

  if (rest.length > 0) {
    if (composite) {
      if (args.every((x) => !Array.isArray(x))) {
        // All-scalar collapses to one tuple id — Rails treats
        // `find(1, 42)` on a 2-arity PK as `[1, 42]`. Arity mismatch
        // raises below with the whole tuple in the message.
        ids = [args];
        wantArray = false;
      } else {
        ids = args;
        wantArray = true;
      }
    } else {
      // Simple PK: flatten so mixed inputs like `find([1, 2], 3)`
      // canonicalize to `[1, 2, 3]`.
      ids = (args as unknown[]).flat(Infinity);
      wantArray = true;
    }
  } else if (Array.isArray(first)) {
    if (composite) {
      if (first.length === 0) {
        ids = first;
        wantArray = true;
      } else if (first.every((x) => !Array.isArray(x))) {
        ids = [first];
        wantArray = false;
      } else {
        ids = first;
        wantArray = true;
      }
    } else {
      // Simple PK: recursive flatten so `find([[1, 2]])` behaves like
      // `find([1, 2])`, matching Rails' `Array#flatten`.
      ids = (first as unknown[]).flat(Infinity);
      wantArray = true;
    }
  } else {
    ids = [first];
    wantArray = false;
  }

  if (ids.length === 0) {
    throw new RecordNotFound(
      `Couldn't find ${modelName} with an empty list of ids`,
      modelName,
      String(pk),
      [],
    );
  }

  if (composite) {
    const pkArity = (pk as string[]).length;
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

/**
 * Raise the aggregate "couldn't find all" error, matching
 * `Relation.performFind`'s message shape for the caller's PK kind:
 *   - simple PK  → `flatIds.join(", ")`, payload = flatIds.
 *   - composite  → `String(tuples)`    , payload = tuples[][].
 */
export function raiseNotFoundAll(
  modelName: string,
  pk: string | string[],
  normalized: NormalizedFindIds,
): never {
  const { ids, tuples } = normalized;
  const messageIds = tuples ? String(tuples) : (ids as unknown[]).join(", ");
  const payload = tuples ?? ids;
  throw new RecordNotFound(
    `Couldn't find all ${modelName} with '${String(pk)}': (${messageIds})`,
    modelName,
    String(pk),
    payload,
  );
}

/**
 * Raise the single-id not-found error for a simple PK.
 * Matches `Relation.performFind`'s `"with 'pk'=<id>"` message.
 */
export function raiseNotFoundSingle(modelName: string, pk: string, id: unknown): never {
  throw new RecordNotFound(
    `Couldn't find ${modelName} with '${pk}'=${String(id)}`,
    modelName,
    pk,
    id,
  );
}

interface FinderRelation {
  _modelClass: {
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
  _limitValue: number | null;
  _offsetValue: number | null;
  _orderClauses: any[];
  _rawOrderClauses: string[];
  _createWithAttrs: Record<string, unknown>;
  _scopeAttributes(): Record<string, unknown>;
  scopeForCreate(): Record<string, unknown>;
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
  try {
    const records = await this.where(conditions).limit(1).toArray();
    return records[0] ?? null;
  } catch (err) {
    // Rails: `find_by` returns nil for values that can't be serialized
    // for the attribute's type (e.g. an integer larger than the column
    // width). Rails catches `::RangeError` at the statement-cache
    // bind layer; we don't have that layer, so scope the catch to the
    // typed `ActiveModelRangeError` thrown by `IntegerType.serialize`
    // — a broader `RangeError` catch would mask unrelated errors.
    if (err instanceof ActiveModelRangeError) return null;
    throw err;
  }
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

/** @internal */
export async function findNthWithLimit(
  this: FinderRelation,
  index: number,
  limit: number,
): Promise<any[]> {
  if ((this as any)._loaded) {
    return (this as any)._records.slice(index, index + limit) ?? [];
  }
  let relation: any = orderedRelation(this);
  if ((this as any)._limitValue != null) {
    limit = Math.min((this as any)._limitValue - index, limit);
  }
  if (limit <= 0) return [];
  if (index > 0) {
    relation = relation.offset(((this as any)._offsetValue ?? 0) + index);
  }
  return relation.limit(limit).toArray();
}

/** @internal */
export async function findNthFromLast(this: FinderRelation, index: number): Promise<any | null> {
  if ((this as any)._loaded) {
    const records: any[] = (this as any)._records;
    return records[records.length - 1 - index] ?? null;
  }
  const relation: any = orderedRelation(this);
  // Rails: `if relation.order_values.empty? || relation.has_limit_or_offset?`
  // Use hasOrder() on the result so _rawOrderClauses (e.g. inOrderOf) are also
  // treated as "has an order" — avoids loading all records for those relations.
  if (
    !hasOrder(relation) ||
    (relation as any)._limitValue != null ||
    (relation as any)._offsetValue != null
  ) {
    const records = await relation.toArray();
    return records[records.length - 1 - index] ?? null;
  }
  return relation.reverseOrder().offset(index).first();
}

export async function performSecond(this: FinderRelation): Promise<any | null> {
  return (await findNthWithLimit.call(this, 1, 1))[0] ?? null;
}

export async function performThird(this: FinderRelation): Promise<any | null> {
  return (await findNthWithLimit.call(this, 2, 1))[0] ?? null;
}

export async function performFourth(this: FinderRelation): Promise<any | null> {
  return (await findNthWithLimit.call(this, 3, 1))[0] ?? null;
}

export async function performFifth(this: FinderRelation): Promise<any | null> {
  return (await findNthWithLimit.call(this, 4, 1))[0] ?? null;
}

export async function performFortyTwo(this: FinderRelation): Promise<any | null> {
  return (await findNthWithLimit.call(this, 41, 1))[0] ?? null;
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
    ...this.scopeForCreate(),
    ...conditions,
    ...extra,
  });
}

export async function performCreateOrFindByBang(
  this: FinderRelation,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<any> {
  // Rails:
  //   transaction(requires_new: true) { create!(attributes, &block) }
  //   rescue ActiveRecord::RecordNotUnique
  //     where(attributes).lock.find_by!(attributes)
  try {
    const result = await this._modelClass.transaction(
      () =>
        this._modelClass.createBang({
          ...this.scopeForCreate(),
          ...conditions,
          ...extra,
        }),
      { requiresNew: true },
    );
    // transaction() returns undefined when the block raises Rollback.
    // Treat that as a persist failure rather than leaking undefined to
    // the bang caller.
    if (result === undefined) {
      throw new RecordNotSaved(
        `${this._modelClass.name}.createOrFindByBang rolled back before persist`,
        undefined,
      );
    }
    return result;
  } catch (error) {
    if (!(error instanceof RecordNotUnique)) throw error;
    return this.where(conditions).lock().findByBang(conditions);
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
  secondBang: performSecondBang,
  third: performThird,
  thirdBang: performThirdBang,
  fourth: performFourth,
  fourthBang: performFourthBang,
  fifth: performFifth,
  fifthBang: performFifthBang,
  fortyTwo: performFortyTwo,
  fortyTwoBang: performFortyTwoBang,
  secondToLast: performSecondToLast,
  secondToLastBang: performSecondToLastBang,
  thirdToLast: performThirdToLast,
  thirdToLastBang: performThirdToLastBang,
  findOrCreateByBang: performFindOrCreateByBang,
  createOrFindByBang: performCreateOrFindByBang,
  raiseRecordNotFoundExceptionBang,
} as const;

// ---------------------------------------------------------------------------
// Private helpers (mirrors Rails' ActiveRecord::FinderMethods private methods)
// ---------------------------------------------------------------------------

/** @internal */
export function constructRelationForExists(rel: FinderRelation, conditions: unknown): any {
  if (conditions === false) return rel;
  // Rails: except(:select, :distinct, :order)._select!("1 AS one").limit!(1)
  // (or except(:order).limit!(1) when distinct+offset are both set)
  let relation: any;
  if ((rel as any)._isDistinct && (rel as any)._offsetValue != null) {
    relation = (rel as any).unscope("order").limit(1);
  } else {
    // Rails: except(:select, :distinct, :order) — "distinct" is not a valid
    // unscope() key so clear _isDistinct directly on the cloned relation.
    relation = (rel as any).unscope("select", "order");
    relation._isDistinct = false;
    relation = relation.select(new Nodes.SqlLiteral("1 AS one")).limit(1);
  }
  if (conditions === null || conditions === undefined || conditions === true) {
    return relation;
  }
  if (Array.isArray(conditions)) {
    // Rails Array form: [sql, bind1, bind2, ...] — spread to avoid triggering
    // the composite-key overload of where() which requires all-string arrays.
    const [sql, ...binds] = conditions as unknown[];
    if (sql !== undefined) relation = relation.where(sql, ...binds);
  } else if (conditions instanceof Nodes.Node) {
    // Arel node — pass directly rather than wrapping as a PK value.
    relation = relation.where(conditions);
  } else if (typeof conditions === "object") {
    // Hash-like: Rails' `when Hash` branch — skip if empty.
    if (Object.keys(conditions as object).length > 0) relation = relation.where(conditions);
  } else {
    // Scalar → PK lookup (Rails' else branch: `where!(primary_key => conditions)`).
    const pk = (rel as any)._modelClass.primaryKey;
    if (Array.isArray(pk)) {
      relation = relation.where(buildPkWhere(pk, conditions as unknown[]));
    } else {
      relation = relation.where({ [pk as string]: conditions });
    }
  }
  return relation;
}

/** @internal */
export function applyJoinDependency(rel: FinderRelation, eagerLoading: boolean): any {
  if (!eagerLoading) return rel;
  // Rails: when eager loading, apply a LEFT OUTER JOIN via the join dependency.
  // Our preloader handles this via separate queries, but we record the join type.
  const arelRel = rel as any;
  if (arelRel._includesAssociations?.length > 0 && arelRel._joinClauses) {
    // Ensure eager-loaded associations use outer join semantics (Arel::Nodes::OuterJoin)
    arelRel._joinClauses = arelRel._joinClauses.map(
      (j: { type: string; table: string; on: string }) =>
        j.type === "inner" && arelRel._includesAssociations.includes(j.table)
          ? { ...j, type: "left" }
          : j,
    );
    void Nodes.OuterJoin; // Rails uses Arel::Nodes::OuterJoin for eager loading joins
  }
  return rel;
}

/** @internal */
export function isUsingLimitableReflections(reflections: unknown[]): boolean {
  return (reflections as any[]).every(
    (r) => r.macro !== "hasMany" && r.macro !== "hasAndBelongsToMany",
  );
}

/** @internal */
export async function findWithIds(rel: FinderRelation, ids: unknown[]): Promise<any> {
  const normalized = normalizeFindArgs(
    (rel as any)._modelClass.name,
    (rel as any)._modelClass.primaryKey,
    ids,
  );
  if (normalized.wantArray) {
    return findSome(rel, normalized.ids);
  }
  return findOne(rel, normalized.ids[0]);
}

/** @internal */
export async function findOne(rel: FinderRelation, id: unknown): Promise<any> {
  const pk = (rel as any)._modelClass.primaryKey;
  const conditions = Array.isArray(pk) ? buildPkWhere(pk, id as unknown[]) : { [pk as string]: id };
  const record = await (rel as any).findBy(conditions);
  if (!record) {
    const modelName = (rel as any)._modelClass.name as string;
    throw new RecordNotFound(`Couldn't find ${modelName}`, modelName, String(pk), id);
  }
  return record;
}

/** @internal */
export async function findSome(rel: FinderRelation, ids: unknown[]): Promise<any[]> {
  if (!hasOrder(rel)) return findSomeOrdered(rel, ids);

  const pk = (rel as any)._modelClass.primaryKey as string;
  const records = await (rel as any).where({ [pk]: ids }).toArray();

  // Rails: expected_size = ids.size, then clamp down for limit/offset.
  // "11 ids with limit 3, offset 9 should give 2 results."
  let expectedSize = ids.length;
  const limitValue: number | null = (rel as any)._limitValue ?? null;
  const offsetValue: number | null = (rel as any)._offsetValue ?? null;
  if (limitValue !== null && ids.length > limitValue) expectedSize = limitValue;
  if (offsetValue !== null && ids.length - offsetValue < expectedSize)
    expectedSize = ids.length - offsetValue;

  if (records.length !== expectedSize) {
    const foundIds = records.map((r: any) => r.readAttribute?.(pk) ?? r[pk]);
    const remaining = [...ids];
    for (const foundId of foundIds) {
      const idx = remaining.findIndex((id) => id === foundId);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    const modelName = (rel as any)._modelClass.name as string;
    throw new RecordNotFound(`Couldn't find all ${modelName}`, modelName, pk, remaining);
  }
  return records;
}

/** @internal */
export async function findSomeOrdered(rel: FinderRelation, ids: unknown[]): Promise<any[]> {
  const pk = (rel as any)._modelClass.primaryKey as string;
  const offsetValue: number = (rel as any)._offsetValue ?? 0;
  const limitValue: number | null = (rel as any)._limitValue ?? null;
  ids = ids.slice(offsetValue, offsetValue + (limitValue ?? ids.length));

  let relation = (rel as any).where({ [pk]: ids });
  relation._limitValue = null;
  relation._offsetValue = null;
  if ((rel as any).selectValues.length > 0) {
    relation = relation.select((rel as any)._modelClass.arelTable.get(pk));
  }
  const records: any[] = await relation.toArray();

  const pkType = (rel as any)._modelClass.typeForAttribute(pk);
  const castKey = (v: unknown) => String(pkType.cast(v));

  if (records.length !== ids.length) {
    const modelName = (rel as any)._modelClass.name as string;
    const remaining = [...ids];
    for (const r of records) {
      const key = castKey(r.readAttribute?.(pk) ?? r[pk]);
      const idx = remaining.findIndex((id) => castKey(id) === key);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    throw new RecordNotFound(`Couldn't find all ${modelName}`, modelName, pk, remaining);
  }
  const idIndex = new Map(ids.map((id, i) => [castKey(id), i]));
  return records.sort((a: any, b: any) => {
    const ai = idIndex.get(castKey(a.readAttribute?.(pk) ?? a[pk])) ?? 0;
    const bi = idIndex.get(castKey(b.readAttribute?.(pk) ?? b[pk])) ?? 0;
    return ai - bi;
  });
}

/** @internal */
export async function findTake(rel: FinderRelation): Promise<any | null> {
  if ((rel as any)._loaded) return (rel as any)._records[0] ?? null;
  const records = await (rel as any).limit(1).toArray();
  return records[0] ?? null;
}

/** @internal */
export async function findTakeWithLimit(rel: FinderRelation, limit: number): Promise<any[]> {
  if ((rel as any)._loaded) return (rel as any)._records.slice(0, limit);
  return (rel as any).limit(limit).toArray();
}

/** @internal */
export async function findNth(rel: FinderRelation, index: number): Promise<any | null> {
  return (await findNthWithLimit.call(rel, index, 1))[0] ?? null;
}

/** @internal */
export async function findLast(rel: FinderRelation, limit?: number): Promise<any> {
  return performLast.call(rel, limit);
}

/** @internal */
export function orderedRelation(rel: FinderRelation): any {
  const mc = (rel as any)._modelClass;
  const pk = mc?.primaryKey;
  const implicitOrder: string | null | undefined = mc?.implicitOrderColumn;
  const constraintsList: string[] | null = mc ? _queryConstraintsListFn.call(mc) : null;
  if (!hasOrder(rel) && (implicitOrder || constraintsList != null || pk)) {
    const cols = _orderColumns(rel);
    if (cols.length > 0) {
      // Use hash-form { col: "asc" } so _orderClauses stores ["col", "asc"] tuples.
      // Tuple form is what reverseOrderBang expects — Arel node form pre-renders to
      // { raw: '"tbl"."col" ASC' } which the chained-replace in reverseOrderBang
      // would undo (ASC→DESC→ASC). This matches Rails: table[column].asc nodes are
      // rendered by the visitor at SQL-build time, not at order-storage time.
      return (rel as any).order(...cols.map((col: string) => ({ [col]: "asc" as const })));
    }
  }
  return rel;
}

/** @internal */
export function _orderColumns(rel: FinderRelation): string[] {
  const mc = (rel as any)._modelClass;
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
