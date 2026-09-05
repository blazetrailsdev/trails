import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { hexdigest, isBlank, toFs } from "@blazetrails/activesupport";
import { except, Range } from "@blazetrails/ruby-compat";
import { isEmpty } from "@blazetrails/ruby-compat";
import { first } from "./ruby-first.js";
import { Table, SelectManager, Nodes, sql, star } from "@blazetrails/arel";
import type { Base } from "./base.js";
import { threadedConnectionFor } from "./connection-handling.js";
import { ActiveRecordError, RecordNotSaved, RecordNotUnique, UnknownPrimaryKey } from "./errors.js";
import { InvalidSignature } from "@blazetrails/activesupport/message-verifier";
import { max } from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import type { SerializeOptions } from "@blazetrails/activemodel";

import { applyThenable, stripThenable } from "./relation/thenable.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { wrap, any, compactBlank, groupBy, indexBy } from "@blazetrails/activesupport";

export { Range };
import {
  WhereChain,
  QueryMethods,
  defineValueMethods,
  type UnscopeType,
  type ExceptSkip,
  type AssociationSpec,
  type JoinSpec,
  type OrderArg,
} from "./relation/query-methods.js";
import * as _qm from "./relation/query-methods.js";
import { Batches } from "./relation/batches.js";
import {
  wrapWithScopeProxy,
  relationClassFor,
  create as _delegationCreate,
  DelegationMethods,
  type ToSentenceOptions,
  type ToXmlOptions,
} from "./relation/delegation.js";
import {
  _registerRelationFamily,
  _relationFamilySlot,
} from "./relation/uncacheable-methods-slot.js";
import { InsertAll, type InsertAllOptions } from "./insert-all.js";
import { Result } from "./result.js";
import { FutureResult, Complete } from "./future-result.js";
import { ScopeRegistry } from "./scoping.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { include, type Included } from "@blazetrails/activesupport";
import { Calculations, type CalculationMethods } from "./relation/calculations.js";
import { FinderMethods } from "./relation/finder-methods.js";
import { SpawnMethods } from "./relation/spawn-methods.js";
import { FromClause } from "./relation/from-clause.js";
import { TableMetadata } from "./table-metadata.js";
import { WhereClause } from "./relation/where-clause.js";
import type { BatchEnumerator } from "./relation/batches/batch-enumerator.js";
import {
  touchAttributesWithTime,
  parseTouchAllArgs,
  type TouchAllArgs,
  type CounterCacheTouchOption,
} from "./timestamp.js";
import { Explain } from "./explain.js";
import type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { PrettyPrinter } from "./pretty-print.js";
import { JoinDependency } from "./associations/join-dependency.js";
import {
  DeferredDistinctPkIn,
  DeferredDistinctPkNotIn,
  DeferredIdsIn,
  DeferredIdsNotIn,
} from "./relation/predicate-builder/deferred-distinct-pk-in.js";
import { AliasCounts, AliasTracker } from "./associations/alias-tracker.js";

export type LoadedRelation<R> = Omit<R, "then">;

/** @internal */
export type InBatchesOptions = {
  of?: number;
  start?: unknown;
  finish?: unknown;
  order?: "asc" | "desc" | ("asc" | "desc")[];
  cursor?: string | string[];
  errorOnIgnore?: boolean;
  load?: boolean;
  useRanges?: boolean | null;
};

/** @internal */
export type EnumerablePattern<T extends Base> =
  | ((record: T) => boolean)
  | (new (...args: never[]) => Base);

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((element, i) => valuesEqual(element, b[i]))
    );
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (typeof (a as any).equals === "function") return Boolean((a as any).equals(b));
  if (typeof (a as any).eql === "function") return Boolean((a as any).eql(b));
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) && valuesEqual((a as any)[key], (b as any)[key]),
  );
}

function takeLimit(limitValue: number | string | null): number {
  if (limitValue === null) return 11;
  if (typeof limitValue !== "number") {
    throw new ArgumentError("comparison of String with 11 failed");
  }
  return Math.min(limitValue, 11);
}

/** @internal */
const StrictLoadingScope = {
  isEmptyScope: true,
  strictLoadingValue: true,
} as const;

export type ValueMethod =
  | (typeof Relation.MULTI_VALUE_METHODS)[number]
  | (typeof Relation.SINGLE_VALUE_METHODS)[number]
  | (typeof Relation.CLAUSE_METHODS)[number];

export type ValuesHash = {
  includes?: AssociationSpec[];
  eagerLoad?: AssociationSpec[];
  preload?: AssociationSpec[];
  select?: (string | Nodes.Node)[];
  group?: string[];
  order?: Array<string | Nodes.Node>;
  joins?: (AssociationSpec | string | Nodes.Join)[];
  leftOuterJoins?: AssociationSpec[];
  references?: string[];
  extending?: Array<Record<string, (...args: any[]) => any>>;
  unscope?: Array<string | { where: string | string[] }>;
  optimizerHints?: string[];
  annotate?: string[];
  with?: Array<{ name: string; expression: Nodes.Node; recursive: boolean }>;
  limit?: number | string | null;
  offset?: number | string | null;
  lock?: string | null;
  readonly?: boolean;
  reordering?: boolean;
  strictLoading?: boolean;
  reverseOrder?: boolean;
  distinct?: boolean;
  createWith?: Record<string, unknown>;
  skipQueryCache?: boolean;
  where?: WhereClause;
  having?: WhereClause;
  from?: FromClause;
};

declare const relationNameBrand: unique symbol;

export type RelationName = string | { readonly [relationNameBrand]: never };

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/** @internal */
export class ExplainProxy<T extends Base> {
  private readonly _relation: Relation<T>;
  private readonly _options: ExplainOption[];

  constructor(relation: Relation<T>, options: ExplainOption[]) {
    this._relation = relation;
    this._options = options;
  }

  inspect(): Promise<string> {
    return this.execExplain(() =>
      (this._relation as unknown as { execQueries(): Promise<T[]> }).execQueries(),
    );
  }

  average(columnName: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.average(columnName as never));
  }

  count(columnName?: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.count(columnName as never));
  }

  first(limit?: number): Promise<string> {
    return this.execExplain(() => this._relation.first(limit as never));
  }

  last(limit?: number): Promise<string> {
    return this.execExplain(() => this._relation.last(limit as never));
  }

  maximum(columnName: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.maximum(columnName as never));
  }

  minimum(columnName: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.minimum(columnName as never));
  }

  pluck(...columnNames: (string | Nodes.Node)[]): Promise<string> {
    return this.execExplain(() => this._relation.pluck(...(columnNames as never[])));
  }

  sum(identityOrColumn?: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.sum(identityOrColumn as never));
  }

  private async execExplain(block: () => unknown): Promise<string> {
    const { queries } = await this._relation.collectingQueriesForExplain(async () => block());
    return this._relation.execExplain(queries, this._options);
  }
}

