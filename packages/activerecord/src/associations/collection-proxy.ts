import type { Base } from "../base.js";
import { Relation } from "../relation.js";
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
import { underscore, singularize, camelize, constantize } from "@blazetrails/activesupport";
import {
  RecordNotSaved,
  ConfigurationError,
  AssociationTypeMismatch,
  RecordNotFound,
} from "../errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { strictLoadingViolationBang } from "../core.js";
import { RecordInvalid } from "../validations.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughNestedAssociationsAreReadonly,
  HasManyThroughOrderError,
  CompositePrimaryKeyMismatchError,
  AssociationNotFoundError,
} from "./errors.js";
import { routeThroughCheckValidity } from "./validate-through-reflection.js";
import type { AssociationDefinition } from "../associations.js";
import {
  autoloadModel,
  resolveAssocClass,
  _routeThroughViaAssociationScope,
} from "../associations.js";
import { _setCollectionProxyCtor } from "./collection-proxy-slot.js";
import { multisetDifference, multisetIntersection } from "./has-many-through-association.js";
import {
  countRecords,
  scope as hasManyScope,
  setDifference,
  setIntersection,
} from "./has-many-association.js";
import { throughForeignKeyPresent } from "./through-association.js";
import { foreignKeyPresentFor } from "./foreign-association.js";
import type { AssociationReflection } from "../reflection.js";

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
  private _assocName: string;
  private _assocDef: AssociationDefinition;
  private _target: T[] = [];
  private _targetLoaded = false;
  // Rails' `CollectionProxy#@scope` memo (collection_proxy.rb:949-951), cleared
  // by `reset_scope` (collection_proxy.rb:1112-1116).
  private _scope: unknown;
  // Mirrors Rails' `CollectionAssociation#@replaced_or_added_targets` (a
  // `Set.new.compare_by_identity`): records that have been added to or
  // replaced on the in-memory target. `replace_on_target` consults it to
  // dedup by identity rather than appending the same record twice.
  private _replacedOrAddedTargets = new Set<T>();
  // The JS Proxy wrapper returned by association() — methods that return
  // `self` (push / concat / append) hand this back so callers get the same
  // object they hold, since `this` is the raw target, not the wrapper.
  private _proxySelf?: this;

  // An `ArgumentError` raised while deriving the has_many foreign key
  // (e.g. an owner whose `query_constraints` list has >2 attributes, so the FK
  // is underivable). Rails surfaces this only when the association is *loaded*
  // (`blog_post.comments.to_a`), not when the proxy is constructed — the
  // reflection's `foreign_key` is computed lazily inside the scope build that
  // `load_target` runs. We mirror that: catch the error during construction,
  // stash it here, and re-throw from the single load chokepoint (`_execLoad`).
  private _deferredFkError?: Error;

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

  /** @internal */
  get _sharedTarget(): T[] {
    return this._target;
  }

  set _sharedTarget(records: T[]) {
    this._target = records;
  }

  /** @internal */
  get _sharedReplacedOrAddedTargets(): Set<T> {
    return this._replacedOrAddedTargets;
  }

  set _sharedReplacedOrAddedTargets(value: Set<T>) {
    this._replacedOrAddedTargets = value;
  }

  /** @internal */
  get _sharedLoaded(): boolean {
    return this._targetLoaded;
  }

  set _sharedLoaded(value: boolean) {
    this._targetLoaded = value;
  }

  /** @internal */
  _adoptSharedTarget(records: T[], loaded: boolean): void {
    this._target = records;
    this._targetLoaded = loaded;
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

  /** @internal Whether this is a through association — used by AssociationRelation. */
  get isThrough(): boolean {
    return !!this._assocDef.options.through;
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
   * an unloaded one re-queries. The inherited `Relation#length` always
   * re-queries via `toArray`/`_execLoad`, which is why we override here: the
   * proxy keeps loaded state in `_target`/`_targetLoaded`, not Relation's
   * `_records`/`_loaded`, so `loadTarget()` (which short-circuits on
   * `_targetLoaded`) is the faithful path.
   */
  override async length(): Promise<number> {
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

  // Mirrors Ruby's Enumerable#detect / #find: returns the first record for
  // which the block is truthy, else undefined. Named `detect` (not `find`)
  // because `find` is the AR PK finder on both CollectionProxy and Relation.
  // Rails reaches detect via Enumerable#detect → Relation#records →
  // CollectionProxy#load_target (collection_proxy.rb:1024), so an unloaded
  // proxy loads first — hence async + loadTarget() here (as select/records do).
  async detect(fn: (record: T, index: number, all: T[]) => unknown): Promise<T | undefined> {
    const records = await this.loadTarget();
    return records.find(fn);
  }

  // Mirrors Ruby's Enumerable#sort_by: a new array sorted ascending by the
  // block's return key (stable, non-mutating). Like detect above, Rails reaches
  // sort_by via Enumerable → Relation#records → CollectionProxy#load_target
  // (collection_proxy.rb:1024), so override Relation#sortBy to load through
  // loadTarget() — hydrating the target and its loaded-state side effects —
  // rather than the inherited toArray() path.
  async sortBy(key: (record: T) => any): Promise<T[]> {
    const records = await this.loadTarget();
    return records
      .map((record, index) => ({ record, index, sortKey: key(record) }))
      .sort((a, b) => {
        if (a.sortKey < b.sortKey) return -1;
        if (a.sortKey > b.sortKey) return 1;
        return a.index - b.index;
      })
      .map((entry) => entry.record);
  }

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

    // Seed the proxy's inherited Relation state so direct Relation calls
    // (`cp.toSql()`, `cp.where(...)`, `cp.toArray()`) scope to the owner
    // — matches Rails, where CollectionProxy IS the scoped Relation.
    //
    // Non-through path delegates to the `scope()` seam (the same relation
    // `findTarget` runs, and what `countHasMany()` counts) so CP
    // gets identical semantics: the relation starts from
    // `targetModel.all()` (default scope applied), is scope-proxied
    // (so the definition's scope callbacks can call named scopes / generated
    // methods on it), and composite-PK mismatches throw
    // `CompositePrimaryKeyMismatchError`. State is then copied onto
    // `this` so the inherited Relation methods observe the same scope.
    //
    // Through path copies state from `_buildThroughScope()`. Config
    // errors (missing through assoc, unregistered target model) are
    // validated upfront; only adapter/schema failures fall to the
    // fail-closed `_isNone` path.
    const ctor = record.constructor as typeof Base;
    // The seeding bangs must land on the proxy's OWN inherited Relation state,
    // not on the memoized `scope()` the prototype delegation would forward them
    // to (collection_proxy.rb:1128-1137) — and `scope()` is not even buildable
    // yet mid-construction. Invoke them through `Relation.prototype` directly.
    const proxySelf = this as unknown as {
      initializeCopy: (other: Relation<T>) => void;
    };
    const relationProto = Relation.prototype as unknown as {
      extendingBang: (this: unknown, ...mods: unknown[]) => unknown;
    };
    // `none!` reads `where_clause` (query_methods.rb) — a reader delegated to
    // `scope` — so it is applied to a plain relation and copied onto the
    // proxy's own inherited state rather than called on the proxy.
    const seedNone = (): void => {
      proxySelf.initializeCopy((targetModel as any).all().noneBang() as Relation<T>);
      // Rails never sets `@none` on a CollectionProxy: `none!` is one of the
      // methods delegated to `scope` (collection_proxy.rb:1128-1137), so it
      // flips the SCOPE's flag and the proxy sees the `1=0` only through the
      // delegated `where_clause` reader. Copying the seed's predicates onto our
      // own inherited state must not also copy that flag, or the inherited
      // `update_all`'s `return 0 if @none` (relation.rb:1013) — and every other
      // `@none` short-circuit — fires on the proxy itself.
      (this as unknown as { _isNone: boolean })._isNone = false;
    };
    if (assocDef.options.through) {
      // Config validation FIRST, outside the try — missing through
      // association or unregistered target model are deterministic
      // bugs that must surface immediately, not silently fall to
      // `_isNone`. The try only wraps the schema/adapter-dependent
      // parts (join resolution, subquery build).
      const ownerAssociations: AssociationDefinition[] =
        (ctor as unknown as { _associations?: AssociationDefinition[] })._associations ?? [];
      const throughAssoc = ownerAssociations.find((a) => a.name === assocDef.options.through);
      if (!throughAssoc) {
        throw new ConfigurationError(
          `Through association "${assocDef.options.through}" not found on ${ctor.name}`,
        );
      }
      // No try/catch: if `_buildThroughScope()` throws, the caller
      // sees the real error (composite-PK mismatch, join resolution
      // failure, etc.) instead of a silently `none`-coerced proxy.
      // Previous fail-closed catch swallowed deterministic config
      // errors — worse than letting construction fail.
      const throughRel = this._buildThroughScope() as Relation<T>;
      proxySelf.initializeCopy(throughRel);
    } else {
      // Build via the `scope()` seam so CP's inherited Relation
      // state matches `scope()` / direct Relation callers: default
      // scope from `targetModel.all()` is applied, the relation is
      // scope-proxied (so the definition's scope can call named scopes /
      // generated methods on it), and composite-PK validation runs.
      // Then `initializeCopy` onto `this`. Missing owner PK →
      // `_isNone = true` (Rails' NullRelation fallback).
      // `scope()` derives the foreign key, which can raise a
      // `ArgumentError` when the owner's `query_constraints` make the FK
      // underivable. Rails defers that error to load time (the FK is computed
      // lazily inside `load_target`'s scope build), so catch it here, seed a
      // none relation to keep construction valid, and re-throw on load via
      // `_execLoad`. Other errors (composite-PK mismatch guards, etc.) still
      // surface eagerly — they are not part of Rails' lazy-FK contract.
      let seedRel: Relation<T> | null;
      try {
        seedRel = hasManyScope(record, assocName, assocDef) as Relation<T> | null;
      } catch (err) {
        if (err instanceof ArgumentError) {
          this._deferredFkError = err;
          seedNone();
          seedRel = null;
        } else {
          throw err;
        }
      }
      if (seedRel === null) {
        if (this._deferredFkError === undefined) {
          seedNone();
        }
      } else {
        proxySelf.initializeCopy(seedRel);
      }
    }

    // Apply the `extend:` option — mirrors Rails
    // `CollectionProxy#initialize`, which does `extend(*extensions)` with
    // `association.extensions` (`reflection.extensions` =
    // `Array(options[:extend])`). Routing through `extendingBang` (rather
    // than binding methods directly onto the instance) records the
    // modules in `extendingValues`, so extension methods survive every spawned
    // scope (`owner.things.where(...).fooExtension()`) via the rebinding
    // in `initializeCopy`.
    const ext = assocDef.options.extend;
    if (ext) {
      const extensions = Array.isArray(ext) ? ext : [ext];
      relationProto.extendingBang.call(this, ...extensions);
    }
  }

  /**
   * Shared execution core for `toArray()` and `load()`. Routes both the
   * unmutated and mutated (whereBang / orderBang / ...) proxy through a
   * single `findTarget` call. When the proxy state has diverged from the
   * seed, a `queryExecutor` callback is passed so `findTarget` skips cache
   * and scope rebuild and runs the mutated Relation directly — mirrors Rails'
   * `CollectionProxy → AssociationRelation#exec_queries → loadTarget` path
   * which always routes through the OO association regardless of scope state.
   *
   * `_cascadeStrictLoading` is called exactly once here; the Relation's own
   * `strictLoadingValue` is applied afterward so it wins over cascade (Rails
   * applies `strict_loading_value` after `set_strict_loading` per record).
   */
  private async _execLoad(): Promise<T[]> {
    // Re-throw a foreign-key derivation error deferred from construction, so
    // the underivable-FK `ArgumentError` surfaces at load time (Rails'
    // `load_target`), not when the proxy was built.
    if (this._deferredFkError !== undefined) throw this._deferredFkError;
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
   * Load and return all associated records.
   */
  async toArray(): Promise<T[]> {
    // Rails `to_a` → `CollectionProxy#records` → `load_target`
    // (collection_proxy.rb, collection_association.rb) hydrates and caches the
    // association target (`@target = merge_target_lists(...)`) and marks it
    // loaded. Delegate to `load` for that full hydrate-and-cache path.
    //
    // Keep the cache-bypassing re-query path when either (a) an in-place bang
    // mutation (`whereBang`/`orderBang`/...) has diverged the proxy scope — this
    // is effectively a scoped AssociationRelation whose `to_a` runs
    // `exec_queries` without touching the owner's cached target — or (b) the
    // target is not yet loaded and `find_target?` is false: a new-record owner
    // with no foreign key present. Rails' `load_target` only assigns/caches
    // `@target` from a query when `find_target?` (or the target is stale); for
    // the new-record-without-FK case it leaves the in-memory target untouched,
    // which for a through association means re-traversing the in-memory chain
    // (`post.author.books` …) on each read rather than caching a scoped subset.
    //
    // The `!_targetLoaded` guard is essential: `_findTarget()` short-circuits to
    // `false` once loaded (mirroring Rails `find_target?` = `!loaded? && …`), so
    // OR-ing on a bare `!_findTarget()` would send *every* post-load `toArray()`
    // back down the re-query path and defeat caching entirely. `load()` is the
    // hydrate/cache chokepoint for the already-loaded case (including staleness).
    if (!this._targetLoaded && !this._findTarget()) {
      const results = await this._execLoad();
      return this._mergeTargetLists(results);
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
    this._target = this._mergeTargetLists(results);
    this._targetLoaded = true;
    // Snapshot the owner's `@stale_state` NOW (while owner FKs still reflect
    // the load time). Letting it happen later — after a FK change — would
    // capture the wrong state and mask the staleness.
    this._staleWrapper()?.loadedBang?.();
    return this._target;
  }

  /**
   * Merge freshly-loaded DB rows with the in-memory `_target`, mirroring Rails'
   * `CollectionAssociation#merge_target_lists` (collection_association.rb): for
   * each DB row, prefer the matching in-memory instance by primary key (so
   * unsaved attribute changes and scheduled destroys are preserved), copying DB
   * values only onto attributes not changed in memory; then append the in-memory
   * new records that have no DB counterpart. Used by both `toArray` (Rails
   * `to_a`) and `load` so both surface in-memory state the same way.
   * @internal
   */
  private _mergeTargetLists(results: T[]): T[] {
    const existingByPk = new Map<string, T>();
    for (const r of this._target) {
      const id = this._identityFor(r);
      if (id != null) existingByPk.set(id, r);
    }
    const merged: T[] = results.map((dbRecord) => {
      const id = this._identityFor(dbRecord);
      if (id == null || !existingByPk.has(id)) return dbRecord;
      const memRecord = existingByPk.get(id)!;
      this._refreshUnchangedAttributes(memRecord, dbRecord);
      return memRecord;
    });
    const unsaved = this._target.filter((r) => r.isNewRecord());
    return unsaved.length > 0 ? [...merged, ...unsaved] : merged;
  }

  /**
   * Reconcile a fresh DB record with the matching in-memory record, mirroring
   * the attribute merge inside Rails' `CollectionAssociation#merge_target_lists`
   * (collection_association.rb): for every attribute the two share, copy the
   * database value onto the in-memory record *unless* that attribute carries an
   * unsaved change or is readonly. Unsaved updates and scheduled destroys win;
   * every other attribute reflects the database. This keeps the in-memory
   * instance (so order, identity, and dirty/destroy state are preserved) while
   * refreshing its untouched columns from the just-loaded row.
   * @internal
   */
  private _refreshUnchangedAttributes(memRecord: T, dbRecord: T): void {
    const memClass = memRecord.constructor as typeof Base;
    // Rails intersects the *instance* `attribute_names` of both records
    // (collection_association.rb:340) — the actually-loaded keys, not the class
    // set — so a collection loaded under a `select` projection only refreshes
    // the columns both rows actually carry. The instance
    // `attributeNames()` reads `_attributes.keys()`; using the class-level
    // static would write columns absent from a partially-loaded dbRecord.
    const dbNames = new Set(dbRecord.attributeNames());
    const changed = new Set(
      (memRecord as unknown as { changedAttributeNamesToSave: string[] })
        .changedAttributeNamesToSave,
    );
    const readonly = new Set(memClass.readonlyAttributes);
    // We iterate the intersection of loaded attribute names (not aliases/virtual
    // reads), so the low-level `_readAttribute` is equivalent to Rails'
    // `record[name]` (`read_attribute`, collection_association.rb:342) for every
    // name here — the value is already type-cast from the fresh row. Both sides
    // use the raw read/write pair, mirroring `_write_attribute` on the Rails side.
    for (const name of memRecord.attributeNames()) {
      if (!dbNames.has(name) || changed.has(name) || readonly.has(name)) continue;
      memRecord._writeAttribute(name, dbRecord._readAttribute(name));
    }
  }

  private _identityFor(r: Base): string | null {
    const pk = (r.constructor as typeof Base).primaryKey;
    if (Array.isArray(pk)) {
      const vals = pk.map((col) => r._readAttribute(col));
      if (vals.some((v) => v == null)) return null;
      // Stringify each column value (matching the scalar branch below) so a
      // BigInt PK value — how PG/MariaDB surface a bigint `id` — is serializable;
      // JSON.stringify throws on a raw BigInt.
      return JSON.stringify(vals.map((v) => String(v)));
    }
    const val = r._readAttribute(pk);
    return val == null ? null : String(val);
  }

  private get _isThrough(): boolean {
    return !!this._assocDef.options.through;
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

  private _ensureThroughWritable(): void {
    if (!this._isThrough) return;
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new HasManyThroughOrderError(
        ctor.name,
        this._assocName,
        this._assocDef.options.through as string,
      );
    }

    if (throughAssoc.type === "hasOne" && !throughAssoc.options.through) {
      throw new HasManyThroughCantAssociateThroughHasOneOrManyReflection(
        ctor.name,
        this._assocName,
      );
    }

    // Nested through: the through association is itself a through association
    const isNestedThrough =
      throughAssoc.options.through ||
      (throughAssoc.type as string) === "hasManyThrough" ||
      (throughAssoc.type as string) === "hasOneThrough";
    if (isNestedThrough) {
      if (this._assocDef.type === "hasOne" || (this._assocDef.type as string) === "hasOneThrough") {
        throw new HasOneThroughNestedAssociationsAreReadonly(ctor.name, this._assocName);
      }
      throw new HasManyThroughNestedAssociationsAreReadonly(ctor.name, this._assocName);
    }
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
   * Owner FK column(s) from the reflection, which derives them from the class
   * that *declared* the association (`reflection.active_record`), not the owner
   * instance's class. For an STI subclass owner (e.g. a `SpecialPost` whose
   * `has_many :special_comments` is declared on `Post`) this yields `post_id`,
   * not `special_post_id` — mirrors Rails `reflection.foreign_key`. Returns
   * undefined for anonymous inline associations with no registered reflection,
   * so callers fall back to the owner-class derivation.
   * @internal
   */
  private _reflectionForeignKey(): string | string[] | undefined {
    return this.reflection.foreignKey ?? undefined;
  }

  /**
   * Bulk insert/upsert through a collection association. Mirrors
   * ActiveRecord::AssociationRelation, which guards `insert`, `insert_all`,
   * `insert!`, `insert_all!`, `upsert`, and `upsert_all`: when the
   * association is `has_many :through`, it raises ArgumentError because the
   * join records can't be built from the bulk path. Non-through associations
   * fall through to the inherited Relation implementation.
   */
  private _assertBulkInsertable(): void {
    if (this.isThrough) {
      throw new ArgumentError(
        "Bulk insert or upsert is currently not supported for has_many through association",
      );
    }
  }

  async insert(
    attrs: Record<string, unknown>,
    options?: { uniqueBy?: string | string[] },
  ): ReturnType<Relation<T>["insert"]> {
    this._assertBulkInsertable();
    return super.insert(attrs, options);
  }

  async insertBang(
    ...args: Parameters<Relation<T>["insertBang"]>
  ): ReturnType<Relation<T>["insertBang"]> {
    this._assertBulkInsertable();
    return super.insertBang(...args);
  }

  async insertAll(
    ...args: Parameters<Relation<T>["insertAll"]>
  ): ReturnType<Relation<T>["insertAll"]> {
    this._assertBulkInsertable();
    return super.insertAll(...args);
  }

  async insertAllBang(
    ...args: Parameters<Relation<T>["insertAllBang"]>
  ): ReturnType<Relation<T>["insertAllBang"]> {
    this._assertBulkInsertable();
    return super.insertAllBang(...args);
  }

  async upsert(
    attrs: Record<string, unknown>,
    options?: { uniqueBy?: string | string[] },
  ): ReturnType<Relation<T>["upsert"]> {
    this._assertBulkInsertable();
    return super.upsert(attrs, options);
  }

  async upsertAll(
    ...args: Parameters<Relation<T>["upsertAll"]>
  ): ReturnType<Relation<T>["upsertAll"]> {
    this._assertBulkInsertable();
    return super.upsertAll(...args);
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
   * Alias for count.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#size
   */
  async size(): Promise<number> {
    // Mirrors CollectionAssociation#size (collection_association.rb) branch
    // ordering exactly.
    //
    // `!find_target? || loaded?` → return the in-memory target size. A loaded
    // target is authoritative; an unloaded one is only authoritative when the
    // target can't be fetched (new-record owner without a foreign key).
    if (this._targetLoaded || !this._findTarget()) {
      return this._target.length;
    }
    // `@association_ids` cached by a prior ids_reader → its length, no query.
    const cachedIds = this._cachedAssociationIds();
    if (cachedIds) {
      return cachedIds.length;
    }
    // GROUP BY present → a grouped COUNT(*) returns per-group rows rather than
    // a scalar, so Rails loads the full target and counts it in memory.
    if (this.groupValues.length > 0) {
      return (await this.loadTarget()).length;
    }
    // No DISTINCT and unsaved records buffered → add them to the persisted
    // COUNT(*) rather than ignoring them.
    if (!this.distinctValue && this._target.length > 0) {
      const unsaved = this._target.filter((r) => r.isNewRecord()).length;
      return unsaved + (await this._countRecords());
    }
    return this._countRecords();
  }

  /**
   * Mirrors ActiveRecord::Associations::HasManyAssociation#count_records
   * (has_many_association.rb): prefer an active counter cache, otherwise issue
   * a `COUNT(*)`; purge non-new records and mark the target loaded when the DB
   * is empty (a documented side-effect that can avoid an extra SELECT); finally
   * clamp the result to the association scope's `limit_value`.
   * @internal
   */
  private _countRecords(): Promise<number> {
    const reflection = this.reflection;
    return countRecords({
      hasActiveCachedCounter: () => reflection.hasActiveCachedCounter?.() ?? false,
      counterCacheColumn: () => reflection.counterCacheColumn?.() ?? null,
      readCounterAttribute: (col) => this._record.readAttribute(col),
      // has_many_association.rb:84 `scope.count(:all)`: the `:all` keeps a
      // `select` declared on the association off the COUNT.
      countViaScope: () => this.count("all") as Promise<number>,
      // Rails clamps by `association_scope.limit_value` — the association's own
      // scope, not any in-place proxy (`whereBang`/`limitBang`) mutation. So we
      // read the limit from the rebuilt scope even on the diverged count path,
      // matching count_records rather than the ad-hoc query limit.
      limitValue: () =>
        (this.scope() as { limitValue?: number | null } | undefined)?.limitValue ?? null,
      retainOnlyNewRecords: () => {
        this._target = this._target.filter((r) => r.isNewRecord());
      },
      markLoaded: () => {
        this._targetLoaded = true;
      },
    });
  }

  /**
   * Mirrors Association#find_target? — whether the target can be fetched.
   * False when loaded (the caller short-circuits on `_targetLoaded`) or when
   * the owner is a new record lacking the foreign key needed to query.
   * @internal
   */
  private _findTarget(): boolean {
    if (this._targetLoaded) return false;
    return !this._record.isNewRecord() || this._foreignKeyPresent();
  }

  /**
   * Whether the target can be fetched for a new-record owner. A has_many :through
   * routes through a belongs_to (`ThroughAssociation#foreign_key_present?`,
   * through_association.rb:90); a vanilla has_many requires the owner's
   * `active_record_primary_key` to be present (`ForeignAssociation#foreign_key_present?`,
   * foreign_association.rb:5). The same two-branch dispatch runs in
   * `CollectionAssociation#foreignKeyPresent`, so the proxy and the OO
   * association agree on both the through and non-through paths.
   * @internal
   */
  private _foreignKeyPresent(): boolean {
    const reflection = this.reflection;
    // No registered reflection: the fallback carries none of the key readers below.
    if (reflection.klass == null) return false;
    if (this._assocDef.options.through) {
      return throughForeignKeyPresent({ owner: this._record, reflection });
    }
    return foreignKeyPresentFor(reflection as AssociationReflection, this._record);
  }

  /**
   * Mirrors the `@association_ids` ivar read in CollectionAssociation#size —
   * the ids cache lives on the owner's association instance (populated by a
   * prior `collectionIds` reader), not on the proxy. Returns null when unset.
   * @internal
   */
  private _cachedAssociationIds(): unknown[] | null {
    const assocInstance = (this._record as any)._associationInstances?.get(this._assocName);
    const ids = assocInstance?._associationIds;
    return Array.isArray(ids) ? ids : null;
  }

  /**
   * Check if the collection is empty.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#empty?
   */
  async isEmpty(): Promise<boolean> {
    if (this._targetLoaded) return this._target.length === 0;
    if (this._target.length > 0) return false;
    // Through associations: #exists always loads the full target, so prefer
    // count() which routes through AssociationScope as a SQL COUNT for the
    // common shapes (findTarget fallback still loads for the rest).
    if (this._isThrough) return (await this.count()) === 0;
    // Mirrors Rails collection_association.rb#empty?:
    //   if loaded? || @association_ids || reflection.has_active_cached_counter?
    //     size.zero?  → count_records (reads counter cache; marks loaded when 0)
    //   else
    //     target.empty? && !scope.exists?  (no side effects, never marks loaded)
    // Using _countRecords unconditionally was a regression: when count=0 it calls
    // markLoaded(), so a later isEmpty() reads a stale empty cache instead of
    // querying the DB again after records were created.
    let activeCachedCounter = false;
    try {
      activeCachedCounter = this.reflection.hasActiveCachedCounter?.() ?? false;
    } catch {
      // hasActiveCachedCounter can throw when referenced models are not yet
      // registered (e.g. inverseWhichUpdatesCounterCache calls c.klass).
    }
    // Rails empty? → size.zero?, and size returns @association_ids.length when
    // a prior ids_reader cached them (no query). Only fall back to count_records
    // when the size comes from a counter cache rather than cached ids.
    const cachedIds = this._cachedAssociationIds();
    if (cachedIds !== null) {
      return cachedIds.length === 0;
    }
    if (activeCachedCounter) {
      return (await this._countRecords()) === 0;
    }
    return !(await this.exists());
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
   * share ONE in-memory target (`_sharedTarget`), so the appended records,
   * loaded-ness, `@replaced_or_added_targets` dedup and before/after_add
   * callbacks all land on this proxy too.
   */
  async push(...records: T[]): Promise<Omit<this, "then"> | false> {
    this._ensureThroughWritable();
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
   * Resolve the composite-aware owner FK / PK column pairs for a through
   * association, raising on length mismatch. Mirrors how Rails relies on
   * `Array(association_primary_key)` matching the reflection's foreign key
   * shape inside `construct_join_attributes` (through_association.rb).
   * @internal
   */
  private _throughOwnerCols(
    throughAssoc: AssociationDefinition,
    ctor: typeof Base,
  ): { fkCols: string[]; pkCols: string[] } {
    // Rails reads owner attributes straight off the through reflection:
    // `through_reflection.foreign_key` / `through_reflection.active_record_primary_key`
    // (through_association.rb:84). The rich Reflection already computes every
    // case the join/preload paths use — `foreignKey` runs the option →
    // queryConstraints → deriveFkQueryConstraints resolution (reflection.ts:781),
    // and `activeRecordPrimaryKey` runs the option → queryConstraintsList →
    // id-collapse resolution (reflection.ts:1049) — and both derive from the
    // class that *declared* the association (`reflection.active_record`), so an
    // STI subclass owner resolves `post_id` not `special_post_id`. Delegate
    // rather than keep a parallel copy.
    const reflection = ctor._reflectOnAssociation?.(throughAssoc.name) as
      | { foreignKey?: string | string[]; activeRecordPrimaryKey?: string | string[] }
      | undefined;

    // Only the unregistered/anonymous owner (no reflection) falls back to the
    // conventional `<owner>_id` against the owner's primary key.
    const ownerFk: string | string[] =
      reflection?.foreignKey ??
      throughAssoc.options.foreignKey ??
      throughAssoc.options.queryConstraints ??
      `${underscore(ctor.name)}_id`;
    const fkCols = Array.isArray(ownerFk) ? ownerFk : [ownerFk];

    let ownerPk: string | string[];
    if (reflection?.activeRecordPrimaryKey !== undefined) {
      ownerPk = reflection.activeRecordPrimaryKey;
    } else if (throughAssoc.options.primaryKey !== undefined) {
      ownerPk = throughAssoc.options.primaryKey;
    } else if (
      // Reflection-less fallback only: reproduce Reflection#activeRecordPrimaryKey's
      // id-collapse (reflection.ts:1063-1065) — a scalar FK against a composite PK
      // that includes "id" pairs with the scalar "id" column.
      fkCols.length === 1 &&
      Array.isArray(ctor.primaryKey) &&
      ctor.primaryKey.includes("id")
    ) {
      ownerPk = "id";
    } else {
      ownerPk = ctor.primaryKey;
    }
    const pkCols = Array.isArray(ownerPk) ? ownerPk : [ownerPk];
    if (fkCols.length !== pkCols.length) {
      throw new Error(
        `Composite primaryKey/foreignKey mismatch on through "${this._assocName}": ${pkCols.length} pk vs ${fkCols.length} fk`,
      );
    }
    return { fkCols, pkCols };
  }

  /**
   * Resolve the polymorphic `<as>_id`/`<as>_type` column descriptor for a
   * polymorphic-through. The schema is intrinsically scalar, so the owner
   * PK collapses to "id" when composite-with-id (matching Rails' polymorphic
   * derivation) and otherwise to the scalar/first PK column. Used by every
   * polymorphic-through write/read site to keep them in lock-step.
   * @internal
   */
  private _throughOwnerPolymorphic(
    throughAssoc: AssociationDefinition,
    ctor: typeof Base,
    asName: string,
  ): { idCol: string; idValue: unknown; typeCol: string; typeValue: string } {
    const polyFk = throughAssoc.options.foreignKey ?? `${underscore(asName)}_id`;
    if (Array.isArray(polyFk)) {
      // Polymorphic associations have only one `<as>_id`/`<as>_type` pair
      // in the schema, so a composite foreignKey is unrepresentable.
      // Matches the rejection at associations.ts:829-833 / :1028-1032.
      throw new ConfigurationError(
        `Polymorphic-through "${this._assocName}" cannot use a composite foreign key — ` +
          `the schema only supports a single \`${underscore(asName)}_id\`/\`${underscore(asName)}_type\` pair.`,
      );
    }
    const idCol = polyFk;
    // The polymorphic schema (`<as>_id`/`<as>_type`) only carries a scalar
    // owner identifier. When the owner has a composite PK, Rails' `join_id_for`
    // (reflection.rb:642-644) collapses to the `id` component when present.
    // We match that: if the CPK includes "id", use "id"; otherwise the CPK
    // cannot collapse to a scalar and we raise CompositePrimaryKeyMismatchError.
    const ownerPkOption = throughAssoc.options.primaryKey;
    if (Array.isArray(ownerPkOption) && !ownerPkOption.includes("id")) {
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message.
      routeThroughCheckValidity(ctor, this._assocName);
      // No reflection resolvable (polymorphic collapse) — minimal fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: this._assocName,
        primaryKey: ownerPkOption,
        foreignKey: idCol,
      });
    }
    const resolvedPkOption = Array.isArray(ownerPkOption) ? "id" : ownerPkOption;
    const ctorPk = ctor.primaryKey;
    if (Array.isArray(ctorPk) && !ctorPk.includes("id")) {
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message.
      routeThroughCheckValidity(ctor, this._assocName);
      // No reflection resolvable (polymorphic collapse) — minimal fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: this._assocName,
        primaryKey: ctorPk,
        foreignKey: idCol,
      });
    }
    const resolvedCtorPk = Array.isArray(ctorPk) ? "id" : ctorPk;
    const polyPk = resolvedPkOption ?? resolvedCtorPk;
    return {
      idCol,
      idValue: this._record._readAttribute(polyPk),
      // Rails derives the type column as reflection.type =
      // options[:foreign_type] || "#{options[:as]}_type" (reflection.rb:519).
      typeCol: throughAssoc.options.foreignType ?? `${underscore(asName)}_type`,
      typeValue: ctor.name,
    };
  }

  /** @internal Builds an FK→ownerPkValue map for join-row WHERE/INSERT shapes. */
  private _throughOwnerAttrs(
    throughAssoc: AssociationDefinition,
    ctor: typeof Base,
  ): Record<string, unknown> {
    const { fkCols, pkCols } = this._throughOwnerCols(throughAssoc, ctor);
    const attrs: Record<string, unknown> = {};
    for (let i = 0; i < fkCols.length; i++) {
      attrs[fkCols[i]] = this._record._readAttribute(pkCols[i]);
    }
    return attrs;
  }

  /**
   * Rails has no `_pushThrough`: `CollectionProxy#<<` is
   * `proxy_association.concat(records)` (collection_proxy.rb:1053), and every
   * join-row decision lives on `HasManyThroughAssociation#concat_records` /
   * `#insert_record` (has_many_through_association.rb:24-49). This is that
   * delegation. The proxy and the association object share ONE in-memory target
   * (`_sharedTarget`, `collection-association.ts:96`), so routing the write onto
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
  /** @internal The OO association object backing this through-collection. */
  private _throughAssociation(): ThroughAssociationHandle {
    return this._record.association(this._assocName) as unknown as ThroughAssociationHandle;
  }

  private async _pushThrough(records: T[], throughScope?: unknown): Promise<void> {
    const assoc = this._throughAssociation();
    const previousThroughScope = assoc._throughScope;
    if (throughScope != null) assoc._throughScope = throughScope;
    try {
      await assoc.concat(...records);
    } finally {
      assoc._throughScope = previousThroughScope;
    }
    this._invalidateAssociationIds();
  }

  private _invalidateAssociationIds(): void {
    // `@offsets = @take = nil; @scope = nil` (collection_proxy.rb:1112-1116).
    this.resetScope();
    const assocInstance = (this._record as any)._associationInstances?.get(this._assocName);
    if (assocInstance) {
      assocInstance._associationIds = null;
      // Rails' `insert_record` ends in `reset_scope` (collection_association.rb),
      // which drops the memoized `@association_scope` — NOT `reset`, which now
      // shares one array with this proxy and would discard the record just added.
      if (typeof assocInstance.resetScope === "function") {
        assocInstance.resetScope();
      }
      assocInstance._namedScopeRelations = undefined;
    }
  }

  /**
   * Walk the through-chain looking for `record` via the source reflection.
   * Mirrors the through branch of
   * `CollectionAssociation#include_in_memory?` —
   * `assoc.reader.any? { |source| source.send(source_reflection.name)... }`.
   */
  private async _includeInMemoryThrough(record: T): Promise<boolean> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughName = this._assocDef.options.through!;
    const throughAssoc = associations.find((a: any) => a.name === throughName);
    if (!throughAssoc) return false;
    // Rails reads `reflection.source_reflection.name` — the *actual* source
    // association name, which for a collection source (e.g. `has_many :comments
    // through: :posts`, source `Post#comments`) is plural. `singularize` would
    // mis-guess `comment`, so prefer the resolved source reflection.
    const sourceRefl = (this.reflection as { sourceReflection?: { name?: string } })
      .sourceReflection;
    const sourceName =
      sourceRefl?.name ?? this._assocDef.options.source ?? singularize(this._assocName);
    const sources = (await (this._record as any)[throughName]) as Base[] | undefined;
    if (!sources) return false;
    for (const joinRecord of sources) {
      const source = await (joinRecord as any)[sourceName];
      if (source == null) continue;
      if (Array.isArray(source)) {
        if (source.includes(record)) return true;
      } else if (source === record) {
        return true;
      }
    }
    return false;
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

  private _removeFromTarget(records: Base[]): void {
    const pkIdentities = new Set<string>();
    const nullPkRecords = new Set<Base>();
    for (const r of records) {
      const id = this._identityFor(r);
      if (id == null) {
        nullPkRecords.add(r);
      } else {
        pkIdentities.add(id);
      }
    }

    this._target = this._target.filter((r) => {
      const id = this._identityFor(r);
      if (id != null) return !pkIdentities.has(id);
      return !nullPkRecords.has(r);
    });
    this._invalidateAssociationIds();
  }

  /**
   * Decrement the owner's counter cache by `count`, mirroring Rails
   * `CollectionAssociation#update_counter` for the bulk delete/nullify path.
   */
  private async _decrementCounterCache(count: number): Promise<void> {
    let column: string | null = this._assocDef.options.counterCache
      ? String(this._assocDef.options.counterCache)
      : null;
    // A has_many without an explicit `counter_cache:` may still update a counter
    // through the child's belongs_to inverse (e.g. Car.engines ← Engine
    // belongs_to :my_car, counter_cache: :engines_count). The bulk delete path
    // bypasses the child callbacks, so resolve the reflection's cached-counter
    // column and decrement it here, matching Rails' `update_counter(-count)`.
    if (!column) {
      const refl = this.reflection;
      if (refl.hasCachedCounter?.()) column = refl.counterCacheColumn?.() ?? null;
    }
    if (!column) return;
    const owner = this._record as any;
    if (typeof owner.incrementBang === "function") {
      await owner.incrementBang(column, -count);
    } else if (typeof owner.updateCounters === "function") {
      await owner.updateCounters({ [column]: -count });
    } else if (typeof owner.increment === "function") {
      owner.increment(column, -count);
    }
  }

  private _buildNullifyUpdates(): Record<string, null> {
    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;
    const foreignKey =
      this._assocDef.options.foreignKey ??
      this._reflectionForeignKey() ??
      this._assocDef.options.queryConstraints ??
      (asName
        ? `${underscore(asName)}_id`
        : Array.isArray(primaryKey)
          ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`);
    const updates: Record<string, null> = {};
    if (Array.isArray(foreignKey)) {
      for (const fk of foreignKey) updates[fk] = null;
    } else {
      updates[foreignKey] = null;
    }
    if (asName) updates[this._assocDef.options.foreignType ?? `${underscore(asName)}_type`] = null;
    return updates;
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
   * Remove all records from the collection by nullifying FKs.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#clear
   */
  async clear(): Promise<void> {
    // Rails' `clear` → `delete_all` → through `delete_records` runs through
    // `ensure_mutable` / the nested-through readonly check; mirror `deleteAll`
    // and the prior per-record `delete` path by enforcing the same guard
    // before touching join rows.
    this._ensureThroughWritable();
    return this._withoutStrictLoading(async () => {
      // A new-record owner whose scope is a `null_scope?` has no persisted
      // children to delete or nullify, so Rails' `scope.none!`
      // (collection_association.rb:300-305) makes the delete/nullify a no-op.
      // `null_scope?` is `owner.new_record? && !foreign_key_present?`, so a new
      // owner WITH the owner PK present (e.g. a client-assigned UUID) still
      // queries — only the genuinely keyless new owner short-circuits. Reset
      // the in-memory target without touching the DB in that case.
      if (this.isNullScope()) {
        this._target = [];
        this._targetLoaded = true;
        this._invalidateAssociationIds();
        return;
      }
      // Rails' `clear` routes through `delete_all`, which removes the rows in
      // bulk and does NOT run `before_remove`/`after_remove` callbacks (those
      // live in `remove_records`, not the delete path) — unlike per-record
      // `delete`.
      if (this._isThrough) {
        // Mirror `delete_or_nullify_all_records` → `delete_records(load_target,
        // method)` (has_many_through_association.rb:136-175): destroy the join
        // rows for the loaded target so the join model's `belongsTo`
        // counter-cache callbacks still fire, without the collection
        // before/after-remove callbacks. Like Rails, this follows the
        // association-layer `load_target` (the full association target), not
        // the proxy's in-place relation state.
        const assoc = this._record.association(this._assocName) as unknown as {
          loadTarget: () => Promise<Base[]>;
          deleteRecords: (records: Base[], method: string) => Promise<number>;
        };
        const target = await assoc.loadTarget();
        if (target.length > 0) {
          await assoc.deleteRecords(target, (this._assocDef.options.dependent as string) ?? "");
        }
        // The whole association target was cleared (load_target, not the
        // diverged proxy scope), so reset the full in-memory target the way
        // `deleteAll` does — pruning only the pre-clear `toArray()` subset
        // would leave stale records for `size()`/`isEmpty()` to read.
        this._target = [];
        this._targetLoaded = true;
        this._invalidateAssociationIds();
        return;
      }
      // Capture the records to prune BEFORE removing — afterwards a delete /
      // nullified FK makes a reload return nothing. Only the non-through path
      // needs this; the through branch returns early after a full reset, so its
      // `toArray()` load is avoided entirely.
      const records = await this.toArray();
      // Honor the association's `:dependent` like Rails `delete_all` (nil arg):
      // `dependent == :destroy` collapses to `:delete_all`, so
      // destroy/delete/delete_all bulk-DELETE the child rows while
      // nullify/default nullify the owner FK — all without per-record remove
      // callbacks (collection_association.rb:150-167 + has_many_association.rb:112-118).
      const dep = this._assocDef.options.dependent as string | undefined;
      const deleteRows =
        dep === "destroy" || dep === "delete" || dep === "delete_all" || dep === "deleteAll";
      let count: number;
      if (deleteRows) {
        count = await this.scope().deleteAll();
      } else {
        count = await this.scope().updateAll(this._buildNullifyUpdates());
      }
      // Rails `delete_records` else-branch: update_counter(-delete_count). The
      // bulk DELETE/UPDATE bypasses the child's belongs_to callbacks, so decrement
      // the owner's counter cache by the affected count here (matching the
      // per-record `delete` path). `clear` collapses `:destroy` to a bulk delete,
      // so this fires for delete_all/nullify alike, never the gated destroy branch.
      if (count > 0) await this._decrementCounterCache(count);
      this._removeFromTarget(records);
      this._invalidateAssociationIds();
    });
  }

  /**
   * Check if a record is in the collection.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#include?
   */
  async isInclude(record: T): Promise<boolean> {
    // Rails `include?` short-circuits on type mismatch — a record whose
    // class is unrelated to the reflection's `klass` can never be in the
    // target. Without this guard, a bogus record would issue a needless
    // `exists?` query and might silently match a row with the same PK on
    // the wrong table.
    // Mirrors `ActiveRecord::Associations::CollectionAssociation#include?`
    // (`return false unless record.is_a?(reflection.klass)`).
    if (!this._assocDef.options.polymorphic) {
      const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
      const klass = resolveAssocClass(this._record, this._assocName, className);
      if (!(record instanceof klass)) return false;
    }
    if (record.isNewRecord()) {
      // Mirrors `CollectionAssociation#include_in_memory?`: for through
      // associations, walk the through target looking for `record` via the
      // source reflection; OR fall back to the local target. For
      // non-through associations, just check the local target.
      if (this._assocDef.options.through) {
        if (await this._includeInMemoryThrough(record)) return true;
      }
      return this._target.includes(record);
    }

    if (this._targetLoaded) {
      const targetId = this._identityFor(record);
      if (targetId != null) {
        return this._target.some((r) => this._identityFor(r) === targetId);
      }
      return this._target.includes(record);
    }

    const primaryKey = (record.constructor as typeof Base).primaryKey;
    const s = this.scope();
    if (typeof s.exists === "function") {
      if (Array.isArray(primaryKey)) {
        const condition: Record<string, unknown> = {};
        let allPresent = true;
        for (const key of primaryKey) {
          const value = record._readAttribute(key);
          if (value == null) {
            allPresent = false;
            break;
          }
          condition[key] = value;
        }
        if (allPresent) return s.exists(condition);
      } else {
        const pkValue = record._readAttribute(primaryKey);
        if (pkValue != null) return s.exists({ [primaryKey]: pkValue });
      }
    }

    const loaded = await this.loadTarget();
    const targetId = this._identityFor(record);
    if (targetId != null) {
      return loaded.some((r) => this._identityFor(r) === targetId);
    }
    return loaded.includes(record);
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
    if (this._isThrough) {
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
   * Replace the collection with a new set of records, performing a diff so
   * only the records that actually changed are deleted/added — records common
   * to the old and new sets are left in place (no remove/add callbacks, no
   * timestamp touches).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#replace →
   * `CollectionAssociation#replace` (collection_association.rb:242), returning
   * the resulting target (`other_array` when nothing changed).
   */
  async replace(records: T[]): Promise<T[]> {
    this._ensureThroughWritable();
    this._raiseOnTypeMismatch(records);
    const originalTarget = [...(await this._withoutStrictLoading(() => this.toArray()))];
    if (this._record.isNewRecord()) {
      return this._replaceRecords(records, originalTarget);
    }
    this._replaceCommonRecordsInMemory(records, originalTarget);
    if (sameRecordList(records, originalTarget)) return records;
    let replaced: T[] = this._target;
    await this._replaceTransaction(async () => {
      replaced = await this._replaceRecords(records, originalTarget);
    });
    return replaced;
  }

  /**
   * Rails' `replace_records` (collection_association.rb:418): delete the
   * records the new target dropped, then concat the ones it gained, restoring
   * the original target and raising when the concat fails.
   *
   * `target` tracks Rails' `@target` across the two diffs. It is a local copy
   * because the proxy's `_target` is only populated when the association is
   * genuinely loaded (a diverged or `find_target?`-false `toArray()` returns
   * records without caching them), which would silently make the delete diff a
   * no-op. The delete step applies Rails' `remove_records`
   * (collection_association.rb:405) mutation verbatim: `@target -= records` is
   * plain `Array#-`, which drops EVERY occurrence of a deleted record, not the
   * `difference` hook's per-occurrence count. For a `:through` reflection that
   * is what makes `[david, david].replace([david])` delete both join rows and
   * re-concat a fresh one, exactly as Rails does — and it matches what
   * `_removeFromTarget` does to the real `_target`.
   * @internal
   */
  private async _replaceRecords(newTarget: T[], originalTarget: T[]): Promise<T[]> {
    let target = [...originalTarget];
    const toDelete = this._difference(target, newTarget);
    if (toDelete.length > 0) {
      await this.delete(...toDelete);
      target = setDifference(target, toDelete) as T[];
    }
    const toAdd = this._difference(newTarget, target);
    if (toAdd.length > 0 && (await this.push(...toAdd)) === false) {
      this._target = [...originalTarget];
      throw new RecordNotSaved(
        `Failed to replace ${this._assocName} because one or more of the new records could not be saved.`,
        this._record,
      );
    }
    return this._target;
  }

  /**
   * Rails' `replace_common_records_in_memory` (collection_association.rb:430):
   * swap each record the two sets share into the target in place, skipping the
   * add callbacks.
   * @internal
   */
  private _replaceCommonRecordsInMemory(newTarget: T[], originalTarget: T[]): void {
    for (const record of this._intersection(newTarget, originalTarget)) {
      this._collectionAssociation().replaceOnTarget(record, true, { replace: true }) as Base | null;
    }
  }

  /**
   * `difference`/`intersection` are the hooks Rails splits across
   * `HasManyAssociation` (set: `a - b`, `a & b`) and
   * `HasManyThroughAssociation` (multiset, occurrence-counting — which is what
   * makes `post.people = [person, person]` create two join rows). The proxy is
   * a single class serving both reflection kinds, so it selects by
   * `_isThrough` rather than by inheritance, reusing the very bodies those two
   * classes install.
   * @internal
   */
  private _difference(a: T[], b: T[]): T[] {
    return (this._isThrough ? multisetDifference(a, b) : setDifference(a, b)) as T[];
  }

  /** @internal */
  private _intersection(a: T[], b: T[]): T[] {
    return (this._isThrough ? multisetIntersection(a, b) : setIntersection(a, b)) as T[];
  }

  /**
   * Rails wraps `replace_records` in `transaction`, which
   * `ThroughAssociation#transaction` overrides to use the through model's.
   * @internal
   */
  private async _replaceTransaction(block: () => Promise<void>): Promise<void> {
    const throughModel = this._isThrough ? this._resolveThroughModel() : null;
    if (throughModel && typeof throughModel.transaction === "function") {
      await throughModel.transaction(block);
      return;
    }
    await this.transaction(block);
  }

  /**
   * The join model class behind a `:through` reflection, or `null` when the
   * through association can't be resolved (the misconfiguration cases are
   * already reported by `_ensureThroughWritable`).
   * @internal
   */
  private _resolveThroughModel(): typeof Base | null {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) return null;
    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    return resolveAssocClass(this._record, throughAssoc.name, throughClassName);
  }

  /**
   * Destroy all records in the collection (runs callbacks, deletes from DB).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#destroy_all
   */
  async destroyAll(): Promise<T[]> {
    const records = await this.toArray();
    await this.destroy(...records);
    this._invalidateAssociationIds();
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
   * Set the collection to exactly the records identified by ids, e.g.
   * `order.book_ids = [...]`.
   *
   * Delegates to `CollectionAssociation#idsWriter` — the same method the
   * generated `<name>_ids=` writer calls — so there is one Rails-faithful
   * `ids_writer` and tests exercise the real writer path. Mirrors Rails'
   * `CollectionProxy`, which forwards `ids_writer` to its `@association`.
   */
  async setIds(ids: (number | string | (number | string)[])[]): Promise<void> {
    await (
      this._record.association(this._assocName) as unknown as {
        idsWriter(ids: unknown[]): Promise<void>;
      }
    ).idsWriter(ids);
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
    // _loaded, _loadToken, _loadAsyncPromise) is cleared alongside the
    // association-specific target cache. Without super, callers using
    // Relation#load() / Relation#loadAsync() patterns on the proxy
    // would see stale results after reset.
    super.reset();
    this._targetLoaded = false;
    this._target = [];
    this._replacedOrAddedTargets.clear();
    // Drop the OO association's memoized named-scope relations (Rails'
    // `reset_scope`) so the next `things.someScope()` rebuilds. Only an
    // already-built instance can hold a cache, so don't construct one here.
    const assoc = (this._record as any)._associationInstances?.get(this._assocName) as
      | { _namedScopeRelations?: Map<string, unknown> }
      | undefined;
    if (assoc) assoc._namedScopeRelations = undefined;
    this.resetScope();
    return this;
  }

  /**
   * Build (or return the memoized) named-scope relation for `name`. This memo
   * is trails-specific (RFC 0030): Rails' `scope :name` rebuilds a fresh
   * relation on every call (named.rb:174-178) — it does NOT cache the named-
   * scope return value (only `@association_scope` inside `Association#scope` is
   * memoized). We cache per scope name so two consecutive zero-arg calls within
   * one association load return the same object. The cache lives on the OO
   * `CollectionAssociation` so a reset driven through
   * `owner.association(:things)` invalidates it even though the proxy and the
   * association are distinct objects here. Only zero-arg scope calls are
   * memoized — arg'd calls vary per invocation and rebuild fresh, sidestepping
   * any need to key on (potentially unserializable) arguments. The memo is safe
   * because the underlying `scope()` is stable within one load: every owner-
   * state change that would alter it (reload / insert / remove / destroy_all /
   * delete_all / reset) routes through `CollectionAssociation#reset`, which
   * clears this cache.
   * @internal
   */
  _cachedNamedScopeRelation(name: string, args: unknown[]): unknown {
    if (args.length > 0) {
      return (this.scope() as Record<string, (...a: unknown[]) => unknown>)[name](...args);
    }
    const assoc = this._record.association(this._assocName) as unknown as {
      _namedScopeRelations?: Map<string, unknown>;
    };
    const cache = (assoc._namedScopeRelations ??= new Map());
    if (cache.has(name)) return cache.get(name);
    const built = (this.scope() as Record<string, () => unknown>)[name]();
    cache.set(name, built);
    return built;
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

  private _buildThroughScope(): any {
    const ctor = this._record.constructor as typeof Base;
    // Rails' scope IS the JOIN-based AssociationScope relation: delegate to it
    // for every shape it can route, composite keys included. The chain-based
    // `scope()` seam emits the full composite ON clause, so composite
    // owner PK, composite target PK, composite belongsTo-source FK, and
    // composite through-model PK all build correctly here — the single-column
    // IN-subquery fallback below can't express those tuple matches and would
    // throw. Only shapes `_routeThroughViaAssociationScope` still declines
    // (polymorphic-has_many sources, unsaved nested-through) fall through to
    // that fallback, where the composite guards remain as a loud backstop.
    const refl = this.reflection as any;
    if (_routeThroughViaAssociationScope(this._record, refl, this._assocDef.options)) {
      const joinRel = hasManyScope(this._record, this._assocName, this._assocDef);
      return joinRel ?? (this.model as any).all().none(); // null FK → empty, as below
    }
    // Below is the single-column IN-subquery fallback, reached only for shapes
    // `_routeThroughViaAssociationScope` declines (polymorphic-has_many sources,
    // unsaved nested-through). Every composite shape it CAN route now takes the
    // JOIN path above, so the composite ConfigurationError guards below are
    // backstops for the residual unroutable composite shapes the single-column
    // subquery genuinely can't express — not the common composite-key path.
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new Error(
        `Through association "${this._assocDef.options.through}" not found on ${ctor.name}`,
      );
    }

    const targetModel = this.model;
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveAssocClass(this._record, throughAssoc.name, throughClassName);
    // Mirrors Rails ThroughReflection#source_reflection: go through the HMT
    // reflection's sourceReflection rather than scanning _associations by name.
    // This avoids the pluralize-fallback ambiguity and respects the source:
    // option exactly as Rails does (source_reflection_names returns [options[:source]]
    // only when source: is given — reflection.rb:1108).
    const sourceRefl = (this.reflection as { sourceReflection?: any }).sourceReflection;

    const throughAs = throughAssoc.options.as;
    const throughTable = throughModel.arelTable;
    const targetArelTable = targetModel.arelTable;
    // sourceRefl.belongsTo?.() returns true for belongs_to, false/undefined otherwise.
    const isBelongsToSource = sourceRefl == null || sourceRefl.belongsTo?.() !== false;

    let throughSubquery = throughTable.from();
    if (throughAs) {
      // Polymorphic-through: defer to the shared polymorphic helper so the
      // scope reads from the same column _pushThrough writes to.
      const poly = this._throughOwnerPolymorphic(throughAssoc, ctor, throughAs);
      if (poly.idValue == null) return (targetModel as any).all().none();
      throughSubquery = throughSubquery
        .where(throughTable.get(poly.idCol).eq(poly.idValue))
        .where(throughTable.get(poly.typeCol).eq(poly.typeValue));
    } else {
      const { fkCols: ownerFkCols, pkCols: ownerPkCols } = this._throughOwnerCols(
        throughAssoc,
        ctor,
      );
      const ownerPkValues = ownerPkCols.map((c) => this._record._readAttribute(c));
      if (ownerPkValues.some((v) => v == null)) return (targetModel as any).all().none();
      for (let i = 0; i < ownerFkCols.length; i++) {
        throughSubquery = throughSubquery.where(
          throughTable.get(ownerFkCols[i]).eq(ownerPkValues[i]),
        );
      }
    }

    if (isBelongsToSource) {
      const targetFk = sourceRefl?.foreignKey ?? `${underscore(sourceName)}_id`;
      if (Array.isArray(targetFk)) {
        throw new ConfigurationError(
          `Through association "${this._assocName}" does not support a composite foreign key on the source belongsTo — the target-side IN-subquery needs a single column.`,
        );
      }
      const targetFkStr = targetFk;
      let targetPkCol: string;
      if (Array.isArray(targetModel.primaryKey)) {
        // Mirrors BelongsToReflection#association_primary_key: options[:primary_key]
        // when set, else "id" when it is part of the composite PK.
        const srcPk = sourceRefl?.associationPrimaryKey;
        if (typeof srcPk === "string") {
          targetPkCol = srcPk;
        } else if (targetModel.primaryKey.includes("id")) {
          targetPkCol = "id";
        } else {
          throw new ConfigurationError(
            `Through association "${this._assocName}" has a composite-PK target "${targetModel.name}" but no scalar primaryKey on the source reflection to anchor the IN-subquery. Specify primaryKey: "<col>" on the source belongs_to.`,
          );
        }
      } else {
        targetPkCol = targetModel.primaryKey;
      }

      // Handle sourceType for polymorphic belongsTo sources
      if (sourceRefl?.isPolymorphic?.() && this._assocDef.options.sourceType) {
        const sourceTypeCol = `${underscore(sourceRefl.name ?? sourceName)}_type`;
        throughSubquery = throughSubquery.where(
          throughTable.get(sourceTypeCol).eq(this._assocDef.options.sourceType),
        );
      }

      throughSubquery.project(throughTable.get(targetFkStr));
      const inNode = targetArelTable.get(targetPkCol).in(throughSubquery);

      let rel = (targetModel as any).all().where(inNode);
      if (this._assocDef.scope) rel = this._assocDef.scope(rel);
      return rel;
    } else {
      const sourceAsName = sourceRefl?.options?.as;
      const sourceFk = sourceAsName
        ? (sourceRefl?.foreignKey ?? `${underscore(sourceAsName)}_id`)
        : (sourceRefl?.foreignKey ?? `${underscore(throughClassName)}_id`);
      if (Array.isArray(sourceFk)) {
        // Composite source FK (e.g. CPK `has_many :chapters, through: :book`
        // where the join model's `has_many` source uses a composite key): the
        // single-column IN-subquery can't express the tuple match, so route
        // through the JOIN-based AssociationScope, which builds the composite ON
        // clause. Falls back to a null scope only when the owner FK is absent.
        const joinRel = hasManyScope(this._record, this._assocName, this._assocDef);
        return joinRel ?? (targetModel as any).all().none();
      }
      // When the source reflection specifies a primaryKey option (e.g.
      // `has_many :orderAgreements, primaryKey: "id"` on a CPK through model),
      // that named column is the one the FK references — use it instead of the
      // through model's own (possibly composite) primary key.
      let sourcePk: string | string[] | undefined;
      try {
        sourcePk = sourceRefl?.associationPrimaryKey ?? sourceRefl?.options?.primaryKey;
      } catch {
        sourcePk = undefined;
      }
      const throughPkCol = typeof sourcePk === "string" ? sourcePk : throughModel.primaryKey;
      if (Array.isArray(throughPkCol)) {
        throw new ConfigurationError(
          `Through association "${this._assocName}" does not support a composite primary key on the through model "${throughModel.name}" — the target-side IN-subquery needs a single column.`,
        );
      }
      const sourceFkStr = sourceFk;

      throughSubquery.project(throughTable.get(throughPkCol));
      const inNode = targetArelTable.get(sourceFkStr).in(throughSubquery);

      let rel = (targetModel as any).all().where(inNode);
      if (sourceAsName) {
        rel = rel.where({ [`${underscore(sourceAsName)}_type`]: throughClassName });
      }
      if (this._assocDef.scope) rel = this._assocDef.scope(rel);
      return rel;
    }
  }

  /**
   * Load and return the target records array.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#load_target
   */
  async loadTarget(): Promise<T[]> {
    await this.load();
    return this._target;
  }

  /**
   * Whether the association scope is the null scope — the owner is a new record
   * with no foreign key to query by, so `CollectionAssociation#scope` has
   * `none!`d it (collection_association.rb:298-306). Mirrors
   * `CollectionProxy#null_scope?` (collection_proxy.rb:1150-1152), a one-line
   * delegation to `@association.null_scope?`.
   *
   * The body is re-expressed rather than borrowed from
   * `CollectionAssociation.prototype.isNullScope` because the proxy's
   * `_foreignKeyPresent` is the through-aware one (a `has_many :through` routes
   * the check through the `belongs_to`), and — as with `isFindFromTarget` — the
   * proxy must not resolve through `owner.association(name)`, whose state is a
   * secondary copy.
   *
   * @internal
   */
  isNullScope(): boolean {
    return this._record.isNewRecord() && !this._foreignKeyPresent();
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
    // In Rails the proxy reads the association's `@target`, so the `reset` /
    // `loaded!` inside `delete_all` is what empties the collection the proxy
    // shows. The trails CollectionProxy keeps its own copy of the target, so
    // the same reset has to be replayed on it here.
    this._target = [];
    this._targetLoaded = true;
    this._invalidateAssociationIds();
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
  get proxyAssociation(): {
    readonly owner: Base;
    readonly reflection: any;
    readonly target: Base[];
    readonly loaded: boolean;
    reset: () => void;
  } {
    const proxy = this;
    return {
      owner: this._record,
      reflection: this._assocDef,
      get target() {
        return proxy._target;
      },
      get loaded() {
        return proxy._targetLoaded;
      },
      // reset() returns `this` (a thenable Relation); the contract here is a
      // plain void reset, so discard the proxy return rather than leak it.
      reset: () => {
        this.reset();
      },
    };
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
    this._ensureThroughWritable();
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
// trails mixes QueryMethods / SpawnMethods into `Relation` itself rather than
// keeping them as standalone modules, so their `public_instance_methods(false)`
// can't be reflected off a module object — the two name lists below stand in for
// that reflection, in Rails' source order (`query_methods.rb`, `spawn_methods.rb`).
// Both halves of each module are listed: `public_instance_methods(false)` includes
// the bang builders (`where!`, `limit!`, `none!`, …), so Rails delegates those to
// `scope` too — a Rails `CollectionProxy` owns no relation state of its own. The
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
  "arel",
  "constructJoinDependency",
  // The bang half of `QueryMethods.public_instance_methods(false)`
  // (query_methods.rb) — Rails delegates these to `scope` as well.
  "includesBang",
  "eagerLoadBang",
  "preloadBang",
  "referencesBang",
  "selectBang",
  "withBang",
  "withRecursiveBang",
  "reselectBang",
  "groupBang",
  "regroupBang",
  "orderBang",
  "reorderBang",
  "unscopeBang",
  "joinsBang",
  "leftOuterJoinsBang",
  "whereBang",
  "rewhereBang",
  "invertWhereBang",
  "havingBang",
  "limitBang",
  "offsetBang",
  "lockBang",
  "noneBang",
  "nullBang",
  "readonlyBang",
  "strictLoadingBang",
  "createWithBang",
  "fromBang",
  "distinctBang",
  "extendingBang",
  "optimizerHintsBang",
  "reverseOrderBang",
  "annotateBang",
  "excludingBang",
  "uniqBang",
  "skipQueryCacheBang",
  "skipPreloadingBang",
  "andBang",
  "orBang",
] as const;

const SPAWN_METHODS_PUBLIC_INSTANCE_METHODS = [
  "spawn",
  "merge",
  "mergeBang",
  "except",
  "only",
] as const;

const delegateMethods = (
  [...QUERY_METHODS_PUBLIC_INSTANCE_METHODS, ...SPAWN_METHODS_PUBLIC_INSTANCE_METHODS] as string[]
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
