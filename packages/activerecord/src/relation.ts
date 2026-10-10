import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { eachCons, isBlank, isPresent, stripThenable } from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import {
  except,
  hashDelete,
  isModuleIncluded,
  type Module,
  Range,
  rbEnsure,
  rtest,
  uniq,
} from "@blazetrails/ruby-compat";
import {
  Enumerable,
  isEmpty,
  rbDefineAllocFunc,
  rbObjClone,
  toS,
  type Each,
} from "@blazetrails/ruby-compat";
import { RelationMethods as SignedIdRelationMethods } from "./signed-id.js";
import { RelationMethods as TokenForRelationMethods } from "./token-for.js";
import { first } from "@blazetrails/ruby-compat";
import * as Arel from "@blazetrails/arel";
import { Table, SelectManager, Nodes, sql, star, type ArelNode } from "@blazetrails/arel";
import type { Base } from "./base.js";
import { ActiveRecordError, RecordNotUnique } from "./errors.js";
import { compact, max, min, take } from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import type { SerializeOptions } from "@blazetrails/activemodel";

import { applyThenable } from "./relation/thenable.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import {
  wrap,
  any,
  compactBlank,
  extractOptionsBang,
  groupBy,
  indexBy,
  many,
  mergeBang,
} from "@blazetrails/activesupport";

export { Range };
import {
  WhereChain,
  QueryMethods,
  type UnscopeArg,
  type ExceptSkip,
  type AssociationSpec,
  type JoinSpec,
  type OrderArg,
} from "./relation/query-methods.js";
import * as _qm from "./relation/query-methods.js";
import { Batches } from "./relation/batches.js";
import {
  ClassSpecificRelation,
  create as _delegationCreate,
  Delegation,
  type ToSentenceOptions,
  type ToXmlOptions,
} from "./relation/delegation.js";
import { ActiveRecord, Associations } from "./namespaces.js";
import { Preloader } from "./associations/preloader.js";
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
  type TouchAllArgs,
  type TouchAllOptions,
  type CounterCacheTouchOption,
} from "./timestamp.js";
import { Explain } from "./explain.js";
import type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { PP } from "@blazetrails/ruby-compat";
import type { JoinDependency } from "./associations/join-dependency.js";
import {
  DeferredIdsIn,
  DeferredIdsNotIn,
} from "./relation/predicate-builder/deferred-distinct-pk-in.js";
import { AliasTracker } from "./associations/alias-tracker.js";
import type { Hash } from "@blazetrails/ruby-compat";

export type LoadedRelation<R> = Omit<R, "then">;

/** @internal */
export type FindEachOptions = {
  start?: unknown;
  finish?: unknown;
  batchSize?: number;
  errorOnIgnore?: boolean;
  cursor?: string | string[];
  order?: ":asc" | ":desc" | (":asc" | ":desc")[];
};

