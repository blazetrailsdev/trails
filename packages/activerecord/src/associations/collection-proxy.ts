import type { Base } from "../base.js";
import { Relation } from "../relation.js";
import { QueryMethodBangs } from "../relation/query-methods.js";
import { SpawnMethods } from "../relation/spawn-methods.js";
import {
  CollectionAssociation,
  callback as assocCallback,
  callbacksFor as assocCallbacksFor,
  type CallbackHost,
} from "./collection-association.js";
import type { PrettyPrinter } from "../pretty-print.js";
import type { AssociationRelation as AssociationRelationType } from "../association-relation.js";
import {
  associationRelationClassFor,
  collectionProxyClassFor,
  wrapWithScopeProxy,
} from "../relation/delegation.js";
import { _registerRelationFamily } from "../relation/uncacheable-methods-slot.js";

// Late-bound AssociationRelation constructor to break circular imports
// (association-relation.ts extends Relation, which would otherwise
// transitively load before Base finishes initializing the Relation ctor
// slot). Set by association-relation.ts when it loads.
let _AssociationRelationCtor: (new (modelClass: any, assoc: any) => any) | null = null;
/** @internal */
export function _setAssociationRelationCtor(
  ctor: new (modelClass: any, assoc: any) => AssociationRelationType<any>,
): void {
  _AssociationRelationCtor = ctor;
}
import { applyThenable, stripThenable } from "../relation/thenable.js";
import {
  findNthFromLast as baseFindNthFromLast,
  findNthWithLimit as baseFindNthWithLimit,
  performLast as basePerformLast,
} from "../relation/finder-methods.js";
import type { Nodes } from "@blazetrails/arel";
import { singularize, camelize, constantize } from "@blazetrails/activesupport";
import { ConfigurationError, AssociationTypeMismatch, RecordNotFound } from "../errors.js";
import { strictLoadingViolationBang } from "../core.js";
import { RecordInvalid } from "../validations.js";
import { AssociationNotFoundError } from "./errors.js";
import type { AssociationDefinition } from "../associations.js";
import {
  autoloadModel,
  resolveAssocClass,
  association as associationProxy,
} from "../associations.js";
import { _setCollectionProxyCtor } from "./collection-proxy-slot.js";

