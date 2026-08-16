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
import { wrap } from "@blazetrails/activesupport";
import { pluralize } from "@blazetrails/activesupport/core-ext/string/inflections";
import {
  ArgumentError,
  RangeError as ActiveModelRangeError,
  sanitizeForMassAssignment as sanitizeForbiddenAttributes,
} from "@blazetrails/activemodel";
import { RecordNotFound, RecordNotSaved, RecordNotUnique, SoleRecordExceeded } from "../errors.js";
import { queryConstraintsList as _queryConstraintsListFn } from "../persistence.js";
import { compactUniqIds, compactUniqTuples } from "./compact-uniq-ids.js";
import { isBaseInstance } from "./predicate-builder/is-base-instance.js";

/** Mirrors: `ActiveRecord::FinderMethods::ONE_AS_ONE` (finder_methods.rb:7). */
const ONE_AS_ONE = "1 AS one";

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
 *   - zero-arg call                     → "without an ID" (Rails `when 0`)
 *   - explicit `find([])`               → short-circuits to `[]` (no raise)
 *   - composite PK + scalar or wrong-arity tuple →
 *     "`<Model>: composite primary key requires a <N>-element array, got <id>`"
 *
 * Does NOT do the actual lookup or the "couldn't find all" aggregate
 * error — that stays at the call site (SQL vs in-memory each have
 * their own count-comparison logic).
 * @internal Rails inlines this in `find`; no counterpart to match against.
 */
export function normalizeFindArgs(
  modelName: string,
  pk: string | string[],
  args: unknown[],
): NormalizedFindIds {
  const composite = Array.isArray(pk);

  if (args.length === 0) {
    // Rails `find_with_ids` `when 0` (finder_methods.rb:508): a zero-arg /
    // empty-id call raises "Couldn't find <Model> without an ID" (no id payload).
    throw new RecordNotFound(`Couldn't find ${modelName} without an ID`, modelName, String(pk));
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
    // Post-flatten empty (e.g. `find(null)`, `find([nil])`): Rails' `compact`
    // drops them, leaving `when 0` → "without an ID".
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

/**
 * Raise the aggregate "couldn't find all" error, composing Rails'
 * `raise_record_not_found_exception!` multi-id message byte-for-byte
 * (finder_methods.rb:431-432): the model name is pluralized and the
 * `(found N results, but was looking for M).` suffix is appended.
 *   - simple PK  → `flatIds.join(", ")`, payload = flatIds.
 *   - composite  → `String(tuples)`    , payload = tuples[][] (tuple
 *     compaction/formatting is a separate concern; the pluralize + suffix
 *     convergence applies to both kinds).
 *
 * `notFoundIds` (Rails' `ids_writer` passes `ids - found_ids`) appends the
 * trailing "Couldn't find <Model> with <key> <ids>." sentence.
 * @internal Relation-free form of `raiseRecordNotFoundExceptionBang` below.
 */
export function raiseNotFoundAll(
  modelName: string,
  pk: string | string[],
  normalized: NormalizedFindIds,
  resultSize: number,
  expectedSize: number,
  conditions = "",
  notFoundIds?: unknown[],
): never {
  const { ids, tuples } = normalized;
  const messageIds = tuples ? String(tuples) : ids.join(", ");
  const payload = tuples ?? ids;
  throw new RecordNotFound(
    formatNotFoundAllMessage(
      modelName,
      String(pk),
      messageIds,
      conditions,
      resultSize,
      expectedSize,
      notFoundIds,
    ),
    modelName,
    String(pk),
    payload,
  );
}

/**
 * Compose the "Couldn't find all …" message shared by `raiseNotFoundAll` and
 * `raiseRecordNotFoundExceptionBang`, byte-for-byte with Rails'
 * `raise_record_not_found_exception!` `else` branch (finder_methods.rb:431-433).
 */
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
      ` with ${pluralize(key, notFoundIds.length)} ${notFoundIds.join(", ")}.`;
  }
  return error;
}

