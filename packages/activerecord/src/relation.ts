import { Temporal } from "@blazetrails/date";
import { except, hexdigest, isBlank, Notifications, toFs } from "@blazetrails/activesupport";
import { isEmpty } from "@blazetrails/activesupport/ruby-empty";
import { first } from "./ruby-first.js";
import { Table, SelectManager, Nodes, sql } from "@blazetrails/arel";
import type { Base } from "./base.js";
import { threadedConnectionFor } from "./connection-handling.js";
import {
  ActiveRecordError,
  ConnectionNotEstablished,
  RecordNotSaved,
  RecordNotUnique,
  UnknownPrimaryKey,
} from "./errors.js";
import { InvalidSignature } from "@blazetrails/activesupport/message-verifier";
import { ArgumentError } from "@blazetrails/activemodel";
import type { SerializeOptions } from "@blazetrails/activemodel";

import { applyThenable, stripThenable } from "./relation/thenable.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import {
  isPlainObject as _isPlainObject,
  wrap,
  any,
  compactBlank,
  groupBy,
  indexBy,
} from "@blazetrails/activesupport";

import { Range } from "./connection-adapters/postgresql/oid/range.js";
export { Range };
import {
  WhereChain,
  QueryMethodBangs,
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
  DelegationMethods,
  type ToSentenceOptions,
  type ToXmlOptions,
} from "./relation/delegation.js";
import {
  _registerRelationFamily,
  _relationFamilySlot,
} from "./relation/uncacheable-methods-slot.js";
import { resolveAliasedColumn } from "./reflection.js";
import { InsertAll, type InsertAllOptions } from "./insert-all.js";
import { Result } from "./result.js";
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
import { sanitizeLimit } from "./connection-adapters/abstract/database-statements.js";
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
import { AliasTracker } from "./associations/alias-tracker.js";

/**
 * A Relation returned from `load()` / `reload()` — a normal Relation with
 * `then` stripped so `await rel.load()` resolves to the relation itself
 * rather than being recursively unwrapped through the thenable contract to
 * `T[]`. (Matches `stripThenable` which only shadows `.then`; `.catch` and
 * `.finally` aren't part of `Awaited<>`'s unwrap rules, so they stay.)
 */
export type LoadedRelation<R> = Omit<R, "then">;

/** @internal The keyword arguments of `ActiveRecord::Batches#in_batches`. */
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

/**
 * Ruby's `Hash#==` — the comparison `empty_scope?` (relation.rb:1299) makes
 * between two values hashes. JS has no value equality for objects at all, so
 * the recursive walk Ruby gets from `==` is spelled out: each value is compared
 * with its own `==` (`WhereClause#==` / `FromClause#==`, spelled `equals` in the
 * port; an Arel node's `eql?`, spelled `eql`), arrays element by element, and
 * anything else by identity.
 */
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

/**
 * Rails' `[limit_value, 11].compact.min` (relation.rb:1266, :1292). `limit!` is
 * a bare assignment, so `limit_value` can hold whatever the caller passed;
 * Ruby's `Array#min` raises `ArgumentError` when that is a String.
 */
function takeLimit(limitValue: number | string | null): number {
  if (limitValue === null) return 11;
  if (typeof limitValue !== "number") {
    throw new ArgumentError("comparison of String with 11 failed");
  }
  return Math.min(limitValue, 11);
}

function validateExplainOptions(options: ExplainOption[]): void {
  let seenHash = false;
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (typeof o === "string") {
      if (seenHash) {
        throw new Error(
          "EXPLAIN option hash must be the last argument (Rails' extract_options! semantics)",
        );
      }
      continue;
    }
    if (!o || typeof o !== "object") {
      throw new TypeError(
        `EXPLAIN option must be a string flag or an options hash; got ${String(o)}`,
      );
    }
    if (seenHash) {
      throw new Error("EXPLAIN accepts at most one option hash");
    }
    seenHash = true;
  }
}

/**
 * Relation — the lazy, chainable query interface.
 *
 * Mirrors: ActiveRecord::Relation
 */

/**
 * Sentinel preload scope threaded into the preloader when the parent relation
 * is strict-loading. The preloader's `cascade_strict_loading` reads
 * `strictLoadingValue` to propagate strictness onto the derived scope, while
 * `isEmptyScope` keeps it from being merged like a real scope.
 *
 * Rails nests this `:nodoc:` inside `Relation`; kept module-private here.
 *
 * Mirrors: ActiveRecord::Relation::StrictLoadingScope
 * @internal
 */
const StrictLoadingScope = {
  isEmptyScope: true,
  strictLoadingValue: true,
} as const;

/**
 * One pre-resolved association JOIN: the SQL table + ON predicate. The resolved
 * target model is retained here; it is no longer copied onto `_joinClauses`,
 * since a plain `.joins(:assoc)` now resolves its klass through the
 * join-dependency walk.
 */
type JoinClauseSpec = {
  table: string;
  on: string | Nodes.Node;
  klass?: unknown;
};

/**
 * A `Relation::VALUE_METHODS` key — the Ruby Symbol the `@values` hash is keyed
 * by, camelCased (`:eager_load` → `"eagerLoad"`).
 */
export type ValueMethod =
  | (typeof Relation.MULTI_VALUE_METHODS)[number]
  | (typeof Relation.SINGLE_VALUE_METHODS)[number]
  | (typeof Relation.CLAUSE_METHODS)[number];

/**
 * The shape of Rails' `@values` hash: every `VALUE_METHODS` key, optional
 * (an absent key reads back as its default) and typed as that method's value.
 */
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

/**
 * Return type of {@link Relation.name} — a *supertype* of `string`
 * (`string | { [relationNameBrand]: never }`). The runtime value is always a
 * plain string (the model class name); the brand member is phantom and never
 * present at runtime. Widening past `string` is deliberate: it keeps `name` off
 * the structural surface so `Relation` does not satisfy `{ name: string }` (see
 * `Relation#name`), while remaining a supertype of `string` so string literals
 * stay assignable to it at call sites.
 */
export type RelationName = string | { readonly [relationNameBrand]: never };

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/**
 * The chainable object `Relation#explain` returns. Every member runs one
 * operation with query collection enabled and renders the EXPLAIN output for
 * every query it emitted, so `.explain.count` explains the COUNT query rather
 * than the main SELECT.
 *
 * Ruby reaches the rendered plan through `inspect` in the console; trails
 * exposes the same terminal through the relation thenable idiom
 * (`applyThenable(ExplainProxy.prototype, "inspect")` below), so
 * `await rel.explain()` renders while `await rel.explain().count()` stays
 * available.
 *
 * Mirrors: ActiveRecord::Relation::ExplainProxy (relation.rb:6-51)
 * @internal
 */
export class ExplainProxy<T extends Base> {
  private readonly _relation: Relation<T>;
  private readonly _options: ExplainOption[];

  constructor(relation: Relation<T>, options: ExplainOption[]) {
    this._relation = relation;
    this._options = options;
  }

