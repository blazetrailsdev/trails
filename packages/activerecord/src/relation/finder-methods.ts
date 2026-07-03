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
import { pluralize } from "@blazetrails/activesupport";
import {
  ActiveModelRangeError,
  sanitizeForMassAssignment as sanitizeForbiddenAttributes,
} from "@blazetrails/activemodel";
import { RecordNotFound, RecordNotSaved, RecordNotUnique, SoleRecordExceeded } from "../errors.js";
import { queryConstraintsList as _queryConstraintsListFn } from "../persistence.js";
import { compactUniqIds, compactUniqTuples } from "./compact-uniq-ids.js";

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

  /**
   * `true` when the caller passed an empty array as the first arg
   * (`find([])`). Rails' `find_with_ids` short-circuits this to `[]`
   * before any flatten/lookup, so callers return `[]` without a query.
   */
  readonly emptyArray?: boolean;
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

  // Rails `find_with_ids`: `return [] if expects_array && ids.first.empty?`.
  // An empty first array short-circuits to `[]` before any flatten or
  // lookup, so `find([])` resolves to `[]` rather than raising
  // `RecordNotFound`. For composite PKs Rails derives `expects_array` from
  // `ids.first.first` (a nested array), so a bare `find([])` does NOT
  // short-circuit there — hence the simple-PK guard.
  if (!composite && Array.isArray(first) && first.length === 0) {
    return { ids: [], wantArray: true, tuples: null, emptyArray: true };
  }

  let ids: unknown[];
  let wantArray: boolean;

  // Rails `find_with_ids`: `ids = ids.flatten.compact.uniq` BEFORE the
  // `case ids.size` dispatch. So `find([1, 1])` collapses to one id
  // (→ `find_one`) and `find([1, nil])` drops the nil. Applied to the
  // simple-PK flatten branches below. Composite tuple lists get their own
  // `compact.uniq` (structural equality) — nil _outer_ entries drop, but a
  // tuple's own nil components are preserved (see `compactUniqTuples`).
  if (composite) {
    // Rails composite `find_with_ids` (finder_methods.rb:494-517):
    //   expects_array = ids.first.first.is_a?(Array)
    //   ids = ids.first if expects_array
    //   ids = ids.compact.uniq
    //   when 1 then expects_array ? [result] : result
    // `expectsArray` keys off the *first* element of the first arg alone, so
    // a nil that precedes the tuples (`find([nil, [1, 2]])`) leaves it false
    // and the arg is a single degenerate tuple — the nil is NOT dropped as a
    // list entry. The size-1 result is wrapped only when `expectsArray`, so a
    // variadic duplicate like `find([1, 2], [1, 2])` dedupes to one tuple and
    // returns the bare record (not `[record]`).
    const expectsArray = Array.isArray(first) && Array.isArray(first[0]);
    if (rest.length > 0 && args.every((x) => !Array.isArray(x))) {
      // trails accommodation (Rails would raise on `1.first`): an all-scalar
      // variadic call like `find(1, 42)` on a 2-arity PK is the single tuple
      // `[1, 42]`. Arity mismatch raises below with the whole tuple.
      ids = [args];
    } else {
      ids = compactUniqTuples(expectsArray ? (first as unknown[]) : args);
    }
    // `find_some` (size > 1) always returns an array; only a deduped size-1
    // list stays unwrapped when the caller did not pass a tuple list.
    wantArray = expectsArray || ids.length !== 1;
  } else if (rest.length > 0) {
    // Simple PK: flatten so mixed inputs like `find([1, 2], 3)`
    // canonicalize to `[1, 2, 3]`.
    ids = compactUniqIds(args.flat(Infinity));
    wantArray = true;
  } else if (Array.isArray(first)) {
    // Simple PK: recursive flatten so `find([[1, 2]])` behaves like
    // `find([1, 2])`, matching Rails' `Array#flatten`.
    ids = compactUniqIds((first as unknown[]).flat(Infinity));
    wantArray = true;
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
  conditions = "",
): never {
  const { ids, tuples } = normalized;
  const messageIds = tuples ? String(tuples) : ids.join(", ");
  const payload = tuples ?? ids;
  throw new RecordNotFound(
    `Couldn't find all ${modelName} with '${String(pk)}': (${messageIds})${conditions}`,
    modelName,
    String(pk),
    payload,
  );
}