/**
 * Raise the single-id not-found error for a simple PK.
 * Matches `Relation.performFind`'s `"with 'pk'=<id>"` message.
 * @internal Relation-free form of `raiseRecordNotFoundExceptionBang` below.
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
  model: FinderRelation["_model"];
  /** Rails `attr_reader :table` (relation.rb:71) — the relation's own Arel table. */
  table: { get(name: string): Nodes.Node };
  /** Rails `delegate :primary_key, to: :model` (delegation.rb:106). */
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
  /** @internal Rebase-then-report none short-circuit; see Relation. */
  _isEmptyRelation(): boolean;
  limitValue: number | null;
  offsetValue: number | null;
  orderValues: unknown[];
  _rawOrderClauses: string[];
  createWithValue: Record<string, unknown>;
  _scopeAttributes(): Record<string, unknown>;
  scopeForCreate(): Record<string, unknown>;
  _clone(): any;
  whereClause: { isEmpty(): boolean; isContradiction(): boolean };
  havingClause: { isEmpty(): boolean };
  /** Relation#arel — the built SelectManager (relation.ts). */
  arel(): { whereSql(engine: unknown): Nodes.SqlLiteral | null };
  where(conditions: unknown, ...rest: unknown[]): any;
  findBy(conditions: unknown): Promise<any>;
  findByBang(conditions: unknown): Promise<any>;
  /** @internal Relation#_conn — the leased adapter (relation.ts). */
  _conn(): { isTransactionOpen(): boolean };
  limit(n: number): any;
  order(...args: any[]): any;
  reverseOrder(): any;
  toArray(): Promise<any[]>;
  /** Relation#loaded? / Relation#records (relation.ts). */
  isLoaded: boolean;
  records(): Promise<any[]>;
  /** @internal */
  findTake(): Promise<any | null>;
  /** @internal */
  findTakeWithLimit(limit: number): Promise<any[]>;
  /** @internal */
  findNthWithLimit(index: number, limit: number): Promise<any[]>;
  /** @internal */
  findNthFromLast(index: number): Promise<any | null>;
  /** @internal Relation#exists? — recursed into by the eager-loading arm. */
  exists(conditions?: unknown): Promise<boolean>;
  /** @internal */
  constructRelationForExists(conditions: unknown): any;
  /** @internal Relation#eager_loading? (relation.ts). */
  _eagerLoadingForSql(): boolean;
  /** @internal Rails raises EagerLoadPolymorphicError from apply_join_dependency. */
  _checkEagerLoadable(): void;
  /** @internal Relation#apply_join_dependency (relation.ts). */
  applyJoinDependency(options?: { eagerLoading?: boolean }): any;
  /** @internal */
  _materializeDeferredDistinctPkPredicates(): Promise<void>;
  toArel(): { ast: unknown };
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

/** @internal */
export async function performFind(this: FinderRelation, ...args: unknown[]): Promise<any> {
  const pk = this.primaryKey;
  const modelName = this._model.name;
  const normalized = normalizeFindArgs(modelName, pk, args);
  if (normalized.emptyArray) return [];
  const { ids, wantArray, tuples } = normalized;
  // Rails appends the relation's WHERE clause to every not-found message.
  // Rails builds it inside raise_record_not_found_exception! (finder_methods.rb:418);
  // trails precomputes it here because the raise paths below go through the
  // shared raiseNotFoundSingle/raiseNotFoundAll helpers rather than the bang.
  // The guard is `where_clause.empty?`, but the rendered SQL comes from the
  // built arel, whose WHERE also folds in the STI type_condition and any
  // default-scope predicates.
  const conditions = this.whereClause.isEmpty()
    ? ""
    : ` [${this.arel().whereSql(this._model)?.value ?? ""}]`;

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
    if (records.length !== tuples.length)
      raiseNotFoundAll(modelName, pk, normalized, records.length, tuples.length, conditions);
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
  if (records.length !== ids.length)
    raiseNotFoundAll(modelName, pk, normalized, records.length, ids.length, conditions);
  return records;
}

/** @internal */
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

/** @internal */
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

/** @internal */
export async function performFindSoleBy(
  this: FinderRelation,
  ...conditions: unknown[]
): Promise<any> {
  return performSole.call((this.where as any)(...conditions));
}

function hasOrder(rel: FinderRelation): boolean {
  return rel.orderValues.length > 0 || rel._rawOrderClauses.length > 0;
}

/** @internal */
export async function performFirst(this: FinderRelation, n?: number): Promise<any> {
  // Rails: Relation#first(limit) → find_nth_with_limit(0, limit); no-arg
  // first → find_nth(0) → find_nth_with_limit(0, 1). find_nth_with_limit reads
  // the loaded cache when present, otherwise runs an ordered LIMIT query — and
  // crucially caps `limit` against an existing `limit_value` (`first(3)` on a
  // `.limit(2)` relation returns 2 rows, not 3).
  if (n !== undefined) return this.findNthWithLimit(0, n);
  return findNth.call(this, 0);
}