  /**
   * Mirrors: ActiveRecord::Relation::ExplainProxy#inspect (relation.rb:12-14) —
   * `exec_explain { @relation.send(:exec_queries) }`, private-bypass included.
   */
  inspect(): Promise<string> {
    return this.execExplain(() =>
      (this._relation as unknown as { execQueries(): Promise<T[]> }).execQueries(),
    );
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#average (relation.rb:16-18) */
  average(columnName: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.average(columnName as never));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#count (relation.rb:20-22) */
  count(columnName?: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.count(columnName as never));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#first (relation.rb:24-26) */
  first(limit?: number): Promise<string> {
    return this.execExplain(() => this._relation.first(limit as never));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#last (relation.rb:28-30) */
  last(limit?: number): Promise<string> {
    return this.execExplain(() => this._relation.last(limit as never));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#maximum (relation.rb:32-34) */
  maximum(columnName: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.maximum(columnName as never));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#minimum (relation.rb:36-38) */
  minimum(columnName: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.minimum(columnName as never));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#pluck (relation.rb:40-42) */
  pluck(...columnNames: (string | Nodes.Node)[]): Promise<string> {
    return this.execExplain(() => this._relation.pluck(...(columnNames as never[])));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#sum (relation.rb:44-46) */
  sum(identityOrColumn?: string | Nodes.Node): Promise<string> {
    return this.execExplain(() => this._relation.sum(identityOrColumn as never));
  }

  /** Mirrors: ActiveRecord::Relation::ExplainProxy#exec_explain (relation.rb:48-50) */
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
  /**
   * @noRailsEquivalent PERMANENT (`vendor/rails/activerecord/lib/active_record/relation.rb:12` —
   *   JS Promise protocol; Ruby has no thenable).
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<string | TResult>;
  /**
   * @noRailsEquivalent PERMANENT (`vendor/rails/activerecord/lib/active_record/relation.rb:12` —
   *   JS Promise protocol; Ruby has no thenable).
   */
  finally(onfinally?: (() => void) | null): Promise<string>;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

/**
 * Ruby core `Enumerable`'s methods — `relation.rb:67`'s `include Enumerable`,
 * which works over `each` → `records` — as pure sync functions on an
 * already-loaded `records` array. This is the Enumerable half of what
 * `RECORD_DELEGATES` is for `delegate ... to: :records` (delegation.rb:101):
 * Ruby's core Enumerable has no `def` in any vendored gem, so there is no
 * per-method Rails body to mirror and the `include` itself is the only thing
 * to port — one table, not a bespoke body per method.
 *
 * `Relation` applies these to `toArray()`; `CollectionProxy` applies the same
 * functions to `loadTarget()` (collection_proxy.rb:1024 — `records` →
 * `load_target`), which is the whole of the difference Rails has between the
 * two.
 */
const ENUMERABLE_DELEGATES = {
  /** `Enumerable#detect` / `#find` — the first record the block is truthy for. */
  detect: <T>(records: T[], fn: (record: T, index: number, all: T[]) => unknown): T | undefined =>
    records.find(fn),

  /** `Enumerable#reject` — the records the block is falsy for. */
  reject: <T>(records: T[], fn: (record: T) => boolean): T[] => records.filter((r) => !fn(r)),

  /**
   * `Enumerable#sort_by` — ascending by the block's key, stable (equal keys
   * keep their relative order) and non-mutating (`sort_by`, not `sort_by!`).
   */
  sortBy: <T>(records: T[], key: (record: T) => any): T[] =>
    records
      .map((record, index) => ({ record, index, sortKey: key(record) }))
      .sort((a, b) => {
        if (a.sortKey < b.sortKey) return -1;
        if (a.sortKey > b.sortKey) return 1;
        return a.index - b.index;
      })
      .map((entry) => entry.record),

  /** `Enumerable#group_by`. */
  groupBy,

  /** `Enumerable#index_by` (core_ext/enumerable.rb:52-60) — last wins. */
  indexBy,

  /** `Enumerable#compact_blank` (core_ext/enumerable.rb:184-186). */
  compactBlank,
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Relation<T extends Base> {
  /**
   * @internal Ruby's `self.class.name` is the namespace-qualified constant path
   * ("ActiveRecord::Relation"); JS `constructor.name` is unqualified and gets
   * mangled by bundlers. Each relation class pins its Rails constant path here
   * so `inspect` renders the wrapper Rails names.
   */
  static _railsClassName = "ActiveRecord::Relation";

  /** Mirrors: ActiveRecord::Relation::MULTI_VALUE_METHODS (relation.rb:54-57). */
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

  /** Mirrors: ActiveRecord::Relation::SINGLE_VALUE_METHODS (relation.rb:59-60). */
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

  /**
   * Mirrors: ActiveRecord::Relation::INVALID_METHODS_FOR_DELETE_ALL
   * (relation.rb:63). Spelled with the Ruby member names because `delete_all`
   * interpolates them straight into its error message; `with_recursive` has no
   * `@values` entry in Rails either.
   */
  static readonly INVALID_METHODS_FOR_DELETE_ALL = ["distinct", "with", "with_recursive"] as const;

  /** Mirrors: ActiveRecord::Relation::CLAUSE_METHODS (relation.rb:62). */
  static readonly CLAUSE_METHODS = ["where", "having", "from"] as const;

  /** Mirrors: ActiveRecord::Relation::VALUE_METHODS (relation.rb:65). */
  static readonly VALUE_METHODS: readonly ValueMethod[] = [
    ...Relation.MULTI_VALUE_METHODS,
    ...Relation.SINGLE_VALUE_METHODS,
    ...Relation.CLAUSE_METHODS,
  ];

  private _model: typeof Base;
  /**
   * Rails `@values` (relation.rb:86) — the single hash holding every
   * `VALUE_METHODS` entry, read and written through the accessors
   * `query_methods.rb:162-183` generates. An absent key reads back as that
   * method's default.
   * @internal
   */
  _values: ValuesHash = {};
  private _rawOrderClauses: string[] = [];
  /**
   * Mirrors: ActiveRecord::Relation's `@with_is_recursive` (query_methods.rb:527)
   * — an ivar, not a `VALUE_METHODS` entry, so `initialize_copy` carries it over
   * with the rest of the receiver's ivars rather than through `@values`.
   */
  _withIsRecursive = false;
  private _distinctOnColumns: string[] = [];
  private _isNone = false;
  /**
   * @internal True when this relation's WHERE base is the stale new-owner
   * `1=0` NullRelation seed of an association scope built while the owner was a
   * NEW record. Set on that scope and propagated to every spawned relation via
   * `initializeCopy`, so a query executed after the owner is saved can rebase
   * the dead seed onto the resolved association scope. See
   * `associations/new-owner-seed-rebase.ts`.
   */
  _seededNoneNewOwner = false;
  /**
   * @internal Identity snapshot of the seed WHERE predicates captured when a
   * new-owner association scope is built, so a rebase can separate accumulated
   * mutation predicates from the stale `1=0` seed. Empty on ordinary relations.
   */
  _seedWherePredicates: readonly unknown[] = [];
  private _joinClauses: Array<{
    type: "inner" | "left";
    table: string;
    on: string | Nodes.Node;
    quoted?: boolean;
    as?: string;
    // The association this join was derived from (when added via
    // where.associated/where.missing), so a repeat of the same association reuses
    // the existing join instead of minting a duplicate alias.
    assoc?: string;
    // The base alias candidate a self-join alias was minted from (see
    // _selfJoinAlias) — used to attribute repeat counts to the right candidate.
    aliasBase?: string;
  }> = [];
  // A `joins_values` entry is a "named" inner association join (resolved through
  // JoinDependency) when it is a nested-association hash, a Symbol — spelled as
  // a leading-colon string, trails' signal for an association/CTE name, e.g.
  // `joins(":name")` — or a string naming an association; everything else (Arel
  // join nodes, raw SQL strings) is a raw join value. The two derived getters
  // below partition `joinsValues` by this rule — the same rule `joins` uses at
  // insert time. A raw Symbol routed to the raw-join bucket would reach the arel
  // visitor and raise "Unknown node type: Symbol", so Symbols must be named.
  private _isNamedJoinValue(v: unknown): boolean {
    return (
      _isPlainObject(v) ||
      v instanceof JoinDependency ||
      (typeof v === "string" && (v.startsWith(":") || this._isAssociationName(v)))
    );
  }
  /** Mirrors: `attr_accessor :skip_preloading_value` (relation.rb:72). */
  skipPreloadingValue = false;
  private _loaded = false;
  // Rails `@delegate_to_model` (relation.rb:90) — true only while a scope body
  // runs via `_exec_scope`, which is what makes `already_in_scope?` (and hence
  // `spawn`'s `model.all` branch) reachable at all.
  private _delegateToModel = false;
  private _records: T[] = [];
  // Rails `@take` / `@offsets` (finder_methods.rb:586, 599-600).
  protected _take?: T | null;
  protected _offsets?: Map<number, T | null>;
  /**
   * Per-record loader block, run on each freshly instantiated record BEFORE
   * its find/initialize callbacks fire — the trails analog of the block Rails
   * threads through `find_by_sql`/`init_with_attributes`. The collection load
   * path (`findTarget`) sets this to wire `inverse_of` so an `after_find` hook
   * already sees the inverse association loaded.
   * Not copied across `spawn()`: it is set immediately before `toArray()` on
   * the exact relation that will execute.
   */
  _instantiateBlock?: (record: T) => void;
  private _loadAsyncPromise?: Promise<T[]>;
  /**
   * Set by `loadAsync()` so `execMainQuery` issues its SELECT with `async:` on, the way Rails' `load_async` calls
   * `exec_main_query(async: ...)` (relation.rb:1142).
   */
  private _asyncLoad = false;
  // Monotonic token bumped on reset()/reload() so an in-flight toArray()
  // that started before the reset can detect it lost the race and skip
  // committing stale records/loaded state.
  private _loadToken = 0;

  /**
   * Rails' `@_join_dependency` (relation.rb:1435): set by `exec_main_query`'s
   * eager arm and consumed — then cleared — by `instantiate_records` (:1457-1459).
   */
  private _joinDependency: JoinDependency | null = null;
  /**
   * The eager associations `exec_main_query` degraded to a preload, handed to
   * `exec_queries`' preload step. No Rails counterpart: Rails' eager arm always
   * builds the JOIN.
   */
  private _eagerBypassPreloads: AssociationSpec[] | null = null;

  private _table: Table | null = null;

  constructor(
    model: typeof Base,
    // Rails `Relation.create(model, table:)` stores any supplied table object as
    // `@table`, including an aliased table (`arel_table.alias(...)`). Accept the
    // Arel `TableAlias` node directly so callers don't need to cast; the build
    // paths (`buildArel`, Calculations#performCount) seed the manager
    // from whichever node this is.
    table?: Table | Nodes.TableAlias,
    predicateBuilder?: PredicateBuilder,
  ) {
    this._model = model;
    if (table) {
      this._table = table as Table;
    }
    if (predicateBuilder) {
      this._predicateBuilder = predicateBuilder;
    }
  }

  /**
   * PostgreSQL DISTINCT ON — select distinct rows based on specific columns.
   *
   * Mirrors: ActiveRecord::Relation#distinct_on (PostgreSQL only)
   */
  distinctOn(...columns: string[]): Relation<T> {
    const rel = this.spawn();
    rel.distinctValue = true;
    rel._distinctOnColumns = columns;
    return rel;
  }

  /**
   * Returns a human-readable string representation of the relation.
   *
   * Mirrors: ActiveRecord::Relation#inspect
   */
  inspect(): string {
    // Rails renders `#<ClassName [rec.inspect, ...]>`, loading the records
    // synchronously (blocking DB I/O) when the relation isn't already loaded
    // and truncating the entry list at 11 with `...`. The wrapper carries NO
    // model name: Rails' `self.class.name` is the relation class itself —
    // `"ActiveRecord::Relation"` for `Post.limit(2)`, not `Post` (relations_test
    // "relations show the records in #inspect", relations_test.rb:2108-2111) —
    // so model identity surfaces only through the inspected records. The name
    // comes from the per-class `_railsClassName` rather than
    // `constructor.name`, keeping the Relation / CollectionProxy /
    // AssociationRelation distinction (three distinct Rails classes) while
    // rendering each one's namespace-qualified Rails constant path.
    const className = (this.constructor as typeof Relation)._railsClassName;
    if (this._loaded) {
      const max = takeLimit(this.limitValue);
      const entries = this._records.slice(0, max).map((record) => record.inspect());
      if (entries.length === 11) entries[10] = "...";
      return `#<${className} [${entries.join(", ")}]>`;
    }
    // Unloaded: Rails blocks on DB I/O here to load the records; a synchronous
    // JS method returning a string cannot. Rather than invent a divergent
    // query-chain representation, keep Rails' wrapper shape and elide the
    // not-yet-loaded entries with `...`. The faithful record-printing path is
    // async — `await relation.toArray()` (or `prettyPrint`) loads first, after
    // which `inspect` takes the loaded branch above. This is the same sync-JS
    // deviation already documented on `prettyPrint`.
    return `#<${className} [...]>`;
  }

  /**
   * Pretty-print this relation through the `PP` protocol, rendering its
   * records (loading a bounded `annotate("loading for pp")` subject when not
   * yet loaded) and truncating at 11 with `...`.
   *
   * Rails' `Relation#pretty_print` loads synchronously (blocking DB I/O); JS
   * has no blocking I/O, so loading the subject here is async — widening the
   * return to `Promise<void>` vs Ruby's `void`.
   *
   * Mirrors: ActiveRecord::Relation#pretty_print
   */
  async prettyPrint(pp: PrettyPrinter): Promise<void> {
    const max = takeLimit(this.limitValue);
    const subject = this._loaded ? this._records : await this.annotate("loading for pp").limit(max);
    const entries = subject.slice(0, max) as (T | string)[];
    if (entries.length === 11) entries[10] = "...";
    await pp.pp(entries);
  }

  /**
   * Check if this relation is marked readonly.
   *
   * Mirrors: ActiveRecord::Relation#readonly? (relation.rb:1278-1280) — the
   * stored `readonly_value` itself, so an unset relation answers `null` the way
   * Rails answers `nil`.
   */
  get isReadonly(): boolean | null {
    return this.readonlyValue;
  }

  /**
   * Check if this relation carries a lock clause.
   *
   * Mirrors: ActiveRecord::Relation#locked? (relation.rb:75,
   * `alias :locked? :lock_value`) — the stored `lock_value` itself, so `lock`
   * answers `true` and `lock("FOR UPDATE")` answers the string.
   */
  get isLocked(): string | boolean | null {
    return this.lockValue;
  }

  /**
   * Return a fresh unscoped relation for the model, discarding any
   * WHERE/ORDER/etc. conditions on this relation.
   *
   * Mirrors: ActiveRecord::Relation#unscoped — delegates to klass.unscoped.
   */
  unscoped(): Relation<T> {
    return this._model.unscoped() as unknown as Relation<T>;
  }

  // merge and spawn are mixed in from spawn-methods.ts

  /**
   * True when `name` is a declared association on this relation's model. A
   * named `joins(:assoc)` routes through JoinDependency (mirroring Rails'
   * joins_values → build_join_dependencies); anything else is a raw SQL join
   * fragment stored verbatim in joins_values.
   *
   * @internal
   */
  private _isAssociationName(name: string): boolean {
    const modelClass = this._model as any;
    return (modelClass._associations ?? []).some((a: any) => a.name === name);
  }

  // -- Relation state --

  /**
   * Check if the relation has been loaded.
   *
   * Mirrors: ActiveRecord::Relation#loaded?
   */
  get isLoaded(): boolean {
    return this._loaded;
  }

  /**
   * Reset the relation to force re-query next time.
   *
   * Mirrors: ActiveRecord::Relation#reset
   */
  reset(): this {
    this._loaded = false;
    this._delegateToModel = false;
    this._offsets = undefined;
    this._take = undefined;
    this._records = [];
    this._shouldEagerLoad = undefined;
    this._cacheKeys = undefined;
    this._cacheVersions = undefined;
    // Bump the load token and drop any in-flight loadAsync() promise —
    // an already-running toArray() checks the token after its await and
    // will skip committing if it lost the race, so a stale background
    // load can't re-populate records after a reset.
    this._loadToken += 1;
    this._loadAsyncPromise = undefined;
    // Rails' reset also drops the scheduled query (`@future_result&.cancel;
    // @future_result = nil`, relation.rb:1195-1196).
    this._asyncLoad = false;
    return this;
  }

  /**
   * Reset and reload the relation.
   *
   * Mirrors: ActiveRecord::Relation#reload
   */
  async reload(): Promise<LoadedRelation<this>> {
    this.reset();
    await this.load();
    return stripThenable(this);
  }

  /**
   * Return the loaded records. Triggers loading if not yet loaded.
   *
   * Mirrors: ActiveRecord::Relation#records
   */
  async records(): Promise<T[]> {
    await this.load();
    return this._records;
  }

  /**
   * Schedule loading in the background. Returns self for chaining.
   * In JS, this eagerly starts the load as a promise.
   *
   * Mirrors: ActiveRecord::Relation#load_async
   */
  loadAsync(): Relation<T> {
    // Rails' `load_async` takes a connection, bails to `load` unless
    // `c.async_enabled?`, and calls `exec_main_query(async: !c.current_transaction
    // .joinable?)`, keeping the returned FutureResult in `@future_result`
    // (relation.rb:1138-1154). Both of those reads need the connection that
    // will run the query, so trails makes them where it is in hand — in
    // `execMainQuery` — and marks the load async here.
    //
    // The `_loadAsyncPromise` memoization is retained in place of Rails'
    // `@future_result` + `scheduled?`: Rails' foreground `exec_queries` reads
    // `future.result` for the ROWS and still instantiates records itself, so
    // the future is all it has to hold. trails' loading path is a promise the
    // whole way down — instantiation, eager loading and preloading are awaited
    // inside `execQueries` — so the in-flight handle a second caller must
    // join is that promise, not the FutureResult, which covers only the first
    // of those steps.
    // Kick off the load in the background and stash the in-flight promise.
    // toArray() already caches _loaded/_records when it resolves, so no
    // .then bookkeeping is needed. A later `await rel.toArray()` drains
    // the stashed promise instead of issuing a second query — and carries
    // any rejection to the awaiter, matching Rails' load_async behavior.
    //
    // Keep the promise cached for the full lifetime of the load (clear
    // in finally) so concurrent callers share the one in-flight query
    // instead of racing to fire additional ones.
    if (!this._loadAsyncPromise && !this._loaded) {
      // Rails' `unless loaded?` guards the async query too (relation.rb:1141).
      this._asyncLoad = true;
      const loadPromise = this.toArray().finally(() => {
        this._loadAsyncPromise = undefined;
        this._asyncLoad = false;
      });
      // Attach a no-op rejection handler so a failure here isn't treated
      // as an unhandled rejection if nothing else awaits the relation.
      // The stored promise still carries the rejection to explicit
      // awaiters (.toArray(), etc.) via a separate chain.
      void loadPromise.catch(() => {});
      this._loadAsyncPromise = loadPromise;
    }
    return this;
  }

  // spawn is mixed in from spawn-methods.ts

  /**
   * Build a new record with the relation's scoped conditions.
   *
   * Mirrors: ActiveRecord::Relation#build
   */
  build(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  build(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  build(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    if (Array.isArray(attrs)) {
      return attrs.map((a) => this.build(a, block));
    }
    // Rails: `build`/`new` is `scoping { _new(attributes) }` — the new
    // record's `populate_with_current_scope_attributes` seeds from THIS
    // relation's `scope_for_create` (which may be empty, e.g. `unscoped`)
    // rather than the class-level default scope. Set current_scope across the
    // construction so the constructor's seeding honors the relation's scope.
    const modelClass = this._model as any;
    const prev = ScopeRegistry.currentScope(modelClass);
    modelClass.setCurrentScope(this as any);
    let record: T;
    try {
      record = new this._model(attrs) as T;
    } finally {
      modelClass.setCurrentScope(prev);
    }
    // The block runs AFTER current_scope is restored, matching Rails'
    // `current_scope_restoring_block` (relation.rb:1345): it captures the
    // PRIOR scope before `scoping {}` and re-installs it before yielding, so
    // the user block sees the prior scope, not this relation's scope.
    if (block) block(record);
    return record;
  }

  /**
   * Create and persist a new record with the relation's scoped conditions.
   *
   * Mirrors: ActiveRecord::Relation#create (relation.rb:154-161) —
   * `block = current_scope_restoring_block(&block); scoping { _create(attributes, &block) }`,
   * so the record is built under this relation's scope while the user block
   * runs with the prior scope restored.
   */
  async create(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async create(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async create(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attrs)) {
      const records: T[] = [];
      for (const a of attrs) {
        records.push(await this.create(a, block));
      }
      return records;
    }
    const restoring = this.currentScopeRestoringBlock(block);
    return await this.scoping(() => this._create(attrs, restoring));
  }

  /**
   * Create and persist a new record, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Relation#create! (relation.rb:169-176) — the
   * `_create!` arm of the same `current_scope_restoring_block` + `scoping` shape.
   */
  async createBang(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async createBang(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async createBang(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attrs)) {
      const records: T[] = [];
      for (const a of attrs) {
        records.push(await this.createBang(a, block));
      }
      return records;
    }
    const restoring = this.currentScopeRestoringBlock(block);
    return await this.scoping(() => this._createBang(attrs, restoring));
  }

  /**
   * Returns count if not loaded, length of loaded records if loaded.
   *
   * Mirrors: ActiveRecord::Relation#size
   */
  async size(): Promise<number> {
    if (this._loaded) return this._records.length;
    return this.count("all") as Promise<number>;
  }

  /**
   * Check if there are no matching records.
   *
   * Mirrors: ActiveRecord::Relation#empty?
   */
  async isEmpty(): Promise<boolean> {
    if (this._loaded) return this._records.length === 0;
    return !(await this.exists());
  }

  /**
   * Check if there are any matching records.
   *
   * Mirrors: ActiveRecord::Relation#any? (relation.rb:391-396) — `!empty?`;
   * the `loaded?` short-circuit lives in `empty?` (relation.rb:362-370).
   * A pattern argument goes straight to `Enumerable`, whose `===` is
   * `instance_of?` for a class and a call for any other object.
   */
  async isAny(pattern?: EnumerablePattern<T>): Promise<boolean> {
    if (this.isNullRelation()) return false;
    if (pattern !== undefined) {
      const matches = (record: T): boolean =>
        (pattern as { _isActiveRecordBase?: unknown })._isActiveRecordBase === true
          ? record instanceof (pattern as new (...args: never[]) => Base)
          : (pattern as (record: T) => boolean)(record);
      return (await this.toArray()).some(matches);
    }
    return !(await this.isEmpty());
  }

  /**
   * Check if there are multiple matching records.
   *
   * Mirrors: ActiveRecord::Relation#many? (relation.rb:413-419). The optional
   * predicate is Ruby's block, which `Enumerable#many?` counts through,
   * short-circuiting at two matches.
   */
  async isMany(predicate?: (record: T) => boolean): Promise<boolean> {
    if (this.isNullRelation()) return false;
    if (predicate !== undefined) {
      let count = 0;
      for (const record of await this.toArray()) {
        if (predicate(record) && ++count === 2) break;
      }
      return count > 1;
    }
    if (this._loaded) return this._records.length > 1;
    return (await this.limitedCount()) > 1;
  }

  /**
   * Check if there is exactly one matching record.
   *
   * Mirrors: ActiveRecord::Relation#one? (relation.rb:404-411).
   * A pattern argument goes straight to `Enumerable`, whose `===` is
   * `instance_of?` for a class and a call for any other object.
   */
  async isOne(pattern?: EnumerablePattern<T>): Promise<boolean> {
    if (this.isNullRelation()) return false;
    if (pattern !== undefined) {
      const matches = (record: T): boolean =>
        (pattern as { _isActiveRecordBase?: unknown })._isActiveRecordBase === true
          ? record instanceof (pattern as new (...args: never[]) => Base)
          : (pattern as (record: T) => boolean)(record);
      let count = 0;
      for (const record of await this.toArray()) {
        if (matches(record) && ++count === 2) break;
      }
      return count === 1;
    }
    if (this._loaded) return this._records.length === 1;
    return (await this.limitedCount()) === 1;
  }

  /**
   * Alias for isEmpty.
   *
   * Mirrors: ActiveRecord::Relation#blank?
   */
  async isBlank(): Promise<boolean> {
    return this.isEmpty();
  }

  /**
   * Alias for isAny (opposite of blank).
   *
   * Mirrors: ActiveRecord::Relation#present?
   */
  async isPresent(): Promise<boolean> {
    return this.isAny();
  }

  /**
   * Return self if any records exist, null otherwise.
   *
   * Mirrors: Object#presence (core_ext/object/blank.rb:45-47) — `present? ?
   * self : nil`, reached on a Relation through `Relation#blank?`.
   */
  async presence(): Promise<LoadedRelation<Relation<T>> | null> {
    return (await this.isPresent()) ? stripThenable(this as Relation<T>) : null;
  }

  /**
   * Return the number of loaded records — `delegate :length, to: :records`
   * (delegation.rb:101), not an Enumerable member.
   *
   * Mirrors: ActiveRecord::Relation#length
   */
  async length(): Promise<number> {
    const records = await this.toArray();
    return records.length;
  }

  // ---- include Enumerable (relation.rb:67) — see ENUMERABLE_DELEGATES ----

  /** `Enumerable#detect` / `#find` — `find` on a Relation is the AR PK finder. */
  async detect(fn: (record: T, index: number, all: T[]) => unknown): Promise<T | undefined> {
    return ENUMERABLE_DELEGATES.detect(await this.toArray(), fn);
  }

  /** `Enumerable#reject`. */
  async reject(fn: (record: T) => boolean): Promise<T[]> {
    return ENUMERABLE_DELEGATES.reject(await this.toArray(), fn);
  }

  /** `Enumerable#sort_by`. */
  async sortBy(key: (record: T) => any): Promise<T[]> {
    return ENUMERABLE_DELEGATES.sortBy(await this.toArray(), key);
  }

  /** `Enumerable#group_by`. */
  async groupBy<K>(fn: (record: T) => K): Promise<Map<K, T[]>> {
    return ENUMERABLE_DELEGATES.groupBy(await this.toArray(), fn);
  }

  /** `Enumerable#index_by`. */
  async indexBy<K extends string | number>(fn: (record: T) => K): Promise<Record<K, T>> {
    return ENUMERABLE_DELEGATES.indexBy(await this.toArray(), fn);
  }

  /** `Enumerable#compact_blank`. */
  async compactBlank(): Promise<T[]> {
    return ENUMERABLE_DELEGATES.compactBlank(await this.toArray());
  }

  // -- Terminal methods --

  /**
   * Eagerly load the records and return the relation itself.
   * Useful for chaining: `relation.load().isLoaded` is true.
   *
   * Mirrors: ActiveRecord::Relation#load
   */
  async load(): Promise<LoadedRelation<this>> {
    await this.toArray();
    return stripThenable(this);
  }

  /**
   * Execute the query and return all records.
   *
   * Mirrors: ActiveRecord::Relation#to_a / #load
   */
  async toArray(): Promise<T[]> {
    if (this.isNullRelation()) return [];
    if (this._loaded) return [...this._records];
    if (this._loadAsyncPromise) {
      // A prior loadAsync() kicked off the query — share the in-flight
      // promise so callers drain the same query (and carry its errors)
      // instead of racing to issue additional ones. The promise clears
      // itself in loadAsync's .finally once the load settles.
      //
      // This check must stay synchronous (before any await): loadAsync
      // calls toArray() and only assigns _loadAsyncPromise once it
      // returns. Awaiting earlier would let this call resume after the
      // assignment and return the promise derived from itself, deadlocking.
      return this._loadAsyncPromise;
    }
    // Run the query inside `with_connection` so the pool releases the connection
    // afterwards instead of holding it permanently. The build / execute path
    // reads the threaded connection via `_conn()` (see {@link withConnection})
    // rather than the deprecated `.connection` getter, so it never flips the lease
    // permanent under `permanent_connection_checkout = :deprecated | :disallowed`.
    // Mirrors Rails, whose read paths run inside `with_connection` and thread the
    // yielded connection.
    // Mirrors: ActiveRecord::Relation#load (relation.rb:1179-1186) —
    // `@records = exec_queries; @loaded = true`. The assignment lives HERE, not
    // in `exec_queries`, which is what makes `.explain` (which calls
    // `exec_queries` directly, relation.rb:13) side-effect-free.
    const token = this._loadToken;
    const records = await this.withConnection(() => this.execQueries());
    // A reset() landed while the query was in flight: return the rows we got
    // without clobbering the fresh state.
    if (token !== this._loadToken) return records;
    this.loadRecords(records);
    return [...this._records];
  }

  /**
   * Mirrors: ActiveRecord::Relation#exec_queries (relation.rb:1403-1421).
   */
  private async execQueries(): Promise<T[]> {
    return this.skipQueryCacheIfNecessary(async () => {
      // Lazily reflect the schema before issuing the query so consumers
      // don't have to call loadSchema explicitly. Idempotent and cheap.
      await (
        this._model as unknown as { ensureSchemaLoaded(): Promise<void> }
      ).ensureSchemaLoaded();

      // Rails materializes a `distinct_relation_for_primary_key` subquery value
      // (an eager-loading relation with limit/offset over a collection reflection)
      // into a literal id list inside `.where()`. trails' `.where()` is sync, so
      // the materialization is deferred to here — run it before `exec_main_query`
      // so an empty id set becomes an empty `IN` (contradiction, no query).
      await this._materializeDeferredDistinctPkPredicates();

      // Capture the load token before any await so we can detect if a
      // reset() landed while the query was in flight and bail without
      // clobbering the fresh state.
      const token = this._loadToken;

      const rows = await this.execMainQuery();
      if (token !== this._loadToken) return [];
      const records = this.instantiateRecords(rows);

      // Preload associations via separate queries. Rails builds this list as
      // `preload = preload_values; preload += includes_values unless eager_loading?`
      // (relation.rb:1321-1322) — preload_values FIRST, then any includes not
      // already eager-loaded via JOIN. Order matters now that each spec runs as
      // its own sequential `Preloader.call()`, so the query-issue sequence matches
      // Rails for relations mixing `.preload(...)` and `.includes(...)`.
      const bypassPreloads = this._eagerBypassPreloads ?? [];
      this._eagerBypassPreloads = null;
      const preloadAssocs = [
        ...this.preloadValues,
        ...(this.isEagerLoading ? [] : this.includesValues),
        ...bypassPreloads.filter((n) => !this.preloadValues.includes(n)),
      ];
      if (preloadAssocs.length > 0 && records.length > 0) {
        await this.preloadAssociations(records, preloadAssocs);
        if (token !== this._loadToken) return [];
      }

      // Rails applies both flags AFTER `preload_associations` (relation.rb:1417-1418).
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

  /**
   * Mirrors: ActiveRecord::Relation#exec_main_query (relation.rb:1423-1452).
   * Returns rows; `instantiateRecords` turns them into records.
   */
  private async execMainQuery(): Promise<Result> {
    // Rails' load_async bails to a plain `load` unless `c.async_enabled?` and
    // passes `async: !c.current_transaction.joinable?` into `exec_main_query`
    // (relation.rb:1140-1142), which forwards it to BOTH of its query arms —
    // the eager-loading `select_all(relation.arel, "SQL", async: async)`
    // (relation.rb:1436) and `_query_by_sql` (relation.rb:1449 →
    // querying.rb:67-68).
    // Mirrors relation.rb:1424-1429: the `@none` arm short-circuits before the
    // query cache block and before any SQL is issued.
    if (this._isNone) return Result.empty();

    const c = this._conn();
    const async =
      this._asyncLoad && c.asyncEnabled?.() === true && !c.currentTransaction?.()?.joinable;

    // Mirrors relation.rb:1431-1451: ONE `skip_query_cache_if_necessary` over
    // the contradiction / eager_loading? / plain arms, not one per arm.
    return this.skipQueryCacheIfNecessary(async () => {
      // relation.rb:1432-1433: a contradictory where-clause (e.g. `where(id: [])`,
      // which compiles to an empty `IN`) returns `[].freeze` before any SELECT.
      if (this.whereClause.isContradiction()) return Result.empty();

      // Rails' `eager_loading?`, which `exec_main_query` reads for itself
      // (relation.rb:1434) exactly as `exec_queries` does for its preload list.
      if (this.isEagerLoading) {
        const allEager = [...new Set([...this.eagerLoadValues, ...this.includesValues])];
        // trails' remaining capability gap: a composite-PK/CTE/FROM-override
        // eager load can't emit the aliased JOIN, so it degrades to a preload
        // (`_eagerLoadBypassesJoinDependency`). Rails always JOINs.
        if (this._eagerLoadBypassesJoinDependency()) {
          const result = await this._conn().selectAll(this.toArel(), "Eager Load", [], { async });
          this._eagerBypassPreloads = allEager;
          return result;
        }
        // Mirrors: relation.rb:1435-1446.
        return this.applyJoinDependency({}, async (relation, joinDependency) => {
          if (relation.isNullRelation()) return Result.empty();
          joinDependency.applyColumnAliases(relation);
          this._joinDependency = joinDependency;
          return this._conn().selectAll(relation.toArel(), "SQL", [], { async });
        });
      }

      // Awaiting the FutureResult here is trails' `future.result` in
      // `exec_queries` (relation.rb:1408).
      return c.selectAll(this.toArel(), `${this.model.name} Load`, [], { async });
    });
  }

  /**
   * Returns true when any references_values entry points to a table that is
   * not already joined — triggers promoting includes to eager_load.
   *
   * Mirrors: ActiveRecord::Relation#references_eager_loaded_tables?
   */
  private referencesEagerLoadedTables(): boolean {
    // relation.rb:1475 `build_joins([])`. Rails' `build_joins` appends to the
    // joins array it is handed and the caller reads it back; trails' appends to
    // an Arel `SelectManager`, so the throwaway manager is the `[]`.
    const arel = new SelectManager(this.table);
    this.buildJoins(arel);
    const joinedTables = arel
      .joinSources()
      .flatMap((join: Nodes.Join) =>
        join instanceof Nodes.StringJoin
          ? this.tablesInString(join.left)
          : [(join.left as unknown as { name: string }).name],
      );

    joinedTables.push(this.table.name);

    // always convert table names to downcase as in Oracle quoted table names are in uppercase
    const downcased = joinedTables.map((name) => name.toLowerCase());

    return this.referencesValues.some((ref) => !downcased.includes(String(ref)));
  }

  /**
   * Extracts table-like identifiers from a raw SQL string (e.g. a JOIN fragment).
   *
   * Mirrors: ActiveRecord::Relation#tables_in_string
   */
  private tablesInString(string: Nodes.Node | string | null | undefined): string[] {
    // Rails' SqlLiteral IS a String subclass, so `tables_in_string(join.left)`
    // reaches `blank?`/`scan` unconverted (relation.rb:1477, 1491). TS has no
    // String subclass, so the unwrap lives here rather than at each call site.
    if (string instanceof Nodes.SqlLiteral) string = string.value;
    else if (string instanceof Nodes.Node) string = string.toSql();
    if (!string) return [];
    // Mirrors Rails' tables_in_string regex: /[a-zA-Z_][.\w]+(?=.?\.)/
    // The `.?` lookahead allows one non-dot char (e.g. a closing `"`) between
    // the identifier and the qualifying dot, so `"posts"."col"` correctly
    // yields `posts`. Downcase to match Rails' Oracle compat comment.
    const matches = string.match(/[a-zA-Z_][\w.]+(?=.?\.)/g) ?? [];
    return matches.map((s) => s.toLowerCase()).filter((s) => s !== "raw_sql_");
  }

  /**
   * Mirrors: ActiveRecord::Relation#limited_count
   */
  private limitedCount(): Promise<number> {
    if (this.limitValue != null) return this.count() as Promise<number>;
    return this.limit(2).count() as Promise<number>;
  }

  /**
   * Async iterator support — allows `for await (const record of relation)`.
   *
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activerecord/lib/active_record/relation/delegation.rb:101` — the delegated
   *   `each` is synchronous and has no async twin).
   * JS async-iteration protocol — Ruby's Enumerable#each is synchronous
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const records = await this.toArray();
    for (const record of records) {
      yield record;
    }
  }

  /**
   * Return the first record, or first N records when n is given.
   *
   * Mirrors: ActiveRecord::Relation#first
   */
  // first, firstBang, last, lastBang, sole, take, takeBang,
  // second, third, fourth, fifth, fortyTwo, secondToLast, thirdToLast,
  // and their bang variants are mixed in from finder-methods.ts

  /**
   * Return an {@link ExplainProxy} over this relation. Each of its members runs
   * one operation while `ExplainRegistry.collect = true` — the subscriber
   * captures every `sql.active_record` notification and `exec_explain` runs
   * EXPLAIN against each captured SQL — so `.explain().count()` explains the
   * COUNT query and `await .explain()` (the proxy's `inspect`) explains the main
   * SELECT plus every query run as a side effect of it (eager loads, preloads).
   *
   * `options` is a mix of flag strings and an optional trailing keyword
   * hash. Supported keyword options are adapter-specific — PG and MySQL
   * each allowlist their own set of `format` values, SQLite ignores
   * options entirely. Ruby's `extract_options!` allows at most one
   * trailing Hash; we enforce the same shape here so MySQL's
   * order-sensitive SQL (`EXPLAIN FORMAT=JSON ANALYZE` is invalid) can't
   * be produced by accident. Examples:
   *
   *     await Post.all().explain("analyze", "verbose")
   *     // → EXPLAIN (ANALYZE, VERBOSE) for: SELECT …
   *
   *     await Post.all().explain("analyze", { format: "json" })
   *     // → EXPLAIN (ANALYZE, FORMAT JSON) for: SELECT …  (PG)
   *     // → EXPLAIN ANALYZE FORMAT=JSON for: SELECT …     (MySQL)
   *
   * Mirrors: ActiveRecord::Relation#explain
   */
  explain(...options: ExplainOption[]): ExplainProxy<T> {
    validateExplainOptions(options);
    return new ExplainProxy(this, options);
  }

  // count, sum, average, minimum, maximum are mixed in via
  // interface merge + prototype assignment (see bottom of file)

  /**
   * Whether an eager-load query degrades to plain SQL + preloading instead of
   * building a JoinDependency. trails can't emit the aliased eager JOIN under
   * CTEs or a FROM override, so eager specs are preloaded in those cases (a
   * capability gap — Rails always JOINs). Kept in one place so the `toArray`
   * builder (`exec_main_query`), the `toSql` builder (`toSql`), and the
   * calculation/exists raise-check (`_checkEagerLoadable`) agree on exactly when
   * a JoinDependency is built.
   *
   * A composite PK is NOT a bypass: the limited-ids query runs through the
   * adapter's `distinct_relation_for_primary_key` (schema_statements.rb:1429-1452),
   * which maps every pk column and rewrites the relation per column, so
   * `apply_join_dependency` handles a composite key exactly as Rails does.
   * @internal
   */
  private _eagerLoadBypassesJoinDependency(): boolean {
    return this.withValues.length > 0 || !this.fromClause.isEmpty();
  }

  /**
   * Surface raise-worthy eager-load specs before building calculation/exists
   * SQL, which never constructs a JoinDependency of its own. Mirrors Rails
   * `apply_join_dependency`, which `count`/`exists?`/`calculate` route through
   * over `eager_load_values | includes_values` and which raises (via
   * `construct_join_dependency` → `build`) for both misspelled names
   * (`ConfigurationError`) and polymorphic associations
   * (`EagerLoadPolymorphicError`). Building the JoinDependency and discarding it
   * is the whole check — like Rails, the errors are a side effect of `build`.
   *
   * Skips entirely when the query bypasses the JoinDependency (CTEs, set ops,
   * FROM overrides, composite PK): there `toArray` degrades to preloading
   * without raising, so the calculation/exists paths must stay consistent and
   * not raise either.
   *
   * Gated on `eager_loading?`, the condition its Rails counterparts reach
   * `apply_join_dependency` behind (finder_methods.rb:369, calculations.rb:431),
   * so a bare `includes(:polymorphic)` with no reference does not raise here
   * either.
   *
   * Only the calculation/exists entry points call this — the `toArray` eager
   * path builds its real JoinDependency in `exec_main_query`/`toSql`,
   * which raises there, so re-checking from the shared `buildJoins`
   * chokepoint would just rebuild a throwaway JoinDependency on every eager load.
   *
   * Public (not `private`) because the calculation mixins in
   * `relation/calculations.ts` call it cross-module; declaring it private would
   * force a structural-typing workaround and break under `#private` fields.
   * @internal
   */
  _checkEagerLoadable(): void {
    if (this._eagerLoadBypassesJoinDependency()) return;
    if (!this.isEagerLoading) return;
    const specs = [...new Set([...this.eagerLoadValues, ...this.includesValues])];
    new JoinDependency(this._model, this.table, specs, Nodes.OuterJoin);
  }

  /**
   * Update all matching records.
   *
   * Mirrors: ActiveRecord::Relation#update_all
   */
  async updateAll(
    updates: Record<string, unknown> | string | [string, ...unknown[]],
  ): Promise<number> {
    // Mirrors Rails relation.rb#update_all: accepts a Hash, a SQL string, or an
    // Array [sql, *binds] (sanitize_sql_for_assignment). The blank/none checks
    // mirror Rails' order (blank precedes none?).
    const table = this.table;
    // Mirrors Rails: blank check precedes none? check (relation.rb:589-591).
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
        updates[attr.name] = this._incrementAttribute(attr);
      }
      values = this._substituteValues(Object.entries(updates));
    } else {
      values = sql(this.model.sanitizeSqlForAssignment(updates, table.name));
    }

    // Mirrors `relation.rb:606-616`.
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
    // Mirrors `relation.rb:618`: `c.update(stmt, "#{model} Update All")`.
    const count = await this._conn().update(stmtAst, `${this.model.name} Update All`);
    this.reset();
    return count;
  }

  /**
   * Destroy all matching records (runs callbacks on each record).
   *
   * Mirrors: ActiveRecord::Relation#destroy_all
   */
  async destroyAll(): Promise<T[]> {
    const recs = await this.records();
    for (const record of recs) {
      await record.destroy();
    }
    this.reset();
    return recs;
  }

  /**
   * Delete all matching records.
   *
   * Mirrors: ActiveRecord::Relation#delete_all
   */
  async deleteAll(): Promise<number> {
    if (this.isNullRelation()) return 0;
    await this._materializeDeferredDistinctPkPredicates();

    // Mirrors Rails `INVALID_METHODS_FOR_DELETE_ALL.select` (relation.rb:1014):
    // `@values[method]`, tested with `any?` except for `:distinct`. There is no
    // `@values[:with_recursive]` store — `with_recursive!` writes `with_values`
    // like `with!` does — so that member always reads nil and never lands in the
    // message, exactly as here.
    const invalidMethods = Relation.INVALID_METHODS_FOR_DELETE_ALL.filter((method) => {
      const value = (this._values as Record<string, unknown>)[method];
      return method === "distinct" ? Boolean(value) : any((value ?? []) as unknown[]);
    });
    if (invalidMethods.length > 0) {
      throw new ActiveRecordError(`delete_all doesn't support ${invalidMethods.join(", ")}`);
    }

    const table = this.table;
    // Mirrors Rails `delete_all`: always run `build_arel` + `compile_delete`
    // with the primary key, having clause, and group columns. For a
    // limited/ordered/grouped delete the visitor rewrites it into
    // `WHERE (pk...) IN (SELECT pk... ORDER BY ... LIMIT ...)`; for the
    // unconstrained case it emits a plain `DELETE FROM ... WHERE`, identical
    // to a hand-built DeleteManager. A composite primary key maps each column
    // into a row-value tuple (`relation.rb`: `primary_key.map { |pk| table[pk] }`).
    // Routing both PK shapes through one path keeps the TS port structurally
    // faithful to Rails (no second code path to sync).
    //
    // Mirrors `relation.rb:1023`: when the relation requires eager loading
    // (e.g. an `includes` promoted to a join by a `where`/`order` reference),
    // build the arel from the join-dependency relation
    // (`apply_join_dependency.arel`) instead of the plain `build_arel`. Rails
    // passes `apply_join_dependency(eager_loading: group_values.empty?)`
    // implicitly here (the no-arg default, finder_methods.rb:457), so a
    // grouped delete skips the limit/offset materialization guard.
    const arel = this.isEagerLoading
      ? await this.applyJoinDependency({}, (relation) => relation.arel())
      : this.buildArel(this._conn());
    // Mirrors `relation.rb:1024` (`arel.source.left = table`): force the FROM
    // target back to the bare table before `compile_delete`. For the common
    // and join cases `source.left` is already the table, but an explicit
    // `from(custom)` would otherwise leave the DELETE targeting the custom
    // FROM node rather than the model table.
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

    // Mirrors `relation.rb:1035`: `c.delete(stmt, "#{model} Delete All")`.
    const count = await this._conn().delete(stmtAst, `${this.model.name} Delete All`);
    this.reset();
    return count;
  }

  /**
   * Touch all matching records (update timestamps without callbacks).
   *
   * Mirrors: ActiveRecord::Relation#touch_all
   */
  async touchAll(...args: TouchAllArgs): Promise<number> {
    const { names, time } = parseTouchAllArgs(args);
    // No `none?` guard here: Rails' touch_all (relation.rb:969-971) is a bare
    // `update_all model.touch_attributes_with_time(...)` and inherits the
    // `return 0 if @none` from update_all (relation.rb:592). Delegating rather
    // than short-circuiting is also what lets a CollectionProxy's touchAll build
    // from the value readers delegated to `scope` (collection_proxy.rb:1128-1137).

    // Use touchAttributesWithTime so alias-resolved column names are used
    // (e.g. Developer.updated_at → legacy_updated_at). Route through updateAll
    // so optimistic locking (lock_version increment) is applied — mirrors Rails
    // touch_all which calls update_all internally (relation.rb).
    // No empty-updates guard: Rails passes the hash straight to update_all,
    // which raises ArgumentError on a blank hash (relation.rb:589) — before
    // its `none?` check, so a `none` relation raises too.
    return this.updateAll(touchAttributesWithTime.call(this.model, ...names, time));
  }

  /**
   * Find the first record matching conditions within this relation, or create one.
   *
   * Mirrors: ActiveRecord::Relation#find_or_create_by
   */
  async findOrCreateBy(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    // Rails (relation.rb:231): find_by(attributes) || create_or_find_by(attributes)
    // — the create leg rides create_or_find_by so a concurrent insert that wins
    // the race is recovered via its RecordNotUnique rescue instead of raising.
    const existing = await this.findBy(attributes);
    if (existing) return existing;
    return this.createOrFindBy(attributes, extra);
  }

  /**
   * Find the first record matching conditions within this relation, or instantiate one (unsaved).
   *
   * Mirrors: ActiveRecord::Relation#find_or_initialize_by
   */
  async findOrInitializeBy(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const existing = await this.findBy(attributes);
    if (existing) return existing;
    // Same scope_for_create precedence as findOrCreateBy: scope attrs
    // first, createWith overrides, caller's attributes + extra win.
    return new (this._model as any)({
      ...this.scopeForCreate(),
      ...attributes,
      ...extra,
    }) as T;
  }

  /**
   * Try to create first; if uniqueness violation, find the existing record.
   *
   * Mirrors: ActiveRecord::Relation#create_or_find_by (relation.rb:273-283) —
   * the whole body runs inside `with_connection do |connection|`, and the
   * rescue's `transaction_open?` branch asks that yielded connection.
   */
  async createOrFindBy(
    attributes: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    return this.withConnection(async (connection) => {
      // Rails:
      //   transaction(requires_new: true) { create(attributes, &block) }
      //   rescue ActiveRecord::RecordNotUnique
      //     where(attributes).lock.find_by!(attributes)
      // Nested transaction so the failed INSERT rolls back cleanly
      // before the retry; `.lock` + `find_by!` so the concurrent winner
      // is materialized + row-locked inside the caller's txn.
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
        // transaction() returns undefined when the block raises Rollback.
        // Don't silently yield undefined — raise so callers see the abort.
        if (result === undefined) {
          // `RecordNotSaved.record` is conventionally the model instance that
          // failed to persist — which doesn't exist here, since the inner
          // create rolled back. Leave record undefined rather than passing
          // the Relation.
          throw new RecordNotSaved(`${this._model.name}.createOrFindBy rolled back before persist`);
        }
        return result;
      } catch (e) {
        if (!(e instanceof RecordNotUnique)) throw e;
        // Rails (relation.rb:277-281): with a transaction still open the winner
        // is materialized + row-locked inside it; otherwise plain find_by!, no
        // lock.
        if (connection.isTransactionOpen()) {
          return this.where(attributes).lock().findByBang(attributes);
        }
        return this.findByBang(attributes);
      }
    });
  }

  /**
   * Find the first record matching the current where chain, or create one.
   * Extra attributes can be passed to set on the new record.
   *
   * Mirrors: ActiveRecord::Relation#first_or_create
   */
  async firstOrCreate(extra?: Record<string, unknown>): Promise<T> {
    const first = await this.first();
    if (first) return first;
    return this.create(extra);
  }

  /**
   * Find the first record matching the current where chain, or create one (raises on validation failure).
   *
   * Mirrors: ActiveRecord::Relation#first_or_create!
   */
  async firstOrCreateBang(extra?: Record<string, unknown>): Promise<T> {
    const first = await this.first();
    if (first) return first;
    return this.createBang(extra);
  }

  /**
   * Find the first record matching the current where chain, or instantiate one (unsaved).
   *
   * Mirrors: ActiveRecord::Relation#first_or_initialize
   */
  async firstOrInitialize(
    attributes?: Record<string, unknown>,
    block?: (r: T) => void,
  ): Promise<T> {
    return (await this.first()) || this.new(attributes, block);
  }

  /**
   * Insert multiple records in a single INSERT statement (skip callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.insert_all
   */
  async insertAll(
    attributes: Record<string, unknown>[],
    options?: {
      uniqueBy?: string | string[];
      returning?: InsertAllOptions["returning"];
      recordTimestamps?: boolean;
    },
  ): Promise<Result> {
    // Rails' Relation#insert_all always passes `on_duplicate: :skip` (regardless
    // of unique_by); the conflict target is only narrowed when unique_by is
    // given, otherwise `ON CONFLICT DO NOTHING` skips every constraint violation.
    return InsertAll.execute(this, attributes, {
      uniqueBy: options?.uniqueBy,
      onDuplicate: "skip",
      returning: options?.returning,
      recordTimestamps: options?.recordTimestamps,
    });
  }

  /**
   * Upsert multiple records in a single statement (skip callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.upsert_all
   */
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

  /**
   * Extract scope attributes from the where clauses (for find_or_create_by).
   */
  /**
   * Return attributes that would be set on records created through this relation.
   *
   * Mirrors: ActiveRecord::Relation#scope_for_create
   */
  scopeForCreate(): Record<string, unknown> {
    const hash = this._scopeAttributes();
    if (!isEmpty(this.createWithValue)) {
      for (const [k, v] of Object.entries(this.createWithValue)) hash[k] = v;
    }
    return hash;
  }

  /**
   * Return the where values hash for inspection.
   *
   * Mirrors: ActiveRecord::Relation#where_values_hash
   * (`where_values_hash(relation_table_name = model.table_name)`): the
   * table name defaults to the relation's own model table but can be
   * overridden to extract equality predicates scoped to a different table
   * (e.g. `HasManyThroughAssociation#through_scope_attributes` passing the
   * through model's table).
   */
  whereValuesHash(relationTableName: string = this.model.tableName): Record<string, unknown> {
    return this.whereClause.toH(relationTableName);
  }

  /** @internal */
  protected _scopeAttributes(): Record<string, unknown> {
    return this.whereClause.toH(this.model.tableName, { equalityOnly: true });
  }

  // -- SQL generation --

  /**
   * Return the complete query AST as a SelectManager — projections, joins,
   * wheres, order, distinct, limit/offset, group, having, lock, hints, from,
   * CTEs, and annotate() comments. Mirrors Rails `build_arel`
   * (active_record/relation/query_methods.rb:1750): the single manager Rails
   * then compiles, so anything consuming `relation.arel()` as a subquery
   * (`where(id: subrel.arel)`, `from(relation)`) carries the full query rather
   * than a projection-only fragment.
   */
  toArel(aliases?: AliasTracker): SelectManager {
    // Rails' `arel` reader is `with_connection { |c| build_arel(c, aliases) }`
    // (query_methods.rb:1595), so `build_arel` always has a connection.
    // `_resolveAdapter` is the trails stand-in for that acquisition, but it
    // yields null for a model with no established pool — Arel building is
    // reachable there (CTE bodies, `from(relation)` subqueries). Name that case
    // HERE, at the acquisition point, substituting the abstract adapter's own
    // `sanitize_limit` (abstract/database_statements.rb), so `build_arel`'s body
    // never has to consider a missing connection the way Rails' never does.
    return this.buildArel(this._resolveAdapter() ?? { sanitizeLimit }, aliases);
  }

  /**
   * Mirrors: ActiveRecord::FinderMethods#apply_join_dependency
   * (finder_methods.rb:457-481).
   *
   * Only the block form Rails also offers is provided: `distinct_relation_for_primary_key`
   * EXECUTES a query, so this method is async, and a trails `Relation` is
   * thenable — returning one out of a `Promise` would run it and resolve to its
   * records. Callers that want Rails' `relation = apply_join_dependency` shape
   * capture the yielded relation from the block.
   * @internal
   */
  async applyJoinDependency<R>(
    { eagerLoading = this.groupValues.length === 0 }: { eagerLoading?: boolean },
    block: (relation: Relation<T>, joinDependency: JoinDependency) => R | Promise<R>,
  ): Promise<R> {
    const joinDependency = QueryMethodBangs.constructJoinDependency.call(
      this as any,
      [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
      Nodes.OuterJoin,
    ) as unknown as JoinDependency;
    const relation = this.except("includes", "eagerLoad", "preload");
    QueryMethodBangs.joinsBang.call(relation as any, joinDependency as any);

    if (
      eagerLoading &&
      this.hasLimitOrOffset &&
      !(
        this.usingLimitableReflections(joinDependency.reflections as never) &&
        this.usingLimitableReflections(
          (
            QueryMethodBangs.constructJoinDependency.call(
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
      // Rails reassigns `relation` from the return value; every rewrite
      // `distinct_relation_for_primary_key` performs is an in-place mutation of
      // the relation it is handed, and a thenable `Relation` cannot be returned
      // through a `Promise`, so it mutates `relation` and returns nothing here.
      await this.skipQueryCacheIfNecessary(() =>
        this.model.withConnection((c: DatabaseAdapter) =>
          (
            c as unknown as {
              distinctRelationForPrimaryKey(rel: unknown): Promise<void>;
            }
          ).distinctRelationForPrimaryKey(relation),
        ),
      );
    }

    return block(relation, joinDependency);
  }

  /**
   * True when, used as a `where(x: <relation>)` subquery value, this relation
   * matches Rails' `distinct_relation_for_primary_key` branch: it is
   * eager-loading, has a limit/offset, and its eager reflections are NOT
   * limitable (i.e. at least one is a collection). Rails materializes the
   * limited DISTINCT primary keys for this case to avoid `IN (SELECT … LIMIT n)`
   * (which MySQL rejects); trails defers that to relation load time.
   *
   * A grouped relation is excluded, mirroring Rails
   * `apply_join_dependency(eager_loading: group_values.empty?)`
   * (finder_methods.rb:457): a grouped subquery passes `eager_loading: false`,
   * which skips the `distinct_relation_for_primary_key` materialization and
   * builds the plain `IN (SELECT … GROUP BY …)` subquery instead.
   * @internal
   */
  _isDeferredDistinctPkSubquery(): boolean {
    if (this.groupValues.length > 0) return false;
    if (!this.isEagerLoading) return false;
    if (!this.hasLimitOrOffset) return false;
    return !this._eagerJoinDependencyIsLimitable(
      QueryMethodBangs.constructJoinDependency.call(
        this as any,
        [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
        Nodes.OuterJoin,
      ),
    );
  }

  /**
   * Build the inline `SELECT DISTINCT <pk> … LIMIT n` subquery used as the
   * synchronous display fallback (`toSql`) for a deferred marker. The load
   * pipeline substitutes a materialized id list instead; this nested form is
   * only rendered when SQL is requested without loading (valid on SQLite/
   * PostgreSQL; MySQL rejects `LIMIT` inside `IN`, which is exactly why the
   * load-time materialization exists).
   * @internal
   */
  _buildDeferredDistinctPkInlineSubquery(): SelectManager {
    const basePk = (this._model as any).primaryKey ?? "id";
    const jd = QueryMethodBangs.constructJoinDependency.call(
      this as any,
      [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
      Nodes.OuterJoin,
    );
    return this._buildEagerIdSubquery(jd, basePk);
  }

  /**
   * Execute the standalone `SELECT DISTINCT <pk> … LIMIT n` and collect the
   * limited primary keys, mirroring Rails `distinct_relation_for_primary_key`
   * (schema_statements.rb:1429). Runs inside the relation's own connection lease
   * so it resolves the inner model's adapter independently of the outer query.
   * @internal
   */
  async _materializeDistinctPkIds(): Promise<unknown[]> {
    const basePk = (this._model as any).primaryKey ?? "id";
    const jd = QueryMethodBangs.constructJoinDependency.call(
      this as any,
      [...new Set([...this.eagerLoadValues, ...this.includesValues])] as any,
      Nodes.OuterJoin,
    );
    if (jd.nodes.length === 0) return [];
    return this.withConnection(() => this._materializeLimitedIds(jd, basePk));
  }

  /**
   * Load-time hook for Rails' `distinct_relation_for_primary_key`
   * materialization. Before the where clause is compiled, replace each deferred
   * marker (recorded synchronously by `RelationHandler`, or by `excludingBang`
   * for an unloaded `excluding`/`without` relation arg) with a literal
   * `attribute IN (...ids)` / `NOT IN (...ids)`. An empty id set yields an empty
   * `IN`, which `WhereClause#isContradiction` short-circuits to a no-query empty
   * result (Rails' `none!` semantics). Idempotent: substituted nodes are plain
   * `In`/`NotIn`, so a re-load finds nothing to do.
   *
   * Substitution mutates `this.whereClause.predicates` in place and bakes the
   * ids permanently, mirroring Rails, which fixes the materialized ids at
   * `.where()`-build time. Consequence: reloading the SAME relation object after
   * the underlying rows change reuses the first load's parent ids rather than
   * re-querying — re-run the original `where(x: <subquery>)` for fresh ids.
   * Called from every terminal that compiles the where clause (toArray, pluck,
   * exists, the calculations, updateAll/deleteAll) so the literal id list — not
   * the unportable inline `IN (SELECT … LIMIT n)` — reaches all of them.
   * @internal
   */
  async _materializeDeferredDistinctPkPredicates(): Promise<void> {
    const predicates = this.whereClause.predicates;
    for (let i = 0; i < predicates.length; i++) {
      const node = predicates[i];
      if (node instanceof DeferredDistinctPkIn || node instanceof DeferredDistinctPkNotIn) {
        const attribute = node.left as Nodes.Attribute;
        const ids = await node.innerRelation._materializeDistinctPkIds();
        predicates[i] =
          node instanceof DeferredDistinctPkNotIn ? attribute.notIn(ids) : attribute.in(ids);
      } else if (node instanceof DeferredIdsNotIn || node instanceof DeferredIdsIn) {
        const attribute = node.left as Nodes.Attribute;
        // Rails `excluding`/`without`: one predicate over
        // `records + relations.flat_map(&:ids)` (query_methods.rb:1583-1588).
        // Concatenate the known literal ids with each relation's materialized
        // ids so the substitution stays a single predicate, not an `AND` of them.
        // `flat_map(&:ids)` runs each `Relation#ids` select sequentially in
        // argument order (calculations.rb:390-404), so await them in order
        // rather than concurrently (also avoids contending the connection).
        const ids = [...node.literalIds];
        for (const rel of node.innerRelations) {
          ids.push(...(await rel.ids()));
        }
        // Build positively and invert — Rails
        // `predicate_builder[primary_key, records].invert`
        // (query_methods.rb:1587) — instead of hardcoding `NOT IN`, so the
        // materialized array shares the `where.not` array-negation logic
        // (e.g. the single-id `!=` collapse) rather than diverging.
        const built = this.predicateBuilder.build(attribute, ids);
        predicates[i] = node instanceof DeferredIdsNotIn ? built.invert() : built;
      }
    }
  }

  /**
   * Returns sql statement for the relation.
   *
   * Mirrors: ActiveRecord::Relation#to_sql (relation.rb:1210-1222). The eager
   * arm is Rails' `apply_join_dependency { |relation, jd| jd.apply_column_aliases(relation).to_sql }`
   * — `_buildEagerOperandManager` is that block, and its manager is rendered
   * through the same connection path (a null manager, e.g. an unresolvable
   * association, falls through to the plain arel).
   *
   * @missingRailsCall with_connection — Rails' non-eager arm is
   * `model.with_connection { |conn| conn.unprepared_statement { conn.to_sql(arel) } }`
   * (relation.rb:1217-1219). `withConnection` is a `Promise`-returning checkout
   * in TypeScript, and `to_sql` renders a string with no `await` in it, so
   * taking one would make `toSql` async — 412 test and 16 source call sites
   * treat it as synchronous. The checkout is instead the caller's, read through
   * `_conn()`, and `unprepared_statement` is applied by hand around the render.
   * Convergence tracked by RFC 0107 (`converge-sync-eager-builders-async-to-sql`).
   */
  toSql(): string {
    // `unprepared_statement` applied synchronously: `to_sql` is sync here, so
    // the flag is saved and restored around the render rather than through the
    // async `unpreparedStatement` wrapper.
    const conn = this._conn();
    const wasPrepared = conn.preparedStatements;
    conn.preparedStatements = false;
    try {
      if (this.isEagerLoading) {
        const manager = this._buildEagerOperandManager();
        if (manager !== null) return conn.toSql(manager.ast);
      }
      return conn.toSql(this.toArel().ast);
    } finally {
      conn.preparedStatements = wasPrepared;
    }
  }

  /**
   * Mirrors: ActiveRecord::Relation#instantiate_records (relation.rb:1455-1464).
   * The non-eager arm is `model._load_from_sql(rows)`, instrumented with
   * `instantiation.active_record` the way `_load_from_sql` is in Rails.
   */
  private instantiateRecords(result: Result): T[] {
    if (result.isEmpty()) return [];
    const rows = result.toArray();
    const columnTypes = result.columnTypes as Record<
      string,
      { deserialize(value: unknown): unknown }
    >;
    const block = this._instantiateBlock;

    const joinDependency = this._joinDependency;
    if (joinDependency) {
      this._joinDependency = null;
      return joinDependency.instantiate(rows, this.strictLoadingValue, columnTypes, block) as T[];
    }

    const payload = { record_count: rows.length, class_name: this._model.name };
    return Notifications.instrument("instantiation.active_record", payload, () =>
      rows.map((row) => this._model._instantiate(row, block as never, columnTypes) as T),
    );
  }

  /**
   * Mirrors Rails `apply_join_dependency` (finder_methods.rb:456-488) for the
   * eager-load paths that construct their JoinDependency locally: return the
   * relation Rails yields to its block — `except(:includes, :eager_load,
   * :preload).joins!(join_dependency)`. The caller then builds arel from it, so
   * projections, wheres, order, distinct, group, having, lock and hints all come
   * from the ordinary `build_arel` path.
   *
   * Rails resolves a limit/offset over non-limitable (collection) reflections by
   * EXECUTING `distinct_relation_for_primary_key` and rewriting the relation as
   * `pk IN (ids)` with limit/offset cleared. `limitedIds` is that materialized
   * list on the async path; the synchronous `toSql` path cannot execute a query,
   * so it nests the same DISTINCT-pk query inline as a subquery — the one
   * deviation, kept in the same relation-rewrite shape.
   */
  private _applyEagerJoinDependency(
    jd: JoinDependency,
    basePk: string | string[],
    limitedIds?: unknown[],
  ): Relation<T> {
    let rel = this.except("includes", "eagerLoad", "preload");
    QueryMethodBangs.joinsBang.call(rel as any, jd as any);
    if (this.hasLimitOrOffset && !this._eagerJoinDependencyIsLimitable(jd)) {
      if (Array.isArray(basePk)) {
        // Rails `where!(**Array(primary_key).zip(limited_ids.transpose).to_h)`
        // (schema_statements.rb:1448) — a per-column `IN`, not a tuple `IN`.
        // Only the materialized form exists for a composite key: the inline
        // subquery fallback has no single column to nest under.
        const tuples = (limitedIds ?? []) as unknown[][];
        basePk.forEach((column, i) => {
          rel = rel.where(this.table.get(column).in(tuples.map((tuple) => tuple[i]) as never));
        });
      } else {
        const ids = limitedIds ?? this._buildEagerIdSubquery(jd, basePk);
        rel = rel.where(this.table.get(basePk).in(ids as never));
      }
      rel.limitValue = null;
      rel.offsetValue = null;
    }
    return rel;
  }

  /**
   * Rails' two-clause `using_limitable_reflections?` guard in
   * `apply_join_dependency` (finder_methods.rb:463-470), for the paths that
   * already hold the eager JoinDependency: BOTH its own reflections AND those of
   * `select_association_list(joins_values) ∪ select_association_list(left_outer_joins_values)`
   * must be non-collection. A collection reflection in `joins`/`leftOuterJoins`
   * forces the distinct-parent-id rewrite even when every eager reflection is
   * singular.
   *
   * Rails spells this guard inline in `apply_join_dependency`, and so does
   * {@link applyJoinDependency}. This copy serves only the SYNCHRONOUS eager
   * paths that cannot route through it — `toSql`, the deferred distinct-PK
   * predicate cluster, and `_eagerLoadBypassesJoinDependency` — pending the
   * sync/async collapse tracked by
   * `converge-relation-subquery-distinct-pk-materialization`.
   */
  private _eagerJoinDependencyIsLimitable(jd: JoinDependency): boolean {
    return (
      this.usingLimitableReflections(jd.reflections as never) &&
      this.usingLimitableReflections(
        QueryMethodBangs.constructJoinDependency.call(
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

  /**
   * Builds the DISTINCT-primary-key subquery used to limit collection eager
   * loads (LEFT OUTER JOINs + WHERE/ORDER + LIMIT/OFFSET). The toSql path
   * nests it inside `pk IN (...)`; the execution path runs it standalone to
   * materialize literal IDs (Rails' `distinct_relation_for_primary_key`).
   *
   * When `distinctSelectSql` is provided (the standalone execution path), it is
   * the precomputed `columns_for_distinct` SELECT list — order columns appended
   * after the pk, because `SELECT DISTINCT id ... ORDER BY <col>` requires every
   * ordered column to be projected on PostgreSQL. The pk stays last, so callers
   * extract it as the final column. The inline `pk IN (...)` path omits it and
   * projects the pk only (a multi-column subquery is invalid as an `IN` operand)
   * and is never executed.
   *
   * Known limitation (pre-existing): single-column pk only. Callers read the
   * last column value and emit a scalar `pk IN (...)`. Composite keys (Rails'
   * `results.last(pk.length)` + `zip`) are unhandled, matching the rest of this
   * eager path (`basePk`).
   */
  private _buildEagerIdSubquery(
    jd: JoinDependency,
    basePk: string | string[],
    distinctSelectSql?: string,
  ): SelectManager {
    const table = this.table;
    // `table` may be a TableAlias (an aliased relation), which has no
    // `project` — seed the manager from it instead, as Rails does by spawning
    // the relation itself (`relation.reselect(values).distinct!`).
    const idSubquery = new SelectManager(table).project(
      ...(distinctSelectSql !== undefined
        ? [new Nodes.SqlLiteral(distinctSelectSql)]
        : (Array.isArray(basePk) ? basePk : [basePk]).map((column) => table.get(column))),
    );
    idSubquery.distinct();
    // This subquery is its own `build_joins` statement: fold the eager JD into
    // `stashedJoins` so it emits through the single `emitJoinPlan` port with one
    // shared `AliasTracker` spanning the eager JoinDependency and the manual
    // joins, deduping coinciding nodes via `walk` — same threading as the
    // relation `_applyEagerJoinDependency` yields.
    const joined = this.clone();
    QueryMethodBangs.joinsBang.call(joined as any, jd as any);
    _qm.buildJoins.call(joined as any, idSubquery);
    if (!this.whereClause.isEmpty()) idSubquery.where(this.whereClause.ast);
    this.buildOrder(idSubquery);
    if (this.limitValue !== null) idSubquery.take(this.limitValue);
    if (this.offsetValue !== null) idSubquery.skip(this.offsetValue);
    return idSubquery;
  }

  /**
   * Run the DISTINCT-primary-key query that materializes the limited parent IDs
   * for a collection eager load with LIMIT/OFFSET — Rails' `limited_ids_for` /
   * `distinct_relation_for_primary_key` (finder_methods.rb:463). Executes a
   * standalone `SELECT DISTINCT pk … LIMIT n` and returns the literal IDs, so
   * the caller can rewrite the relation as `WHERE pk IN (ids)` instead of
   * nesting `IN (SELECT … LIMIT n)` (which MariaDB rejects). Shared by the
   * toArray execution path (`exec_main_query`) and pluck's apply-join-dependency
   * branch; the connection is proven live at both call sites (the subquery
   * executes immediately).
   *
   * `columns_for_distinct` projects the order columns first and the pk last
   * (unaliased), so the pk is keyed by its column name. When an order column
   * shares that name (e.g. ordering by `posts.id`), duplicate keys collapse to
   * the last write — which is the pk, since it is projected last.
   * @internal
   */
  private async _materializeLimitedIds(
    jd: JoinDependency,
    basePk: string | string[],
  ): Promise<unknown[]> {
    const distinctSelect = this._distinctSelectForLimitedIds(basePk);
    const idResult = await this._conn().selectAll(
      this._buildEagerIdSubquery(jd, basePk, distinctSelect),
      "SQL",
    );
    const idRows = idResult.toArray();
    // Rails `results.last(Array(relation.primary_key).length)`
    // (schema_statements.rb:1441) — a composite key yields one tuple per row.
    if (Array.isArray(basePk)) return idRows.map((row) => basePk.map((column) => row[column]));
    return idRows.map((row) => row[basePk] ?? Object.values(row).pop());
  }

  /**
   * Precompute the DISTINCT-pk subquery's SELECT list via the adapter's
   * `columns_for_distinct` (Rails' `limited_ids_for`). Order columns are
   * appended after the pk so PostgreSQL accepts `SELECT DISTINCT ... ORDER BY
   * <ordered col>`. Called from the deferred distinct-PK cluster, where the connection is
   * established (the subquery executes immediately after), so the adapter is
   * always resolvable here.
   *
   * Order values are shaped for `columns_for_distinct`: strings and Arel nodes
   * pass through (the adapter compiles nodes via its visitor); internal
   * `[col, dir]` tuples are flattened to a SqlLiteral so they compile as plain
   * SQL.
   */
  private _distinctSelectForLimitedIds(basePk: string | string[]): string {
    const table = this.table;
    // Bind-free column refs — compile straight through the visitor (no bind
    // inlining needed) and hand the rendered text to the adapter's
    // `columns_for_distinct`. Rails maps over `Array(relation.primary_key)`
    // (schema_statements.rb:1430), so a composite key contributes every column.
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
    // Qualify a bare known-column order to the base table (mirroring
    // `buildOrder` and Rails' order_values, which are qualified Arel
    // attributes). columns_for_distinct projects the order columns into the
    // SELECT list, so an unqualified `id` would be ambiguous under the eager
    // LEFT OUTER JOIN (e.g. a self-referential `Topic.replies` join on the same
    // `topics` table). Arel order nodes pass through untouched; dotted/quoted/
    // expression orders stay raw SQL (strip ASC/DESC before testing).
    const orders = this.orderValues.map((clause) => {
      if (clause instanceof Nodes.Node) return clause;
      const raw = Array.isArray(clause) ? `${clause[0]} ${clause[1]}` : clause;
      const bare = raw
        .trim()
        .replace(/\s+(?:ASC|DESC)\b.*$/i, "")
        .trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return new Nodes.SqlLiteral(raw);
      // Rails' `arel_column(field) { ... }` (query_methods.rb:1990-2005).
      return this.arelColumn(bare, () => new Nodes.SqlLiteral(raw)) as Nodes.Node;
    });
    const values = adapter.columnsForDistinct ? adapter.columnsForDistinct(pkSql, orders) : pkSql;
    return Array.isArray(values) ? values.join(", ") : values;
  }

  /**
   * Build the eager-load JoinDependency SelectManager (column aliases + LEFT
   * OUTER JOINs), or null when this relation has no resolvable eager loading.
   * Shared by `toSql` (string path) and the set-operation operand
   * builder, which composes it into the compound's single collector.
   *
   * Also null for the one composite-PK case left after
   * `distinct_relation_for_primary_key` took over the async path: this builder is
   * synchronous, so it substitutes an inline `pk IN (SELECT DISTINCT …)` for the
   * executed limited-ids query, and a composite key has no single column to nest
   * that under. The plain arel is closer than a broken per-column `IN ()`.
   */
  private _buildEagerOperandManager(): SelectManager | null {
    if (this._eagerLoadBypassesJoinDependency()) return null;

    const allEager = [...new Set([...this.eagerLoadValues, ...this.includesValues])];
    if (allEager.length === 0) return null;

    const basePk = (this._model as any).primaryKey ?? "id";

    const jd = QueryMethodBangs.constructJoinDependency.call(
      this as any,
      allEager as any,
      Nodes.OuterJoin,
    );
    if (jd.nodes.length === 0) return null;

    if (
      Array.isArray(basePk) &&
      this.hasLimitOrOffset &&
      !this._eagerJoinDependencyIsLimitable(jd)
    ) {
      return null;
    }

    const eagerRelation = this._applyEagerJoinDependency(jd, basePk);
    jd.applyColumnAliases(eagerRelation);
    return eagerRelation.toArel();
  }

  /**
   * The connection for internal query execution: the one threaded by the
   * enclosing `withConnection` wrap when it belongs to this model's pool,
   * else the model's public `.connection`. Mirrors Rails threading the
   * `with_connection` block parameter so internal reads don't re-lease via the
   * deprecated `.connection` getter. The pool-identity guard in
   * {@link threadedConnectionFor} prevents a cross-pool outer wrap from handing
   * this model a foreign connection, so an unconnected HABTM join model still
   * raises `ConnectionNotEstablished`.
   * @internal
   */
  private _conn(): DatabaseAdapter {
    return threadedConnectionFor(this._model) ?? this._model.connection;
  }

  /** Resolve the connection through {@link _conn}, returning null for HABTM join models with no established connection. */
  private _resolveAdapter(): DatabaseAdapter | null {
    try {
      return this._conn();
    } catch (e) {
      if (e instanceof ConnectionNotEstablished) return null;
      throw e;
    }
  }

  /**
   * Mirrors: ActiveRecord::Relation#preload_associations (relation.rb:1321)
   *
   * Rails derives the spec list itself (`preload_values`, plus `includes_values`
   * unless `eager_loading?`) — that is the `assocNames` default here. The
   * internal `load` path passes the list explicitly because this port promotes
   * `includes` to a JOIN per-association rather than all-or-nothing, so it has
   * to subtract exactly the specs it promoted.
   */
  async preloadAssociations(
    records: T[],
    assocNames: AssociationSpec[] = [
      ...this.preloadValues,
      ...(this.isEagerLoading ? [] : this.includesValues),
    ],
  ): Promise<void> {
    if (assocNames.length === 0) return;
    const { Preloader } = await import("./associations/preloader.js");
    // Mirror Rails' `Relation#preload_associations`, which runs one Preloader
    // per association-spec element (`preload.each { |as| Preloader.new(...).call }`,
    // relation.rb:1321-1329) — NOT one Preloader over the whole list. Each spec
    // gets its own Batch, so sibling associations from separate `includes`/
    // `preload` arguments are never co-scheduled into a single
    // `group_and_load_similar` pass. This keeps `class_name`-aliased HABTMs that
    // share one join table (Category's `posts`/`otherPosts`/`specialPosts` on
    // `categories_posts`) on distinct middle-loader passes, so each join-table
    // row is instantiated as its own anonymous `HABTM_*` join model instead of
    // whichever sibling wins a conflated group.
    const scope = this.strictLoadingValue ? StrictLoadingScope : undefined;
    for (const assocName of assocNames) {
      const preloader = new Preloader({
        records: records as unknown as import("./base.js").Base[],
        associations: [assocName],
        scope,
      });
      await preloader.call();
    }
  }

  // find, findBy, findByBang, findSoleBy, findOrCreateByBang, createOrFindByBang,
  // and all bang ordinal methods are mixed in from finder-methods.ts

  // -- CTE support --

  // -- Other query methods --

  /**
   * Alias for build.
   *
   * Mirrors: ActiveRecord::Relation#new
   */
  new(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  new(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  new(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    if (Array.isArray(attrs)) return this.build(attrs, block);
    return this.build(attrs, block);
  }

  // -- Mutation methods --

  /**
   * Update a record by primary key.
   *
   * Mirrors: ActiveRecord::Relation#update
   */
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

  /**
   * Update a record by primary key, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Relation#update!
   */
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

  /**
   * Insert a new record (skips callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.insert
   */
  async insert(
    attributes: Record<string, unknown>,
    options?: { uniqueBy?: string | string[]; returning?: InsertAllOptions["returning"] },
  ): Promise<Result> {
    return this.insertAll([attributes], options);
  }

  /**
   * Insert a new record, raising on failure.
   *
   * Mirrors: ActiveRecord::Base.insert!
   */
  async insertBang(
    attributes: Record<string, unknown>,
    options?: Pick<InsertAllOptions, "returning" | "recordTimestamps">,
  ): Promise<Result> {
    return this.insertAllBang([attributes], options);
  }

  /**
   * Insert multiple records, raising on failure.
   *
   * Mirrors: ActiveRecord::Base.insert_all! (Rails relation.rb:790 —
   * `def insert_all!(attributes, returning: nil, record_timestamps: nil)`).
   */
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

  /**
   * Upsert a single record.
   *
   * Mirrors: ActiveRecord::Base.upsert
   */
  async upsert(
    attributes: Record<string, unknown>,
    options?: { uniqueBy?: string | string[]; returning?: InsertAllOptions["returning"] },
  ): Promise<Result> {
    return this.upsertAll([attributes], options);
  }

  /**
   * Increment/decrement counter columns for all records matching this
   * relation. Values can be positive (increment) or negative (decrement).
   *
   * If `options.touch` is given, updates the named timestamp columns
   * (and `updated_at`/`updated_on` by default) at the same time — matching
   * Rails' `Relation#update_counters(counters, touch:)` behavior.
   *
   * Mirrors: ActiveRecord::Relation#update_counters. For each counter
   * column, builds an Arel `COALESCE("col", 0) + N` expression via
   * `NamedFunction` + `UnqualifiedColumn` + `Addition`. The COALESCE
   * wrapper keeps NULL counters from propagating through the arithmetic.
   */
  async updateCounters(
    counters: Record<
      string,
      number | { time?: Temporal.Instant } | CounterCacheTouchOption | undefined
    >,
  ): Promise<number> {
    // No `none?` guard here: Rails' update_counters (relation.rb:926-944) ends
    // in `update_all updates` and inherits the `return 0 if @none` from there
    // (relation.rb:592), and — on a CollectionProxy — the association scope,
    // through the value readers delegated to `scope` (collection_proxy.rb:1128-1137).

    // Rails extracts :touch from the counters hash itself (relation.rb: `touch = counters.delete(:touch)`)
    const touchFromCounters = (counters as Record<string, unknown>).touch;
    const normalCounters: Record<string, number> = {};
    for (const [k, v] of Object.entries(counters)) {
      if (k !== "touch") normalCounters[k] = v as number;
    }

    const updates: Record<string, unknown> = {};

    for (const [counterName, value] of Object.entries(normalCounters)) {
      // Mirror Rails Relation#update_counters: `attr = table[counter_name]` →
      // `updates[attr.name] = _increment_attribute(attr, value)` (relation.rb:930).
      // resolveAliasedColumn bridges a counter cache on an aliased column to the
      // real column (Rails resolves it inside Arel::Table#[]).
      const attr = this.table.get(resolveAliasedColumn(this._model, counterName));
      updates[attr.name] = this._incrementAttribute(attr, value);
    }

    const touch = touchFromCounters as CounterCacheTouchOption | undefined;
    if (touch) {
      // Mirrors relation.rb:935-941 verbatim: `names = touch if touch != true`,
      // `names = Array.wrap(names)`, then `options = names.extract_options!` —
      // a trailing plain-object arg is the `{ time: }` keyword hash, not a
      // column name.
      let names = wrap(touch !== true ? touch : undefined) as Array<
        string | { time?: Temporal.Instant }
      >;
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

    // No empty-updates guard: Rails ends in a bare `update_all updates`
    // (relation.rb:943), which raises ArgumentError on a blank hash.
    return this.updateAll(updates);
  }

  /**
   * Delete a record by primary key (no callbacks).
   *
   * Mirrors: ActiveRecord::Relation#delete
   */
  async delete(id: unknown): Promise<number> {
    if (id == null) return 0;
    if (Array.isArray(id) && id.length === 0) return 0;

    const primaryKey = this.model.primaryKey;
    if (Array.isArray(primaryKey)) {
      const idArr = Array.isArray(id) ? id : [id];
      if (idArr.length !== primaryKey.length) return 0;
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < primaryKey.length; i++) {
        conditions[primaryKey[i]] = idArr[i];
      }
      return this.where(conditions).deleteAll();
    }

    return this.where({ [primaryKey]: id }).deleteAll();
  }

  /**
   * Destroy a record by primary key (runs callbacks).
   *
   * Mirrors: ActiveRecord::Relation#destroy
   */
  async destroy(id: unknown): Promise<T> {
    const record = await this.find(id);
    await record.destroy();
    return record;
  }

  /**
   * Destroy records matching conditions.
   *
   * Mirrors: ActiveRecord::Relation#destroy_by
   */
  async destroyBy(conditions: Record<string, unknown> = {}): Promise<T[]> {
    return this.where(conditions).destroyAll();
  }

  /**
   * Delete records matching conditions (no callbacks).
   *
   * Mirrors: ActiveRecord::Relation#delete_by
   */
  async deleteBy(conditions: Record<string, unknown> = {}): Promise<number> {
    return this.where(conditions).deleteAll();
  }

  // -- Other --

  /**
   * Compares two relations for equality.
   *
   * Mirrors: ActiveRecord::Relation#== (relation.rb:1253-1262) — a
   * `case/when` whose arms are, in order: a `CollectionProxy`/
   * `AssociationRelation` (re-dispatch on its `records`), any other `Relation`
   * (compare `to_sql`), an Array (compare the loaded `records`). Anything else
   * falls off the `case` and returns `nil`.
   *
   * The two relation-family classes are read off the zero-import registration
   * slot rather than imported: they are `Relation` subclasses, so a value
   * import here would close a subclass cycle. Reading them at call time is
   * where Ruby resolves the constants anyway.
   */
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

  /**
   * Return the Arel table for this relation's model.
   *
   * Mirrors: ActiveRecord::Relation#table
   */
  get table(): Table {
    return this._table ?? this._model.arelTable;
  }

  /**
   * Return the model class for this relation.
   *
   * Mirrors: ActiveRecord::Relation#model
   */
  get model(): typeof Base {
    return this._model;
  }

  /**
   * Alias for {@link model} — mirrors `alias :klass :model` (relation.rb:73).
   */
  get klass(): typeof Base {
    return this._model;
  }

  /**
   * `delegate :slice, to: :records` (relation/delegation.rb:104) — a slice of
   * the loaded records. Rails reads the eager `records` array synchronously;
   * trails loads asynchronously, so this self-loads via `toArray()` first and
   * slices a copy.
   *
   * The return type carries a bare `T[]` alternative so `CollectionProxy#slice`
   * — which overrides this with a synchronous, eager `slice(start?, end?): T[]`
   * over its already-loaded `_target` — stays assignable to the base signature.
   */
  slice(start?: number, end?: number): T[] | Promise<T[]> {
    return this.toArray().then((records) => records.slice(start, end));
  }

  /**
   * `delegate :name, to: :model` (relation/delegation.rb:106) — the model
   * class name. Exposed as a property reader (`relation.name`, no parens),
   * matching Rails' calling convention.
   *
   * The declared return type is {@link RelationName} — a *supertype* of
   * `string` (`string | RelationNameBrand`), not plain `string`. The runtime
   * value is always the model-class-name string, but the widened static type is
   * deliberate: a plain-`string` `name` getter would make the structurally
   * typed `Relation` satisfy the ubiquitous `{ name: string }` object shape,
   * which silently flips `Array#reduce` accumulator inference — e.g.
   * `[{ name }, …].reduce((memo, param) => memo.where(param), Model.unscoped())`
   * would resolve the `reduce(cb, initial: T): T` overload with `T = { name }`
   * (since `Relation` would be assignable to the element type) instead of the
   * generic `reduce<U>(cb, initial: U): U` with `U = Relation`. Because
   * `RelationName` is not assignable to `string`, `Relation` is not assignable
   * to `{ name: string }`, so inference stays correct; because it is a
   * *supertype* of `string`, a string literal is still assignable to it, so
   * `expect(relation.name).toBe("Comment")` type-checks at the call site.
   */
  get name(): RelationName {
    return this.model.name;
  }

  /**
   * Alias for isLoaded.
   *
   * Mirrors: ActiveRecord::Relation#loaded?
   */
  get loaded(): boolean {
    return this._loaded;
  }

  /**
   * Mirrors: ActiveRecord::Relation#none? (relation.rb:373-378).
   * A pattern argument goes straight to `Enumerable`, whose `===` is
   * `instance_of?` for a class and a call for any other object.
   */
  async isNone(pattern?: EnumerablePattern<T>): Promise<boolean> {
    if (this.isNullRelation()) return true;
    if (pattern !== undefined) {
      const matches = (record: T): boolean =>
        (pattern as { _isActiveRecordBase?: unknown })._isActiveRecordBase === true
          ? record instanceof (pattern as new (...args: never[]) => Base)
          : (pattern as (record: T) => boolean)(record);
      return !(await this.toArray()).some(matches);
    }
    return this.isEmpty();
  }

  /**
   * The single none-short-circuit chokepoint consulted by every query terminal
   * (`toArray`/`exists`/`pluck`/`count`/the bounded finders) and by the mutation
   * terminals (`updateAll`/`deleteAll`) BEFORE returning an empty result.
   * `touchAll`/`updateCounters` reach it by delegating to `updateAll`, as they
   * do in Rails.
   *
   * On a plain relation this is just `_isNone`; the override in
   * `AssociationRelation` first rebases a stale new-owner `1=0` seed onto the
   * live association scope, so a relation SPAWNED off a new owner
   * (`owner.things.where(...)`) resolves the persisted FK once the owner is
   * saved — mirroring Rails' CollectionProxy delegating every query to
   * `association.scope`, rather than each terminal carrying its own rebase hook.
   * `CollectionProxy` needs no rebase at all: it is never `@none` itself, and
   * its value readers are delegated to `scope` (collection_proxy.rb:1128-1137).
   *
   * @internal
   */
  _isEmptyRelation(): boolean {
    return this._isNone;
  }

  // ---------------------------------------------------------------------------
  // Missing relation.rb methods — accessors, cache keys, scoping
  // ---------------------------------------------------------------------------

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
    return false;
  }

  /**
   * Returns true if relation needs eager loading.
   *
   * Mirrors: ActiveRecord::Relation#eager_loading? (relation.rb:1237-1242)
   *
   *   @should_eager_load ||=
   *     eager_load_values.any? ||
   *     includes_values.any? && (joined_includes_values.any? || references_eager_loaded_tables?)
   *
   * `||=` recomputes on a falsy memo, so a `false` result is not sticky; `reset`
   * clears it alongside the other memos (relation.rb:1195-1204).
   */
  get isEagerLoading(): boolean {
    return (this._shouldEagerLoad ||=
      this.eagerLoadValues.length > 0 ||
      (this.includesValues.length > 0 &&
        (this.joinedIncludesValues.length > 0 || this.referencesEagerLoadedTables())));
  }

  /**
   * Joins that are also marked for preloading. In which case we should just eager load them.
   *
   * Mirrors: ActiveRecord::Relation#joined_includes_values (relation.rb:1247-1249)
   * — `includes_values & joins_values`, Ruby's order-preserving, deduping Array
   * intersection.
   */
  get joinedIncludesValues(): AssociationSpec[] {
    // Rails intersects two Symbol arrays. joins_values now carries the Symbol
    // spelling (`":comments"`) while includes_values is still swept to the bare
    // one, so both sides drop a leading colon before the comparison. Once
    // includes/preload/eagerLoad are swept too, this collapses back to
    // `joinsValues.has(spec)`.
    const symbolName = (v: unknown): unknown =>
      typeof v === "string" && v.startsWith(":") ? v.slice(1) : v;
    const joinsValues = new Set<unknown>(this.joinsValues.map(symbolName));
    return [...new Set(this.includesValues)].filter((spec) => joinsValues.has(symbolName(spec)));
  }

  /** Mirrors: ActiveRecord::Relation#values (relation.rb:1281-1283) — `@values.dup`. */
  values(): Record<string, unknown> {
    return { ...this._values };
  }

  /** Mirrors Rails' `Relation#values_for_queries` (relation.rb:1286):
   *  `@values.except(:extending, :skip_query_cache, :strict_loading)`. This is
   *  the canonical key the preloader uses to decide whether two loaders
   *  coalesce (Preloader::Association::LoaderQuery#eql?/#hash). */
  valuesForQueries(): Record<string, unknown> {
    return except(this._values, "extending", "skipQueryCache", "strictLoading");
  }

  /**
   * Mirrors: ActiveRecord::Relation#empty_scope? (relation.rb:1299) —
   * `@values == model.unscoped.values`. The STI `type_condition` needs no
   * special case: a finder-type-condition class carries it in its own
   * `unscoped` values too, so it compares equal (see {@link valuesEqual} for
   * the `Hash#==` JS lacks).
   */
  get isEmptyScope(): boolean {
    return valuesEqual(this.values(), (this.model as any).unscoped().values());
  }

  get hasLimitOrOffset(): boolean {
    return this.limitValue !== null || this.offsetValue !== null;
  }

  aliasTracker(joins: Nodes.Node[] = [], aliases?: Map<string, number>): AliasTracker {
    return AliasTracker.create(this.model.connectionPool(), this.table.name, joins, aliases);
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
          reflection.associationPrimaryKey as string,
        );
      }
    }

    const attr = this.table.get(name);
    const bind = this.predicateBuilder.buildBindAttribute(attr.name, value);
    return block(attr, bind);
  }

  /**
   * Execute a block with this relation installed as the current scope.
   *
   * With `{ allQueries: true }` the scope also applies to non-SELECT queries
   * (update/delete/reload) and association reads, by installing it as the
   * registry's global current scope. Once `allQueries` is set it cannot be
   * unset in a nested block — passing `{ allQueries: false }` while a global
   * scope is active raises ArgumentError, mirroring Rails.
   *
   * Mirrors: ActiveRecord::Relation#scoping(all_queries:, &block)
   */
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

    const modelClass = this.model as any;
    const registry = this.model.scopeRegistry();

    // Rails: global_scope? && all_queries == false → raise.
    if (this.isGlobalScope(registry) && allQueries === false) {
      throw new ArgumentError(
        "Scoping is set to apply to all queries and cannot be unset in a nested block.",
      );
    }

    // Rails: `elsif already_in_scope?(registry) then yield` — the receiver is
    // already installed as the current scope, so re-installing it is a no-op.
    if (this.isAlreadyInScope(registry)) {
      return await callback();
    }

    const prev = registry.currentScope(modelClass, true);
    registry.setCurrentScope(modelClass, this as any);
    let prevGlobal: any;
    if (allQueries) {
      prevGlobal = registry.globalCurrentScope(modelClass, true);
      registry.setGlobalCurrentScope(modelClass, this as any);
    }
    try {
      return await callback();
    } finally {
      registry.setCurrentScope(modelClass, prev);
      if (allQueries) {
        registry.setGlobalCurrentScope(modelClass, prevGlobal);
      }
    }
  }

  /**
   * Mirrors: ActiveRecord::SignedId::RelationMethods#find_signed
   */
  async findSigned(token: string, options?: { purpose?: string }): Promise<T | null> {
    return this.scoping(() => (this.model as any).findSigned(token, options)) as Promise<T | null>;
  }

  /**
   * Mirrors: ActiveRecord::SignedId::RelationMethods#find_signed!
   */
  async findSignedBang(token: string, options?: { purpose?: string }): Promise<T> {
    return this.scoping(() => (this.model as any).findSignedBang(token, options)) as Promise<T>;
  }

  /**
   * Mirrors: ActiveRecord::TokenFor::RelationMethods#find_by_token_for
   */
  async findByTokenFor(purpose: string, token: string): Promise<T | null> {
    const primaryKey = this.model.primaryKey as string | string[] | null;
    if (!primaryKey || primaryKey.length === 0) throw new UnknownPrimaryKey(this);
    const record = await this.model.tokenDefinitions.fetch(purpose).resolveToken(token, (id) => {
      // Rails passes `model.primary_key => [id]`; with a composite key that
      // hash key is the key array, which trails' findBy spells one column at
      // a time.
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

  /**
   * Mirrors: ActiveRecord::TokenFor::RelationMethods#find_by_token_for!
   */
  async findByTokenForBang(purpose: string, token: string): Promise<T> {
    const record = await this.model.tokenDefinitions
      .fetch(purpose)
      .resolveToken(token, (id) => this.find(id) as Promise<Base>);
    if (!record) throw new InvalidSignature();
    return record as T;
  }

  // Memoized per timestamp column, matching Rails' @cache_keys / @cache_versions.
  /** Rails: `@should_eager_load` (relation.rb:1237-1242), cleared in `reset`. */
  private _shouldEagerLoad: boolean | undefined;

  private _cacheKeys: Map<string, Promise<string>> | undefined;
  private _cacheVersions: Map<string, Promise<string | null>> | undefined;

  /**
   * Returns a cache key for this relation, including count and timestamp when
   * collection_cache_versioning is off (the default), or just the query digest
   * when versioning is on (stable key, use cache_version for the changing part).
   *
   * Mirrors: ActiveRecord::Relation#cache_key
   */
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

  /**
   * Returns cache version when collection_cache_versioning is on, null otherwise.
   *
   * Mirrors: ActiveRecord::Relation#cache_version
   */
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

  /** @internal */
  async computeCacheVersion(timestampColumn = "updated_at"): Promise<string> {
    timestampColumn = String(timestampColumn);

    let size: unknown = 0;
    let timestamp: unknown = null;

    if (this._loaded) {
      size = this._records.length;
      if ((size as number) > 0) {
        // Ruby's `Array#max`, which orders through `<=>`; a cast datetime
        // attribute sits on a `Temporal.Instant`, which has no relational
        // operators of its own.
        timestamp = this._records
          .map((record) =>
            (record as unknown as { readAttribute(name: string): unknown }).readAttribute(
              timestampColumn,
            ),
          )
          .reduce((max: unknown, value: unknown) => {
            if (max == null) return value;
            if (value == null) return max;
            if (max instanceof Temporal.Instant && value instanceof Temporal.Instant) {
              return Temporal.Instant.compare(value, max) > 0 ? value : max;
            }
            return (value as number) > (max as number) ? value : max;
          }, null);
      }
    } else {
      // Rails: `collection = eager_loading? ? apply_join_dependency : self`
      // (relation.rb:481). An eager-loaded relation must have its includes/
      // eager_load converted to plain JOINs first, so the COUNT(*)/MAX(...)
      // projection below replaces the relation's columns instead of being mixed
      // with the eager-load's `comments.*` projection — which Postgres rejects
      // ("column must appear in the GROUP BY clause") and SQLite silently allows.
      //
      // The yielded relation is captured out of the block rather than assigned
      // from the return value (Rails' `collection = apply_join_dependency`)
      // because a `Relation` is thenable and cannot cross a `Promise` boundary.
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
      // A limit/offset over a collection reflection is materialized to a
      // `WHERE pk IN (ids)` relation with limit/offset cleared, so this branch
      // keys off the RESOLVED relation's limit/offset (Rails'
      // `collection.has_limit_or_offset?`), not the original's.
      if (collection.hasLimitOrOffset) {
        const query = collection.select(sql(`${column} AS collection_cache_key_timestamp`));
        if (this.distinctValue && isEmpty(collection.selectValues)) {
          // `Table#star` is a getter; a table ALIAS (Nodes.TableAlias) has none,
          // so `get("*")` yields the equivalent `<alias>.*` Attribute — mirrors
          // Rails' `table[Arel.star]` over `Arel::Nodes::TableAlias#[]`.
          const star = (this.table as { star?: Nodes.Node }).star ?? this.table.get("*");
          query.selectValues = [...query.selectValues, star];
        }
        const subqueryAlias = "subquery_for_cache_key";
        const subqueryColumn = `${subqueryAlias}.collection_cache_key_timestamp`;
        arel = query.buildSubquery(subqueryAlias, sql(selectValues.replace("%s", subqueryColumn)));
      } else {
        const query = collection.unscope("order");
        query.selectValues = [sql(selectValues.replace("%s", column))];
        arel = query.toArel();
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

  /**
   * Copy query state from `source` onto `this`.
   *
   * Mirrors: ActiveRecord::Relation#initialize_copy (relation.rb:97-100) —
   * `@values = @values.dup` then `reset`. Ruby's `dup` copies the receiver's
   * ivars first and `initialize_copy` re-dups the values hash; TypeScript has
   * no `dup`, so the copy is spelled as an explicit assignment from `source`.
   * The stores trails still keeps beside `@values` are copied alongside it.
   */
  initializeCopy(source: Relation<T>): void {
    this._table = source._table;
    this._values = { ...source._values };
    this._rawOrderClauses = [...source._rawOrderClauses];
    this._withIsRecursive = source._withIsRecursive;
    this._distinctOnColumns = [...source._distinctOnColumns];
    this._isNone = source._isNone;
    this._joinClauses = [...source._joinClauses];
    // Rebind extension-module methods onto this clone. Ruby's `extend`
    // mutates the singleton class, so a cloned relation keeps the mixed-in
    // methods; here `extending_values` only carries the module objects, so we
    // re-bind each method to the new instance. Without this, extension
    // methods applied to a CollectionProxy (or via `extending(...)`) are
    // lost the moment the relation is spawned (`rel.where(...).fooExt()`).
    // Read the modules off `source`, not `this`: `@values` was just copied from
    // it, and a `CollectionProxy` receiver delegates its `extending_values`
    // reader to `scope` (collection_proxy.rb:1128-1137), which would build the
    // association scope mid-copy.
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
    // `_delegateToModel` is deliberately NOT copied: Rails' `initialize_copy`
    // (relation.rb:97-100) ends in `reset`, which clears `@delegate_to_model`.
    // Carrying it onto clones would let derived relations report "already in
    // scope" whenever a current scope is installed, so a chained `where` would
    // spawn `model.all` and discard the values accumulated so far.
  }

  /**
   * Ruby's `Object#clone` — the allocation `spawn` (spawn_methods.rb:10) copies
   * through. Ruby copies the receiver's ivars into a same-class allocation and
   * then runs `initialize_copy`; TypeScript has no `allocate`, so the class is
   * re-instantiated here (subclasses override to reach their own constructor)
   * and `initializeCopy` does the ivar copy.
   *
   * @internal
   */
  clone(): Relation<T> {
    // Allocate from the per-model `Relation` subclass carrier
    // (`relationClassFor`) so cloned relations keep the prototype that carries
    // generated relation methods — otherwise `.where(...).someClassMethod()`
    // would spawn a bare shared `Relation` and lose the real-method resolution.
    const ctor = relationClassFor(this._model as unknown as typeof Base);
    const rel = new ctor(this._model) as Relation<T>;
    rel.initializeCopy(this);
    return wrapWithScopeProxy(rel);
  }

  /**
   * Run a named-scope body with this relation as the receiver.
   *
   * Rails `instance_exec`s the body against the relation; trails scope bodies
   * instead take the relation as their first argument, so it is passed
   * explicitly here — the `|| self` fallback and the scope-registry threading
   * are otherwise identical.
   *
   * Mirrors: ActiveRecord::Relation#_exec_scope
   */
  _execScope(fn: (rel: Relation<T>, ...args: unknown[]) => unknown, ...args: unknown[]): unknown {
    this._delegateToModel = true;
    const registry = this.model.scopeRegistry();
    try {
      return this._scoping(null, registry, () => fn(this, ...args) || this);
    } finally {
      this._delegateToModel = false;
    }
  }

  protected loadRecords(records: T[]): void {
    this._records = [...records];
    this._loaded = true;
  }

  // Mirrors relation.rb:1337-1339 — the `@delegate_to_model` guard is what
  // narrows this to "receiver is the current scope inside a scope body";
  // without it every relation under any `scoping {}` block would qualify.
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

  private _new(attributes: Record<string, unknown>): T {
    return new (this.model as any)(attributes) as T;
  }

  private _create(attributes: Record<string, unknown>, block?: (record: T) => void): Promise<T> {
    return (this.model as any).create(attributes, block);
  }

  private _createBang(
    attributes: Record<string, unknown>,
    block?: (record: T) => void,
  ): Promise<T> {
    return (this.model as any).createBang(attributes, block);
  }

  private _scoping<R>(scope: any, registry: any, fn: () => R): R {
    const previous = registry?.currentScope?.(this.model, true);
    registry?.setCurrentScope?.(this.model, scope);
    try {
      return fn();
    } finally {
      registry?.setCurrentScope?.(this.model, previous);
    }
  }

  // Mirrors relation.rb:1381-1393.
  private _substituteValues(values: [string, unknown][]): [any, any][] {
    return values.map(([name, value]) => {
      const attr = this.table.get(name);
      // Mirrors `Arel.arel_node?` (arel.rb): Node, SqlLiteral, or Attribute.
      if (
        value instanceof Nodes.Node ||
        value instanceof Nodes.SqlLiteral ||
        value instanceof Nodes.Attribute
      ) {
        // The Grouping is what makes a raw `Arel.sql(...)` scalar subquery
        // render as `SET col = (select ...)`, which SQLite/MySQL/PG require.
        return [attr, value instanceof Nodes.SqlLiteral ? new Nodes.Grouping(value) : value];
      }
      // Rails casts exactly once here: `build_bind_attribute` hands the already-cast
      // value to `QueryAttribute.new` (predicate_builder.rb:67-69), and
      // `QueryAttribute#type_cast` is identity (query_attribute.rb:22-24). trails'
      // `QueryAttribute#typeCast` instead casts its input — most of its callers pass
      // RAW values and rely on that — so routing a cast value through
      // `buildBindAttribute` would cast twice. `withCastValue` is the preserving
      // constructor that matches Rails' semantics.
      const type = this.model.typeForAttribute(attr.name);
      return [attr, QueryAttribute.withCastValue(attr.name, type.cast(value), type)];
    });
  }

  private _incrementAttribute(attribute: any, value = 1): any {
    const bind = this.predicateBuilder.buildBindAttribute(attribute.name, Math.abs(value));
    // Rails passes the bare Integer `0`; the to_sql visitor dispatches on the
    // Ruby class, and trails' visitor does the same for a JS number.
    const expr = this.table.coalesce(
      new Nodes.UnqualifiedColumn(attribute),
      0 as unknown as Nodes.Node,
    ) as Nodes.Node;
    // Arel's `-`/`+` wrap the operation in a Grouping; Rails unwraps it again
    // with `.expr`, so build the bare operation node here.
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

// ---------------------------------------------------------------------------
// Mixin: mirrors Rails' include QueryMethods, FinderMethods, Calculations, SpawnMethods
// ---------------------------------------------------------------------------

export interface Relation<T extends Base> {
  // Declared as a METHOD signature (the mixin's object-literal type makes it a
  // function-valued PROPERTY) so `AssociationRelation` can override it with a
  // plain method and reach `super.isNullRelation()`.
  isNullRelation(): boolean;
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  /**
   * @noRailsEquivalent PERMANENT (`vendor/rails/activerecord/lib/active_record/relation.rb:1179` —
   *   `def load` materializes synchronously; Ruby has no thenable to mirror).
   * JS Promise protocol — Ruby has no thenable
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
  /**
   * @noRailsEquivalent PERMANENT (`vendor/rails/activerecord/lib/active_record/relation.rb:1179` —
   *   `def load` materializes synchronously; Ruby has no thenable to mirror).
   * JS Promise protocol — Ruby has no thenable
   */
  finally(onfinally?: (() => void) | null): Promise<T[]>;
}

/**
 * The `*_values` / `*_value` / `*_clause` accessors generated by
 * `defineValueMethods` (query_methods.rb:162-183). Each reader is
 * `@values.fetch(:<name>, <default>)` and each writer asserts modifiability
 * before storing into `@values`; `extensions` is the reader-only
 * `alias extensions extending_values` (query_methods.rb:183).
 */
export interface Relation<T extends Base> {
  /** Mirrors: ActiveRecord::Relation#includes_values */
  includesValues: AssociationSpec[];
  /** Mirrors: ActiveRecord::Relation#eager_load_values */
  eagerLoadValues: AssociationSpec[];
  /** Mirrors: ActiveRecord::Relation#preload_values */
  preloadValues: AssociationSpec[];
  /** Mirrors: ActiveRecord::Relation#select_values */
  selectValues: (string | Nodes.Node)[];
  /** Mirrors: ActiveRecord::Relation#group_values */
  groupValues: string[];
  /** Mirrors: ActiveRecord::Relation#order_values */
  orderValues: Array<string | Nodes.Node>;
  /** Mirrors: ActiveRecord::Relation#joins_values */
  joinsValues: (AssociationSpec | string | Nodes.Join)[];
  /** Mirrors: ActiveRecord::Relation#left_outer_joins_values */
  leftOuterJoinsValues: AssociationSpec[];
  /** Mirrors: ActiveRecord::Relation#references_values */
  referencesValues: Array<string | Nodes.SqlLiteral>;
  /** Mirrors: ActiveRecord::Relation#extending_values */
  extendingValues: Array<Record<string, (...args: any[]) => any>>;
  /** Mirrors: ActiveRecord::Relation#extensions */
  readonly extensions: Array<Record<string, (...args: any[]) => any>>;
  /** Mirrors: ActiveRecord::Relation#unscope_values */
  unscopeValues: Array<string | { where: string | string[] }>;
  /** Mirrors: ActiveRecord::Relation#optimizer_hints_values */
  optimizerHintsValues: string[];
  /** Mirrors: ActiveRecord::Relation#annotate_values */
  annotateValues: string[];
  /** Mirrors: ActiveRecord::Relation#with_values */
  withValues: Array<Record<string, unknown>>;
  /** Mirrors: ActiveRecord::Relation#limit_value */
  limitValue: number | string | null;
  /** Mirrors: ActiveRecord::Relation#offset_value */
  offsetValue: number | string | null;
  /** Mirrors: ActiveRecord::Relation#lock_value */
  lockValue: string | boolean | null;
  /** Mirrors: ActiveRecord::Relation#readonly_value */
  readonlyValue: boolean | null;
  /** Mirrors: ActiveRecord::Relation#reordering_value */
  reorderingValue: boolean | null;
  /** Mirrors: ActiveRecord::Relation#strict_loading_value */
  strictLoadingValue: boolean | null;
  /** Mirrors: ActiveRecord::Relation#reverse_order_value */
  reverseOrderValue: boolean | null;
  /** Mirrors: ActiveRecord::Relation#distinct_value */
  distinctValue: boolean | null;
  /** Mirrors: ActiveRecord::Relation#create_with_value */
  createWithValue: Record<string, unknown>;
  /** Mirrors: ActiveRecord::Relation#skip_query_cache_value */
  skipQueryCacheValue: boolean | null;
  /** Mirrors: ActiveRecord::Relation#where_clause */
  whereClause: WhereClause;
  /** Mirrors: ActiveRecord::Relation#having_clause */
  havingClause: WhereClause;
  /** Mirrors: ActiveRecord::Relation#from_clause */
  fromClause: FromClause;
}

// QueryMethodBangs doesn't involve T — Included<> works fine.
// Calculations uses the explicit CalculationMethods interface (method-syntax)
// so subclasses (CollectionProxy, AssociationRelation, DJAR) can override
// count/sum/etc. with narrower signatures.
// FinderMethods and SpawnMethods return T-typed values — explicit signatures needed.

export interface Relation<T extends Base>
  extends Included<typeof QueryMethodBangs>, Included<typeof Explain>, CalculationMethods {
  find(ids: unknown[]): Promise<T[]>;
  find(id: unknown): Promise<T>;
  find(...ids: unknown[]): Promise<T | T[]>;
  findBy(conditions: Record<string, unknown>): Promise<T | null>;
  findByBang(conditions: Record<string, unknown>): Promise<T>;
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
  findOrCreateByBang(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T>;
  createOrFindByBang(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T>;
  raiseRecordNotFoundExceptionBang(
    ids?: unknown,
    resultSize?: number,
    expectedSize?: number,
    key?: string,
    notFoundIds?: unknown[],
  ): never;
  // QueryMethods' flag / annotation / scope-shaping methods (query-methods.ts),
  // whose mixin signatures return `any` — declared here with the relation's own
  // element type.
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
  // QueryMethods' joins / eager-load / CTE members and the shared Arel helpers
  // (query-methods.ts), whose mixin signatures return `any` — declared here with
  // the relation's own element type, in query_methods.rb source order.
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
  // QueryMethods' ordering and projection families (query-methods.ts), whose
  // mixin signatures return `any` — declared here with the relation's own
  // element type, in query_methods.rb source order.
  select(fn: (record: T) => boolean): Promise<T[]>;
  select(...fields: (string | Nodes.Node | Record<string, unknown>)[]): Relation<T>;
  reselect(...args: (string | Nodes.Node | Record<string, unknown>)[]): Relation<T>;
  group(...args: (string | Nodes.Node)[]): Relation<T>;
  regroup(...args: string[]): Relation<T>;
  order(...args: OrderArg[]): Relation<T>;
  inOrderOf(column: string | Nodes.Node, values: unknown[], filter?: boolean): Relation<T>;
  reorder(...args: OrderArg[]): Relation<T>;
  where(): WhereChain<Relation<T>>;
  where(conditions: undefined): WhereChain<Relation<T>>;
  where(conditions: Record<string, unknown> | null): Relation<T>;
  where(sql: string, ...binds: unknown[]): Relation<T>;
  where(node: Nodes.Node): Relation<T>;
  /**
   * Sanitized-conditions array form: `where(["name = ?", x])` /
   * `where(["name = :name", { name: x }])` / `where(["name = '%s'", x])`.
   * A single array argument routes through `buildWhereClause`, matching Rails'
   * `sanitize_sql(array)`; the two-argument composite form below is distinct.
   */
  where(conditions: unknown[]): Relation<T>;
  /**
   * Composite-key form: `where(['c1', 'c2'], [[v11, v12], [v21, v22]])`
   * compiles to `(c1 = v11 AND c2 = v12) OR (c1 = v21 AND c2 = v22)`.
   * The Rails analog is `where({['c1', 'c2'] => [[v11, v12], ...]})` —
   * JS object keys can't be arrays, so columns become a leading
   * positional argument. Tuples containing null/undefined are
   * filtered (SQL tuple-equality treats any null component as a
   * non-match); after filtering, an empty list short-circuits via
   * `none()`.
   */
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

// DelegationMethods carries getters (connection/primaryKey/tableName) and
// generic/T-returning methods, so its surface is declared explicitly here rather
// than via Included<> (which drops accessors and erases the generics).
// NB: `name` (`delegate :name, to: :model`) is a getter typed to return
// `RelationName` (a supertype of `string`), NOT plain `string` — a plain-string
// `name` accessor would make `Relation` structurally satisfy the ubiquitous
// `{ name: string }` shape and flip `Array#reduce` accumulator inference. See
// the `get name()` doc comment for the full rationale. `slice` (`to: :records`)
// is a class-body method (its signature must stay override-compatible with
// `CollectionProxy#slice`).
export interface Relation<T extends Base> {
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

// relation.rb:68 — `include FinderMethods, Calculations, SpawnMethods,
// QueryMethods, Batches, Explain, Delegation`. Ruby's multi-argument `include`
// is not left-to-right: it inserts the modules so the FIRST argument ends up
// highest in the ancestry (`K.ancestors == [K, A, B, C]` for `include A, B, C`),
// which makes it equivalent to `include C; include B; include A`. `include()`
// here is last-call-wins, so the calls run in REVERSE of relation.rb's argument
// order. Do not append a new `include()` below this block: appending would give
// the new module the highest precedence of all. Pinned by
// relation.trails.test.ts ("relation.rb:68 mixin ancestry").
include(Relation, DelegationMethods);
include(Relation, Explain);
include(Relation, Batches);
include(Relation, QueryMethodBangs);
include(Relation, SpawnMethods);
include(Relation, Calculations);
include(Relation, FinderMethods);

// Mirrors `Relation::VALUE_METHODS.each { ... }` in query_methods.rb:162-183,
// which generates every `*_values` / `*_value` / `*_clause` accessor over @values.
defineValueMethods(Relation);

// Thenable: make Relation directly awaitable (delegates to toArray).
applyThenable(Relation.prototype);

// Ruby reaches ExplainProxy's rendered plan through `inspect` in the console;
// the same terminal is spelled `await rel.explain()` here.
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