// Declaration merging with `class CollectionProxy extends Relation`
// propagates Relation's method types into this interface. `load()`
// diverges (CP returns T[], Relation returns LoadedRelation<this>)
// and the conflict surfaces here. Permanent divergence: CP is thenable
// via load(), so T[] is the correct contract for await semantics.
// @ts-expect-error declaration-merge load() divergence — permanent, see class override
export interface CollectionProxy<T extends Base = Base> {
  // Thenable — makes CollectionProxy awaitable. Delegates to `load()`,
  // which both returns the loaded records AND hydrates `_target`, so
  // subsequent sync ops (`proxy.target.length`, `proxy[0]`, iteration)
  // work after a single `await proxy`. Wired at the bottom of the file
  // via `applyThenable(CollectionProxy.prototype, "load")`.
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
 * All Relation methods not already defined on CollectionProxy. These are
 * delegated to the underlying Relation via the JS Proxy at runtime.
 * Using Omit instead of Pick means new Relation methods are automatically
 * available on AssociationProxy without manual maintenance.
 */
type DelegatedRelationMethods<T extends Base> = {
  [K in keyof Omit<Relation<T>, keyof CollectionProxy<T>> as K extends `_${string}`
    ? never
    : K]: Omit<Relation<T>, keyof CollectionProxy<T>>[K];
};

/**
 * A CollectionProxy wrapped with a JS Proxy that delegates methods
 * and named scopes to the underlying Relation. Returned by association().
 * The generic parameters allow typing the associated model and any
 * extend-option methods; default to open index signatures so named scopes
 * and extensions work without casts.
 */
export type AssociationProxy<
  T extends Base = Base,
  TExtensions extends Record<string, (...args: any[]) => any> = Record<
    string,
    (...args: any[]) => any
  >,
> = CollectionProxy<T> &
  DelegatedRelationMethods<T> &
  TExtensions & {
    // Numeric indexing — `proxy[0]` reads the loaded target via the
    // `wrapCollectionProxy` `get` trap. Lives on AssociationProxy (not
    // raw CollectionProxy) because the runtime support comes from the
    // JS Proxy wrapper. A bare `new CollectionProxy(...)` does NOT
    // support indexing — you'd get `undefined` at runtime.
    // Out-of-range / unloaded indices return `undefined`, matching
    // `Array<T>[i]` semantics under TS's standard lib.
    readonly [index: number]: T | undefined;
  };

/**
 * Ruby's `Array#==` over AR records: same length, pairwise `==` (class + id),
 * order-sensitive. Used by `replace` for `other_array != original_target`.
 */
function sameRecordList(a: Base[], b: Base[]): boolean {
  return a.length === b.length && a.every((record, i) => record.equals(b[i]));
}

/** @internal */
/**
 * The `HasManyThroughAssociation` surface the proxy's through-writes delegate
 * to (Rails' `proxy_association`).
 */
interface ThroughAssociationHandle {
  _throughScope?: unknown;
  concat(...records: Base[]): Promise<Base[] | undefined>;
  insertRecord(
    record: Base,
    validate?: boolean,
    raise?: boolean,
    block?: (record: Base) => void,
  ): Promise<boolean>;
  transaction<R>(block: () => Promise<R>): Promise<R | undefined>;
}

interface StaleWrapper {
  isStaleTarget?: () => boolean;
  resetScope?: () => void;
  loadedBang?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CollectionProxy<T extends Base = Base> extends Relation<T> {
  /** @internal */
  static override _railsClassName = "ActiveRecord::Associations::CollectionProxy";

  private _record: Base;
  /**
   * Ruby's `@association` (collection_proxy.rb:31-35): the association object
   * the proxy is handed at construction and reads its `@target` / `@loaded` /
   * `@replaced_or_added_targets` off (`:33`, `:53`). Resolved once in the
   * constructor, so a declared collection has exactly one `@target` in the
   * system. Spelled `_targetAssociation` because `_association` on this class
   * is the `this`-alias the `AssociationRelation` bodies invoked with the proxy
   * as receiver read.
   *
   * trails' `association(record, name)` factory also builds a proxy for a
   * declared SINGULAR name, which Rails never does: `@association` there is a
   * `SingularAssociation` whose `@target` is one record, and folding a
   * collection's array into it would box that record. Such a proxy gets a
   * collection seat of its own instead.
   */
  private _targetAssociation!: CollectionAssociation;
  private _assocName: string;
  private _assocDef: AssociationDefinition;
  // Rails' `CollectionProxy` holds no target of its own — `target`, `loaded?`
  // and `@replaced_or_added_targets` all read `@association`
  // (collection_proxy.rb:33, 53). trails keeps that direction: these accessors
  // are the association's `@target` / `@loaded` ivars, so association and proxy
  // are one seat rather than two stores to keep coherent.
  private get _target(): T[] {
    return this._targetAssociation._targetStore as T[];
  }

  private set _target(records: T[]) {
    this._targetAssociation._targetStore = records;
  }

  private get _targetLoaded(): boolean {
    return this._targetAssociation._loadedStore;
  }

  private set _targetLoaded(value: boolean) {
    this._targetAssociation._loadedStore = value;
  }
  // Rails' `CollectionProxy#@scope` memo (collection_proxy.rb:949-951), cleared
  // by `reset_scope` (collection_proxy.rb:1112-1116).
  private _scope: unknown;
  // Mirrors Rails' `CollectionAssociation#@replaced_or_added_targets` (a
  // `Set.new.compare_by_identity`): records that have been added to or
  // replaced on the in-memory target. `replace_on_target` consults it to
  // dedup by identity rather than appending the same record twice.
  private get _replacedOrAddedTargets(): Set<T> {
    return this._targetAssociation._replacedOrAddedTargets as Set<T>;
  }

  private set _replacedOrAddedTargets(value: Set<T>) {
    this._targetAssociation._replacedOrAddedTargets = value as Set<Base>;
  }
  // The JS Proxy wrapper returned by association() — methods that return
  // `self` (push / concat / append) hand this back so callers get the same
  // object they hold, since `this` is the raw target, not the wrapper.
  private _proxySelf?: this;

  /**
   * Mirrors: ActiveRecord::Associations::CollectionProxy#loaded?
   * (`@association.loaded?`, collection_proxy.rb:53) — the proxy's loadedness is
   * the association target's, NOT `Relation`'s `_loaded`. Overriding the
   * inherited getter is what lets the base `FinderMethods` bodies (`find_take`,
   * `find_nth_with_limit`, `find_last`) take their `loaded?` arm on a proxy and
   * read the target through `records()` (`load_target`, :1024), exactly as they
   * do in Rails.
   */
  override get isLoaded(): boolean {
    return this._targetLoaded;
  }

  get loaded(): boolean {
    return this._targetLoaded;
  }

  get target(): T[] {
    return this._target;
  }

  /**
   * @internal Canonical read accessor for RFC 0006 (collection-store
   * unification). The loaded target array IS the single source of truth for
   * has_many membership; `Base#_associationCache` surfaces this proxy so its
   * `.target` is read through the same store. Returns the
   * in-memory target without triggering a DB load — JS has no blocking IO, so
   * a fresh load means awaiting the proxy / `loadTarget()` first.
   */
  readTargets(): T[] {
    return this._target;
  }

  /**
   * @internal Identify the loaded targets by primary key. Composite primary
   * keys (`string[]`) are joined into a single token so the map key is stable
   * for both `string` and `string[]` primary-key values; records whose key is
   * not yet assigned (new records) are skipped. Used by the migration stories
   * to dedup proxy writes against the canonical store.
   */
  targetsByPrimaryKey(): Map<string, T> {
    const byKey = new Map<string, T>();
    for (const record of this._target) {
      const token = primaryKeyToken(record);
      if (token != null) byKey.set(token, record);
    }
    return byKey;
  }

  /** @internal Owner record — used by AssociationRelation. */
  get owner(): Base {
    return this._record;
  }

  /**
   * @internal Reassign the owner record. Mirrors Rails' settable
   * `Association#owner`, which `reload` mutates when it re-points each adopted
   * `@association_cache` entry back to the reloaded record
   * (`persistence.rb:752`). Rails' proxy owner lives inside the `Association`
   * object; ours is the `CollectionProxy`'s backing `_record`.
   */
  set owner(record: Base) {
    this._record = record;
  }

  /**
   * Mirrors Rails' `Association#reflection` (association.rb:16), which is the
   * rich `AssociationReflection` the constructor was handed off the owner's
   * class (`associations.rb:290-296`). The proxy is built from the thin macro
   * definition, so the reader resolves the reflection here — once — instead of
   * every rich-predicate call site re-resolving `_reflectOnAssociation`. An
   * anonymous inline association has no registered reflection; it falls back to
   * the macro definition.
   * @internal
   */
  get reflection(): AssociationDefinition {
    const ctor = this._record.constructor as typeof Base;
    return (
      (ctor._reflectOnAssociation?.(this._assocName) as AssociationDefinition | null) ??
      this._assocDef
    );
  }

  /**
   * The owner/reflection pair `CollectionAssociation#callback` dispatches on.
   * The proxy holds the same two pieces under different field names.
   * @internal
   */
  private get _callbackHost(): CallbackHost {
    return {
      owner: this._record,
      reflection: this._assocDef,
      callback: assocCallback,
      callbacksFor: assocCallbacksFor,
    };
  }

  /** @internal Association name — used by AssociationRelation. */
  get associationName(): string {
    return this._assocName;
  }

  /**
   * Self-referential alias so AssociationRelation#toArray can be called
   * with `this` = CollectionProxy via `.call(this)`. AR#toArray reads
   * `this._association.owner` and `this._association.reflection`; both are
   * already exposed as getters on CollectionProxy, so returning `this`
   * satisfies the contract without extra indirection.
   */
  private get _association(): this {
    return this;
  }

  // ──────────────────────────────────────────────────────────────────
  // Array-likeness — sync ops over the loaded target.
  //
  // Rails' CollectionProxy IS a Relation that's iterable / countable
  // / array-shaped against the loaded records. JS has no blocking IO,
  // so these methods do NOT trigger a fresh DB load — they read
  // whatever's in `_target` (populated by `await proxy`,
  // `await proxy.load()`, `Post.includes(...)`, or push / build /
  // create through the proxy). For a fresh load, await the proxy
  // first.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Return the number of records in the collection.
   *
   * Mirrors ActiveRecord::Associations::CollectionProxy#length
   * (collection_proxy.rb): `records.length`. `records` resolves through
   * `load_target`, which returns the cached `@target` when the association is
   * already loaded — so a loaded proxy counts in memory with NO query and only
   * an unloaded one re-queries. `Relation`'s `to: :records` delegate
   * (delegation.rb:101) always re-queries via `toArray`/`_execLoad`, which is
   * why this overrides it: the proxy keeps loaded state in
   * `_target`/`_targetLoaded`, not Relation's `_records`/`_loaded`, so
   * `loadTarget()` (which short-circuits on `_targetLoaded`) is the faithful
   * path.
   */
  async length(): Promise<number> {
    return (await this.loadTarget()).length;
  }

  /**
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activerecord/lib/active_record/relation/delegation.rb:101` — `each` is
   *   delegated to the loaded records).
   * JS iteration protocol — Ruby uses Enumerable#each
   */
  [Symbol.iterator](): IterableIterator<T> {
    return this._target[Symbol.iterator]();
  }

  at(index: number): T | undefined {
    return this._target.at(index);
  }

  map<U>(fn: (record: T, index: number, all: T[]) => U, thisArg?: unknown): U[] {
    return this._target.map(fn, thisArg);
  }

  // filter has the standard type-predicate overload from Array<T>.
  filter<S extends T>(
    predicate: (record: T, index: number, all: T[]) => record is S,
    thisArg?: unknown,
  ): S[];
  filter(predicate: (record: T, index: number, all: T[]) => unknown, thisArg?: unknown): T[];
  filter(predicate: (record: T, index: number, all: T[]) => unknown, thisArg?: unknown): T[] {
    return this._target.filter(predicate, thisArg);
  }

  forEach(fn: (record: T, index: number, all: T[]) => void, thisArg?: unknown): void {
    this._target.forEach(fn, thisArg);
  }

  some(fn: (record: T, index: number, all: T[]) => unknown, thisArg?: unknown): boolean {
    return this._target.some(fn, thisArg);
  }

  // Enumerable#detect / #sort_by are inherited, not overridden: `toArray()`
  // below is this proxy's `records` → `load_target` (collection_proxy.rb:1024).

  // every has the standard type-predicate overload from Array<T>.
  every<S extends T>(
    predicate: (record: T, index: number, all: T[]) => record is S,
    thisArg?: unknown,
  ): boolean;
  every(predicate: (record: T, index: number, all: T[]) => unknown, thisArg?: unknown): boolean;
  every(predicate: (record: T, index: number, all: T[]) => unknown, thisArg?: unknown): boolean {
    return this._target.every(predicate, thisArg);
  }

  // Mirrors Rails' Relation#any? / CollectionProxy#any? semantics:
  // - No predicate: returns !empty? which uses exists? when not loaded
  //   (SELECT 1 LIMIT 1) rather than materializing all rows.
  // - With predicate: loads all records (via Enumerable#any? / to_a.any?).

  async any(
    fn?: (record: T, index: number, all: T[]) => unknown,
    thisArg?: unknown,
  ): Promise<boolean> {
    if (!fn) return !(await this.isEmpty());
    const records = await this.toArray();
    return records.some(fn as (v: T, i: number, a: T[]) => unknown, thisArg);
  }

  // The Array-style `includes(record)` and `find(predicate)` overloads
  // are intentionally NOT added:
  //   - Array-style `includes(record)` would shadow
  //     `Relation#includes(...associations)` (eager loading).
  //   - Array-style `find(predicate)` would shadow this class's own
  //     `async find(id)` and `Relation#find(id)` — the Rails-style
  //     PK-lookup forms.
  // Reach for Array semantics via `Array.from(proxy).includes(...)` /
  // `Array.from(proxy).find(...)` (or `proxy.target.includes(...)` /
  // `proxy.target.find(...)`). Matches Rails' priority — CollectionProxy
  // preserves the Relation + PK-find surface and lets Array semantics
  // route through `to_a`.

  slice(start?: number, end?: number): T[] {
    return this._target.slice(start, end);
  }

  reduce(fn: (acc: T, record: T, index: number, all: T[]) => T): T;
  reduce<U>(fn: (acc: U, record: T, index: number, all: T[]) => U, initial: U): U;
  reduce(...args: [unknown, ...unknown[]]): unknown {
    // Forward verbatim with the array as receiver — reduce needs `this`
    // to be the array. (with-vs-without initial value picks different
    // semantics, hence the variadic forwarding.)
    return (this._target.reduce as (...a: unknown[]) => unknown).apply(this._target, args);
  }

  indexOf(record: T, fromIndex?: number): number {
    return this._target.indexOf(record, fromIndex);
  }

  flatMap<U>(fn: (record: T, index: number, all: T[]) => U | readonly U[], thisArg?: unknown): U[] {
    return this._target.flatMap(fn, thisArg);
  }

  keys(): IterableIterator<number> {
    return this._target.keys();
  }

  // `values()` is intentionally NOT added — it would shadow
  // `Relation#values(): Record<string, unknown>` (query-state
  // introspection used by the Relation merger). Use the proxy's
  // built-in iteration (`for...of`, `[...proxy]`, `Array.from(proxy)`).

  entries(): IterableIterator<[number, T]> {
    return this._target.entries();
  }

  /** @internal Initialize from preloaded association data. */
  _hydrateFromPreload(records: T[]): void {
    // Preserve any unsaved in-memory records (from build/push before preload ran)
    const unsaved = this._target.filter((r) => r.isNewRecord());
    this._target = unsaved.length > 0 ? [...records, ...unsaved] : records;
    this._targetLoaded = true;
  }

  /**
   * @internal Resolve the target model an association's proxy scopes to —
   * preferring the rich reflection's namespace-aware klass, else `className`.
   * Shared by the constructor and {@link _create} so the per-model carrier is
   * chosen from the exact same model the constructed instance reports as
   * `.model`.
   */
  static _targetModelFor(
    record: Base,
    assocName: string,
    assocDef: AssociationDefinition,
  ): typeof Base {
    const className = assocDef.options.className ?? camelize(singularize(assocName));
    const ownerCtor = record.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { klass?: typeof Base } | null;
    };
    const richKlass = ownerCtor._reflectOnAssociation?.(assocName)?.klass;
    if (richKlass) return richKlass;
    autoloadModel(className);
    return constantize(className) as typeof Base;
  }