export type InBatchesOptions = {
  of?: number;
  start?: unknown;
  finish?: unknown;
  order?: ":asc" | ":desc" | (":asc" | ":desc")[];
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
  select?: (string | ArelNode)[];
  group?: string[];
  order?: Array<string | ArelNode>;
  joins?: (AssociationSpec | string | Nodes.Join)[];
  leftOuterJoins?: AssociationSpec[];
  references?: string[];
  extending?: Array<Record<string, (...args: any[]) => any>>;
  unscope?: UnscopeArg[];
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

/** @internal */
export class ExplainProxy<T extends Base> {
  private readonly _relation: Relation<T, boolean>;
  private readonly _options: ExplainOption[];

  constructor(relation: Relation<T, boolean>, options: ExplainOption[]) {
    this._relation = relation;
    this._options = options;
  }

  inspect(): Promise<string> {
    return this.execExplain(() =>
      (this._relation as unknown as { execQueries(): Promise<T[]> }).execQueries(),
    );
  }

  average(columnName: string | ArelNode): Promise<string> {
    return this.execExplain(() => this._relation.average(columnName as never));
  }

  count(columnName?: string | ArelNode): Promise<string> {
    return this.execExplain(() => this._relation.count(columnName as never));
  }

  first(limit?: number): Promise<string> {
    return this.execExplain(() => this._relation.first(limit as never));
  }

  last(limit?: number): Promise<string> {
    return this.execExplain(() => this._relation.last(limit as never));
  }

  maximum(columnName: string | ArelNode): Promise<string> {
    return this.execExplain(() => this._relation.maximum(columnName as never));
  }

  minimum(columnName: string | ArelNode): Promise<string> {
    return this.execExplain(() => this._relation.minimum(columnName as never));
  }

  pluck(...columnNames: (string | ArelNode)[]): Promise<string> {
    return this.execExplain(() => this._relation.pluck(...(columnNames as never[])));
  }

  sum(identityOrColumn?: string | ArelNode): Promise<string> {
    return this.execExplain(() => this._relation.sum(identityOrColumn as never));
  }

  private async execExplain(block: () => unknown): Promise<string> {
    const queries = await this._relation.collectingQueriesForExplain(async () => block());
    return this._relation.execExplain(queries, this._options);
  }
}

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

const CLASS_SPECIFIC_RELATION_HANDLER: ProxyHandler<any> = {
  get(target: any, prop: string | symbol, receiver: any) {
    if (prop === Symbol.iterator && !target._isRecordsSynchronous) return undefined;
    const value = Reflect.get(target, prop, receiver);
    if (typeof prop === "symbol" || Reflect.has(target, prop) || value !== undefined) {
      return value;
    }
    if (/^(0|[1-9]\d*)$/.test(prop)) {
      return target._isRecordsSynchronous
        ? (target.target ?? target._records)[Number(prop)]
        : target.records().then((records: any[]) => records[Number(prop)]);
    }
    const enumerable = ENUMERABLE_METHODS[prop];
    if (enumerable) {
      return (...args: any[]) => {
        const records = target.each(() => {});
        return records instanceof Promise
          ? records.then((records: any[]) => enumerable([...records], args))
          : enumerable([...records], args);
      };
    }
    if (target.respondToMissing(prop, false)) {
      return (...args: any[]) => target.methodMissing(prop, ...args);
    }
    return value;
  },
  has(target: any, prop: string | symbol) {
    if (prop === Symbol.iterator && !target._isRecordsSynchronous) return false;
    if (Reflect.has(target, prop)) return true;
    if (typeof prop === "symbol") return false;
    if (Object.prototype.hasOwnProperty.call(ENUMERABLE_METHODS, prop)) return true;
    return target.respondToMissing(prop, false);
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Relation<T extends Base, G extends boolean = false> {
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
  skipPreloadingValue = false;
  private _loaded = false;
  private _delegateToModel = false;
  private _recordsStore: T[] = [];
  protected get _records(): T[] {
    return this._recordsStore;
  }

  protected set _records(records: T[]) {
    this._recordsStore = records;
  }
  protected _offsets?: Record<number, T | null>;
  private _futureResult?: FutureResult | Complete | Promise<Result>;
  /** @internal */
  _loadResult?: Promise<T[]>;
  private _loadToken = 0;

  private _joinDependency: JoinDependency | null = null;
  /** @internal */
  _fromLimitedIds = new WeakMap<object, unknown[]>();

  private _table: Table;

  /** @inventedArm if — PERMANENT */
  constructor(
    model: typeof Base,
    {
      table = null,
      predicateBuilder = null,
      values = {},
    }: {
      table?: Table | Nodes.TableAlias | null;
      predicateBuilder?: PredicateBuilder | null;
      values?: ValuesHash;
    } = {},
  ) {
    if (table) {
      predicateBuilder ||= model.predicateBuilder.with(new TableMetadata(model, table as Table));
    } else {
      table = model.arelTable;
      predicateBuilder ||= model.predicateBuilder;
    }

    this._model = model;
    this._table = table as Table;
    this._values = values;
    this._predicateBuilder = predicateBuilder;
    if (isModuleIncluded(new.target, ClassSpecificRelation)) {
      return new Proxy(this, CLASS_SPECIFIC_RELATION_HANDLER);
    }
  }

  inspect(): string | Promise<string> {
    const subject = this.isLoaded
      ? this.isScheduled || this._loadResult
        ? this.records()
        : this._records
      : this.annotate("loading for inspect");
    const inspectEntries = (records: T[]): string => {
      const entries = take(records, min(compact([this.limitValue, 11])) as number).map((record) =>
        record.inspect(),
      );
      if (entries.length === 11) entries[10] = "...";
      return `#<${(this.constructor as typeof Relation)._railsClassName} [${entries.join(", ")}]>`;
    };
    if (Array.isArray(subject)) return inspectEntries(subject);
    return (
      subject instanceof Promise
        ? subject
        : subject.take(min(compact([this.limitValue, 11])) as number)
    ).then(inspectEntries);
  }

  async prettyPrint(pp: PP): Promise<void> {
    const subject = this.isLoaded ? await this.records() : this.annotate("loading for pp");
    const entries = (
      Array.isArray(subject)
        ? subject.slice(0, min(compact([this.limitValue, 11])) as number)
        : await subject.take(min(compact([this.limitValue, 11])) as number)
    ) as (T | string)[];
    if (entries.length === 11) entries[10] = "...";
    await pp.pp(entries);
  }

  get isReadonly(): boolean | null {
    return this.readonlyValue;
  }

  get isLocked(): string | boolean | null {
    return this.lockValue;
  }

  get isLoaded(): boolean {
    return this._loaded;
  }

  reset(): this {
    this._arel = undefined;
    this._fromLimitedIds = new WeakMap();
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
    this._loadResult = undefined;
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

  get _isRecordsSynchronous(): boolean {
    return this.isLoaded && !this.isScheduled && !this._loadResult;
  }

  /** @inventedArm synchronize — CONVERGEABLE load-async-null-executor-arm-floats-its-load-under-the-adapter-lock */
  loadAsync(): Relation<T, G> {
    this._model.connectionPool().withConnectionSync((c: DatabaseAdapter) => {
      if (!c.asyncEnabled()) {
        const token = this._loadToken;
        void c.lock
          .synchronize(() => this.load())
          .catch(() => {
            if (token === this._loadToken) this._loaded = false;
          });
        this._loaded = true;
        return;
      }

      if (!this.isLoaded) {
        const result = this.execMainQuery(!c.currentTransaction().joinable);
        if (result instanceof Result) {
          this.loadRecords(this.instantiateRecords(result));
        } else {
          if (result instanceof Promise) void result.catch(() => {});
          this._futureResult = result;
        }
        this._loaded = true;
      }
    });
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
    if (this.isNullRelation()) return true;

    if (this.isLoaded) {
      return (await this.records()).length === 0;
    } else {
      return !(await this.isExists());
    }
  }

  async isAny(...args: EnumerablePattern<T>[]): Promise<boolean> {
    if (this.isNullRelation()) return false;

    if (isPresent(args))
      return Enumerable.isAny.call<Each<T, Promise<T[]>>, unknown[], Promise<boolean>>(
        this,
        ...args,
      );
    return !(await this.isEmpty());
  }

  async isMany(predicate?: (record: T) => boolean): Promise<boolean> {
    if (this.isNullRelation()) return false;

    if (predicate !== undefined) return many(await this.toArray(), predicate);
    if (this.isLoaded) return many(await this.records());
    return (await this.limitedCount()) > 1;
  }

  async isOne(...args: EnumerablePattern<T>[]): Promise<boolean> {
    if (this.isNullRelation()) return false;

    if (isPresent(args))
      return Enumerable.isOne.call<Each<T, Promise<T[]>>, unknown[], Promise<boolean>>(
        this,
        ...args,
      );
    if (this.isLoaded) return (await this.records()).length === 1;
    return (await this.limitedCount()) === 1;
  }

  async isBlank(): Promise<boolean> {
    return isBlank(await this.records());
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

  async isExclude(object: T): Promise<boolean> {
    return !(await this.isInclude(object));
  }

  async load(block?: (record: T) => void): Promise<LoadedRelation<this>> {
    if (this._loadResult) await this._loadResult;
    if (!this.isLoaded || this.isScheduled) {
      const token = this._loadToken;
      const loadResult = this.withConnection(() => this.execQueries(block));
      this._loadResult = loadResult;
      let records: T[];
      try {
        records = await loadResult;
      } finally {
        if (this._loadResult === loadResult) this._loadResult = undefined;
      }
      if (token === this._loadToken) this.loadRecords(records);
    }
    return stripThenable(this);
  }

  toAry(): T[] | null {
    return this._isRecordsSynchronous ? Array.from(this as Iterable<T>) : null;
  }

  async toArray(): Promise<T[]> {
    return [...(await this.records())];
  }

  protected async execQueries(block?: (record: T) => void): Promise<T[]> {
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
      const records = this.instantiateRecords(rows, block);

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

  /** @missingRailsCall with_connection — CONVERGEABLE relation-layer-with-connection-receipts-are-not-the-tosql-sites */
  private execMainQuery(async = false): Result | Promise<Result> | FutureResult | Complete {
    if (this._isNone) {
      if (async) {
        return FutureResult.wrap(Result.empty());
      } else {
        return Result.empty();
      }
    }

    return this.skipQueryCacheIfNecessary(() => {
      if (this.whereClause.isContradiction()) {
        return Result.empty();
      } else if (this.isEagerLoading) {
        return this.model.connectionPool().withConnectionSync((c: DatabaseAdapter) => {
          return this.applyJoinDependency({}, (relation, joinDependency) => {
            if (relation.isNullRelation()) {
              return Result.empty();
            } else {
              joinDependency.applyColumnAliases(relation);
              this._joinDependency = joinDependency;
              return c.selectAll(relation.arel(), "SQL", [], { async });
            }
          });
        });
      } else {
        return this.model.connectionPool().withConnectionSync((c: DatabaseAdapter) => {
          return this.model._queryBySql(c, this.arel(), [], { async });
        });
      }
    }) as Result | Promise<Result> | FutureResult | Complete;
  }

  private referencesEagerLoadedTables(): boolean {
    let joinedTables = this.buildJoins([]).flatMap((join: Nodes.Join) =>
      join instanceof Nodes.StringJoin
        ? this.tablesInString(join.left as Nodes.SqlLiteral)
        : [(join.left as unknown as { name: string }).name],
    );

    joinedTables.push(String(this.table.name));

    joinedTables = joinedTables.map((name) => name.toLowerCase());

    return !isEmpty(
      this.referencesValues.map((ref) => toS(ref)).filter((ref) => !joinedTables.includes(ref)),
    );
  }

  private tablesInString(string: Nodes.SqlLiteral | string): string[] {
    if (isBlank(string)) return [];
    const matches = string.toString().match(/[a-zA-Z_][\w.]+(?=.?\.)/g) ?? [];
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

  async updateAll(
    updates: Record<string, unknown> | string | [string, ...unknown[]],
  ): Promise<number> {
    if (isBlank(updates)) throw new ArgumentError("Empty list of attributes to change");
    if (this.isNullRelation()) return 0;

    let values: [Nodes.Node, unknown][] | Nodes.SqlLiteral;
    if (typeof updates !== "string" && !Array.isArray(updates)) {
      if (
        this.model.lockingEnabled &&
        !Object.prototype.hasOwnProperty.call(updates, this.model.lockingColumn)
      ) {
        const attr = this.table.get(this.model.lockingColumn);
        updates[String(attr.name)] = this._incrementAttribute(attr);
      }
      values = this._substituteValues(Object.entries(updates));
    } else {
      values = sql(this.model.sanitizeSqlForAssignment(updates, String(this.table.name)));
    }

    return this.model.withConnection(async (c) => {
      const arel = this.isEagerLoading
        ? (await this.applyJoinDependency()).arel()
        : this.buildArel(c);
      arel.source.left = this.table;
      const groupValuesArelColumns = this.arelColumns(uniq(this.groupValues)) as ArelNode[];
      const havingClauseAst = this.havingClause.isEmpty() ? null : this.havingClause.ast;
      const primaryKey = this.primaryKey;
      const key = this.model.compositePrimaryKey
        ? (primaryKey as string[]).map((pk) => this.table.get(pk))
        : this.table.get((primaryKey as string | null) ?? null);
      const stmt = arel.compileUpdate(values, key, havingClauseAst, groupValuesArelColumns).ast;
      const count = await c.update(stmt, `${this.model.name} Update All`);
      this.reset();
      return count;
    });
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

    const invalidMethods = Relation.INVALID_METHODS_FOR_DELETE_ALL.filter((method) => {
      const value = (this._values as Record<string, unknown>)[method];
      return method === "distinct" ? Boolean(value) : any((value ?? []) as unknown[]);
    });
    if (invalidMethods.length > 0) {
      throw new ActiveRecordError(`delete_all doesn't support ${invalidMethods.join(", ")}`);
    }

    return this.model.withConnection(async (c) => {
      const arel = this.isEagerLoading
        ? (await this.applyJoinDependency()).arel()
        : this.buildArel(c);
      arel.source.left = this.table;
      const groupValuesArelColumns = this.arelColumns(uniq(this.groupValues)) as ArelNode[];
      const havingClauseAst = this.havingClause.isEmpty() ? null : this.havingClause.ast;
      const primaryKey = this.model.primaryKey;
      const key = this.model.compositePrimaryKey
        ? (primaryKey as string[]).map((pk) => this.table.get(pk))
        : this.table.get((primaryKey as string | null) ?? null);
      const stmt = arel.compileDelete(key, havingClauseAst, groupValuesArelColumns).ast;

      const count = await c.delete(stmt, `${this.model.name} Delete All`);
      this.reset();
      return count;
    });
  }

  async touchAll(...names: TouchAllArgs): Promise<number> {
    const { time } = extractOptionsBang(names as unknown[]) as TouchAllOptions;

    return this.updateAll(await this.model.touchAttributesWithTime(...(names as string[]), time));
  }

  async findOrCreateBy(
    attributes: Record<string, unknown>,
    block?: (r: T) => void,
  ): Promise<T | undefined> {
    return (await this.findBy(attributes)) || this.createOrFindBy(attributes, block);
  }

  async findOrCreateByBang(
    attributes: Record<string, unknown>,
    block?: (r: T) => void,
  ): Promise<T | undefined> {
    return (await this.findBy(attributes)) || this.createOrFindByBang(attributes, block);
  }

  async createOrFindBy(
    attributes: Record<string, unknown>,
    block?: (r: T) => void,
  ): Promise<T | undefined> {
    return this.withConnection(async (connection) => {
      try {
        return await this.transaction(() => this.create(attributes, block), {
          requiresNew: true,
        });
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
    block?: (r: T) => void,
  ): Promise<T | undefined> {
    return this.withConnection(async (connection) => {
      try {
        return await this.transaction(() => this.createBang(attributes, block), {
          requiresNew: true,
        });
      } catch (e) {
        if (!(e instanceof RecordNotUnique)) throw e;
        if (connection.isTransactionOpen()) {
          return this.where(attributes).lock().findByBang(attributes);
        }
        return this.findByBang(attributes);
      }
    });
  }

  async findOrInitializeBy(
    attributes: Record<string, unknown>,
    block?: (r: T) => void,
  ): Promise<T> {
    return (await this.findBy(attributes)) || this.new(attributes, block);
  }

  async firstOrCreate(attributes?: Record<string, unknown>, block?: (r: T) => void): Promise<T> {
    return (await this.first()) || this.create(attributes, block);
  }

  async firstOrCreateBang(
    attributes?: Record<string, unknown>,
    block?: (r: T) => void,
  ): Promise<T> {
    return (await this.first()) || this.createBang(attributes, block);
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
      onDuplicate: ":skip",
      returning: options?.returning,
      recordTimestamps: options?.recordTimestamps,
    });
  }

  async upsertAll(
    attributes: Record<string, unknown>[],
    options?: {
      uniqueBy?: string | string[];
      updateOnly?: string | string[];
      onDuplicate?: ":skip" | ":update" | Nodes.SqlLiteral;
      returning?: InsertAllOptions["returning"];
      recordTimestamps?: boolean;
    },
  ): Promise<Result> {
    return InsertAll.execute(this, attributes, {
      uniqueBy: options?.uniqueBy,
      updateOnly: options?.updateOnly,
      onDuplicate: options?.onDuplicate ?? ":update",
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

  whereValuesHash(
    relationTableName: string | null = this.model.tableName,
  ): Record<string, unknown> {
    return this.whereClause.toH(relationTableName);
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
    if (jd.reflections.length === 0) return [];
    return this.withConnection((c) => this._materializeLimitedIds(c, jd, basePk));
  }

  /** @internal */
  _materializeDeferredDistinctPkPredicates(): Promise<void> | void {
    if (this.isNullRelation()) return;
    const predicates = this.whereClause.predicates;
    const from: unknown = this.fromClause.value;
    const deferredFrom = from instanceof Relation && from._isDeferredDistinctPkSubquery();
    if (
      !deferredFrom &&
      !predicates.some((node) => node instanceof DeferredIdsNotIn || node instanceof DeferredIdsIn)
    ) {
      return;
    }
    return (async () => {
      if (deferredFrom) {
        this._arel = undefined;
        this._fromLimitedIds = new WeakMap([[from, await from._materializeDistinctPkIds()]]);
      }
      for (let i = 0; i < predicates.length; i++) {
        const node = predicates[i];
        if (node instanceof DeferredIdsNotIn || node instanceof DeferredIdsIn) {
          const ids: unknown[] = [];
          for (const rel of node.innerRelations) {
            ids.push(...(await rel.ids()));
          }
          if (node.left instanceof Nodes.Grouping) {
            const key = (node.left.expr as Arel.Attribute[]).map((attribute) => attribute.name);
            const clause = new WhereClause(
              this.predicateBuilder.buildFromHash(new Map([[key, ids]])),
            );
            const built = (node instanceof DeferredIdsNotIn ? clause.invert() : clause).predicates;
            const at = predicates.indexOf(node);
            if (at === -1) continue;
            predicates.splice(at, 1, ...built);
            i = at + built.length - 1;
            continue;
          }
          const attribute = node.left as Arel.Attribute;
          const built = this.predicateBuilder.build(attribute, ids);
          predicates[i] = node instanceof DeferredIdsNotIn ? built.invert() : built;
        }
      }
    })();
  }

  /**
   * @missingRailsCall apply_join_dependency — PERMANENT
   * @missingRailsCall with_connection — PERMANENT
   */
  toSql(): string {
    return this._model.connectionPool().withConnectionSync(
      (conn: DatabaseAdapter) =>
        conn.unpreparedStatement(() => {
          if (this.isEagerLoading) {
            return conn.toSql(this._buildEagerOperandManager());
          } else {
            return conn.toSql(this.arel());
          }
        }) as string,
    );
  }

  private instantiateRecords(rows: Result, block?: (record: T) => void): T[] {
    if (rows.isEmpty()) return [];

    const joinDependency = this._joinDependency;
    if (joinDependency) {
      this._joinDependency = null;
      return joinDependency.instantiate(rows, this.strictLoadingValue, block) as T[];
    }

    return this._model._loadFromSql(rows, block as never) as T[];
  }

  /** @internal */
  _applyEagerJoinDependency(options?: {
    eagerLoading?: boolean;
    limitedIds?: unknown[];
  }): Relation<T, G>;
  /** @internal */
  _applyEagerJoinDependency<R>(
    options: { eagerLoading?: boolean; limitedIds?: unknown[] },
    block: (relation: Relation<T, G>, joinDependency: JoinDependency) => R,
  ): R;
  _applyEagerJoinDependency<R>(
    {
      eagerLoading = this.groupValues.length === 0,
      limitedIds,
    }: { eagerLoading?: boolean; limitedIds?: unknown[] } = {},
    block?: (relation: Relation<T, G>, joinDependency: JoinDependency) => R,
  ): R | Relation<T, G> {
    const jd = QueryMethods.constructJoinDependency.call(
      this as any,
      [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
      Nodes.OuterJoin,
    );
    let rel = this.except("includes", "eagerLoad", "preload");
    QueryMethods.joinsBang.call(rel as any, jd as any);
    if (
      eagerLoading &&
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
      const basePk: string | string[] = (this._model as any).primaryKey ?? "id";
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
    if (block) {
      return block(rel, jd);
    } else {
      return rel;
    }
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
  ): Relation<T, G> {
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
    c: DatabaseAdapter,
    jd: JoinDependency,
    basePk: string | string[],
  ): Promise<unknown[]> {
    const distinctSelect = this._distinctSelectForLimitedIds(c, basePk);
    const idResult = await c.selectAll(
      this._limitedDistinctRelation(jd, basePk, distinctSelect).arel(),
      "SQL",
    );
    const idRows = idResult.toArray();
    if (Array.isArray(basePk)) return idRows.map((row) => basePk.map((column) => row[column]));
    return idRows.map((row) => row[basePk] ?? Object.values(row).pop());
  }

  private _distinctSelectForLimitedIds(c: DatabaseAdapter, basePk: string | string[]): string {
    const table = this.table;
    const pkColumns = (Array.isArray(basePk) ? basePk : [basePk]).map((column) =>
      c.toSql(table.get(column)),
    );
    const pkSql = pkColumns.length === 1 ? pkColumns[0] : pkColumns;
    const adapter = c as unknown as {
      columnsForDistinct?: (
        cols: string | string[],
        orders: (string | ArelNode)[],
      ) => string | string[];
    };
    const orders = this.orderValues.map((clause) => {
      if (Arel.arelNode(clause)) return clause;
      const raw = Array.isArray(clause) ? `${clause[0]} ${clause[1]}` : clause;
      const bare = raw
        .trim()
        .replace(/\s+(?:ASC|DESC)\b.*$/i, "")
        .trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return new Nodes.SqlLiteral(raw);
      return this.arelColumn(bare, () => new Nodes.SqlLiteral(raw)) as ArelNode;
    });
    const values = adapter.columnsForDistinct ? adapter.columnsForDistinct(pkSql, orders) : pkSql;
    return Array.isArray(values) ? values.join(", ") : values;
  }

  private _buildEagerOperandManager(): SelectManager {
    return this._applyEagerJoinDependency({}, (eagerRelation, jd) => {
      jd.applyColumnAliases(eagerRelation);
      return eagerRelation.arel();
    });
  }

  async preloadAssociations(records: T[]): Promise<void> {
    const preload: AssociationSpec[] = [
      ...this.preloadValues,
      ...(this.isEagerLoading ? [] : this.includesValues),
    ];
    const scope = this.strictLoadingValue ? StrictLoadingScope : undefined;
    for (const associations of preload) {
      await Preloader.new({
        records: records as unknown as import("./base.js").Base[],
        associations: [associations],
        scope,
      }).call();
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
    if (attributes === undefined) [id, attributes] = [":all", id as Record<string, unknown>];
    if (id === ":all") {
      const records = await this.toArray();
      for (const record of records) {
        await record.update(attributes);
      }
      return records;
    } else {
      return (await this.model.update(id, attributes)) as T;
    }
  }

  updateBang(attributes: Record<string, unknown>): Promise<T[]>;
  updateBang(id: ":all", attributes: Record<string, unknown>): Promise<T[]>;
  updateBang(id: unknown, attributes: Record<string, unknown>): Promise<T>;
  async updateBang(id?: unknown, attributes?: Record<string, unknown>): Promise<T | T[]> {
    if (arguments.length === 0) {
      throw new ArgumentError("wrong number of arguments (given 0, expected 1..2)");
    }
    if (attributes === undefined) [id, attributes] = [":all", id as Record<string, unknown>];
    if (id === ":all") {
      const records = await this.toArray();
      for (const record of records) {
        await record.updateBang(attributes);
      }
      return records;
    } else {
      return (await this.model.updateBang(id, attributes)) as T;
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
      onDuplicate: ":raise",
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
    const touch = hashDelete(counters, "touch") as CounterCacheTouchOption | null;

    const updates: Record<string, unknown> = {};
    for (const [counterName, value] of Object.entries(counters)) {
      const attr = this.table.get(counterName);
      updates[String(attr.name)] = this._incrementAttribute(attr, value as number);
    }

    if (rtest(touch)) {
      let names: CounterCacheTouchOption | undefined;
      if (touch !== true) names = touch as CounterCacheTouchOption;
      names = wrap(names) as Array<string | { time?: RubyTime }>;
      const options = extractOptionsBang(names) as TouchAllOptions;
      const touchUpdates = await this.model.touchAttributesWithTime(
        ...(names as string[]),
        options.time,
      );
      if (!isEmpty(touchUpdates)) mergeBang(updates, touchUpdates);
    }

    return this.updateAll(updates);
  }

  async delete(idOrArray: unknown): Promise<number> {
    if (idOrArray == null || (Array.isArray(idOrArray) && idOrArray.length === 0)) return 0;

    return this.where(new Map([[this.model.primaryKey, idOrArray]])).deleteAll();
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
    if (
      other instanceof Associations.CollectionProxy ||
      other instanceof ActiveRecord.AssociationRelation
    ) {
      return this.equals(await other.records());
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
    return this._table;
  }

  get model(): typeof Base {
    return this._model;
  }

  get klass(): typeof Base {
    return this._model;
  }

  get loaded(): boolean {
    return this._loaded;
  }

  async isNone(...args: EnumerablePattern<T>[]): Promise<boolean> {
    if (this.isNullRelation()) return true;

    if (isPresent(args))
      return Enumerable.isNone.call<Each<T, Promise<T[]>>, unknown[], Promise<boolean>>(
        this,
        ...args,
      );
    return this.isEmpty();
  }

  private _predicateBuilder: PredicateBuilder;

  get predicateBuilder(): PredicateBuilder {
    return this._predicateBuilder;
  }

  get isScheduled(): boolean {
    return !!this._futureResult;
  }

  get isEagerLoading(): boolean {
    return (this._shouldEagerLoad ||=
      any(this.eagerLoadValues) ||
      (any(this.includesValues) &&
        (any(this.joinedIncludesValues) || this.referencesEagerLoadedTables())));
  }

  get joinedIncludesValues(): AssociationSpec[] {
    const joinsValues = new Set<unknown>(this.joinsValues);
    return [...new Set(this.includesValues)].filter((spec) => joinsValues.has(spec));
  }

  values(): Record<string, unknown> {
    return { ...this._values };
  }

  /** @missingRailsName values — PERMANENT */
  valuesForQueries(): Record<string, unknown> {
    return except(this._values, "extending", "skipQueryCache", "strictLoading");
  }

  get isEmptyScope(): boolean {
    return valuesEqual(this.values(), (this.model as any).unscoped().values());
  }

  get hasLimitOrOffset(): boolean {
    return this.limitValue !== null || this.offsetValue !== null;
  }

  aliasTracker(joins: Nodes.Node[] = [], aliases?: Hash<string, number>): AliasTracker {
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
    block: (attr: Arel.Attribute, bind: QueryAttribute) => R,
  ): R {
    const reflection = this.model._reflectOnAssociation(name);
    if (reflection) {
      name = reflection.foreignKey() as string;
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

  scoping<R>(callback: () => R): R;
  scoping<R>(options: { allQueries?: boolean | null }, callback: () => R): R;
  scoping<R>(options: { allQueries?: boolean | null } | (() => R) = {}, block?: () => R): R {
    if (typeof options === "function") {
      block = options;
      options = {};
    }
    const { allQueries = null } = options;
    const registry = this.model.scopeRegistry();

    if (this.isGlobalScope(registry) && allQueries === false) {
      throw new ArgumentError(
        "Scoping is set to apply to all queries and cannot be unset in a nested block.",
      );
    } else if (this.isAlreadyInScope(registry)) {
      return block!();
    } else {
      return this._scoping(this as any, registry, allQueries, block!);
    }
  }

  private _shouldEagerLoad: boolean | undefined;

  private _cacheKeys: Record<string, Promise<string>> | undefined;
  private _cacheVersions: Record<string, Promise<string>> | undefined;

  async cacheKey(timestampColumn = "updated_at"): Promise<string> {
    this._cacheKeys ||= {};
    return (this._cacheKeys[timestampColumn] ||= this.model.collectionCacheKey(
      this,
      timestampColumn,
    ));
  }

  /** @internal */
  async computeCacheKey(timestampColumn = "updated_at"): Promise<string> {
    const querySignature = Digest.hexdigest(this.toSql());
    const key = `${this.model.modelName.cacheKey}/query-${querySignature}`;

    if (this.model.collectionCacheVersioning) {
      return key;
    }
    const version = await this.computeCacheVersion(timestampColumn);
    return `${key}-${version}`;
  }

  async cacheVersion(timestampColumn = "updated_at"): Promise<string | null> {
    if (this.model.collectionCacheVersioning) {
      this._cacheVersions ||= {};
      return (this._cacheVersions[timestampColumn] ||= this.computeCacheVersion(timestampColumn));
    }
    return null;
  }

  /** @internal */
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
      let collection: Relation<T, G> = this;
      if (this.isEagerLoading) {
        await this.applyJoinDependency({}, (relation) => {
          collection = relation;
        });
      }

      await this.withConnection(async (c) => {
        const column = c.visitor.compile(this.table.get(timestampColumn));
        const selectValues = `COUNT(*) AS ${this.model.adapterClass().quoteColumnName("size")}, MAX(%s) AS timestamp`;

        let arel: unknown;
        if (collection.hasLimitOrOffset) {
          const query = collection.select(sql(`${column} AS collection_cache_key_timestamp`));
          if (this.distinctValue && isEmpty(collection.selectValues)) {
            query.selectValues = [...query.selectValues, this.table.get(star())];
          }
          const subqueryAlias = "subquery_for_cache_key";
          const subqueryColumn = `${subqueryAlias}.collection_cache_key_timestamp`;
          arel = query.buildSubquery(
            subqueryAlias,
            sql(selectValues.replace("%s", subqueryColumn)),
          );
        } else {
          const query = collection.unscope(":order");
          query.selectValues = [sql(selectValues.replace("%s", column))];
          arel = query.arel();
        }

        [size, timestamp] = first(await c.selectRows(arel, null)) ?? [];

        if (size != null) {
          const columnType = this.model.typeForAttribute(timestampColumn);
          timestamp = (
            columnType as unknown as { deserialize(value: unknown): unknown }
          ).deserialize(timestamp);
        } else {
          size = 0;
        }
      });
    }

    if (timestamp != null) {
      return `${size}-${(timestamp as RubyTime).utc().toFs(this.model.cacheTimestampFormat)}`;
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

  initializeCopy(other: Relation<T, G>): this {
    this._values = { ...this._values };
    this.reset();
    this._fromLimitedIds = other._fromLimitedIds;
    return this;
  }

  clone(): Relation<T, G> {
    return rbObjClone(this);
  }

  _execScope(...args: unknown[]): unknown {
    this._delegateToModel = true;
    const registry = this.model.scopeRegistry();
    const body = args.pop() as (this: Relation<T, G>, ...rest: unknown[]) => unknown;
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
      if (block) return block(record);
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

  private _scoping<R>(
    scope: any,
    registry: any,
    allQueries: boolean | null = false,
    block: () => R,
  ): R {
    let previous: any;
    let previousGlobal: any;
    return rbEnsure(
      () => {
        previous = registry.currentScope(this.model, true);
        registry.setCurrentScope(this.model, scope);

        if (allQueries) {
          previousGlobal = registry.globalCurrentScope(this.model, true);
          registry.setGlobalCurrentScope(this.model, scope);
        }
        return block();
      },
      () => {
        registry.setCurrentScope(this.model, previous);
        if (allQueries) {
          registry.setGlobalCurrentScope(this.model, previousGlobal);
        }
      },
    );
  }

  private _substituteValues(values: [string, unknown][]): [any, any][] {
    return values.map(([name, value]) => {
      const attr = this.table.get(name);
      if (Arel.arelNode(value)) {
        if (value instanceof Nodes.SqlLiteral) {
          value = new Nodes.Grouping(value);
        }
      } else {
        const type = this.model.typeForAttribute(String(attr.name));
        value = this.predicateBuilder.buildBindAttribute(String(attr.name), type!.cast(value));
      }
      return [attr, value];
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

ActiveRecord.Relation = Relation;

/* eslint-disable @typescript-eslint/no-empty-object-type */
export interface RelationScopes<T extends Base> {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

export interface Relation<T extends Base, G extends boolean = false> extends RelationScopes<T> {
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
  /** @internal */
  _take?: T | null;
}

export interface Relation<T extends Base, G extends boolean = false> {
  includesValues: AssociationSpec[];
  eagerLoadValues: AssociationSpec[];
  preloadValues: AssociationSpec[];
  selectValues: (string | ArelNode)[];
  groupValues: Array<string | ArelNode>;
  orderValues: Array<string | ArelNode>;
  joinsValues: (AssociationSpec | string | Nodes.Join | JoinDependency)[];
  leftOuterJoinsValues: AssociationSpec[];
  referencesValues: Array<string | Nodes.SqlLiteral>;
  extendingValues: object[];
  readonly extensions: object[];
  unscopeValues: UnscopeArg[];
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
  /** @internal */
  _arel?: SelectManager;
}

export interface Relation<T extends Base, G extends boolean = false>
  extends
    Included<typeof QueryMethods>,
    Included<typeof Explain>,
    Included<SignedIdRelationMethods<T>>,
    Included<TokenForRelationMethods<T>>,
    CalculationMethods<G> {
  find(block: (record: T) => unknown): Promise<T | null>;
  find(ids: unknown[]): Promise<T[]>;
  find(id: unknown): Promise<T>;
  find(...ids: unknown[]): Promise<T | T[]>;
  findBy(arg: Record<string, unknown>): Promise<T | null>;
  findBy(arg: Map<unknown, unknown>): Promise<T | null>;
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
  isExists(conditions?: Record<string, unknown> | unknown): Promise<boolean>;
  isInclude(record: T): Promise<boolean>;
  isMember(record: T): Promise<boolean>;
  raiseRecordNotFoundExceptionBang(
    ids?: unknown,
    resultSize?: number,
    expectedSize?: number,
    key?: string | string[],
    notFoundIds?: unknown[],
  ): never;
  unscope<A extends UnscopeArg[]>(
    ...args: A
  ): Relation<T, UnscopeArg extends A[number] ? boolean : ":group" extends A[number] ? false : G>;
  lock(locks?: string | boolean | null): Relation<T, G>;
  none(): Relation<T, G>;
  readonly(value?: boolean): Relation<T, G>;
  strictLoading(value?: boolean): Relation<T, G>;
  createWith(value: Record<string, unknown> | null): Relation<T, G>;
  from(value: string | Relation<any, boolean> | ArelNode, subqueryName?: string): Relation<T, G>;
  extending<M extends Record<string, (...args: any[]) => any>>(mod: M): Relation<T, G> & M;
  extending<M extends Record<string, (...args: any[]) => any>>(
    mod: M | undefined,
  ): Relation<T, G> & Partial<M>;
  extending(...modules: Module[]): Relation<T, G>;
  extending(fn: (rel: Relation<T, G>) => void): Relation<T, G>;
  extending(): Relation<T, G>;
  optimizerHints(...args: string[]): Relation<T, G>;
  annotate(...args: string[]): Relation<T, G>;
  includes(...args: AssociationSpec[]): Relation<T, G>;
  all(): Relation<T, G>;
  eagerLoad(...args: AssociationSpec[]): Relation<T, G>;
  preload(...args: AssociationSpec[]): Relation<T, G>;
  extractAssociated(association: string): Promise<Base[]>;
  references(...tableNames: Array<string | Nodes.SqlLiteral>): Relation<T, G>;
  with(
    ...args: Array<
      Record<string, Relation<any, boolean> | string | Array<Relation<any, boolean> | string>>
    >
  ): Relation<T, G>;
  withRecursive(
    ...args: Array<
      Record<string, Relation<any, boolean> | string | Array<Relation<any, boolean> | string>>
    >
  ): Relation<T, G>;
  joins(...nodes: Nodes.Join[]): Relation<T, G>;
  joins(specArray: JoinSpec[]): Relation<T, G>;
  joins(hashSpec: Record<string, AssociationSpec | AssociationSpec[]>): Relation<T, G>;
  joins(...args: Array<JoinSpec>): Relation<T, G>;
  leftOuterJoins(...args: Array<AssociationSpec | AssociationSpec[]>): Relation<T, G>;
  leftJoins(...args: Array<AssociationSpec | AssociationSpec[]>): Relation<T, G>;
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
  select(...fields: (string | ArelNode | Record<string, unknown>)[]): Relation<T, G>;
  reselect(
    ...args: (string | ArelNode | Record<string, unknown> | readonly (string | ArelNode)[])[]
  ): Relation<T, G>;
  group(...args: (string | ArelNode)[]): Relation<T, true>;
  regroup(...args: string[]): Relation<T, true>;
  order(...args: OrderArg[]): Relation<T, G>;
  inOrderOf(column: string | ArelNode, values: unknown[], filter?: boolean): Relation<T, G>;
  reorder(...args: OrderArg[]): Relation<T, G>;
  where(): WhereChain<Relation<T, G>>;
  where(args: undefined): WhereChain<Relation<T, G>>;
  where(args: Record<string, unknown> | null): Relation<T, G>;
  where(args: Map<unknown, unknown>): Relation<T, G>;
  where(sql: string | Nodes.SqlLiteral, ...binds: unknown[]): Relation<T, G>;
  where(args: Nodes.Node | Nodes.SqlLiteral): Relation<T, G>;
  where(args: unknown[]): Relation<T, G>;
  rewhere(conditions: Record<string, unknown> | null): Relation<T, G>;
  invertWhere(): Relation<T, G>;
  structurallyCompatible(other: Relation<T, boolean>): boolean;
  and(other: Relation<T, boolean>): Relation<T, G>;
  or(other: Relation<T, boolean>): Relation<T, G>;
  excluding(...records: unknown[]): Relation<T, G>;
  without(...records: unknown[]): Relation<T, G>;
  having(condition: string | Nodes.SqlLiteral, ...binds: unknown[]): Relation<T, G>;
  having(condition: Record<string, unknown>): Relation<T, G>;
  having(condition: Nodes.Node): Relation<T, G>;
  having(
    condition: string | Record<string, unknown> | Nodes.Node | Nodes.SqlLiteral,
    ...binds: unknown[]
  ): Relation<T, G>;
  limit(value: number | string | null): Relation<T, G>;
  offset(value: number | string | null): Relation<T, G>;
  distinct(value?: boolean): Relation<T, G>;
  reverseOrder(): Relation<T, G>;
  spawn(): Relation<T, G>;
  merge<U extends Base, H extends boolean>(
    other: Relation<U, H>,
  ): Relation<T, [G] extends [true] ? true : [H] extends [true] ? true : G | H>;
  merge(other: Partial<Record<ValueMethod, unknown>>): Relation<T, G>;
  mergeBang(other: any): Relation<T, G>;
  except<A extends ExceptSkip[]>(
    ...skips: A
  ): Relation<T, string extends A[number] ? boolean : "group" extends A[number] ? false : G>;
  only<A extends ExceptSkip[]>(
    ...onlies: A
  ): Relation<T, string extends A[number] ? boolean : "group" extends A[number] ? G : false>;
  /** @internal */
  relationWith(values: Record<string, unknown>): Relation<T, G>;
  /** @internal */
  constructRelationForExists(conditions: unknown): Relation<T, G>;
  /** @internal */
  applyJoinDependency(options?: {
    eagerLoading?: boolean;
  }): Omit<Relation<T, G>, "then"> | Promise<Omit<Relation<T, G>, "then">>;
  /** @internal */
  applyJoinDependency<R>(
    options: { eagerLoading?: boolean },
    block: (relation: Relation<T, G>, joinDependency: JoinDependency) => R | Promise<R>,
  ): R | Promise<R>;
  /** @internal */
  usingLimitableReflections(reflections: Array<{ isCollection(): boolean }>): boolean;
  /** @internal */
  findWithIds(...ids: unknown[]): Promise<T | T[]>;
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
  orderedRelation(): Relation<T, G>;
  /** @internal */
  _orderColumns(): string[];
  /** @internal */
  actOnIgnoredOrder(errorOnIgnore: boolean | undefined): void;
  findEach(opts: FindEachOptions, block: (record: T) => void | Promise<void>): Promise<null>;
  findEach(opts?: FindEachOptions): AsyncGenerator<T> & { size(): Promise<number> };
  findInBatches(opts: FindEachOptions, block: (batch: T[]) => void | Promise<void>): Promise<null>;
  findInBatches(opts?: FindEachOptions): AsyncGenerator<T[]> & { size(): Promise<number> };
  inBatches(
    opts: InBatchesOptions,
    block: (relation: LoadedRelation<Relation<T, G>>) => void | Promise<void>,
  ): Promise<null>;
  inBatches(opts?: InBatchesOptions): BatchEnumerator<LoadedRelation<Relation<T, G>>>;
}

export interface Relation<T extends Base, G extends boolean = false> {
  [Symbol.iterator](): IterableIterator<T>;
  map<R>(block: (record: T) => R): R[] | Promise<R[]>;
  findAll(block: (record: T) => unknown): T[] | Promise<T[]>;
  drop(n: number): T[] | Promise<T[]>;
}

export interface Relation<T extends Base, G extends boolean = false> {
  length(): Promise<number>;
  each(fn: (record: T, index: number) => void): Promise<T[]>;
  join(separator?: string): Promise<string>;
  at(index: number | Range<number>, length?: number): Promise<T | T[] | null>;
  intersection(other: T[]): Promise<T[]>;
  union(other: T[]): Promise<T[]>;
  plus(other: T[]): Promise<T[]>;
  difference(other: T[]): Promise<T[]>;
  slice(index: number | Range<number>, length?: number): T | T[] | null | Promise<T | T[] | null>;
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
  get name(): RelationName;
  withConnection<R>(
    fn: (conn: DatabaseAdapter) => R | Promise<R>,
    options?: { preventPermanentCheckout?: boolean; checkoutTimeout?: number },
  ): Promise<R>;
  transaction<R>(
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined>;
  sanitizeSqlLike(value: string, escapeChar?: string): string;
  unscoped(): Relation<T>;
}

const ENUMERABLE_METHODS: Record<string, (records: any[], args: any[]) => unknown> = {
  partition: (records, [fn]) => {
    const matched: unknown[] = [];
    const unmatched: unknown[] = [];
    records.forEach((record, index) => (fn(record, index) ? matched : unmatched).push(record));
    return [matched, unmatched];
  },
  isAll: (records, [fn]) => records.every(fn ?? ((record) => record != null && record !== false)),
  eachCons: (records, [n, fn]) => {
    const slices = eachCons(records, n);
    if (fn === undefined) return slices;
    slices.forEach(fn);
    return records;
  },
  eachWithIndex: (records, [fn]) => {
    records.forEach(fn);
    return records;
  },
  toSet: (records) => new Set(records),
};
ENUMERABLE_METHODS.collect = (records, args) => records.map(...(args as [any]));
for (const name of [
  "forEach",
  "at",
  "indexOf",
  "lastIndexOf",
  "concat",
  "filter",
  "some",
  "every",
  "reduce",
  "sort",
  "flatMap",
]) {
  ENUMERABLE_METHODS[name] = (records, args) => (records as any)[name](...args);
}

include(Relation, Enumerable);
include(Relation, Delegation);
include(Relation, Explain);
include(Relation, Batches);
include(Relation, QueryMethods);
include(Relation, SpawnMethods);
include(Relation, Calculations);
include(Relation, FinderMethods);
include(Relation, SignedIdRelationMethods);
include(Relation, TokenForRelationMethods);

for (const name of ["updateAll", "deleteAll"] as const) {
  const body = Relation.prototype[name] as (this: Relation<any>, ...args: any[]) => Promise<number>;
  Object.defineProperty(Relation.prototype, name, {
    value: async function (this: Relation<any>, ...args: any[]): Promise<number> {
      await this._materializeDeferredDistinctPkPredicates();
      return body.apply(this, args);
    },
    writable: true,
    configurable: true,
  });
}

applyThenable(Relation.prototype);

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

rbDefineAllocFunc(Relation, (klass) => {
  const relation = Object.create(klass.prototype);
  return isModuleIncluded(klass, ClassSpecificRelation)
    ? new Proxy(relation, CLASS_SPECIFIC_RELATION_HANDLER)
    : relation;
});