export interface ExplainProxy<T extends Base> {
  then<TResult1 = string, TResult2 = never>(
    onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  /** @noRailsEquivalent PERMANENT */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<string | TResult>;
  /** @noRailsEquivalent PERMANENT */
  finally(onfinally?: (() => void) | null): Promise<string>;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

const ENUMERABLE_DELEGATES = {
  detect: <T>(records: T[], fn: (record: T, index: number, all: T[]) => unknown): T | undefined =>
    records.find(fn),

  reject: <T>(records: T[], fn: (record: T) => boolean): T[] => records.filter((r) => !fn(r)),

  sortBy: <T>(records: T[], key: (record: T) => any): T[] =>
    records
      .map((record, index) => ({ record, index, sortKey: key(record) }))
      .sort((a, b) => {
        if (a.sortKey < b.sortKey) return -1;
        if (a.sortKey > b.sortKey) return 1;
        return a.index - b.index;
      })
      .map((entry) => entry.record),

  groupBy,

  indexBy,

  compactBlank,
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Relation<T extends Base> {
  /** @internal */
  static _railsClassName = "ActiveRecord::Relation";

  static create = _delegationCreate;

  static readonly MULTI_VALUE_METHODS = [
    "includes",
    "eagerLoad",
    "preload",
    "select",
    "group",
    "order",
    "joins",
    "leftOuterJoins",
    "references",
    "extending",
    "unscope",
    "optimizerHints",
    "annotate",
    "with",
  ] as const;

  static readonly SINGLE_VALUE_METHODS = [
    "limit",
    "offset",
    "lock",
    "readonly",
    "reordering",
    "strictLoading",
    "reverseOrder",
    "distinct",
    "createWith",
    "skipQueryCache",
  ] as const;

  static readonly INVALID_METHODS_FOR_DELETE_ALL = ["distinct", "with", "with_recursive"] as const;

  static readonly CLAUSE_METHODS = ["where", "having", "from"] as const;

  static readonly VALUE_METHODS: readonly ValueMethod[] = [
    ...Relation.MULTI_VALUE_METHODS,
    ...Relation.SINGLE_VALUE_METHODS,
    ...Relation.CLAUSE_METHODS,
  ];

  private _model: typeof Base;
  /** @internal */
  _values: ValuesHash = {};
  _withIsRecursive = false;
  private _isNone = false;
  /** @internal */
  _seededNoneNewOwner = false;
  /** @internal */
  _seedWherePredicates: readonly unknown[] = [];
  skipPreloadingValue = false;
  /** @internal */
  _arel?: SelectManager;
  private _loaded = false;
  private _delegateToModel = false;
  private _recordsStore: T[] = [];
  protected get _records(): T[] {
    return this._recordsStore;
  }

  protected set _records(records: T[]) {
    this._recordsStore = records;
  }
  protected _take?: T | null;
  protected _offsets?: Map<number, T | null>;
  _instantiateBlock?: (record: T) => void;
  private _futureResult?: FutureResult | Complete | Promise<Result>;
  private _loadToken = 0;

  private _joinDependency: JoinDependency | null = null;

  private _table: Table | null = null;

  constructor(
    model: typeof Base,
    table?: Table | Nodes.TableAlias,
    predicateBuilder?: PredicateBuilder,
    values: ValuesHash = {},
  ) {
    this._model = model;
    if (table) {
      this._table = table as Table;
    }
    this._values = values;
    if (predicateBuilder) {
      this._predicateBuilder = predicateBuilder;
    }
  }

  inspect(): string {
    const className = (this.constructor as typeof Relation)._railsClassName;
    if (this.isLoaded && !this.isScheduled) {
      const max = takeLimit(this.limitValue);
      const entries = this._records.slice(0, max).map((record) => record.inspect());
      if (entries.length === 11) entries[10] = "...";
      return `#<${className} [${entries.join(", ")}]>`;
    }
    return `#<${className} [...]>`;
  }

  async prettyPrint(pp: PrettyPrinter): Promise<void> {
    const max = takeLimit(this.limitValue);
    const subject = this.isLoaded
      ? await this.records()
      : await this.annotate("loading for pp").limit(max);
    const entries = subject.slice(0, max) as (T | string)[];
    if (entries.length === 11) entries[10] = "...";
    await pp.pp(entries);
  }

  get isReadonly(): boolean | null {
    return this.readonlyValue;
  }

  get isLocked(): string | boolean | null {
    return this.lockValue;
  }

  unscoped(): Relation<T> {
    return this._model.unscoped() as unknown as Relation<T>;
  }

  get isLoaded(): boolean {
    return this._loaded;
  }

  reset(): this {
    this._arel = undefined;
    this._loaded = false;
    this._delegateToModel = false;
    this._offsets = undefined;
    this._take = undefined;
    this._records = [];
    this._shouldEagerLoad = undefined;
    this._cacheKeys = undefined;
    this._cacheVersions = undefined;
    this._loadToken += 1;
    if (this._futureResult instanceof FutureResult) this._futureResult.cancel();
    this._futureResult = undefined;
    return this;
  }

  async reload(): Promise<LoadedRelation<this>> {
    this.reset();
    await this.load();
    return stripThenable(this);
  }

  async records(): Promise<T[]> {
    await this.load();
    return this._records;
  }

  loadAsync(): Relation<T> {
    if (!this.isLoaded) {
      const result = this.execMainQuery(true);
      if (result instanceof Result) {
        this.loadRecords(this.instantiateRecords(result));
      } else {
        if (result instanceof Promise) void result.catch(() => {});
        this._futureResult = result;
      }
      this._loaded = true;
    }
    return this;
  }

  build(attributes: Record<string, unknown>[], block?: (r: T) => void): T[];
  build(attributes?: Record<string, unknown>, block?: (r: T) => void): T;
  build(
    attributes: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    if (Array.isArray(attributes)) {
      return attributes.map((a) => this.build(a, block));
    }
    const restoring = block ? this.currentScopeRestoringBlock(block) : undefined;
    const modelClass = this._model as any;
    const prev = ScopeRegistry.currentScope(modelClass);
    modelClass.setCurrentScope(this as any);
    try {
      return this._new(attributes, restoring);
    } finally {
      modelClass.setCurrentScope(prev);
    }
  }

  async create(attributes: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async create(attributes?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async create(
    attributes: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attributes)) {
      const records: T[] = [];
      for (const a of attributes) {
        records.push(await this.create(a, block));
      }
      return records;
    }
    const restoring = this.currentScopeRestoringBlock(block);
    return await this.scoping(() => this._create(attributes, restoring));
  }

  async createBang(attributes: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async createBang(attributes?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async createBang(
    attributes: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attributes)) {
      const records: T[] = [];
      for (const a of attributes) {
        records.push(await this.createBang(a, block));
      }
      return records;
    }
    const restoring = this.currentScopeRestoringBlock(block);
    return await this.scoping(() => this._createBang(attributes, restoring));
  }

  async size(): Promise<number> {
    if (this.isLoaded) return (await this.records()).length;
    return this.count(":all") as Promise<number>;
  }

  async isEmpty(): Promise<boolean> {
    if (this.isLoaded) return (await this.records()).length === 0;
    return !(await this.exists());
  }

  async isAny(args?: EnumerablePattern<T>): Promise<boolean> {
    if (this.isNullRelation()) return false;
    if (args !== undefined) {
      const matches = (record: T): boolean =>
        (args as { _isActiveRecordBase?: unknown })._isActiveRecordBase === true
          ? record instanceof (args as new (...args: never[]) => Base)
          : (args as (record: T) => boolean)(record);
      return (await this.toArray()).some(matches);
    }
    return !(await this.isEmpty());
  }

  async isMany(predicate?: (record: T) => boolean): Promise<boolean> {
    if (this.isNullRelation()) return false;
    if (predicate !== undefined) {
      let count = 0;
      for (const record of await this.toArray()) {
        if (predicate(record) && ++count === 2) break;
      }
      return count > 1;
    }
    if (this.isLoaded) return (await this.records()).length > 1;
    return (await this.limitedCount()) > 1;
  }

  async isOne(args?: EnumerablePattern<T>): Promise<boolean> {
    if (this.isNullRelation()) return false;
    if (args !== undefined) {
      const matches = (record: T): boolean =>
        (args as { _isActiveRecordBase?: unknown })._isActiveRecordBase === true
          ? record instanceof (args as new (...args: never[]) => Base)
          : (args as (record: T) => boolean)(record);
      let count = 0;
      for (const record of await this.toArray()) {
        if (matches(record) && ++count === 2) break;
      }
      return count === 1;
    }
    if (this.isLoaded) return (await this.records()).length === 1;
    return (await this.limitedCount()) === 1;
  }

  async isBlank(): Promise<boolean> {
    return this.isEmpty();
  }

  async isPresent(): Promise<boolean> {
    return this.isAny();
  }

  async presence(): Promise<LoadedRelation<Relation<T>> | null> {
    return (await this.isPresent()) ? stripThenable(this as Relation<T>) : null;
  }

  async detect(fn: (record: T, index: number, all: T[]) => unknown): Promise<T | undefined> {
    return ENUMERABLE_DELEGATES.detect(await this.toArray(), fn);
  }

  async reject(fn: (record: T) => boolean): Promise<T[]> {
    return ENUMERABLE_DELEGATES.reject(await this.toArray(), fn);
  }

  async sortBy(key: (record: T) => any): Promise<T[]> {
    return ENUMERABLE_DELEGATES.sortBy(await this.toArray(), key);
  }

  async groupBy<K>(fn: (record: T) => K): Promise<Map<K, T[]>> {
    return ENUMERABLE_DELEGATES.groupBy(await this.toArray(), fn);
  }

  async indexBy<K extends string | number>(fn: (record: T) => K): Promise<Record<K, T>> {
    return ENUMERABLE_DELEGATES.indexBy(await this.toArray(), fn);
  }

  async compactBlank(): Promise<T[]> {
    return ENUMERABLE_DELEGATES.compactBlank(await this.toArray());
  }

  async load(): Promise<LoadedRelation<this>> {
    if (this.isNullRelation()) return stripThenable(this);
    if (!this.isLoaded || this.isScheduled) {
      const token = this._loadToken;
      const records = await this.withConnection(() => this.execQueries());
      if (token === this._loadToken) this.loadRecords(records);
    }
    return stripThenable(this);
  }

  async toArray(): Promise<T[]> {
    return [...(await this.records())];
  }

  protected async execQueries(): Promise<T[]> {
    return this.skipQueryCacheIfNecessary(async () => {
      await (
        this._model as unknown as { ensureSchemaLoaded(): Promise<void> }
      ).ensureSchemaLoaded();

      await this._materializeDeferredDistinctPkPredicates();

      const token = this._loadToken;

      let rows: Result;
      if (this.isScheduled) {
        const future = this._futureResult!;
        this._futureResult = undefined;
        rows = await (future instanceof FutureResult ? future.result() : future);
      } else {
        rows = await this.execMainQuery();
      }
      if (token !== this._loadToken) return [];
      const records = this.instantiateRecords(rows);

      if (!this.skipPreloadingValue) {
        await this.preloadAssociations(records);
        if (token !== this._loadToken) return [];
      }

      if (this.readonlyValue) {
        for (const record of records) {
          (record as any)._readonly = true;
        }
      }
      if (this.strictLoadingValue != null) {
        for (const record of records) {
          (record as any)._strictLoading = this.strictLoadingValue;
        }
      }

      return records;
    });
  }

  private execMainQuery(async = false): Result | Promise<Result> | FutureResult | Complete {
    if (this._isNone) {
      if (async) {
        return FutureResult.wrap(Result.empty());
      } else {
        return Result.empty();
      }
    }

    const c = this._conn();
    async = async && c.asyncEnabled?.() === true && !c.currentTransaction?.()?.joinable;

    return this.skipQueryCacheIfNecessary(() => {
      if (this.whereClause.isContradiction()) return Result.empty();

      if (this.isEagerLoading) {
        return this.applyJoinDependency({}, (relation, joinDependency) => {
          if (relation.isNullRelation()) return Result.empty();
          joinDependency.applyColumnAliases(relation);
          this._joinDependency = joinDependency;
          return this._conn().selectAll(relation.arel(), "SQL", [], { async });
        });
      }

      return c.selectAll(this.arel(), `${this.model.name} Load`, [], { async });
    });
  }

  /** @missingRailsCall empty? — PERMANENT */
  private referencesEagerLoadedTables(): boolean {
    const joinedTables = this.buildJoins([]).flatMap((join: Nodes.Join) =>
      join instanceof Nodes.StringJoin
        ? this.tablesInString(join.left as Nodes.Node)
        : [(join.left as unknown as { name: string }).name],
    );

    joinedTables.push(String(this.table.name));

    const downcased = joinedTables.map((name) => name.toLowerCase());

    return this.referencesValues.some((ref) => {
      const string = typeof ref === "string" && ref.startsWith(":") ? ref.slice(1) : String(ref);
      return !downcased.includes(string);
    });
  }

  private tablesInString(string: Nodes.Node | string | null | undefined): string[] {
    if (string instanceof Nodes.SqlLiteral) string = string.value;
    else if (string instanceof Nodes.Node) string = string.toSql();
    if (!string) return [];
    const matches = string.match(/[a-zA-Z_][\w.]+(?=.?\.)/g) ?? [];
    return matches.map((s) => s.toLowerCase()).filter((s) => s !== "raw_sql_");
  }

  private limitedCount(): Promise<number> {
    if (this.limitValue != null) return this.count() as Promise<number>;
    return this.limit(2).count() as Promise<number>;
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const records = await this.toArray();
    for (const record of records) {
      yield record;
    }
  }

  explain(...options: ExplainOption[]): ExplainProxy<T> {
    return new ExplainProxy(this, options);
  }

  /** @internal */
  _checkEagerLoadable(): void {
    if (!this.isEagerLoading) return;
    const specs = [...new Set([...this.eagerLoadValues, ...this.includesValues])];
    new JoinDependency(this._model, this.table, specs, Nodes.OuterJoin);
  }

  async updateAll(
    updates: Record<string, unknown> | string | [string, ...unknown[]],
  ): Promise<number> {
    const table = this.table;
    if (isBlank(updates)) throw new ArgumentError("Empty list of attributes to change");
    if (this.isNullRelation()) return 0;
    await this._materializeDeferredDistinctPkPredicates();

    let values: [Nodes.Node, unknown][] | Nodes.SqlLiteral;
    if (typeof updates !== "string" && !Array.isArray(updates)) {
      if (
        this.model.lockingEnabled &&
        !Object.prototype.hasOwnProperty.call(updates, this.model.lockingColumn)
      ) {
        const attr = table.get(this.model.lockingColumn);
        updates[String(attr.name)] = this._incrementAttribute(attr);
      }
      values = this._substituteValues(Object.entries(updates));
    } else {
      values = sql(this.model.sanitizeSqlForAssignment(updates, String(table.name)));
    }

    const arel = this.isEagerLoading
      ? await this.applyJoinDependency({}, (relation) => relation.arel())
      : this.buildArel(this._conn());
    arel.source.left = table;
    const groupValuesArelColumns = this.arelColumns(
      Array.from(new Set(this.groupValues)),
    ) as Nodes.Node[];
    const havingClauseAst = this.havingClause.isEmpty() ? null : this.havingClause.ast;
    const primaryKey = this.primaryKey;
    const key = this.model.compositePrimaryKey
      ? (primaryKey as string[]).map((pk) => table.get(pk))
      : table.get((primaryKey as string | null) ?? null);
    const stmtAst = arel.compileUpdate(values, key, havingClauseAst, groupValuesArelColumns).ast;
    const count = await this._conn().update(stmtAst, `${this.model.name} Update All`);
    this.reset();
    return count;
  }

  async destroyAll(): Promise<T[]> {
    const recs = await this.records();
    for (const record of recs) {
      await record.destroy();
    }
    this.reset();
    return recs;
  }

  async deleteAll(): Promise<number> {
    if (this.isNullRelation()) return 0;
    await this._materializeDeferredDistinctPkPredicates();

    const invalidMethods = Relation.INVALID_METHODS_FOR_DELETE_ALL.filter((method) => {
      const value = (this._values as Record<string, unknown>)[method];
      return method === "distinct" ? Boolean(value) : any((value ?? []) as unknown[]);
    });
    if (invalidMethods.length > 0) {
      throw new ActiveRecordError(`delete_all doesn't support ${invalidMethods.join(", ")}`);
    }

    const table = this.table;
    const arel = this.isEagerLoading
      ? await this.applyJoinDependency({}, (relation) => relation.arel())
      : this.buildArel(this._conn());
    arel.source.left = table;
    const groupValuesArelColumns = this.arelColumns(
      Array.from(new Set(this.groupValues)),
    ) as Nodes.Node[];
    const havingClauseAst = this.havingClause.isEmpty() ? null : this.havingClause.ast;
    const primaryKey = this.model.primaryKey;
    const key = this.model.compositePrimaryKey
      ? (primaryKey as string[]).map((pk) => table.get(pk))
      : table.get((primaryKey as string | null) ?? null);
    const stmtAst = arel.compileDelete(key, havingClauseAst, groupValuesArelColumns).ast;

    const count = await this._conn().delete(stmtAst, `${this.model.name} Delete All`);
    this.reset();
    return count;
  }

  async touchAll(...args: TouchAllArgs): Promise<number> {
    const { names, time } = parseTouchAllArgs(args);

    return this.updateAll(touchAttributesWithTime.call(this.model, ...names, time));
  }

  async findOrCreateBy(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const existing = await this.findBy(attributes);
    if (existing) return existing;
    return this.createOrFindBy(attributes, extra);
  }

  async findOrCreateByBang(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const existing = await this.findBy(attributes);
    if (existing) return existing;
    return this.createOrFindByBang(attributes, extra);
  }

  async findOrInitializeBy(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const existing = await this.findBy(attributes);
    if (existing) return existing;
    return new (this._model as any)({
      ...this.scopeForCreate(),
      ...attributes,
      ...extra,
    }) as T;
  }

  async createOrFindBy(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    return this.withConnection(async (connection) => {
      try {
        const result = await this._model.transaction(
          () =>
            this._model.create({
              ...this.scopeForCreate(),
              ...attributes,
              ...extra,
            }) as Promise<T>,
          { requiresNew: true },
        );
        if (result === undefined) {
          throw new RecordNotSaved(`${this._model.name}.createOrFindBy rolled back before persist`);
        }
        return result;
      } catch (e) {
        if (!(e instanceof RecordNotUnique)) throw e;
        if (connection.isTransactionOpen()) {
          return this.where(attributes).lock().findByBang(attributes);
        }
        return this.findByBang(attributes);
      }
    });
  }

  async createOrFindByBang(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    return this.withConnection(async (connection) => {
      try {
        const result = await this._model.transaction(
          () =>
            this._model.createBang({
              ...this.scopeForCreate(),
              ...attributes,
              ...extra,
            }) as Promise<T>,
          { requiresNew: true },
        );
        if (result === undefined) {
          throw new RecordNotSaved(
            `${this._model.name}.createOrFindByBang rolled back before persist`,
          );
        }
        return result;
      } catch (e) {
        if (!(e instanceof RecordNotUnique)) throw e;
        if (connection.isTransactionOpen()) {
          return this.where(attributes).lock().findByBang(attributes);
        }
        return this.findByBang(attributes);
      }
    });
  }

  async firstOrCreate(attributes?: Record<string, unknown>): Promise<T> {
    const first = await this.first();
    if (first) return first;
    return this.create(attributes);
  }

  async firstOrCreateBang(attributes?: Record<string, unknown>): Promise<T> {
    const first = await this.first();
    if (first) return first;
    return this.createBang(attributes);
  }

  async firstOrInitialize(
    attributes?: Record<string, unknown>,
    block?: (r: T) => void,
  ): Promise<T> {
    return (await this.first()) || this.new(attributes, block);
  }

  async insertAll(
    attributes: Record<string, unknown>[],
    options?: {
      uniqueBy?: string | string[];
      returning?: InsertAllOptions["returning"];
      recordTimestamps?: boolean;
    },
  ): Promise<Result> {
    return InsertAll.execute(this, attributes, {
      uniqueBy: options?.uniqueBy,
      onDuplicate: "skip",
      returning: options?.returning,
      recordTimestamps: options?.recordTimestamps,
    });
  }

  async upsertAll(
    attributes: Record<string, unknown>[],
    options?: {
      uniqueBy?: string | string[];
      updateOnly?: string | string[];
      onDuplicate?: "skip" | "update" | Nodes.SqlLiteral;
      returning?: InsertAllOptions["returning"];
      recordTimestamps?: boolean;
    },
  ): Promise<Result> {
    return InsertAll.execute(this, attributes, {
      uniqueBy: options?.uniqueBy,
      updateOnly: options?.updateOnly,
      onDuplicate: options?.onDuplicate ?? "update",
      returning: options?.returning,
      recordTimestamps: options?.recordTimestamps,
    });
  }

  scopeForCreate(): Record<string, unknown> {
    const hash = this.whereClause.toH(this.model.tableName, { equalityOnly: true });
    if (!isEmpty(this.createWithValue)) {
      for (const [k, v] of Object.entries(this.createWithValue)) hash[k] = v;
    }
    return hash;
  }

  whereValuesHash(relationTableName: string = this.model.tableName): Record<string, unknown> {
    return this.whereClause.toH(relationTableName);
  }

  /** @internal */
  applyJoinDependency<R>(
    { eagerLoading = this.groupValues.length === 0 }: { eagerLoading?: boolean },
    block: (relation: Relation<T>, joinDependency: JoinDependency) => R | Promise<R>,
  ): R | Promise<R> {
    const joinDependency = QueryMethods.constructJoinDependency.call(
      this as any,
      [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
      Nodes.OuterJoin,
    ) as unknown as JoinDependency;
    const relation = this.except("includes", "eagerLoad", "preload");
    QueryMethods.joinsBang.call(relation as any, joinDependency as any);

    if (
      eagerLoading &&
      this.hasLimitOrOffset &&
      !(
        this.usingLimitableReflections(joinDependency.reflections as never) &&
        this.usingLimitableReflections(
          (
            QueryMethods.constructJoinDependency.call(
              this as any,
              _qm.selectAssociationList
                .call(this as any, this.joinsValues, null)
                .concat(
                  _qm.selectAssociationList.call(this as any, this.leftOuterJoinsValues, null),
                ) as AssociationSpec[],
              null,
            ) as unknown as JoinDependency
          ).reflections as never,
        )
      )
    ) {
      return Promise.resolve(
        this.skipQueryCacheIfNecessary(() =>
          this.model.withConnection((c: DatabaseAdapter) =>
            (
              c as unknown as {
                distinctRelationForPrimaryKey(rel: unknown): Promise<void>;
              }
            ).distinctRelationForPrimaryKey(relation),
          ),
        ),
      ).then(() => block(relation, joinDependency));
    }

    return block(relation, joinDependency);
  }

  /** @internal */
  _isDeferredDistinctPkSubquery(): boolean {
    if (this.groupValues.length > 0) return false;
    if (!this.isEagerLoading) return false;
    if (!this.hasLimitOrOffset) return false;
    return !this._eagerJoinDependencyIsLimitable(
      QueryMethods.constructJoinDependency.call(
        this as any,
        [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
        Nodes.OuterJoin,
      ),
    );
  }

  /** @internal */
  _buildDeferredDistinctPkInlineSubquery(): SelectManager {
    const basePk = (this._model as any).primaryKey ?? "id";
    const jd = QueryMethods.constructJoinDependency.call(
      this as any,
      [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
      Nodes.OuterJoin,
    );
    return this._limitedDistinctRelation(jd, basePk).arel();
  }

  /** @internal */
  async _materializeDistinctPkIds(): Promise<unknown[]> {
    const basePk = (this._model as any).primaryKey ?? "id";
    const jd = QueryMethods.constructJoinDependency.call(
      this as any,
      [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
      Nodes.OuterJoin,
    );
    if (jd.nodes.length === 0) return [];
    return this.withConnection(() => this._materializeLimitedIds(jd, basePk));
  }

  /** @internal */
  _materializeDeferredDistinctPkPredicates(): Promise<void> | void {
    const predicates = this.whereClause.predicates;
    if (
      !predicates.some(
        (node) =>
          node instanceof DeferredDistinctPkIn ||
          node instanceof DeferredDistinctPkNotIn ||
          node instanceof DeferredIdsNotIn ||
          node instanceof DeferredIdsIn,
      )
    ) {
      return;
    }
    return (async () => {
      for (let i = 0; i < predicates.length; i++) {
        const node = predicates[i];
        if (node instanceof DeferredDistinctPkIn || node instanceof DeferredDistinctPkNotIn) {
          const attribute = node.left as Nodes.Attribute;
          const ids = await node.innerRelation._materializeDistinctPkIds();
          predicates[i] =
            node instanceof DeferredDistinctPkNotIn ? attribute.notIn(ids) : attribute.in(ids);
        } else if (node instanceof DeferredIdsNotIn || node instanceof DeferredIdsIn) {
          const attribute = node.left as Nodes.Attribute;
          const ids = [...node.literalIds];
          for (const rel of node.innerRelations) {
            ids.push(...(await rel.ids()));
          }
          const built = this.predicateBuilder.build(attribute, ids);
          predicates[i] = node instanceof DeferredIdsNotIn ? built.invert() : built;
        }
      }
    })();
  }

  /**
   * @missingRailsCall apply_join_dependency — CONVERGEABLE converge-sync-eager-builders-async-to-sql
   * @missingRailsCall with_connection — CONVERGEABLE converge-sync-eager-builders-async-to-sql
   */
  toSql(): string {
    const conn = this._conn();
    return conn.unpreparedStatement(() => {
      if (this.isEagerLoading) {
        const manager = this._buildEagerOperandManager();
        if (manager !== null) return conn.toSql(manager.ast);
      }
      return conn.toSql(this.arel().ast);
    }) as string;
  }

  private instantiateRecords(rows: Result): T[] {
    if (rows.isEmpty()) return [];
    const block = this._instantiateBlock;

    const joinDependency = this._joinDependency;
    if (joinDependency) {
      this._joinDependency = null;
      return joinDependency.instantiate(rows, this.strictLoadingValue, block) as T[];
    }

    return this._model._loadFromSql(rows, block as never) as T[];
  }

  private _applyEagerJoinDependency(
    jd: JoinDependency,
    basePk: string | string[],
    limitedIds?: unknown[],
  ): Relation<T> {
    let rel = this.except("includes", "eagerLoad", "preload");
    QueryMethods.joinsBang.call(rel as any, jd as any);
    if (
      this.hasLimitOrOffset &&
      !(
        this.usingLimitableReflections(jd.reflections as never) &&
        this.usingLimitableReflections(
          QueryMethods.constructJoinDependency.call(
            this as any,
            _qm.selectAssociationList
              .call(this as any, this.joinsValues, null)
              .concat(
                _qm.selectAssociationList.call(this as any, this.leftOuterJoinsValues, null),
              ) as AssociationSpec[],
            null,
          ).reflections as never,
        )
      )
    ) {
      if (Array.isArray(basePk)) {
        const tuples = limitedIds as unknown[][] | undefined;
        basePk.forEach((column, i) => {
          const ids =
            tuples !== undefined
              ? tuples.map((tuple) => tuple[i])
              : this._limitedDistinctRelation(jd, column).arel();
          rel = rel.where(this.table.get(column).in(ids as never));
        });
      } else {
        const ids = limitedIds ?? this._limitedDistinctRelation(jd, basePk).arel();
        rel = rel.where(this.table.get(basePk).in(ids as never));
      }
      rel.limitValue = null;
      rel.offsetValue = null;
    }
    return rel;
  }

  private _eagerJoinDependencyIsLimitable(jd: JoinDependency): boolean {
    return (
      this.usingLimitableReflections(jd.reflections as never) &&
      this.usingLimitableReflections(
        QueryMethods.constructJoinDependency.call(
          this as any,
          _qm.selectAssociationList
            .call(this as any, this.joinsValues, null)
            .concat(
              _qm.selectAssociationList.call(this as any, this.leftOuterJoinsValues, null),
            ) as AssociationSpec[],
          null,
        ).reflections as never,
      )
    );
  }

  private _limitedDistinctRelation(
    jd: JoinDependency,
    basePk: string | string[],
    distinctSelectSql?: string,
  ): Relation<T> {
    const relation = this.except("includes", "eagerLoad", "preload");
    QueryMethods.joinsBang.call(relation as any, jd as any);
    const values =
      distinctSelectSql !== undefined
        ? [new Nodes.SqlLiteral(distinctSelectSql)]
        : (Array.isArray(basePk) ? basePk : [basePk]).map((column) => this.table.get(column));
    const limited = relation.reselect(...values);
    QueryMethods.distinctBang.call(limited as any);
    return limited;
  }

  /** @internal */
  private async _materializeLimitedIds(
    jd: JoinDependency,
    basePk: string | string[],
  ): Promise<unknown[]> {
    const distinctSelect = this._distinctSelectForLimitedIds(basePk);
    const idResult = await this._conn().selectAll(
      this._limitedDistinctRelation(jd, basePk, distinctSelect).arel(),
      "SQL",
    );
    const idRows = idResult.toArray();
    if (Array.isArray(basePk)) return idRows.map((row) => basePk.map((column) => row[column]));
    return idRows.map((row) => row[basePk] ?? Object.values(row).pop());
  }

  private _distinctSelectForLimitedIds(basePk: string | string[]): string {
    const table = this.table;
    const pkColumns = (Array.isArray(basePk) ? basePk : [basePk]).map((column) =>
      this._conn().toSql(table.get(column)),
    );
    const pkSql = pkColumns.length === 1 ? pkColumns[0] : pkColumns;
    const adapter = this._conn() as unknown as {
      columnsForDistinct?: (
        cols: string | string[],
        orders: (string | Nodes.Node)[],
      ) => string | string[];
    };
    const orders = this.orderValues.map((clause) => {
      if (clause instanceof Nodes.Node) return clause;
      const raw = Array.isArray(clause) ? `${clause[0]} ${clause[1]}` : clause;
      const bare = raw
        .trim()
        .replace(/\s+(?:ASC|DESC)\b.*$/i, "")
        .trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return new Nodes.SqlLiteral(raw);
      return this.arelColumn(bare, () => new Nodes.SqlLiteral(raw)) as Nodes.Node;
    });
    const values = adapter.columnsForDistinct ? adapter.columnsForDistinct(pkSql, orders) : pkSql;
    return Array.isArray(values) ? values.join(", ") : values;
  }

  private _buildEagerOperandManager(): SelectManager | null {
    const allEager = [...new Set([...this.eagerLoadValues, ...this.includesValues])];
    if (allEager.length === 0) return null;

    const basePk = (this._model as any).primaryKey ?? "id";

    const jd = QueryMethods.constructJoinDependency.call(
      this as any,
      allEager as any,
      Nodes.OuterJoin,
    );
    if (jd.nodes.length === 0) return null;

    const eagerRelation = this._applyEagerJoinDependency(jd, basePk);
    jd.applyColumnAliases(eagerRelation);
    return eagerRelation.arel();
  }

  /** @internal */
  private _conn(): DatabaseAdapter {
    return threadedConnectionFor(this._model) ?? this._model.connection;
  }

  async preloadAssociations(records: T[]): Promise<void> {
    const preload: AssociationSpec[] = [
      ...this.preloadValues,
      ...(this.isEagerLoading ? [] : this.includesValues),
    ];
    if (preload.length === 0) return;
    const { Preloader } = await import("./associations/preloader.js");
    const scope = this.strictLoadingValue ? StrictLoadingScope : undefined;
    for (const associations of preload) {
      const preloader = new Preloader({
        records: records as unknown as import("./base.js").Base[],
        associations: [associations],
        scope,
      });
      await preloader.call();
    }
  }

  new(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  new(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  new(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    if (Array.isArray(attrs)) return this.build(attrs, block);
    return this.build(attrs, block);
  }

  update(attributes: Record<string, unknown>): Promise<T[]>;
  update(id: ":all", attributes: Record<string, unknown>): Promise<T[]>;
  update(id: unknown, attributes: Record<string, unknown>): Promise<T>;
  async update(id?: unknown, attributes?: Record<string, unknown>): Promise<T | T[]> {
    if (arguments.length === 0) {
      throw new ArgumentError("wrong number of arguments (given 0, expected 1..2)");
    }
    if (arguments.length === 1) {
      attributes = id as Record<string, unknown>;
      id = ":all";
    }
    if (id === ":all") {
      const records = await this.toArray();
      for (const record of records) {
        await record.update(attributes!);
      }
      return records;
    } else {
      return (await this.model.update(id, attributes!)) as T;
    }
  }

  updateBang(attributes: Record<string, unknown>): Promise<T[]>;
  updateBang(id: ":all", attributes: Record<string, unknown>): Promise<T[]>;
  updateBang(id: unknown, attributes: Record<string, unknown>): Promise<T>;
  async updateBang(id?: unknown, attributes?: Record<string, unknown>): Promise<T | T[]> {
    if (arguments.length === 0) {
      throw new ArgumentError("wrong number of arguments (given 0, expected 1..2)");
    }
    if (arguments.length === 1) {
      attributes = id as Record<string, unknown>;
      id = ":all";
    }
    if (id === ":all") {
      const records = await this.toArray();
      for (const record of records) {
        await record.updateBang(attributes!);
      }
      return records;
    } else {
      return (await this.model.updateBang(id, attributes!)) as T;
    }
  }

  async insert(
    attributes: Record<string, unknown>,
    options?: { uniqueBy?: string | string[]; returning?: InsertAllOptions["returning"] },
  ): Promise<Result> {
    return this.insertAll([attributes], options);
  }

  async insertBang(
    attributes: Record<string, unknown>,
    options?: Pick<InsertAllOptions, "returning" | "recordTimestamps">,
  ): Promise<Result> {
    return this.insertAllBang([attributes], options);
  }

  async insertAllBang(
    attributes: Record<string, unknown>[],
    options?: Pick<InsertAllOptions, "returning" | "recordTimestamps">,
  ): Promise<Result> {
    return InsertAll.execute(this, attributes, {
      onDuplicate: "raise",
      returning: options?.returning,
      recordTimestamps: options?.recordTimestamps,
    });
  }

  async upsert(
    attributes: Record<string, unknown>,
    options?: { uniqueBy?: string | string[]; returning?: InsertAllOptions["returning"] },
  ): Promise<Result> {
    return this.upsertAll([attributes], options);
  }

  async updateCounters(
    counters: Record<
      string,
      number | { time?: Temporal.Instant } | CounterCacheTouchOption | undefined
    >,
  ): Promise<number> {
    const touchFromCounters = (counters as Record<string, unknown>).touch;
    const normalCounters: Record<string, number> = {};
    for (const [k, v] of Object.entries(counters)) {
      if (k !== "touch") normalCounters[k] = v as number;
    }

    const updates: Record<string, unknown> = {};

    for (const [counterName, value] of Object.entries(normalCounters)) {
      const attr = this.table.get(counterName);
      updates[String(attr.name)] = this._incrementAttribute(attr, value);
    }

    const touch = touchFromCounters as CounterCacheTouchOption | undefined;
    if (touch) {
      let names = wrap(touch !== true ? touch : undefined) as Array<string | { time?: RubyTime }>;
      const last = names[names.length - 1];
      const options = last !== undefined && typeof last === "object" ? last : {};
      if (last !== undefined && typeof last === "object") names = names.slice(0, -1);
      const touchUpdates = touchAttributesWithTime.call(
        this.model,
        ...(names as string[]),
        options.time,
      );
      for (const [col, t] of Object.entries(touchUpdates)) {
        updates[col] = new Nodes.Quoted(t);
      }
    }

    return this.updateAll(updates);
  }

  async delete(idOrArray: unknown): Promise<number> {
    if (idOrArray == null) return 0;
    if (Array.isArray(idOrArray) && idOrArray.length === 0) return 0;

    const primaryKey = this.model.primaryKey;
    if (Array.isArray(primaryKey)) {
      const idArr = Array.isArray(idOrArray) ? idOrArray : [idOrArray];
      if (idArr.length !== primaryKey.length) return 0;
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < primaryKey.length; i++) {
        conditions[primaryKey[i]] = idArr[i];
      }
      return this.where(conditions).deleteAll();
    }

    return this.where({ [primaryKey]: idOrArray }).deleteAll();
  }

  async destroy(id: unknown): Promise<T | T[]> {
    const multipleIds = this.model.compositePrimaryKey
      ? Array.isArray((id as unknown[])[0])
      : Array.isArray(id);

    if (multipleIds) {
      const records = (await this.find(id)) as unknown as T[];
      for (const record of records) {
        await record.destroy();
      }
      return records;
    } else {
      const record = await this.find(id);
      await record.destroy();
      return record;
    }
  }

  async destroyBy(args: Record<string, unknown> = {}): Promise<T[]> {
    return this.where(args).destroyAll();
  }

  async deleteBy(args: Record<string, unknown> = {}): Promise<number> {
    return this.where(args).deleteAll();
  }

  async equals(other: unknown): Promise<boolean | undefined> {
    const CollectionProxyCtor = _relationFamilySlot.collectionProxy;
    const AssociationRelationCtor = _relationFamilySlot.associationRelation;
    if (
      (CollectionProxyCtor && other instanceof CollectionProxyCtor) ||
      (AssociationRelationCtor && other instanceof AssociationRelationCtor)
    ) {
      return this.equals(await (other as Relation<T>).records());
    }
    if (other instanceof Relation) {
      return other.toSql() === this.toSql();
    }
    if (Array.isArray(other)) {
      const records = await this.records();
      if (records.length !== other.length) return false;
      return records.every((rec, i) => rec.equals(other[i]));
    }
    return undefined;
  }

  get table(): Table {
    return this._table ?? this._model.arelTable;
  }

  get model(): typeof Base {
    return this._model;
  }

  get klass(): typeof Base {
    return this._model;
  }

  slice(start?: number, end?: number): T[] | Promise<T[]> {
    return this.toArray().then((records) => records.slice(start, end));
  }

  get name(): RelationName {
    return this.model.name;
  }

  get loaded(): boolean {
    return this._loaded;
  }

  async isNone(args?: EnumerablePattern<T>): Promise<boolean> {
    if (this.isNullRelation()) return true;
    if (args !== undefined) {
      const matches = (record: T): boolean =>
        (args as { _isActiveRecordBase?: unknown })._isActiveRecordBase === true
          ? record instanceof (args as new (...args: never[]) => Base)
          : (args as (record: T) => boolean)(record);
      return !(await this.toArray()).some(matches);
    }
    return this.isEmpty();
  }

  private _predicateBuilder: PredicateBuilder | null = null;

  get predicateBuilder(): PredicateBuilder {
    if (this._predicateBuilder) {
      return this._predicateBuilder;
    }
    let pb: PredicateBuilder;
    const modelPbAccessor = (this.model as any).predicateBuilder;
    const modelPb =
      typeof modelPbAccessor === "function" ? modelPbAccessor.call(this.model) : modelPbAccessor;
    const metadata = new TableMetadata(this.model, this.table);
    if (modelPb && typeof modelPb.with === "function") {
      pb = modelPb.with(metadata);
    } else {
      pb = new PredicateBuilder(metadata);
    }
    this._predicateBuilder = pb;
    return pb;
  }

  get isScheduled(): boolean {
    return !!this._futureResult;
  }

  get isEagerLoading(): boolean {
    return (this._shouldEagerLoad ||=
      this.eagerLoadValues.length > 0 ||
      (this.includesValues.length > 0 &&
        (this.joinedIncludesValues.length > 0 || this.referencesEagerLoadedTables())));
  }

  get joinedIncludesValues(): AssociationSpec[] {
    const joinsValues = new Set<unknown>(this.joinsValues);
    return [...new Set(this.includesValues)].filter((spec) => joinsValues.has(spec));
  }

  values(): Record<string, unknown> {
    return { ...this._values };
  }

  valuesForQueries(): Record<string, unknown> {
    return except(this._values, "extending", "skipQueryCache", "strictLoading");
  }

  get isEmptyScope(): boolean {
    return valuesEqual(this.values(), (this.model as any).unscoped().values());
  }

  get hasLimitOrOffset(): boolean {
    return this.limitValue !== null || this.offsetValue !== null;
  }

  aliasTracker(joins: Nodes.Node[] = [], aliases?: AliasCounts): AliasTracker {
    return AliasTracker.create(
      this.model.connectionPool(),
      String(this.table.name),
      joins,
      aliases,
    );
  }

  bindAttribute<R>(
    name: string,
    value: unknown,
    block: (attr: Nodes.Attribute, bind: QueryAttribute) => R,
  ): R {
    const reflection = this.model._reflectOnAssociation(name);
    if (reflection) {
      name = reflection.foreignKey as string;
      if (value != null) {
        value = (value as { readAttribute(n: string): unknown }).readAttribute(
          reflection.associationPrimaryKey() as string,
        );
      }
    }

    const attr = this.table.get(name);
    const bind = this.predicateBuilder.buildBindAttribute(String(attr.name), value);
    return block(attr, bind);
  }

  async scoping<R>(callback: () => R | Promise<R>): Promise<R>;
  async scoping<R>(
    options: { allQueries?: boolean | null },
    callback: () => R | Promise<R>,
  ): Promise<R>;
  async scoping<R>(
    optionsOrCallback: { allQueries?: boolean | null } | (() => R | Promise<R>),
    maybeCallback?: () => R | Promise<R>,
  ): Promise<R> {
    const callback = (
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback
    ) as () => R | Promise<R>;
    const allQueries =
      typeof optionsOrCallback === "function" ? null : (optionsOrCallback.allQueries ?? null);

    const registry = this.model.scopeRegistry();

    if (this.isGlobalScope(registry) && allQueries === false) {
      throw new ArgumentError(
        "Scoping is set to apply to all queries and cannot be unset in a nested block.",
      );
    }

    if (this.isAlreadyInScope(registry)) {
      return await callback();
    }

    return await this._scoping(this as any, registry, allQueries, async () => await callback());
  }

  async findSigned(token: string, options?: { purpose?: string }): Promise<T | null> {
    return this.scoping(() => (this.model as any).findSigned(token, options)) as Promise<T | null>;
  }

  async findSignedBang(token: string, options?: { purpose?: string }): Promise<T> {
    return this.scoping(() => (this.model as any).findSignedBang(token, options)) as Promise<T>;
  }

  async findByTokenFor(purpose: string, token: string): Promise<T | null> {
    const primaryKey = this.model.primaryKey as string | string[] | null;
    if (!primaryKey || primaryKey.length === 0) throw new UnknownPrimaryKey(this);
    const record = await this.model.tokenDefinitions.fetch(purpose).resolveToken(token, (id) => {
      if (Array.isArray(primaryKey)) {
        if (!Array.isArray(id) || id.length !== primaryKey.length) return Promise.resolve(null);
        return this.findBy(
          Object.fromEntries(primaryKey.map((key, i) => [key, id[i]])),
        ) as Promise<Base | null>;
      }
      return this.findBy({ [primaryKey]: [id] }) as Promise<Base | null>;
    });
    return record as T | null;
  }

  async findByTokenForBang(purpose: string, token: string): Promise<T> {
    const record = await this.model.tokenDefinitions
      .fetch(purpose)
      .resolveToken(token, (id) => this.find(id) as Promise<Base>);
    if (!record) throw new InvalidSignature();
    return record as T;
  }

  private _shouldEagerLoad: boolean | undefined;

  private _cacheKeys: Map<string, Promise<string>> | undefined;
  private _cacheVersions: Map<string, Promise<string | null>> | undefined;

  async cacheKey(timestampColumn = "updated_at"): Promise<string> {
    this._cacheKeys ??= new Map();
    if (!this._cacheKeys.has(timestampColumn)) {
      this._cacheKeys.set(timestampColumn, this.model.collectionCacheKey(this, timestampColumn));
    }
    return this._cacheKeys.get(timestampColumn)!;
  }

  /** @internal */
  async computeCacheKey(timestampColumn = "updated_at"): Promise<string> {
    const key = `${this.model.modelName.cacheKey}/query-${hexdigest(this.toSql())}`;
    if (this.model.collectionCacheVersioning) {
      return key;
    }
    const version = await this.computeCacheVersion(timestampColumn);
    return `${key}-${version}`;
  }

  async cacheVersion(timestampColumn = "updated_at"): Promise<string | null> {
    if (!this.model.collectionCacheVersioning) return null;
    this._cacheVersions ??= new Map();
    if (!this._cacheVersions.has(timestampColumn)) {
      this._cacheVersions.set(
        timestampColumn,
        this.computeCacheVersion(timestampColumn) as Promise<string | null>,
      );
    }
    return this._cacheVersions.get(timestampColumn)!;
  }

  /**
   * @internal
   * @missingRailsArgs max — PERMANENT
   */
  async computeCacheVersion(timestampColumn = "updated_at"): Promise<string> {
    timestampColumn = String(timestampColumn);

    let size: unknown = 0;
    let timestamp: unknown = null;

    if (this.isLoaded) {
      const records = await this.records();
      size = records.length;
      if ((size as number) > 0) {
        timestamp = max(
          records.map((record) =>
            (record as unknown as { readAttribute(name: string): unknown }).readAttribute(
              timestampColumn,
            ),
          ),
        );
      }
    } else {
      let collection: Relation<T> = this;
      if (this.isEagerLoading) {
        await this.applyJoinDependency({}, (relation) => {
          collection = relation;
        });
      }

      const c = this._conn();
      const column = c.visitor.compile(this.table.get(timestampColumn));
      const selectValues = `COUNT(*) AS ${(
        this.model.adapterClassSync() as unknown as { quoteColumnName(name: string): string }
      ).quoteColumnName("size")}, MAX(%s) AS timestamp`;

      let arel: unknown;
      if (collection.hasLimitOrOffset) {
        const query = collection.select(sql(`${column} AS collection_cache_key_timestamp`));
        if (this.distinctValue && isEmpty(collection.selectValues)) {
          query.selectValues = [...query.selectValues, this.table.get(star())];
        }
        const subqueryAlias = "subquery_for_cache_key";
        const subqueryColumn = `${subqueryAlias}.collection_cache_key_timestamp`;
        arel = query.buildSubquery(subqueryAlias, sql(selectValues.replace("%s", subqueryColumn)));
      } else {
        const query = collection.unscope("order");
        query.selectValues = [sql(selectValues.replace("%s", column))];
        arel = query.arel();
      }

      [size, timestamp] = first(await c.selectRows(arel, null)) ?? [];

      if (size != null) {
        const columnType = this.model.typeForAttribute(timestampColumn);
        timestamp = (columnType as unknown as { deserialize(value: unknown): unknown }).deserialize(
          timestamp,
        );
      } else {
        size = 0;
      }
    }

    if (timestamp != null) {
      return `${size}-${toFs(timestamp as Temporal.Instant, this.model.cacheTimestampFormat)}`;
    }
    return `${size}`;
  }

  async cacheKeyWithVersion(): Promise<string> {
    const version = await this.cacheVersion();
    if (version) {
      return `${await this.cacheKey()}-${version}`;
    }
    return this.cacheKey();
  }

  initializeCopy(source: Relation<T>): void {
    this._table = source._table;
    this._values = { ...source._values };
    this._withIsRecursive = source._withIsRecursive;
    this._isNone = source._isNone;
    for (const mod of source.extendingValues) {
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn === "function") {
          (this as unknown as Record<string, unknown>)[name] = fn.bind(this);
        }
      }
    }
    this.skipPreloadingValue = source.skipPreloadingValue;
    this._seededNoneNewOwner = source._seededNoneNewOwner;
    this._seedWherePredicates = [...source._seedWherePredicates];
  }

  clone(): Relation<T> {
    const ctor = relationClassFor(this._model as unknown as typeof Base);
    const rel = new ctor(this._model) as Relation<T>;
    rel.initializeCopy(this);
    return wrapWithScopeProxy(rel);
  }

  _execScope(...args: unknown[]): unknown {
    this._delegateToModel = true;
    const registry = this.model.scopeRegistry();
    const body = args.pop() as (this: Relation<T>, ...rest: unknown[]) => unknown;
    try {
      return this._scoping(null, registry, false, () => body.call(this, ...args) || this);
    } finally {
      this._delegateToModel = false;
    }
  }

  protected loadRecords(records: T[]): void {
    this._records = [...records];
    this._loaded = true;
  }

  /** @internal */
  isAlreadyInScope(registry: any): boolean {
    return this._delegateToModel && !!registry?.currentScope?.(this.model, true);
  }

  private isGlobalScope(registry: any): boolean {
    return !!registry?.globalCurrentScope?.(this.model, true);
  }

  private currentScopeRestoringBlock(block?: (record: T) => void): (record: T) => void {
    const modelClass = this.model;
    const currentScope = (modelClass as any).currentScope(true);
    return (record: T) => {
      (modelClass as any).setCurrentScope(currentScope ?? null);
      block?.(record);
    };
  }

  protected _new(attributes: Record<string, unknown>, block?: (record: T) => void): T {
    return new (this.model as any)(attributes, block) as T;
  }

  protected _create(attributes: Record<string, unknown>, block?: (record: T) => void): Promise<T> {
    return (this.model as any).create(attributes, block);
  }

  protected _createBang(
    attributes: Record<string, unknown>,
    block?: (record: T) => void,
  ): Promise<T> {
    return (this.model as any).createBang(attributes, block);
  }

  private _scoping<R>(scope: any, registry: any, allQueries: boolean | null, fn: () => R): R {
    const previous = registry.currentScope(this.model, true);
    registry.setCurrentScope(this.model, scope);
    let previousGlobal: any;
    if (allQueries) {
      previousGlobal = registry.globalCurrentScope(this.model, true);
      registry.setGlobalCurrentScope(this.model, scope);
    }
    const ensure = () => {
      registry.setCurrentScope(this.model, previous);
      if (allQueries) {
        registry.setGlobalCurrentScope(this.model, previousGlobal);
      }
    };
    let result: R;
    try {
      result = fn();
    } catch (error) {
      ensure();
      throw error;
    }
    if (result instanceof Promise) {
      return result.then(
        (value: unknown) => {
          ensure();
          return value;
        },
        (error: unknown) => {
          ensure();
          throw error;
        },
      ) as R;
    }
    ensure();
    return result;
  }

  private _substituteValues(values: [string, unknown][]): [any, any][] {
    return values.map(([name, value]) => {
      const attr = this.table.get(name);
      if (
        value instanceof Nodes.Node ||
        value instanceof Nodes.SqlLiteral ||
        value instanceof Nodes.Attribute
      ) {
        return [attr, value instanceof Nodes.SqlLiteral ? new Nodes.Grouping(value) : value];
      }
      const type = this.model.typeForAttribute(String(attr.name));
      return [attr, this.predicateBuilder.buildBindAttribute(String(attr.name), type.cast(value))];
    });
  }

  private _incrementAttribute(attribute: any, value = 1): any {
    const bind = this.predicateBuilder.buildBindAttribute(attribute.name, Math.abs(value));
    const expr = this.table.coalesce(
      new Nodes.UnqualifiedColumn(attribute),
      0 as unknown as Nodes.Node,
    ) as Nodes.Node;
    return value < 0 ? new Nodes.Subtraction(expr, bind) : new Nodes.Addition(expr, bind);
  }

  private skipQueryCacheIfNecessary<R>(block: () => R | Promise<R>): R | Promise<R> {
    if (this.skipQueryCacheValue) {
      return this.model.uncached(block);
    }
    return block();
  }
}

_registerRelationFamily("relation", Relation);

/* eslint-disable @typescript-eslint/no-empty-object-type */
/** @noRailsEquivalent PERMANENT */
export interface RelationScopes<T extends Base> {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

export interface Relation<T extends Base> extends RelationScopes<T> {
  isNullRelation(): boolean;
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  /** @noRailsEquivalent PERMANENT */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
  /** @noRailsEquivalent PERMANENT */
  finally(onfinally?: (() => void) | null): Promise<T[]>;
}

export interface Relation<T extends Base> {
  includesValues: AssociationSpec[];
  eagerLoadValues: AssociationSpec[];
  preloadValues: AssociationSpec[];
  selectValues: (string | Nodes.Node)[];
  groupValues: Array<string | Nodes.Node>;
  orderValues: Array<string | Nodes.Node>;
  joinsValues: (AssociationSpec | string | Nodes.Join)[];
  leftOuterJoinsValues: AssociationSpec[];
  referencesValues: Array<string | Nodes.SqlLiteral>;
  extendingValues: Array<Record<string, (...args: any[]) => any>>;
  readonly extensions: Array<Record<string, (...args: any[]) => any>>;
  unscopeValues: Array<string | { where: string | string[] }>;
  optimizerHintsValues: string[];
  annotateValues: string[];
  withValues: Array<Record<string, unknown>>;
  limitValue: number | string | null;
  offsetValue: number | string | null;
  lockValue: string | boolean | null;
  readonlyValue: boolean | null;
  reorderingValue: boolean | null;
  strictLoadingValue: boolean | null;
  reverseOrderValue: boolean | null;
  distinctValue: boolean | null;
  createWithValue: Record<string, unknown>;
  skipQueryCacheValue: boolean | null;
  whereClause: WhereClause;
  havingClause: WhereClause;
  fromClause: FromClause;
}

export interface Relation<T extends Base>
  extends Included<typeof QueryMethods>, Included<typeof Explain>, CalculationMethods {
  find(ids: unknown[]): Promise<T[]>;
  find(id: unknown): Promise<T>;
  find(...ids: unknown[]): Promise<T | T[]>;
  findBy(arg: Record<string, unknown>): Promise<T | null>;
  findByBang(arg: Record<string, unknown>): Promise<T>;
  findSoleBy(...conditions: unknown[]): Promise<T>;
  first(): Promise<T | null>;
  first(n: number): Promise<T[]>;
  firstBang(): Promise<T>;
  last(): Promise<T | null>;
  last(n: number): Promise<T[]>;
  lastBang(): Promise<T>;
  sole(): Promise<T>;
  take(): Promise<T | null>;
  take(limit: number): Promise<T[]>;
  takeBang(): Promise<T>;
  second(): Promise<T | null>;
  third(): Promise<T | null>;
  fourth(): Promise<T | null>;
  fifth(): Promise<T | null>;
  fortyTwo(): Promise<T | null>;
  secondToLast(): Promise<T | null>;
  thirdToLast(): Promise<T | null>;
  secondBang(): Promise<T>;
  thirdBang(): Promise<T>;
  fourthBang(): Promise<T>;
  fifthBang(): Promise<T>;
  fortyTwoBang(): Promise<T>;
  secondToLastBang(): Promise<T>;
  thirdToLastBang(): Promise<T>;
  exists(conditions?: Record<string, unknown> | unknown): Promise<boolean>;
  include(record: T): Promise<boolean>;
  member(record: T): Promise<boolean>;
  raiseRecordNotFoundExceptionBang(
    ids?: unknown,
    resultSize?: number,
    expectedSize?: number,
    key?: string,
    notFoundIds?: unknown[],
  ): never;
  unscope(...args: Array<UnscopeType | { where: string | string[] }>): Relation<T>;
  lock(locks?: string | boolean | null): Relation<T>;
  none(): Relation<T>;
  readonly(value?: boolean): Relation<T>;
  strictLoading(value?: boolean): Relation<T>;
  createWith(value: Record<string, unknown> | null): Relation<T>;
  from(value: string | Relation<any> | Nodes.Node, subqueryName?: string): Relation<T>;
  extending<M extends Record<string, (...args: any[]) => any>>(mod: M): Relation<T> & M;
  extending<M extends Record<string, (...args: any[]) => any>>(
    mod: M | undefined,
  ): Relation<T> & Partial<M>;
  extending(fn: (rel: Relation<T>) => void): Relation<T>;
  extending(): Relation<T>;
  optimizerHints(...args: string[]): Relation<T>;
  annotate(...args: string[]): Relation<T>;
  includes(...args: AssociationSpec[]): Relation<T>;
  all(): Relation<T>;
  eagerLoad(...args: AssociationSpec[]): Relation<T>;
  preload(...args: AssociationSpec[]): Relation<T>;
  extractAssociated(association: string): Promise<Base[]>;
  references(...tableNames: Array<string | Nodes.SqlLiteral>): Relation<T>;
  with(
    ...args: Array<Record<string, Relation<any> | string | Array<Relation<any> | string>>>
  ): Relation<T>;
  withRecursive(
    ...args: Array<Record<string, Relation<any> | string | Array<Relation<any> | string>>>
  ): Relation<T>;
  joins(...nodes: Nodes.Join[]): Relation<T>;
  joins(specArray: JoinSpec[]): Relation<T>;
  joins(hashSpec: Record<string, AssociationSpec | AssociationSpec[]>): Relation<T>;
  joins(...args: Array<JoinSpec>): Relation<T>;
  leftOuterJoins(...args: Array<AssociationSpec | AssociationSpec[]>): Relation<T>;
  leftJoins(...args: Array<AssociationSpec | AssociationSpec[]>): Relation<T>;
  arel(aliases?: AliasTracker): SelectManager;
  /** @internal */
  assertModifiableBang(): void;
  /** @internal */
  checkIfMethodHasArgumentsBang(
    methodName: string,
    args: unknown[],
    message?: string,
    block?: (args: unknown[]) => void,
  ): void;
  /** @internal */
  arelColumns(columns: ReadonlyArray<unknown>): unknown[];
  /** @internal */
  arelColumnsFromHash(fields: Record<PropertyKey, unknown>): unknown[];
  select(fn: (record: T) => boolean): Promise<T[]>;
  select(...fields: (string | Nodes.Node | Record<string, unknown>)[]): Relation<T>;
  reselect(
    ...args: (string | Nodes.Node | Record<string, unknown> | readonly (string | Nodes.Node)[])[]
  ): Relation<T>;
  group(...args: (string | Nodes.Node)[]): Relation<T>;
  regroup(...args: string[]): Relation<T>;
  order(...args: OrderArg[]): Relation<T>;
  inOrderOf(column: string | Nodes.Node, values: unknown[], filter?: boolean): Relation<T>;
  reorder(...args: OrderArg[]): Relation<T>;
  where(): WhereChain<Relation<T>>;
  where(args: undefined): WhereChain<Relation<T>>;
  where(args: Record<string, unknown> | null): Relation<T>;
  where(args: Map<unknown, unknown>): Relation<T>;
  where(sql: string, ...binds: unknown[]): Relation<T>;
  where(args: Nodes.Node): Relation<T>;
  where(args: unknown[]): Relation<T>;
  where(cols: string[], tuples: unknown[][]): Relation<T>;
  rewhere(conditions: Record<string, unknown> | null): Relation<T>;
  invertWhere(): Relation<T>;
  structurallyCompatible(other: Relation<T>): boolean;
  and(other: Relation<T>): Relation<T>;
  or(other: Relation<T>): Relation<T>;
  excluding(...records: unknown[]): Relation<T>;
  without(...records: unknown[]): Relation<T>;
  having(condition: string, ...binds: unknown[]): Relation<T>;
  having(condition: Record<string, unknown>): Relation<T>;
  having(condition: Nodes.Node): Relation<T>;
  having(
    condition: string | Record<string, unknown> | Nodes.Node,
    ...binds: unknown[]
  ): Relation<T>;
  limit(value: number | string | null): Relation<T>;
  offset(value: number | string | null): Relation<T>;
  distinct(value?: boolean): Relation<T>;
  reverseOrder(): Relation<T>;
  spawn(): Relation<T>;
  merge<U extends Base>(other: Relation<U>): Relation<T>;
  mergeBang(other: any): Relation<T>;
  except(...skips: Array<ExceptSkip>): Relation<T>;
  only(...onlies: Array<ExceptSkip>): Relation<T>;
  /** @internal */
  relationWith(values: Record<string, unknown>): Relation<T>;
  /** @internal */
  constructRelationForExists(conditions: unknown): Relation<T>;
  /** @internal */
  usingLimitableReflections(reflections: Array<{ isCollection(): boolean }>): boolean;
  /** @internal */
  findWithIds(ids: unknown[]): Promise<T | T[]>;
  /** @internal */
  findOne(id: unknown): Promise<T>;
  /** @internal */
  findSome(ids: unknown[]): Promise<T[]>;
  /** @internal */
  findSomeOrdered(ids: unknown[]): Promise<T[]>;
  /** @internal */
  findTake(): Promise<T | null>;
  /** @internal */
  findTakeWithLimit(limit: number): Promise<T[]>;
  /** @internal */
  findNth(index: number): Promise<T | null>;
  /** @internal */
  findNthWithLimit(index: number, limit: number): Promise<T[]>;
  /** @internal */
  findNthFromLast(index: number): Promise<T | null>;
  /** @internal */
  findLast(limit?: number): Promise<T | T[] | null>;
  /** @internal */
  orderedRelation(): Relation<T>;
  /** @internal */
  _orderColumns(): string[];
  /** @internal */
  actOnIgnoredOrder(errorOnIgnore: boolean | undefined): void;
  findEach(opts?: {
    batchSize?: number;
    start?: unknown;
    finish?: unknown;
    order?: "asc" | "desc" | ("asc" | "desc")[];
    cursor?: string | string[];
    errorOnIgnore?: boolean;
  }): AsyncGenerator<T> & { size(): Promise<number> };
  findInBatches(opts?: {
    batchSize?: number;
    start?: unknown;
    finish?: unknown;
    order?: "asc" | "desc" | ("asc" | "desc")[];
    cursor?: string | string[];
    errorOnIgnore?: boolean;
  }): AsyncGenerator<T[]> & { size(): Promise<number> };
  inBatches(
    opts: InBatchesOptions,
    block: (relation: LoadedRelation<Relation<T>>) => void | Promise<void>,
  ): Promise<void>;
  inBatches(opts?: InBatchesOptions): BatchEnumerator<LoadedRelation<Relation<T>>>;
}

export interface Relation<T extends Base> {
  length(): Promise<number>;
  each(fn: (record: T, index: number) => void): Promise<T[]>;
  join(separator?: string): Promise<string>;
  isIntersect(other: T[]): Promise<boolean>;
  reverse(): Promise<T[]>;
  compact(): Promise<T[]>;
  index(valueOrFn: T | ((record: T) => unknown)): Promise<number | null>;
  rindex(valueOrFn: T | ((record: T) => unknown)): Promise<number | null>;
  sample(n?: number): Promise<T | T[] | null>;
  rotate(count?: number): Promise<T[]>;
  shuffle(): Promise<T[]>;
  split(valueOrFn: T | ((record: T) => boolean)): Promise<T[][]>;
  inGroups(number: number, fillWith?: T | null | false): Promise<(T | null | false)[][]>;
  inGroupsOf(number: number, fillWith?: T | null | false): Promise<(T | null | false)[][]>;
  toSentence(options?: ToSentenceOptions): Promise<string>;
  asJson(options?: SerializeOptions): Promise<unknown[]>;
  toFs(format?: string): Promise<string>;
  toFormattedS(format?: string): Promise<string>;
  toXml(options?: ToXmlOptions): Promise<string>;
  get connection(): DatabaseAdapter;
  get primaryKey(): string | string[];
  get tableName(): string;
  withConnection<R>(
    fn: (conn: DatabaseAdapter) => R | Promise<R>,
    options?: { preventPermanentCheckout?: boolean; checkoutTimeout?: number },
  ): Promise<R>;
  transaction<R>(
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined>;
  sanitizeSqlLike(value: string, escapeChar?: string): string;
}

include(Relation, DelegationMethods);
include(Relation, Explain);
include(Relation, Batches);
include(Relation, QueryMethods);
include(Relation, SpawnMethods);
include(Relation, Calculations);
include(Relation, FinderMethods);

defineValueMethods(Relation);

applyThenable(Relation.prototype);

applyThenable(ExplainProxy.prototype, "inspect");

/** @internal */
async function computeCacheKey(
  rel: Relation<Base>,
  timestampColumn = "updated_at",
): Promise<string> {
  return rel.computeCacheKey(timestampColumn);
}

/** @internal */
async function computeCacheVersion(
  rel: Relation<Base>,
  timestampColumn = "updated_at",
): Promise<string> {
  return rel.computeCacheVersion(timestampColumn);
}