  /**
   * Mirrors: ActiveRecord::Delegation::ClassMethods#create
   * (relation/delegation.rb:138-140) — `relation_class_for(model).new(model, ...)`
   * — as reached by `CollectionProxy.create(klass, self)`
   * (collection_association.rb:41).
   *
   * RFC 0022 makes the wrapped proxy the canonical has_many store, keyed on the
   * owner by association name, so the create-or-fetch of that store is the
   * `association()` factory: it routes through the same `collectionProxyClassFor`
   * carrier `_create` uses and then hydrates and wraps the instance — resolving
   * `model` from the association itself, so the argument is accepted and unused.
   */
  static create<T extends Base = Base>(
    _model: typeof Base,
    association: { owner: Base; reflection: { name: string } },
  ): AssociationProxy<T> {
    return associationProxy<T>(association.owner, association.reflection.name);
  }

  /**
   * @internal Construct a CollectionProxy from the target model's per-model
   * subclass carrier (`collectionProxyClassFor`), so generated relation methods
   * resolve as real methods on it (Rails' `delegate.include
   * generated_relation_methods`). The carrier subclass inherits this
   * constructor unchanged.
   */
  static _create<T extends Base = Base>(
    record: Base,
    assocName: string,
    assocDef: AssociationDefinition,
  ): CollectionProxy<T> {
    const targetModel = this._targetModelFor(record, assocName, assocDef);
    const Ctor = collectionProxyClassFor(targetModel);
    return new Ctor(record, assocName, assocDef) as CollectionProxy<T>;
  }

  constructor(record: Base, assocName: string, assocDef: AssociationDefinition) {
    // Prefer the rich reflection's klass so namespace-relative resolution applies.
    const targetModel = CollectionProxy._targetModelFor(record, assocName, assocDef);
    super(targetModel, targetModel.arelTable);
    this._record = record;
    this._assocName = assocName;
    this._assocDef = assocDef;
    const instance = record.association(assocName) as unknown as CollectionAssociation & {
      isCollection?(): boolean;
    };
    this._targetAssociation = instance.isCollection?.()
      ? instance
      : new CollectionAssociation(record, assocDef);

    // `extend(*extensions)` (collection_proxy.rb:35-37) mixes into this object
    // only; chained relations get the same modules independently through
    // `scope.extending! reflection.extensions` (association_scope.rb:28).
    const extensions = this._targetAssociation.extensions;
    if (extensions.length > 0) {
      // `self` in an extension body answers a named scope through
      // `method_missing` on the extended proxy; the scope proxy is that lookup.
      const wrapped = wrapWithScopeProxy(this as unknown as Relation<T>);
      for (const mod of extensions) {
        if (typeof mod === "function") {
          (mod as (rel: unknown) => void)(wrapped);
        } else {
          for (const [name, fn] of Object.entries(
            mod as Record<string, (...args: unknown[]) => unknown>,
          )) {
            (this as unknown as Record<string, unknown>)[name] = fn.bind(wrapped);
          }
        }
      }
    }
  }

  /**
   * Shared execution core for `toArray()` and `load()`. Routes both the
   * unmutated and mutated (whereBang / orderBang / ...) proxy through a
   * single `findTarget` call. A mutating bang lands on the memoized `scope`
   * (collection_proxy.rb:1128-1137), so `findTarget` picks the mutation up
   * from the scope rebuild — mirrors Rails'
   * `CollectionProxy → AssociationRelation#exec_queries → loadTarget` path
   * which always routes through the OO association regardless of scope state.
   *
   * `_cascadeStrictLoading` is called exactly once here; the Relation's own
   * `strictLoadingValue` is applied afterward so it wins over cascade (Rails
   * applies `strict_loading_value` after `set_strict_loading` per record).
   */
  private async _execLoad(): Promise<T[]> {
    const results = (await this._findTargetViaAssociation()) as T[];
    this._cascadeStrictLoading(results);
    // Relation's strict_loading wins over cascade — applied last to match
    // Rails: AssociationRelation#exec_queries runs set_strict_loading per
    // record, then Relation#exec_queries applies strict_loading_value
    // (including false) to all records afterward (unless nil).
    const sv = (this as any).strictLoadingValue as boolean | null;
    if (sv != null) {
      for (const r of results) (r as any)._strictLoading = sv;
    }
    return results;
  }

  /**
   * Runs `find_target` (`association.rb:248`) on a freshly built holder for
   * this proxy's definition rather than on `record.association(name)`: this
   * proxy IS the owner's holder for that name, so loading through the cached
   * one would suppress the loader's writeback into it and mark it loaded
   * behind the proxy's back.
   */
  private async _findTargetViaAssociation(queryExecutor?: () => Promise<Base[]>): Promise<Base[]> {
    const { _buildAssociationInstance } = await import("./instance-methods.js");
    const assoc = _buildAssociationInstance.call(this._record, this._assocDef) as unknown as {
      _queryExecutor?: () => Promise<Base[]>;
      findTarget(): Promise<Base[]>;
    };
    assoc._queryExecutor = queryExecutor;
    return assoc.findTarget();
  }

  /**
   * Load and return all associated records — Rails' `to_a` is `records` is
   * `load_target` (collection_proxy.rb:1024-1026, :44-46), so this is `load()`
   * plus one trails-only arm.
   *
   * `null_scope?` on an unloaded target is exactly `!find_target?`, the arm
   * where `load_target` (collection_association.rb:272-279) leaves `@target`
   * unassigned. trails re-traverses the in-memory chain on each read there
   * instead, so the arm must merge WITHOUT caching, and it cannot move into
   * `load()`: `CollectionAssociation#concat` calls `loadTarget()` on a
   * new-record owner before appending (collection_association.rb:439-446) and
   * needs that call to cache. Retiring it belongs with the `_queryExecutor`
   * residue that RFC 0075 owns.
   */
  async toArray(): Promise<T[]> {
    if (!this._targetLoaded && this.isNullScope()) {
      const results = await this._execLoad();
      return this._collectionAssociation().mergeTargetLists(results, this._target) as T[];
    }
    return this.load();
  }

  // @ts-expect-error CP's load returns the hydrated T[] (loaded records);
  //   Relation's returns LoadedRelation<this>. CP is thenable via load()
  //   so T[] is the correct contract here. Permanent divergence.
  async load(): Promise<T[]> {
    if (this._targetLoaded) {
      // Mirror Rails `CollectionAssociation#reader` (collection_association.rb:34):
      // `if stale_target? reload`. When the owner's foreign key has changed since
      // the target was cached (`author = other`), the cache is stale and must be
      // re-queried; otherwise return the cache.
      //
      // Rails runs this staleness check in `reader` (the `owner.pets` accessor),
      // NOT in `load_target` — but in trails there is no separate `reader` entry
      // point. The accessor (`association()` in associations.ts) returns the
      // cached CollectionProxy directly, without Rails' `if stale_target? reload`.
      // So `load()` — the single hydration chokepoint every read funnels through —
      // is where the check must live to reproduce Rails' *observable* behavior:
      // `owner.pets.to_a` after a foreign-key change reloads, because in Rails the
      // `pets` accessor itself reloads before `to_a` ever runs. This does not make
      // trails' `to_a` reload where Rails' wouldn't; it lands the same reload Rails
      // performs one call-frame earlier, at the accessor trails collapses into the
      // proxy.
      const wrapper = this._staleWrapper();
      if (!(wrapper?.isStaleTarget?.() ?? false)) return this._target;
      // Stale (owner FK changed since load): fall through to re-query. Clear
      // the CP's cached target so the stale records don't survive
      // `merge_target_lists`; drop the wrapper's memoized association scope
      // too, as Rails' `reload` does (`reset; reset_scope; load_target`,
      // association.rb:72), since the shared `loaded` flag this clears is what
      // `Association#association_scope` used to read the staleness from.
      this._target = [];
      this._targetLoaded = false;
      wrapper?.resetScope?.();
    }
    const results = await this._execLoad();
    // `@target = merge_target_lists(find_target, target)`
    // (collection_association.rb:274).
    this._target = this._collectionAssociation().mergeTargetLists(results, this._target) as T[];
    this._targetLoaded = true;
    // Snapshot the owner's `@stale_state` NOW (while owner FKs still reflect
    // the load time). Letting it happen later — after a FK change — would
    // capture the wrong state and mask the staleness.
    this._staleWrapper()?.loadedBang?.();
    return this._target;
  }