/**
 * Raise the single-id not-found error for a simple PK.
 * Matches `Relation.performFind`'s `"with 'pk'=<id>"` message.
 */
export function raiseNotFoundSingle(
  modelName: string,
  pk: string,
  id: unknown,
  conditions = "",
): never {
  throw new RecordNotFound(
    `Couldn't find ${modelName} with '${pk}'=${String(id)}${conditions}`,
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
  /** Rails' not-found `conditions` clause: ` [WHERE …]` or "" (relation.ts). */
  _conditionsClause(): string;
  where(conditions: unknown, ...rest: unknown[]): any;
  limit(n: number): any;
  order(...args: any[]): any;
  reverseOrder(): any;
  toArray(): Promise<any[]>;
  /** @internal */
  findNthWithLimit(index: number, limit: number): Promise<any[]>;
  /** @internal */
  findNthFromLast(index: number): Promise<any | null>;
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
  if (normalized.emptyArray) return [];
  const { ids, wantArray, tuples } = normalized;
  // Rails appends the relation's WHERE clause to every not-found message
  // (`conditions = " [#{arel.where_sql(model)}]" unless where_clause.empty?`).
  const conditions = this._conditionsClause();

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
    if (records.length !== tuples.length) raiseNotFoundAll(modelName, pk, normalized, conditions);
    return wantArray ? records : records[0];
  }

  // Simple PK from here on — pk is narrowed to `string`.
  if (Array.isArray(pk)) {
    // Unreachable: tuples-null + pk-array would mean the normalizer
    // violated its contract.
    throw new Error("performFind: composite PK without tuples (normalizer invariant violation)");
  }

  // Simple PK, single id: find(1) or find([1]). Rails' find_with_ids
  // unwraps a single-element array and dispatches to the single-id path
  // (`find_one`), so a missing record raises the scalar "with 'id'=N"
  // message rather than the aggregate "with 'id': (N)". When the caller
  // passed an array (`expects_array`), the found record is wrapped back
  // into a 1-element array.
  if (ids.length === 1) {
    const id = ids[0];
    const records = await this.where({ [pk]: id })
      .limit(1)
      .toArray();
    if (records.length === 0) raiseNotFoundSingle(modelName, pk, id, conditions);
    return wantArray ? [records[0]] : records[0];
  }

  // Simple PK, multiple: find(1, 2, 3) or find([1, 2, 3]).
  const records = await this.where({ [pk]: ids }).toArray();
  if (records.length !== ids.length) raiseNotFoundAll(modelName, pk, normalized, conditions);
  return records;
}

export async function performFindBy(
  this: FinderRelation,
  conditions: unknown,
  ...rest: unknown[]
): Promise<any | null> {
  try {
    const records = await this.where(conditions, ...rest)
      .limit(1)
      .toArray();
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
  conditions: unknown,
  ...rest: unknown[]
): Promise<any> {
  // Rails: `find_by!(arg, *args) = where(arg, *args).take!`. The not-found
  // message therefore flows through `raise_record_not_found_exception!` (no
  // id) and carries the `[WHERE …]` conditions clause from the scoped relation.
  const record = await performFindBy.call(this, conditions, ...rest);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this.where(conditions, ...rest));
  }
  return record;
}

export async function performFindSoleBy(
  this: FinderRelation,
  ...conditions: unknown[]
): Promise<any> {
  return performSole.call((this.where as any)(...conditions));
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
  // An AssociationRelation spawned off a stale new-owner `1=0` seed rebases onto
  // the resolved association scope here — BEFORE the `_isNone` short-circuit, so
  // a saved owner's persisted FK is picked up instead of returning null. No-op
  // for ordinary relations (the hook is absent).
  (this as { _maybeRebaseAssociationSeed?: () => void })._maybeRebaseAssociationSeed?.();
  if (this._isNone) return n !== undefined ? [] : null;
  // Rails: Relation#first(limit) → find_nth_with_limit(0, limit); no-arg
  // first → find_nth(0) → find_nth_with_limit(0, 1). find_nth_with_limit reads
  // the loaded cache when present, otherwise runs an ordered LIMIT query — and
  // crucially caps `limit` against an existing `limit_value` (`first(3)` on a
  // `.limit(2)` relation returns 2 rows, not 3).
  if (n !== undefined) return this.findNthWithLimit(0, n);
  return (await this.findNthWithLimit(0, 1))[0] ?? null;
}