/** @internal */
export async function performFirstBang(this: FinderRelation): Promise<any> {
  const record = await performFirst.call(this);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this);
  }
  return record;
}

/** @internal */
export async function performLast(this: FinderRelation, n?: number): Promise<any> {
  // `return find_last(limit) if loaded? || has_limit_or_offset?`
  // (finder_methods.rb:203). When the relation is already loaded — or carries a
  // `limit`/`offset` that a reverse-order query would otherwise discard — Rails
  // materializes the records and reads the tail in Ruby rather than issuing a
  // fresh reversed query.
  if (this.isLoaded || (this as any).limitValue != null || (this as any).offsetValue != null) {
    return findLast.call(this, n);
  }
  // `result = ordered_relation.limit(limit); result = result.reverse_order!;
  //  limit ? result.reverse : result.first` (finder_methods.rb:205-207).
  let result: any = orderedRelation.call(this).limit(n ?? null);
  result = result.reverseOrderBang();
  if (n !== undefined) return (await result.toArray()).reverse();
  return await performFirst.call(result);
}

/** @internal */
export async function performLastBang(this: FinderRelation): Promise<any> {
  const record = await performLast.call(this);
  if (!record) {
    raiseRecordNotFoundExceptionBang.call(this);
  }
  return record;
}

/** @internal */
export async function performSole(this: FinderRelation): Promise<any> {
  const rel = this._clone();
  rel.limitValue = 2;
  const records = await rel.toArray();
  if (records.length === 0) {
    // Rails Relation#sole calls `raise_record_not_found_exception!` with no
    // args → "Couldn't find <Model>".
    raiseRecordNotFoundExceptionBang.call(this);
  }
  if (records.length > 1) {
    throw new SoleRecordExceeded(this._model);
  }
  return records[0];
}

/** @internal */
export async function performTake(this: FinderRelation, limit?: number): Promise<any> {
  // Rails: `limit ? find_take_with_limit(limit) : find_take` (finder_methods.rb
  // :129). Both go through `this`, so a subclass that overrides either seam —
  // `CollectionProxy`, which points them at the live association scope — is
  // reached from the inherited `take`.
  return limit !== undefined ? this.findTakeWithLimit(limit) : this.findTake();
}

/** @internal */
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
  if (this.isLoaded) {
    return (await this.records()).slice(index, index + limit) ?? [];
  }
  let relation: any = orderedRelation.call(this);
  if ((this as any).limitValue != null) {
    limit = Math.min((this as any).limitValue - index, limit);
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
    return records[records.length - 1 - index] ?? null;
  }
  const relation: any = orderedRelation.call(this);
  // Rails: `if relation.order_values.empty? || relation.has_limit_or_offset?`
  // Use hasOrder() on the result so _rawOrderClauses (e.g. inOrderOf) are also
  // treated as "has an order" — avoids loading all records for those relations.
  if (!hasOrder(relation) || relation.limitValue != null || relation.offsetValue != null) {
    const records = await relation.records();
    return records[records.length - 1 - index] ?? null;
  }
  return relation.reverseOrder().offset(index).first();
}

/** @internal */
export async function performSecond(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 1);
}

/** @internal */
export async function performThird(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 2);
}

/** @internal */
export async function performFourth(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 3);
}

/** @internal */
export async function performFifth(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 4);
}

/** @internal */
export async function performFortyTwo(this: FinderRelation): Promise<any | null> {
  return findNth.call(this, 41);
}

/** @internal */
export async function performSecondToLast(this: FinderRelation): Promise<any | null> {
  return this.findNthFromLast(1);
}

/** @internal */
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

/** @internal */
export const performSecondBang = bangFinder(performSecond);
/** @internal */
export const performThirdBang = bangFinder(performThird);
/** @internal */
export const performFourthBang = bangFinder(performFourth);
/** @internal */
export const performFifthBang = bangFinder(performFifth);
/** @internal */
export const performFortyTwoBang = bangFinder(performFortyTwo);
/** @internal */
export const performSecondToLastBang = bangFinder(performSecondToLast);
/** @internal */
export const performThirdToLastBang = bangFinder(performThirdToLast);