  /**
   * The owner's Association wrapper for this proxy, used to consult
   * `isStaleTarget()` (Rails `Association#stale_target?`) so a cached target is
   * re-queried after the owner's foreign key changes, and to drop its memoized
   * association scope when that happens.
   */
  private _staleWrapper(): StaleWrapper | undefined {
    const rec = this._record as unknown as {
      association?: (n: string) => StaleWrapper;
    };
    return typeof rec.association === "function" ? rec.association(this._assocName) : undefined;
  }

  private _checkStrictLoading(): void {
    // Rails reaches `violates_strict_loading?` through the association the
    // proxy delegates to (`find_target`, association.rb:248-250); trails' proxy
    // loads on its own path, so it consults the same association instance.
    const association = this._staleWrapper() as unknown as
      | { isViolatesStrictLoading(): boolean }
      | undefined;
    if (association?.isViolatesStrictLoading()) {
      const ctor = this._record.constructor as typeof Base;
      const reflection = ctor._reflectOnAssociation?.(this._assocName);
      if (!reflection) throw new AssociationNotFoundError(this._record, this._assocName);
      strictLoadingViolationBang({ owner: ctor, reflection });
    }
  }

  /**
   * Propagate the owner's strict-loading mode onto each loaded child —
   * mirrors `Association#set_strict_loading`, which Rails applies in
   * `find_target` / `exec_queries`. The functional `findTarget` path
   * (the common `await blog.posts` reader) bypasses the OO
   * `CollectionAssociation.loadTarget` where this cascade lives, so we
   * route through the OO association here to reuse the exact same logic.
   */
  private _cascadeStrictLoading(records: T[]): void {
    const assoc = this._record.association(this._assocName) as unknown as {
      setStrictLoading?: (record: Base) => Base;
    };
    if (typeof assoc.setStrictLoading !== "function") return;
    for (const r of records) assoc.setStrictLoading(r);
  }

  private async _withoutStrictLoading<T>(fn: () => Promise<T>): Promise<T> {
    this._record._strictLoadingBypassCount++;
    try {
      return await fn();
    } finally {
      this._record._strictLoadingBypassCount--;
    }
  }