export async function performFirstBang(this: FinderRelation): Promise<any> {
  const record = await performFirst.call(this);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this);
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
  // See performFirst: rebase a stale new-owner seed before the `_isNone` guard.
  (this as { _maybeRebaseAssociationSeed?: () => void })._maybeRebaseAssociationSeed?.();
  if (this._isNone) return n !== undefined ? [] : null;
  // Rails: `return find_last(limit) if loaded? || has_limit_or_offset?`. When
  // the relation is already loaded — or carries a `limit`/`offset` that a
  // reverse-order query would otherwise discard — Rails materializes the
  // records and reads the tail in Ruby (`records.last` / `records.last(n)`)
  // rather than issuing a fresh reversed query. `toArray()` reuses the loaded
  // cache when present and runs the bounded query otherwise, matching both.
  if (
    (this as any)._loaded ||
    (this as any)._limitValue != null ||
    (this as any)._offsetValue != null
  ) {
    const records: any[] = await (this as any).toArray();
    if (n === undefined) return records[records.length - 1] ?? null;
    // Ruby `records.last(0) == []`; `slice(-0)` would return the whole array.
    return n === 0 ? [] : records.slice(-n);
  }
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
    raiseRecordNotFoundExceptionBang.call(this);
  }
  return record;
}

export async function performSole(this: FinderRelation): Promise<any> {
  const rel = this._clone();
  rel._limitValue = 2;
  const records = await rel.toArray();
  if (records.length === 0) {
    // Rails Relation#sole calls `raise_record_not_found_exception!` with no
    // args → "Couldn't find <Model>".
    raiseRecordNotFoundExceptionBang.call(this);
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
  if (!hasOrder(relation) || relation._limitValue != null || relation._offsetValue != null) {
    const records = await relation.toArray();
    return records[records.length - 1 - index] ?? null;
  }
  return relation.reverseOrder().offset(index).first();
}

export async function performSecond(this: FinderRelation): Promise<any | null> {
  return (await this.findNthWithLimit(1, 1))[0] ?? null;
}

export async function performThird(this: FinderRelation): Promise<any | null> {
  return (await this.findNthWithLimit(2, 1))[0] ?? null;
}

export async function performFourth(this: FinderRelation): Promise<any | null> {
  return (await this.findNthWithLimit(3, 1))[0] ?? null;
}

export async function performFifth(this: FinderRelation): Promise<any | null> {
  return (await this.findNthWithLimit(4, 1))[0] ?? null;
}

export async function performFortyTwo(this: FinderRelation): Promise<any | null> {
  return (await this.findNthWithLimit(41, 1))[0] ?? null;
}

export async function performSecondToLast(this: FinderRelation): Promise<any | null> {
  return this.findNthFromLast(1);
}

export async function performThirdToLast(this: FinderRelation): Promise<any | null> {
  return this.findNthFromLast(2);
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

// Mirrors ActiveRecord::FinderMethods#raise_record_not_found_exception!
// (finder_methods.rb:417). Composes the faithful not-found messages from the
// same ids / result_size / expected_size / key / not_found_ids arguments Rails
// passes, so the resulting RecordNotFound message, model, primary_key, and id
// fields match — including the `conditions` clause derived from the relation's
// where clause (` [#{arel.where_sql(model)}]" unless where_clause.empty?`).
export function raiseRecordNotFoundExceptionBang(
  this: FinderRelation,
  ids?: unknown,
  resultSize?: number,
  expectedSize?: number,
  key?: string,
  notFoundIds?: unknown[],
): never {
  const name = this._modelClass.name;
  const k = key ?? String(this._modelClass.primaryKey);
  const conditions = this._conditionsClause();

  if (ids === undefined || ids === null) {
    // Rails: `error << " with#{conditions}" if conditions`.
    throw new RecordNotFound(
      `Couldn't find ${name}${conditions ? ` with${conditions}` : ""}`,
      name,
      k,
    );
  }

  const wrapped = Array.isArray(ids) ? ids : [ids];
  if (wrapped.length === 1) {
    // Rails: `"...'#{key}'=#{ids}"`. `${ids}` relies on JS coercing the lone
    // value to its bare string — and a 1-element array to the same (`${[1]}`
    // → "1"). That matches Rails' user-facing message for both `find(1)` and
    // `find([1])`: find_with_ids does `ids = ids.first if expects_array` then
    // `when 1 then find_one(ids.first)`, so the single-id branch always
    // renders a scalar (`'id'=1`). (Ruby `Array#to_s` would print `[1]` only
    // if raise_record_not_found_exception! were called directly with a
    // 1-element array — never via a finder.)
    throw new RecordNotFound(`Couldn't find ${name} with '${k}'=${ids}${conditions}`, name, k, ids);
  }

  let error = `Couldn't find all ${pluralize(name)} with '${k}': `;
  error += `(${wrapped.join(", ")})${conditions} (found ${resultSize} results, but was looking for ${expectedSize}).`;
  if (notFoundIds) {
    error +=
      ` Couldn't find ${pluralize(name, notFoundIds.length)}` +
      ` with ${pluralize(k, notFoundIds.length)} ${notFoundIds.join(", ")}.`;
  }
  throw new RecordNotFound(error, name, k, ids);
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
  // Mirrors construct_relation_for_exists (finder_methods.rb:438): unwrap/forbid
  // strong-params objects before the Array/Hash/scalar case-analysis below. A
  // plain hash/array/scalar/node passes through unchanged. Skip only the
  // `undefined` sentinel (our stand-in for Rails' `:none`, which Rails
  // harmlessly sanitizes as a plain symbol); dereferencing `.permitted` on it
  // would throw, and `exists?` never reaches here with `null` (short-circuited
  // to false upstream), so `undefined` is the sole non-sanitizable input.
  if (conditions !== undefined) {
    conditions = sanitizeForbiddenAttributes(conditions as Record<string, unknown>);
  }
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
  // Rails only skips `where!` for `conditions == :none` (our `undefined`
  // sentinel for "no argument passed"). Every other value — including `true`
  // and `null` — falls through to the `case`/`else` PK-lookup below, matching
  // Rails' `where!(primary_key => conditions) unless conditions == :none`.
  // (`null`/`nil` is unreachable from `exists?`, which short-circuits it to
  // false before ever calling the helper.)
  if (conditions === undefined) {
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
  } else if (conditions !== null && typeof conditions === "object") {
    // Hash-like: Rails' `when Hash` branch — skip if empty.
    if (Object.keys(conditions).length > 0) relation = relation.where(conditions);
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
  if (normalized.emptyArray) return [];
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
    // Rails find_one: raise_record_not_found_exception!(id, 0, 1)
    (rel as any).raiseRecordNotFoundExceptionBang(id, 0, 1);
  }
  return record;
}

/** @internal */
export async function findSome(rel: FinderRelation, ids: unknown[]): Promise<any[]> {
  if (!hasOrder(rel)) return findSomeOrdered(rel, ids);

  const pk = (rel as any)._modelClass.primaryKey as string;
  let relation = (rel as any).where({ [pk]: ids });
  // Rails: `relation = relation.select(table[primary_key]) unless select_values.empty?`
  if ((rel as any).selectValues.length > 0) {
    relation = relation.select((rel as any)._modelClass.arelTable.get(pk));
  }
  const records = await relation.toArray();

  // Rails: expected_size = ids.size, then clamp down for limit/offset.
  // "11 ids with limit 3, offset 9 should give 2 results."
  let expectedSize = ids.length;
  const limitValue: number | null = (rel as any)._limitValue ?? null;
  const offsetValue: number | null = (rel as any)._offsetValue ?? null;
  if (limitValue !== null && ids.length > limitValue) expectedSize = limitValue;
  if (offsetValue !== null && ids.length - offsetValue < expectedSize)
    expectedSize = ids.length - offsetValue;

  if (records.length !== expectedSize) {
    // Rails find_some: raise_record_not_found_exception!(ids, result.size, expected_size)
    (rel as any).raiseRecordNotFoundExceptionBang(ids, records.length, expectedSize, pk);
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
    // Rails find_some_ordered: raise_record_not_found_exception!(ids, result.size, ids.size)
    (rel as any).raiseRecordNotFoundExceptionBang(ids, records.length, ids.length, pk);
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
  return (await rel.findNthWithLimit(index, 1))[0] ?? null;
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