/** @internal */
export async function performFindOrCreateByBang(
  this: FinderRelation,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<any> {
  // Rails (relation.rb:238): find_by(attributes) || create_or_find_by!(attributes)
  // — the create leg rides create_or_find_by! so a concurrent insert that wins
  // the race is recovered via its RecordNotUnique rescue instead of raising.
  const existing = await this.findBy(conditions);
  if (existing) return existing;
  return performCreateOrFindByBang.call(this, conditions, extra);
}

/** @internal */
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
    const result = await this._model.transaction(
      () =>
        this._model.createBang({
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
        `${this._model.name}.createOrFindByBang rolled back before persist`,
        undefined,
      );
    }
    return result;
  } catch (error) {
    if (!(error instanceof RecordNotUnique)) throw error;
    // Rails (relation.rb:292-296): with a transaction still open the winner is
    // materialized + row-locked inside it; otherwise plain find_by!, no lock.
    if (this._conn().isTransactionOpen()) {
      return this.where(conditions).lock().findByBang(conditions);
    }
    return this.findByBang(conditions);
  }
}

/**
 * Check if any records exist, optionally with conditions.
 *
 * Mirrors: ActiveRecord::FinderMethods#exists? — ending in
 * `skip_query_cache_if_necessary { with_connection { |c|
 * c.select_rows(relation.arel, "#{model.name} Exists?").size == 1 } }`
 * (finder_methods.rb:377-381), the cached read path.
 */
export async function exists(
  this: FinderRelation,
  conditions?: Record<string, unknown> | unknown,
): Promise<boolean> {
  if (this._isEmptyRelation()) return false;
  // `Base === conditions` (finder_methods.rb:360) — detected via the inherited
  // `_isActiveRecordBase` marker so a model of any class (not just this
  // relation's) is caught.
  if (isBaseInstance(conditions)) {
    throw new ArgumentError(
      "You are passing an instance of ActiveRecord::Base to `exists?`. " +
        "Please pass the id of the object by calling `.id`.",
    );
  }
  // `return false if !conditions || limit_value == 0` (finder_methods.rb:367).
  // Ruby's `!conditions` is true only for nil/false, so `undefined` — our
  // stand-in for the `:none` default, a truthy Symbol in Ruby — passes through.
  if (conditions === false || conditions === null || this.limitValue === 0) return false;
  // Rails builds the JoinDependency inside `apply_join_dependency`
  // (finder_methods.rb:370) even on the arm that never reaches it, so the
  // EagerLoadPolymorphicError it raises for a polymorphic spec has to be
  // surfaced here rather than only where the joins are actually built.
  this._checkEagerLoadable();
  if (this._eagerLoadingForSql()) {
    return this.applyJoinDependency({ eagerLoading: false }).exists(conditions);
  }
  const relation = this.constructRelationForExists(conditions);
  // Resolve any deferred distinct-PK subquery markers to a literal id list
  // before compiling: Arel has no such marker, so Rails materializes them at
  // `.where()`-build time and never carries one into `arel`.
  await relation._materializeDeferredDistinctPkPredicates();
  if (relation.whereClause.isContradiction()) return false;
  return await this.skipQueryCacheIfNecessary(() =>
    this.withConnection(
      async (c) => (await c.selectRows(relation.toArel(), `${this.model.name} Exists?`)).length === 1,
    ),
  );
}

/**
 * Check if the given record is present in the relation.
 *
 * Mirrors: ActiveRecord::FinderMethods#include? (finder_methods.rb:389-407).
 * A non-model argument short-circuits to `false` without querying. A loaded
 * relation — or one carrying offset/limit/having — compares in memory; an
 * unloaded relation without those issues a cheap `exists?(id)` rather than
 * materializing every row.
 */
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
  // Unloaded fast path: probe existence by primary key. The composite-PK arm
  // (Rails `record.class.composite_primary_key?`) is a `primary_key.zip(id)`
  // hash rather than the tuple, which exists()'s array branch would read as
  // `[sql, ...binds]`.
  const recordClass = record.constructor;
  const id = recordClass.compositePrimaryKey
    ? Object.fromEntries(
        (recordClass.primaryKey as string[]).map((column, index) => [column, record.id[index]]),
      )
    : record.id;

  return this.exists(id);
}

/**
 * Alias of {@link include} — mirrors `alias :member? :include?`
 * (finder_methods.rb:407).
 */