  /**
   * Mirrors `CollectionProxy#build` (collection_proxy.rb:315-317): a plain
   * delegation to `@association.build(attributes, &block)`. The Array arm and
   * the `add_to_target(build_record(...), replace: true)` shape live on
   * `CollectionAssociation#build` (collection_association.rb:117-123), which
   * writes the same in-memory target this proxy reads.
   *
   * The two textually identical ternary arms are not dead code: each narrows
   * `attrs` (array vs single) so overload resolution picks the matching
   * `CollectionAssociation#build` overload. A bare
   * `association.build(attrs, block)` on the union fails with TS2769 — the same
   * language necessity `new()` carries below.
   */
  build(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  build(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  build(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    const association = this._record.association(
      this._assocName,
    ) as unknown as CollectionAssociation;
    return (
      Array.isArray(attrs)
        ? association.build(attrs, block as (record: Base) => void)
        : association.build(attrs, block as (record: Base) => void)
    ) as T | T[];
  }

  /** Rails `CollectionProxy#new` — `alias_method :new, :build`. */
  new(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  new(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  new(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    // Each branch narrows `attrs` (array vs single) so overload resolution
    // selects the matching `build` overload: a bare `this.build(attrs, block)`
    // on the union fails (TS2769 — no overload accepts `T | T[]`). This is the
    // cast-free delegation Rails expresses as `alias_method :new, :build`
    // (collection_proxy.rb:321).
    return Array.isArray(attrs) ? this.build(attrs, block) : this.build(attrs, block);
  }

  /**
   * Add an already-persisted record to the in-memory target, mirroring Rails'
   * `association.add_to_target(existing_record, skip_callbacks: true)` in
   * `assign_nested_attributes_for_collection_association`. Used by nested
   * attributes when an unloaded collection is assigned an existing record by
   * id: the in-memory `@target` is populated synchronously so subsequent reads
   * and autosave/grandchild cascades use it without a DB reload. Rails passes
   * `skip_callbacks: true` (inverse wiring still runs, but before/after_add do
   * not — this is not a user `<<`) and the default `replace: false`.
   * @internal
   */
  addExistingRecord(record: T): void {
    this._collectionAssociation().addToTarget(record, { skipCallbacks: true });
  }

  /**
   * Mirrors `CollectionProxy#create` (collection_proxy.rb:334-336): a plain
   * delegation to `@association.create(attributes, &block)`. The persisted-owner
   * guard, the Array arm, `build_record`, and the
   * `transaction { add_to_target(record) { insert_record } }` shape all live
   * once on `CollectionAssociation#_create_record`
   * (collection_association.rb:354-372); the :through arm reaches it through
   * `HasManyThroughAssociation#build_record`/`#insert_record`, exactly as Rails
   * reaches it.
   */
  async create(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async create(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async create(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    return (await this._collectionAssociation().create(
      attrs,
      block as ((record: Base) => void) | undefined,
    )) as T | T[];
  }

  /**
   * Rails' `@association` ivar (collection_proxy.rb:33), which every mutation
   * on the proxy delegates to. trails resolves it off the owner instead of
   * holding it, because the proxy is built from the reflection, not handed the
   * association object.
   * @internal
   */
  private _collectionAssociation(): CollectionAssociation {
    return this._record.association(this._assocName) as unknown as CollectionAssociation;
  }

  /**
   * Wire `record` into this collection's target from the inverse side.
   *
   * Mirrors the Rails inverse-wiring chain `set_inverse_instance`
   * (association.rb:132) → `inversed_from` → `self.target =`
   * (CollectionAssociation#target=, collection_association.rb:285) →
   * `replace_on_target(record, true, replace: true, inversing: true)`
   * (the call at collection_association.rb:294), the path Rails takes when a
   * belongs_to-loaded or preloaded record is folded back into its `has_many`
   * owner: `skip_callbacks` (no before/after_add — inverse wiring is not a user
   * `<<`), `replace: true`, and `inversing: true`. The `inversing` arm of that
   * method's `@replaced_or_added_targets << record if inversing || index ||
   * record.new_record?` (:476) is what records a *persisted* record here, so a
   * later `<<`/`push` of the same record replaces in place rather than
   * appending a duplicate; and because `@_was_loaded` is forced true there we
   * always append to `@target` — loaded or not. A subsequent real `load()`
   * merges this in-memory record by primary key (the trails analog of
   * `merge_target_lists`), so the early append is not double-counted.
   *
   * This is the single write entry point for inverse has_many targets. The C2
   * (#2591) seam, which used to reach into `proxy._replacedOrAddedTargets` from
   * `associations.ts`, is now internal here. The seeded record lands in
   * `_target`, which `Base#_associationCache` surfaces to readers (this proxy
   * is the canonical has_many store).
   * @internal
   */
  _wireInverseTarget(record: T): void {
    this._collectionAssociation().replaceOnTarget(record, true, {
      replace: true,
      inversing: true,
    }) as Base | null;
  }

  /**
   * Returns the size of the collection, executing a SELECT COUNT(*) query if
   * the collection hasn't been loaded.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#size
   * (collection_proxy.rb:782-784) — `@association.size`. Every arm of
   * `CollectionAssociation#size` (collection_association.rb:209-222) lives on
   * the association; the proxy counts nothing itself.
   */
  async size(): Promise<number> {
    return this._collectionAssociation().size();
  }

  /**
   * Returns true if the collection is empty.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#empty?
   * (collection_proxy.rb:831-833) — `@association.empty?`.
   */
  async isEmpty(): Promise<boolean> {
    return this._collectionAssociation().isEmpty();
  }

  /**
   * Add one or more records to the collection by setting the FK and saving.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#push / #<< — which
   * return `proxy_association.concat(records) && self`, so the call is falsy
   * as soon as one child fails to insert: `concat_records` raises
   * `ActiveRecord::Rollback` on a false `insert_record`, and the enclosing
   * `transaction { }` swallows it and yields nil out of `concat`. That is the
   * `concatResult` check below — the failure is reported by return value, not
   * by raising, because `concat` passes `raise = false`. Through associations
   * are the exception: `HasManyThroughAssociation#concat_records` calls
   * `super(records, true)`, so they raise instead and always return the proxy.
   *
   * `self` is returned via `stripThenable` so the (thenable) proxy isn't
   * unwrapped by promise adoption — otherwise `return this` would call the
   * proxy's `then` and load the target, breaking Rails' "push does not load
   * target" invariant.
   *
   * The non-through branch is that one delegation: the owner FK / composite
   * primary-key pairing / polymorphic `<as>_type` derivation lives on
   * `CollectionAssociation#insert_record` → `set_owner_attributes`
   * (collection_association.rb:439-446), and `concat` owns both halves Rails
   * puts there — the new-record-owner `load_target` and the persisted-owner
   * `transaction { concat_records }`. The proxy and the association object
   * share ONE in-memory target (the association's `@target`), so the appended records,
   * loaded-ness, `@replaced_or_added_targets` dedup and before/after_add
   * callbacks all land on this proxy too.
   */
  async push(...records: T[]): Promise<Omit<this, "then"> | false> {
    this._raiseOnTypeMismatch(records);
    // Through association (including HABTM): create join records
    if (this._assocDef.options.through) {
      await this._pushThrough(records);
      return stripThenable(this._proxySelf ?? this);
    }

    const assoc = this._record.association(this._assocName) as unknown as {
      concat: (...records: Base[]) => Promise<Base[] | undefined>;
    };
    const concatResult = await assoc.concat(...(records as unknown as Base[]));
    if (!concatResult) return false;
    return stripThenable(this._proxySelf ?? this);
  }

  /**
   * Rails has no `_pushThrough`: `CollectionProxy#<<` is
   * `proxy_association.concat(records)` (collection_proxy.rb:1053), and every
   * join-row decision lives on `HasManyThroughAssociation#concat_records` /
   * `#insert_record` (has_many_through_association.rb:24-49). This is that
   * delegation. The proxy and the association object share ONE in-memory target
   * (the association's `@target`), so routing the write onto
   * the association keeps membership, loaded-ness, `@replaced_or_added_targets`
   * dedup, and the before/after_add callbacks coherent across both handles.
   *
   * The `create!` path does NOT come through here: it is
   * `@association.create!(...)` (collection_proxy.rb:319-321) onto
   * `CollectionAssociation#_create_record` (collection_association.rb:354-372),
   * which owns the `transaction`, the `add_to_target { insert_record }` funnel,
   * the `raise ActiveRecord::Rollback unless result` guard and — through
   * `HasManyAssociation#_create_record` (has_many_association.rb:143-149) — the
   * in-memory counter bump.
   *
   * `throughScope` is Rails' `@through_scope`
   * (has_many_through_association.rb:93), which `construct_join_attributes`
   * reads back; a scoped create (`AssociationRelation#create`) captured it
   * before this call, so it is lent to the association for this write only.
   */
  private async _pushThrough(records: T[], throughScope?: unknown): Promise<void> {
    const assoc = this._record.association(this._assocName) as unknown as ThroughAssociationHandle;
    const previousThroughScope = assoc._throughScope;
    if (throughScope != null) assoc._throughScope = throughScope;
    try {
      await assoc.concat(...records);
    } finally {
      assoc._throughScope = previousThroughScope;
    }
    // `@offsets = @take = nil; @scope = nil` (collection_proxy.rb:1112-1116).
    this.resetScope();
  }

  private _raiseOnTypeMismatch(records: T[]): void {
    const opts = this._assocDef.options;
    // Polymorphic associations have no fixed klass — Rails no-ops type checking there.
    if (opts.polymorphic) return;
    const className = opts.className ?? camelize(singularize(this._assocName));
    const klass = resolveAssocClass(this._record, this._assocName, className);
    for (const record of records) {
      if (record == null || !(record instanceof klass)) {
        const actual =
          record == null
            ? String(record)
            : `an instance of ${(record as any)?.constructor?.name ?? "unknown"}`;
        throw new AssociationTypeMismatch(`${className}`, actual);
      }
    }
  }

  /**
   * Alias for push.
   */
  async concat(...records: T[]): Promise<Omit<this, "then"> | false> {
    return this.push(...records);
  }

  /**
   * Deletes the `records` supplied according to the `:dependent` option, and
   * removes them from the collection.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#delete
   * (collection_proxy.rb:620-622) — `@association.delete(*records).tap {
   * reset_scope }`. The removal body itself (id coercion,
   * `raise_on_type_mismatch!`, the `catch(:abort)` around `before_remove`,
   * `delete_records`, the `@target` prune, `after_remove`) lives once on
   * `CollectionAssociation#delete_or_destroy` / `#remove_records`
   * (collection_association.rb:385-408), which writes the same in-memory target
   * this proxy reads.
   */
  // @ts-expect-error CP and Relation share the method name for genuinely
  //   different operations: Relation#delete removes by PK; CP#delete removes
  //   by record reference (association semantics). Intentional permanent
  //   divergence — renaming either would break the Rails API surface.
  //   Accepts Integer/String keys too, mirroring Rails' delete_or_destroy.
  async delete(...records: Array<T | number | string | bigint>): Promise<Base[] | undefined> {
    const removed = await this._collectionAssociation().delete(
      ...(records as Array<Base | number | string | bigint>),
    );
    this.resetScope();
    return removed;
  }

  /**
   * Destroys the `records` supplied and removes them from the collection,
   * always removing the row from the database regardless of `:dependent`.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#destroy
   * (collection_proxy.rb:692-694) — `@association.destroy(*records).tap {
   * reset_scope }`, which is `delete_or_destroy(records, :destroy)` and so
   * shares every step with {@link delete}.
   */
  // @ts-expect-error CP and Relation share the method name for genuinely
  //   different operations: Relation#destroy removes by PK; CP#destroy
  //   destroys by record reference (association semantics). Intentional
  //   permanent divergence — same rationale as CP#delete above.
  async destroy(...records: Array<T | number | string | bigint>): Promise<Base[] | undefined> {
    const removed = await this._collectionAssociation().destroy(
      ...(records as Array<Base | number | string | bigint>),
    );
    this.resetScope();
    return removed;
  }

  /**
   * Equivalent to `deleteAll`. The difference is that it returns `this`,
   * instead of an array of the deleted objects, so methods can be chained.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#clear
   * (collection_proxy.rb:1066-1069) — `delete_all; self`. The `:dependent`
   * collapse, the delete/nullify dispatch, the counter-cache update and the
   * target reset all live once on `CollectionAssociation#delete_all` /
   * `#delete_or_nullify_all_records` (collection_association.rb:150-176).
   */
  async clear(): Promise<Omit<this, "then">> {
    await this.deleteAll();
    return stripThenable(this._proxySelf ?? this);
  }

  /**
   * Check if a record is in the collection.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#include?
   * (collection_proxy.rb:927-929) — `!!@association.include?(record)`. The
   * `reflection.klass` guard, the `include_in_memory?` scan (through arm
   * included) and the `scope.exists?` fallback all live on
   * `CollectionAssociation#include?` (collection_association.rb:258-270).
   */
  async isInclude(record: T): Promise<boolean> {
    return !!(await this._collectionAssociation().isInclude(record));
  }

  /**
   * Mirrors: ActiveRecord::Relation::FinderMethods#first!
   */
  override async firstBang(): Promise<T> {
    const record = await this.first();
    if (!record) {
      throw new RecordNotFound(`${this.model.name} not found`, this.model.name);
    }
    return record;
  }

  /**
   * Return the last associated record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#last
   */
  override last(): Promise<T | null>;
  override last(n: number): Promise<T[]>;
  override async last(n?: number): Promise<T | T[] | null> {
    // `load_target if find_from_target?; super` (collection_proxy.rb:259-262).
    // `super` is `Relation#last`, whose `loaded?` arm (finder_methods.rb:203)
    // fires on the proxy via the `isLoaded` / `records` overrides; the
    // unloaded arm's `reverse_order.limit(...)` reaches the association scope
    // through `delegate(*QueryMethods, to: :scope)` (:1128-1137).
    if (this.isFindFromTarget()) await this.loadTarget();
    return basePerformLast.call(this as any, n);
  }

  /**
   * Mirrors: ActiveRecord::Relation::FinderMethods#last!
   */
  override async lastBang(): Promise<T> {
    const record = await this.last();
    if (!record) {
      throw new RecordNotFound(`${this.model.name} not found`, this.model.name);
    }
    return record;
  }

  /**
   * Return the first n records (or first record if n omitted).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#take
   */
  override take(): Promise<T | null>;
  override take(limit: number): Promise<T[]>;
  override async take(n?: number): Promise<T | T[] | null> {
    // `load_target if find_from_target?; super` (collection_proxy.rb:289-292).
    // `super` is `Relation#take`, which dispatches to the `findTake` /
    // `findTakeWithLimit` seams below; the `@take` memo and the loaded arm are
    // the base `FinderMethods` bodies'.
    if (this.isFindFromTarget()) await this.loadTarget();
    return super.take(n as number);
  }

  /**
   * Mirrors: ActiveRecord::Relation::FinderMethods#take!
   */
  override async takeBang(): Promise<T> {
    const record = await this.take();
    if (!record) {
      throw new RecordNotFound(`${this.model.name} not found`, this.model.name);
    }
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionProxy#find_nth_with_limit
   * (`load_target if find_from_target?; super`, collection_proxy.rb:1140-1143).
   * Once the target is loaded the base FinderMethods body reads it through the
   * proxy's `isLoaded` / `records` overrides; otherwise it falls through to the
   * same ordered `LIMIT`/`OFFSET` query, built against the live association
   * scope by `delegate(*QueryMethods, to: :scope)` (:1128-1137). This is the
   * single override point that makes the inherited `second`/`third`/`fourth`/
   * `fifth` (and their bang variants) read a loaded/dirty target without
   * re-querying.
   * @internal
   */
  protected override async findNthWithLimit(index: number, limit: number): Promise<T[]> {
    if (this.isFindFromTarget()) await this.loadTarget();
    return baseFindNthWithLimit.call(this as any, index, limit);
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionProxy#find_nth_from_last
   * (`load_target if find_from_target?; super`). Backs the inherited
   * `secondToLast`/`thirdToLast` (and bang variants); see `findNthWithLimit`.
   * @internal
   */
  protected override async findNthFromLast(index: number): Promise<T | null> {
    if (this.isFindFromTarget()) await this.loadTarget();
    return baseFindNthFromLast.call(this as any, index);
  }

  /**
   * True if the collection has more than one record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#many?
   */
  async many(predicate?: (record: T) => boolean): Promise<boolean> {
    if (predicate !== undefined) {
      const records = await this.loadTarget();
      let matched = 0;
      for (const r of records) {
        if (predicate(r) && ++matched > 1) return true;
      }
      return false;
    }
    // Rails Relation#many? uses records.many? when loaded (no query),
    // otherwise limited_count > 1.
    if (this._targetLoaded) return this._target.length > 1;
    return ((await this.count()) as number) > 1;
  }

  /**
   * True if the collection has exactly one record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#one?
   */
  async one(): Promise<boolean> {
    return (await this.count()) === 1;
  }

  /**
   * True if any records exist in the collection (optionally matching conditions).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#exists?
   */
  async exists(conditions?: Record<string, unknown> | unknown): Promise<boolean> {
    if (this._assocDef.options.through != null) {
      const records = (await this.loadTarget()).filter((r) => !r.isNewRecord());
      if (conditions === undefined) return records.length > 0;
      if (typeof conditions === "object" && conditions !== null && !Array.isArray(conditions)) {
        const entries = Object.entries(conditions as Record<string, unknown>);
        return records.some((r) => entries.every(([k, v]) => r.readAttribute(k) === v));
      }
      const targetModel = this.model;
      const pk = targetModel.primaryKey;
      if (Array.isArray(pk)) {
        throw new Error(
          `CollectionProxy#exists does not support composite primary keys for through associations on "${this._assocName}".`,
        );
      }
      if (Array.isArray(conditions)) {
        const idSet = new Set(conditions);
        return records.some((r) => idSet.has(r.readAttribute(pk)));
      }
      return records.some((r) => r.readAttribute(pk) === conditions);
    }
    this._checkStrictLoading();
    return this.scope().exists(conditions);
  }

  /**
   * Find first record matching conditions, or build (but don't save) a new one.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first_or_initialize
   */
  async firstOrInitialize(conditions: Record<string, unknown> = {}): Promise<T> {
    this._checkStrictLoading();
    const matches = await this.scope().where(conditions).toArray();
    if (matches.length > 0) return matches[0];
    return this.build(conditions);
  }

  /**
   * Find first record matching conditions, or create one.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first_or_create
   */
  async firstOrCreate(conditions: Record<string, unknown> = {}): Promise<T> {
    this._checkStrictLoading();
    const matches = await this.scope().where(conditions).toArray();
    if (matches.length > 0) return matches[0];
    return this.create(conditions);
  }

  /**
   * Find first record matching conditions, or create one (raises on failure).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first_or_create!
   */
  async firstOrCreateBang(conditions: Record<string, unknown> = {}): Promise<T> {
    this._checkStrictLoading();
    const matches = await this.scope().where(conditions).toArray();
    if (matches.length > 0) return matches[0];
    return this.createBang(conditions);
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionProxy#replace
   * (collection_proxy.rb:391-393), a one-line delegation to
   * `@association.replace(other_array)`
   * (collection_association.rb:242-256), which owns the `load_target` /
   * `original_target` capture, the persisted-vs-new-owner split,
   * `replace_records`, `replace_common_records_in_memory` and the
   * `difference` / `intersection` hooks.
   *
   * The association's `replace` is synchronous and hands its persisted-owner
   * half back as a plan (RFC 0068 — the property setter cannot await), so the
   * delegation spells the same two steps `CollectionAssociation#writer`
   * (collection_association.rb:46-48) does, then answers with the resulting
   * target the way Rails' `replace` does.
   */
  async replace(records: T[]): Promise<T[]> {
    const association = this._collectionAssociation();
    const plan = association.replace(records);
    if (plan) await association.persistReplacePlan(plan);
    return this._target;
  }

  /**
   * Destroy all records in the collection (runs callbacks, deletes from DB).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#destroy_all
   */
  async destroyAll(): Promise<T[]> {
    const records = (await this._collectionAssociation().destroyAll()) as T[];
    this.resetScope();
    return records;
  }

  /**
   * Find records within the association by id or array of ids.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#find — a bare
   * delegation to `@association.find(*args)`. Rails' `return super if
   * block_given?` arm forwards to `Enumerable#find`'s predicate form, which
   * has no analogue here (this `find` takes ids only; the block form is
   * `Array#find` over an awaited collection).
   */
  override find(ids: unknown[]): Promise<T[]>;
  override find(id: unknown): Promise<T>;
  override find(...ids: unknown[]): Promise<T | T[]>;
  override async find(...args: unknown[]): Promise<T | T[]> {
    const assoc = this._record.association(this._assocName) as unknown as {
      find(...args: unknown[]): Promise<Base | Base[] | null>;
    };
    return (await assoc.find(...args)) as T | T[];
  }

  /**
   * Mirrors: ActiveRecord::Associations::CollectionProxy#pluck
   * (collection_proxy.rb:728-730) — `null_scope? ? scope.pluck(*column_names) : super`.
   */
  override async pluck(
    ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]> {
    // `disable_joins` deviation, not a Rails arm: Rails' `DisableJoinsAssociationScope`
    // plucks the chain ids eagerly, so `scope` is authoritative and `super` — whose
    // `spawn` is delegated to `scope` (collection_proxy.rb:1128-1137) — plucks
    // against a constrained relation. trails resolves the chain asynchronously, so
    // `scope()` carries no constraint until awaited and `super` would pluck over
    // the whole table. Route those through the DJAR, which resolves the walk first.
    // Convergence story: 0106-wide-call-set-direct-burndown/
    // djar-eager-chain-ids-drop-disable-joins-arms.
    if (this.isNullScope()) return this.scope().pluck(...columnNames);
    if (this._assocDef.options.disableJoins) {
      return this.scope().pluck(...columnNames);
    }
    return super.pluck(...columnNames);
  }

  async reload(): Promise<Omit<this, "then">> {
    this._targetLoaded = false;
    this._target = [];
    this._replacedOrAddedTargets.clear();
    await this.load();
    this.resetScope();
    return stripThenable(this);
  }

  override reset(): this {
    // Call Relation.reset() so inherited query state (_records,
    // _loaded, _loadToken, _futureResult) is cleared alongside the
    // association-specific target cache. Without super, callers using
    // Relation#load() / Relation#loadAsync() patterns on the proxy
    // would see stale results after reset.
    super.reset();
    this._targetLoaded = false;
    this._target = [];
    this._replacedOrAddedTargets.clear();
    this.resetScope();
    return this;
  }

  /**
   * Returns a Relation object for the records in this association.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#scope
   * (collection_proxy.rb:948-950) — `@scope ||= @association.scope`. The memo is
   * cleared by `reset_scope`, which the collection reader runs on every read
   * (collection_association.rb:42, mirrored in `associations.ts`'s cached-proxy
   * path) and which `reload` runs, so a scope built while the owner was still a
   * new record never survives to a post-save call.
   */
  scope(): any {
    const assoc = this._record.association(this._assocName) as unknown as {
      scope(): unknown;
    };
    return (this._scope ??= assoc.scope() as any);
  }
  /**
   * Load and return the target records array.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#load_target
   */
  async loadTarget(): Promise<T[]> {
    return this.load();
  }

  /**
   * Whether the association scope is the null scope — the owner is a new record
   * with no foreign key to query by, so `CollectionAssociation#scope` has
   * `none!`d it (collection_association.rb:298-306). Mirrors
   * `CollectionProxy#null_scope?` (collection_proxy.rb:1150-1152), a one-line
   * delegation to `@association.null_scope?`.
   *
   * @internal
   */
  isNullScope(): boolean {
    return this._collectionAssociation().isNullScope();
  }

  /**
   * Whether find should read the in-memory target rather than querying the
   * database. Mirrors `CollectionProxy#find_from_target?`
   * (collection_proxy.rb:1154), a one-line delegation to
   * `@association.find_from_target?` — this proxy *is* its own association, so
   * the delegation borrows `CollectionAssociation`'s body directly instead of
   * re-implementing the clause list, passing `_targetLoaded` as the loaded
   * flag (the proxy's inherited `Relation#isLoaded` tracks something else).
   *
   * Deliberately NOT routed through `owner.association(name)`: that wrapper is
   * a secondary copy whose loaded flag is synthesized from
   * `Base#_associationCache`, so a merely-seeded (concat'd but unloaded) proxy
   * surfaces there as loaded — making `find_from_target?` true where Rails says
   * false. `_targetLoaded` is the proxy's own flag and the faithful one.
   *
   * @internal
   */
  isFindFromTarget(): boolean {
    return CollectionAssociation.prototype.isFindFromTarget.call(
      this as unknown as CollectionAssociation,
      this._targetLoaded,
    );
  }

  /**
   * Render the collection, loading the target (from memory when
   * `find_from_target?`, otherwise via a bounded query) without forcing a
   * premature reload. Mirrors
   * ActiveRecord::Associations::CollectionProxy#inspect, which delegates to
   * Relation#inspect after `load_target if find_from_target?`.
   *
   * Rails' proxy inspect is synchronous (blocking DB I/O inside `inspect`);
   * JS has no blocking I/O, so loading the target here is async. This widens
   * the return to `Promise<string>` vs Relation#inspect's `string`.
   */
  // @ts-expect-error async divergence from Relation#inspect — see doc comment.
  async inspect(): Promise<string> {
    if (this.isFindFromTarget()) await this.loadTarget();
    const limitValue = (this as any).limitValue as number | null;
    const take = limitValue != null ? Math.min(limitValue, 11) : 11;
    // Rails' unloaded branch is `annotate("loading for inspect").take(...)`
    // (relation.rb:1291); carry the annotation onto the bounded query.
    const subject = this._targetLoaded
      ? this._target
      : await this.annotate("loading for inspect").limit(take);
    const entries = subject.slice(0, take).map((r) => (r as any).inspect() as string);
    if (entries.length === 11) entries[10] = "...";
    return `#<${(this.constructor as typeof Relation)._railsClassName} [${entries.join(", ")}]>`;
  }

  /**
   * Pretty-print this proxy through the `PP` protocol, loading the target
   * from memory when `find_from_target?` (otherwise via a bounded query) and
   * delegating record rendering to `pp.pp`.
   *
   * Mirrors ActiveRecord::Associations::CollectionProxy#pretty_print, which
   * runs `load_target if find_from_target?` then delegates to
   * Relation#pretty_print. As with `inspect`, loading is async in trails,
   * widening the return to `Promise<void>`.
   */
  async prettyPrint(pp: PrettyPrinter): Promise<void> {
    if (this.isFindFromTarget()) await this.loadTarget();
    const limitValue = (this as any).limitValue as number | null;
    const take = limitValue != null ? Math.min(limitValue, 11) : 11;
    const subject = this._targetLoaded
      ? this._target
      : await this.annotate("loading for pp").limit(take);
    const entries = subject.slice(0, take) as (T | string)[];
    if (entries.length === 11) entries[10] = "...";
    await pp.pp(entries);
  }

  /**
   * Mirrors `CollectionProxy#create!` (collection_proxy.rb:344-346): a plain
   * delegation to `@association.create!(attributes, &block)`, which routes into
   * `_create_record(attributes, true, &block)` (association.rb:231-233).
   */
  async createBang(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async createBang(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async createBang(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    return (await this._collectionAssociation().createBang(
      attrs,
      block as ((record: Base) => void) | undefined,
    )) as T | T[];
  }

  /**
   * Delete all records from the collection according to the dependent strategy.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#delete_all
   * (collection_proxy.rb:474-476): `@association.delete_all(dependent).tap {
   * reset_scope }`. The argument validation, the `:destroy` → `:delete_all`
   * normalization and the delete/nullify dispatch all live in
   * `CollectionAssociation#deleteAll` / `deleteOrNullifyAllRecords`, exactly as
   * in Rails.
   */
  async deleteAll(dependent?: string): Promise<number> {
    const count = await (
      this._record.association(this._assocName) as unknown as {
        deleteAll(dependent?: string): Promise<number>;
      }
    ).deleteAll(dependent);
    this.resetScope();
    return count;
  }

  /**
   * Perform a calculation on the association scope.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#calculate
   * (collection_proxy.rb:724-726) — `null_scope? ? scope.calculate(operation,
   * column_name) : super`. On a non-null scope Rails runs `Calculations#calculate`
   * with `self` = the proxy, so the proxy's own relation state answers; only the
   * `none!`d new-owner scope is redirected to `scope`.
   */
  override async calculate(
    operation: "count",
    column?: string,
  ): Promise<number | Map<unknown, number>>;
  override async calculate(
    operation: "sum",
    column: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  override async calculate(
    operation: "average" | "minimum" | "maximum",
    column: string,
  ): Promise<unknown | null | Map<unknown, unknown>>;
  override async calculate(
    operation: string,
    columnName?: string | Nodes.Node | number | null,
  ): Promise<unknown> {
    // `disable_joins` deviation, not a Rails arm: Rails' `DisableJoinsAssociationScope`
    // plucks the chain ids eagerly, so `scope` is authoritative and `super` — whose
    // `spawn` is delegated to `scope` (collection_proxy.rb:1128-1137) — calculates
    // against a constrained relation. trails resolves the chain asynchronously, so
    // `scope()` carries no constraint until awaited and `super` would calculate over
    // the whole table. Route those through the DJAR, which resolves the walk first.
    // Convergence story: 0106-wide-call-set-direct-burndown/
    // djar-eager-chain-ids-drop-disable-joins-arms.
    if (this.isNullScope()) return this.scope().calculate(operation, columnName);
    if (this._assocDef.options.disableJoins) {
      return this.scope().calculate(operation, columnName);
    }
    return super.calculate(operation, columnName);
  }

  /**
   * Returns the underlying association object.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#proxy_association
   */
  get proxyAssociation(): CollectionAssociation {
    return this._collectionAssociation();
  }

  /**
   * Returns the loaded records array (loading if needed).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#records
   */
  async records(): Promise<T[]> {
    return this.loadTarget();
  }

  /**
   * Mirrors `CollectionProxy#==` (collection_proxy.rb:980-982) — `load_target
   * == other`, so the loaded target does the comparing: `Array#==` is
   * element-wise against another Array, and against anything that converts to
   * one (another proxy) MRI re-dispatches as `other == load_target`.
   */
  override async equals(other: unknown): Promise<boolean | undefined> {
    const loadTarget = await this.loadTarget();
    if (Array.isArray(other)) {
      return sameRecordList(loadTarget, other as Base[]);
    }
    const otherEquals = (other as { equals?: (o: unknown) => unknown } | null)?.equals;
    if (typeof otherEquals === "function") {
      return (await otherEquals.call(other, loadTarget)) as boolean | undefined;
    }
    return false;
  }

  /**
   * Alias for push/<<.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#append
   */
  async append(...records: T[]): Promise<Omit<this, "then"> | false> {
    return this.push(...records);
  }

  /**
   * Bang version of append — raises RecordInvalid when a target record or join
   * record is invalid (mirrors Rails' << / save! behavior).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#<< (bang semantics)
   */
  async appendBang(...records: T[]): Promise<void> {
    this._raiseOnTypeMismatch(records);
    if (this._assocDef.options.through) {
      await this._pushThrough(records);
      return;
    }
    // Non-through: push() assigns the FK and calls save() for each record.
    // After push(), raise RecordInvalid for any record that is still new (save failed)
    // or still has dirty changes (save returned false without retry — bang raises on
    // the initial failure rather than attempting a second save).
    await this.push(...records);

    for (const record of records) {
      if (record.isNewRecord()) {
        // New record still unsaved — push()'s save() returned false
        throw new RecordInvalid(record as unknown as object);
      }
      if (record.hasChangesToSave) {
        // Persisted record still has unsaved changes after push() — raise without retrying
        throw new RecordInvalid(record as unknown as object);
      }
    }
    return;
  }

  /**
   * Delegates to the target model class's transaction method.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#transaction
   */
  async transaction<R>(
    fn: (tx: unknown) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined> {
    const klass = this.model;
    if (typeof klass.transaction === "function") {
      return klass.transaction(fn as any, options);
    }
    return fn(undefined);
  }

  /**
   * Raises an error — prepend is not supported on associations.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#prepend
   */
  prepend(..._args: any[]): never {
    throw new Error("prepend on association is not defined. Please use <<, push or append");
  }

  /**
   * Reset cached scope state.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#reset_scope
   */
  resetScope(): this {
    this._offsets = undefined;
    this._take = undefined;
    this._scope = undefined;
    return this;
  }

  /**
   * Select columns (delegates to Relation) or filter with a block function.
   * The block form loads records and filters in-memory, matching Rails behavior.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#select
   */
  select(fn: (record: T) => boolean): Promise<T[]>;
  select(...columns: (string | Nodes.SqlLiteral)[]): Relation<T>;
  select(...args: any[]): Promise<T[]> | Relation<T> {
    if (args.length === 1 && typeof args[0] === "function") {
      const predicate = args[0] as (record: T) => boolean;
      return this.loadTarget().then((records) => records.filter(predicate));
    }
    return this.scope().select(...args);
  }

  /**
   * Async iterator — allows `for await (const record of proxy)`.
   *
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activerecord/lib/active_record/relation/delegation.rb:101` — the delegated
   *   `each` is synchronous and has no async twin).
   * JS async-iteration protocol — Ruby's Enumerable#each
   * is synchronous and has no async counterpart
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const records = await this.loadTarget();
    for (const record of records) {
      yield record;
    }
  }

  /**
   * Chains off the proxy (`blog.posts.where(...)`) return an
   * AssociationRelation, not another CollectionProxy — matching Rails,
   * where `blog.posts` is a CP and `blog.posts.where(...)` is an AR.
   * AR still routes writes through `_association` (this CP) so the FK,
   * inverse, and loaded target stay wired up.
   */
  override clone(): Relation<T> {
    if (!_AssociationRelationCtor) {
      throw new ConfigurationError(
        "CollectionProxy.clone: AssociationRelation constructor not set — " +
          "association-relation.ts must be loaded first",
      );
    }
    const Ctor = associationRelationClassFor(this.model);
    const rel = new Ctor(this.model, this) as Relation<T>;
    rel.initializeCopy(this as unknown as Relation<T>);
    return wrapWithScopeProxy(rel);
  }
}

// Mirrors: collection_proxy.rb:1128-1137
//
//   delegate_methods = [QueryMethods, SpawnMethods].flat_map { |klass|
//     klass.public_instance_methods(false)
//   } - self.public_instance_methods(false) - [:select] + [
//     :scoping, :values, :insert, :insert_all, :insert!, :insert_all!, :upsert, :upsert_all, :load_async
//   ]
//   delegate(*delegate_methods, to: :scope)
//
// `SpawnMethods` (spawn-methods.ts) and `QueryMethodBangs` (query-methods.ts) are
// the mixin objects `include()` mixes into `Relation`, so their own keys ARE
// `public_instance_methods(false)` and the delegate list is read off them. The
// non-bang `QueryMethods` members still live on `Relation` itself and stay a
// hand-list below until RFC 0107 finishes moving them into the mixin; it shrinks
// as they land. `public_instance_methods(false)` includes the bang builders
// (`where!`, `limit!`, `none!`, …), so Rails delegates those to `scope` too — a
// Rails `CollectionProxy` owns no relation state of its own. The
// constructor's own seeding calls (`noneBang` / `extendingBang`) run BEFORE the
// prototype delegation is consulted only in the sense that they must target the
// proxy's inherited state, so they are invoked through `Relation.prototype`
// directly (see the ctor).
const QUERY_METHODS_PUBLIC_INSTANCE_METHODS = [
  "includes",
  "all",
  "eagerLoad",
  "preload",
  "extractAssociated",
  "references",
  "select",
  "with",
  "withRecursive",
  "reselect",
  "group",
  "regroup",
  "order",
  "inOrderOf",
  "reorder",
  "unscope",
  "joins",
  "leftOuterJoins",
  // `alias :left_joins :left_outer_joins` (query_methods.rb:887) — a public
  // instance method of QueryMethods, so Rails delegates it to `scope` too.
  "leftJoins",
  "where",
  "rewhere",
  "invertWhere",
  "structurallyCompatible",
  "and",
  "or",
  "having",
  "limit",
  "offset",
  "lock",
  "none",
  "isNullRelation",
  "readonly",
  "strictLoading",
  "createWith",
  "from",
  "distinct",
  "extending",
  "optimizerHints",
  "reverseOrder",
  "annotate",
  "excluding",
  // `alias :without :excluding` (query_methods.rb:1585).
  "without",
  "arel",
  "constructJoinDependency",
] as const;

// Ruby's `private` keyword (query_methods.rb:1677, spawn_methods.rb:71) keeps
// these out of `public_instance_methods(false)`, so `delegate` never sees them.
// A JS object literal carries no such distinction, so the boundary is named here.
const PRIVATE_MIXIN_INSTANCE_METHODS = new Set([
  "assertModifiableBang",
  "checkIfMethodHasArgumentsBang",
  "_selectBang",
  "relationWith",
]);

const MIXIN_PUBLIC_INSTANCE_METHODS = [
  ...Object.keys(QueryMethodBangs).filter((name) => name.endsWith("Bang")),
  ...Object.keys(SpawnMethods),
].filter((name) => !PRIVATE_MIXIN_INSTANCE_METHODS.has(name));

const delegateMethods = (
  [...QUERY_METHODS_PUBLIC_INSTANCE_METHODS, ...MIXIN_PUBLIC_INSTANCE_METHODS] as string[]
)
  .filter((name) => !Object.hasOwn(CollectionProxy.prototype, name) && name !== "select")
  .concat([
    "scoping",
    "values",
    "insert",
    "insertAll",
    "insertBang",
    "insertAllBang",
    "upsert",
    "upsertAll",
    "loadAsync",
  ]);

// The VALUE_METHODS accessors `query_methods.rb:162-183` generates
// (`where_clause`, `order_values`, `limit_value`, …) are
// `QueryMethods.public_instance_methods(false)` too, so `delegate(*delegate_methods,
// to: :scope)` routes them at `scope` as well — which is how a Rails
// `CollectionProxy` runs the mutation terminals it inherits from `Relation`
// (`update_all` reads `where_clause` / `values` / `having_clause`,
// relation.rb:1010-1027) against the association scope with no override.
// They are accessors, not methods, so the delegation is a property pair.
const valueAccessorNames = [
  ...Relation.MULTI_VALUE_METHODS.map((name) => `${name}Values`),
  ...Relation.SINGLE_VALUE_METHODS.map((name) => `${name}Value`),
  ...Relation.CLAUSE_METHODS.map((name) => `${name}Clause`),
];

for (const name of valueAccessorNames) {
  Object.defineProperty(CollectionProxy.prototype, name, {
    get(this: CollectionProxy<Base>): unknown {
      return (this.scope() as Record<string, unknown>)[name];
    },
    set(this: CollectionProxy<Base>, value: unknown) {
      (this.scope() as Record<string, unknown>)[name] = value;
    },
    configurable: true,
  });
}

for (const name of delegateMethods) {
  Object.defineProperty(CollectionProxy.prototype, name, {
    value: function (this: CollectionProxy<Base>, ...args: unknown[]): unknown {
      const scope = this.scope() as Record<string, (...a: unknown[]) => unknown>;
      return scope[name](...args);
    },
    writable: true,
    configurable: true,
  });
}

// Route `await proxy` through `load()` (not `toArray`) so the thenable
// also hydrates `_target` — matches the documented contract that
// `await proxy; proxy[0]` / `proxy.target.length` work after a single await.
// `toArray()` stays available for callers who want a fresh array
// without hydrating this proxy's `_target` / `_loaded` (it still goes
// through `findTarget`, which syncs into the record's association
// instance cache — only this proxy's local cache is left untouched).
applyThenable(CollectionProxy.prototype, "load");

// Register the constructor so associations.ts can late-bind (it can't
// value-import CP at module init without re-entering the cycle).
_setCollectionProxyCtor(
  CollectionProxy as unknown as Parameters<typeof _setCollectionProxyCtor>[0],
);

// Register for Delegation.uncacheableMethods (delegation.rb:17-21): CollectionProxy's
// own methods (not on Relation) must never be cached as generated relation methods.
_registerRelationFamily(
  "collectionProxy",
  CollectionProxy as unknown as new (...a: never[]) => unknown,
);

/**
 * @internal Build a stable string token from a record's primary key. A
 * composite key (`string[]`) is joined with a NUL separator so distinct
 * key tuples can never collide; a record without an assigned key (`null` /
 * `undefined` in any position) returns `null` so callers skip it.
 */
function primaryKeyToken(record: Base): string | null {
  const id = record.id;
  if (Array.isArray(id)) {
    if (id.some((part) => part == null)) return null;
    return id.map((part) => String(part)).join("\u0000");
  }
  if (id == null) return null;
  return String(id);
}