export const member = include;

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
  // Rails: `conditions = " [#{arel.where_sql(model)}]" unless where_clause.empty?`
  // (finder_methods.rb:418). `where_sql` returns nil when the manager has no
  // wheres, which Ruby interpolates as "" — hence the `?? ""`.
  const conditions = this.whereClause.isEmpty()
    ? ""
    : ` [${this.arel().whereSql(this.model)?.value ?? ""}]`;

  const name = this.model.name;
  key ??= String(this.model.primaryKey);

  if (ids === undefined || ids === null) {
    // Rails: `error << " with#{conditions}" if conditions`.
    throw new RecordNotFound(
      `Couldn't find ${name}${conditions ? ` with${conditions}` : ""}`,
      name,
      key,
    );
  }

  // Rails: `elsif Array.wrap(ids).size == 1` (finder_methods.rb:428).
  const wrapped = wrap(ids);
  if (wrapped.length === 1) {
    // Rails: `"...'#{key}'=#{ids}"`. `${ids}` relies on JS coercing the lone
    // value to its bare string — and a 1-element array to the same (`${[1]}`
    // → "1"). That matches Rails' user-facing message for both `find(1)` and
    // `find([1])`: find_with_ids does `ids = ids.first if expects_array` then
    // `when 1 then find_one(ids.first)`, so the single-id branch always
    // renders a scalar (`'id'=1`). (Ruby `Array#to_s` would print `[1]` only
    // if raise_record_not_found_exception! were called directly with a
    // 1-element array — never via a finder.)
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
    wrapped.join(", "),
    conditions,
    resultSize,
    expectedSize,
    notFoundIds,
  );
  throw new RecordNotFound(error, name, key, ids);
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
  exists,
  include,
  member,
  findOrCreateByBang: performFindOrCreateByBang,
  createOrFindByBang: performCreateOrFindByBang,
  raiseRecordNotFoundExceptionBang,
  // finder_methods.rb's private helpers. Rails defines these once, in
  // FinderMethods, and Relation gets them by `include`; they ride the same
  // mixin here so `relation.ts` does not redeclare a second copy.
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

// ---------------------------------------------------------------------------
// Private helpers (mirrors Rails' ActiveRecord::FinderMethods private methods)
// ---------------------------------------------------------------------------

/** @internal */
export function constructRelationForExists(this: FinderRelation, conditions: unknown): any {
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
  let relation: any;
  if ((this as any).distinctValue && (this as any).offsetValue != null) {
    relation = (this as any).except("order").limitBang(1);
  } else {
    relation = (this as any)
      .except("select", "distinct", "order")
      ._selectBang(new Nodes.SqlLiteral(ONE_AS_ONE))
      .limitBang(1);
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
 * Mirror Rails `using_limitable_reflections?` (finder_methods.rb:487):
 * `reflections.none?(&:collection?)` — a set of reflections is limitable
 * when none of them is a collection association.
 *
 * @internal
 */
export function usingLimitableReflections(
  this: FinderRelation,
  reflections: Array<{ isCollection(): boolean }>,
): boolean {
  return reflections.every((r) => !r.isCollection());
}

/** @internal */
export async function findWithIds(this: FinderRelation, ids: unknown[]): Promise<any> {
  const normalized = normalizeFindArgs(this.model.name, this.primaryKey, ids);
  if (normalized.emptyArray) return [];
  // Rails' `case ids.size` reaches the `when 1` arm (`find_one`) before the
  // `else` arm (`find_some`) — finder_methods.rb:519-523.
  if (!normalized.wantArray) {
    return findOne.call(this, normalized.ids[0]);
  }
  return (this as any).findSome(normalized.ids);
}

/** @internal */
export async function findOne(this: FinderRelation, id: unknown): Promise<any> {
  const pk = this.primaryKey;
  // Rails find_one (finder_methods.rb:534-540): `where(primary_key.zip(id).to_h)`
  // for a composite key, `where(primary_key => id)` otherwise, then `.take`.
  const relation = Array.isArray(pk)
    ? (this as any).where(buildPkWhere(pk, id as unknown[]))
    : (this as any).where({ [pk]: id });
  const record = await relation.take();
  if (!record) {
    // Rails find_one: raise_record_not_found_exception!(id, 0, 1)
    (this as any).raiseRecordNotFoundExceptionBang(id, 0, 1);
  }
  return record;
}

/** @internal */
export async function findSome(this: FinderRelation, ids: unknown[]): Promise<any[]> {
  if (!hasOrder(this)) return (this as any).findSomeOrdered(ids);

  const pk = this.primaryKey as string;
  let relation = (this as any).where({ [pk]: ids });
  // Rails: `relation = relation.select(table[primary_key]) unless select_values.empty?`
  if ((this as any).selectValues.length > 0) {
    relation = relation.select(this.table.get(pk));
  }
  const records = await relation.toArray();

  // Rails: expected_size = ids.size, then clamp down for limit/offset.
  // "11 ids with limit 3, offset 9 should give 2 results."
  let expectedSize = ids.length;
  const limitValue: number | null = (this as any).limitValue ?? null;
  const offsetValue: number | null = (this as any).offsetValue ?? null;
  if (limitValue !== null && ids.length > limitValue) expectedSize = limitValue;
  if (offsetValue !== null && ids.length - offsetValue < expectedSize)
    expectedSize = ids.length - offsetValue;

  if (records.length !== expectedSize) {
    // Rails find_some: raise_record_not_found_exception!(ids, result.size, expected_size)
    (this as any).raiseRecordNotFoundExceptionBang(ids, records.length, expectedSize);
  }
  return records;
}

/** @internal */
export async function findSomeOrdered(this: FinderRelation, ids: unknown[]): Promise<any[]> {
  const offsetValue: number = (this as any).offsetValue ?? 0;
  const limitValue: number | null = (this as any).limitValue ?? null;
  ids = ids.slice(offsetValue, offsetValue + (limitValue ?? ids.length));

  let relation = (this as any).except("limit", "offset");
  relation = relation.where({ [this.model.primaryKey as string]: ids });
  if ((this as any).selectValues.length > 0) {
    relation = relation.select(this.table.get(this.model.primaryKey as string));
  }
  const records: any[] = await relation.records();

  const primaryKey = this.model.primaryKey as string;
  const primaryKeyType = (this.model as any).typeForAttribute(primaryKey);
  const castKey = (id: unknown) => String(primaryKeyType.cast(id));

  if (records.length !== ids.length) {
    // Rails find_some_ordered: raise_record_not_found_exception!(ids, result.size, ids.size)
    (this as any).raiseRecordNotFoundExceptionBang(ids, records.length, ids.length);
  }
  const idIndex = new Map(ids.map((id, i) => [castKey(id), i]));
  return records.sort((a: any, b: any) => {
    const ai = idIndex.get(castKey(a.readAttribute?.(primaryKey) ?? a[primaryKey])) ?? 0;
    const bi = idIndex.get(castKey(b.readAttribute?.(primaryKey) ?? b[primaryKey])) ?? 0;
    return ai - bi;
  });
}

/** @internal */
export async function findTake(this: FinderRelation): Promise<any | null> {
  if (this.isLoaded) return (await this.records())[0] ?? null;
  // `@take ||=` (finder_methods.rb:586): a nil result is not memoized, so the
  // query re-runs until a record exists.
  (this as any)._take ??= (await (this as any).limit(1).records())[0] ?? null;
  return (this as any)._take;
}

/** @internal */
export async function findTakeWithLimit(this: FinderRelation, limit: number): Promise<any[]> {
  if (this.isLoaded) return (await this.records()).slice(0, limit);
  return (this as any).limit(limit).toArray();
}

/** @internal */
export async function findNth(this: FinderRelation, index: number): Promise<any | null> {
  // `@offsets[index] ||=` (finder_methods.rb:600): as with `@take`, a nil hit
  // is not memoized and re-queries.
  const offsets = ((this as any)._offsets ??= new Map<number, any>());
  let record = offsets.get(index) ?? null;
  if (record == null) {
    record = (await this.findNthWithLimit(index, 1))[0] ?? null;
    offsets.set(index, record);
  }
  return record;
}

/** @internal */
export async function findLast(this: FinderRelation, limit?: number): Promise<any> {
  // `limit ? records.last(limit) : records.last` (finder_methods.rb:636-638).
  const records: any[] = await this.records();
  if (limit === undefined) return records[records.length - 1] ?? null;
  // Ruby `records.last(0) == []`; `slice(-0)` would return the whole array.
  return limit === 0 ? [] : records.slice(-limit);
}

/** @internal */
export function orderedRelation(this: FinderRelation): any {
  const mc = this.model as any;
  const pk = this.primaryKey;
  const implicitOrder: string | null | undefined = mc?.implicitOrderColumn;
  const constraintsList: string[] | null = mc ? _queryConstraintsListFn.call(mc) : null;
  if (!hasOrder(this) && (implicitOrder || constraintsList != null || pk)) {
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
