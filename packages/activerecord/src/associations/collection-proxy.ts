import type { Base } from "../base.js";
import { Relation } from "../relation.js";
import type { AssociationRelation as AssociationRelationType } from "../association-relation.js";
import { wrapWithScopeProxy } from "../relation/delegation.js";

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
  normalizeFindArgs,
  raiseNotFoundAll,
  raiseNotFoundSingle,
} from "../relation/finder-methods.js";
import { Table as ArelTable } from "@blazetrails/arel";
import type { Nodes } from "@blazetrails/arel";
import { underscore, singularize, pluralize, camelize } from "@blazetrails/activesupport";
import { filterScopeForCreate } from "./association.js";
import { RecordNotSaved, ConfigurationError, AssociationTypeMismatch } from "../errors.js";
import { strictLoadingViolationBang } from "../core.js";
import { RecordInvalid } from "../validations.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughNestedAssociationsAreReadonly,
  HasManyThroughOrderError,
} from "./errors.js";
import { getInheritanceColumn, findStiClass } from "../inheritance.js";
import {
  hasQueryConstraints as ownerHasQueryConstraints,
  queryConstraintsList as ownerQueryConstraintsList,
} from "../persistence.js";
import type { AssociationDefinition } from "../associations.js";
import {
  association,
  resolveModel,
  resolveAssocClass,
  fireAssocCallbacks,
  buildHasManyRelation,
  loadHasMany,
  _canRouteThroughViaAssociationScope,
  ownerHasUnresolvedThroughKey,
  _setCollectionInverseInstance,
  _violatesStrictLoading,
} from "../associations.js";
import { _setCollectionProxyCtor } from "./collection-proxy-slot.js";
import { buildThroughInverseFor } from "./has-many-through-association.js";
import { throughForeignKeyPresent } from "./through-association.js";

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
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
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
 * Validate a numeric limit (safe non-negative integer) and raise the
 * same error shape as Relation#limitBang. Rails' `first(n)` / `last(n)`
 * / `take(n)` all route through `limit(limit)` which validates; our
 * TS finder methods bypass validation for first/take via
 * `_limitValue = n` (a TS-internal shortcut that diverges from Rails).
 * For Rails fidelity at the CollectionProxy layer we validate all
 * three.
 */
function assertValidLimit(n: number): void {
  if (!Number.isSafeInteger(Number(n)) || Number(n) < 0) {
    throw new Error(`Invalid limit value: ${String(n)}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CollectionProxy<T extends Base = Base> extends Relation<T> {
  private _record: Base;
  private _assocName: string;
  private _assocDef: AssociationDefinition;
  private _target: T[] = [];
  private _targetLoaded = false;
  // Mirrors Rails' `CollectionAssociation#@replaced_or_added_targets` (a
  // `Set.new.compare_by_identity`): records that have been added to or
  // replaced on the in-memory target. `replace_on_target` consults it to
  // dedup by identity rather than appending the same record twice.
  private _replacedOrAddedTargets = new Set<T>();
  // Flag flipped by ANY post-ctor bang-style mutation on the inherited
  // Relation state (whereBang / orderBang / reorderBang / regroupBang /
  // reverseOrderBang / rewhereBang / limitBang / offsetBang / ... — all
  // of them). Set by instance-level method wrappers installed at the
  // end of the ctor (see `_installMutationTracker`). `toArray()`
  // consults this flag to decide between the association-cache path
  // (seed-only) and delegating to super.toArray() (mutated).
  //
  // Single-boolean check per toArray call — O(1) vs serializing the
  // entire Relation state. Content-aware implicitly: any bang that
  // touches state passes through the wrapper, regardless of whether
  // it changes array length or only content.
  private _cpMutated = false;

  get loaded(): boolean {
    return this._targetLoaded;
  }

  get target(): T[] {
    return this._target;
  }

  /** @internal Owner record — used by AssociationRelation. */
  get owner(): Base {
    return this._record;
  }

  /** @internal Association definition — used by AssociationRelation. */
  get reflection(): AssociationDefinition {
    return this._assocDef;
  }

  /** @internal Association name — used by AssociationRelation. */
  get associationName(): string {
    return this._assocName;
  }

  /** @internal Whether this is a through association — used by AssociationRelation. */
  get isThrough(): boolean {
    return !!this._assocDef.options.through;
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

  // `length` is intentionally NOT redeclared — `CollectionProxy extends
  // Relation`, and `Relation#length()` is `async`. Previously CP shadowed
  // it with a sync getter over `_target`; keeping that alongside
  // inheritance would require overriding an async method with a getter,
  // which TS rejects. Callers that need the sync count should reach for
  // `proxy.target.length` or `Array.from(proxy).length`.

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

  // every has the standard type-predicate overload from Array<T>.
  every<S extends T>(
    predicate: (record: T, index: number, all: T[]) => record is S,
    thisArg?: unknown,
  ): boolean;
  every(predicate: (record: T, index: number, all: T[]) => unknown, thisArg?: unknown): boolean;
  every(predicate: (record: T, index: number, all: T[]) => unknown, thisArg?: unknown): boolean {
    return this._target.every(predicate, thisArg);
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

  constructor(record: Base, assocName: string, assocDef: AssociationDefinition) {
    const className = assocDef.options.className ?? camelize(singularize(assocName));
    // Prefer the rich reflection's klass so namespace-relative resolution applies.
    const ownerCtor = record.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { klass?: typeof Base } | null;
    };
    const richKlass = ownerCtor._reflectOnAssociation?.(assocName)?.klass;
    const targetModel = richKlass ?? (resolveModel(className) as typeof Base);
    super(targetModel, targetModel.arelTable);
    this._record = record;
    this._assocName = assocName;
    this._assocDef = assocDef;

    // Seed the proxy's inherited Relation state so direct Relation calls
    // (`cp.toSql()`, `cp.where(...)`, `cp.toArray()`) scope to the owner
    // — matches Rails, where CollectionProxy IS the scoped Relation.
    //
    // Non-through path delegates to `buildHasManyRelation()` (same
    // helper used by `scope()`, `countHasMany()`, eager loaders) so CP
    // gets identical semantics: the relation starts from
    // `targetModel.all()` (default scope applied), is scope-proxied
    // (so `options.scope` callbacks can call named scopes / generated
    // methods on it), and composite-PK mismatches throw
    // `CompositePrimaryKeyMismatchError`. State is then copied onto
    // `this` so the inherited Relation methods observe the same scope.
    //
    // Through path copies state from `_buildThroughScope()`. Config
    // errors (missing through assoc, unregistered target model) are
    // validated upfront; only adapter/schema failures fall to the
    // fail-closed `_isNone` path.
    const ctor = record.constructor as typeof Base;
    const proxySelf = this as unknown as {
      _copyStateFrom: (other: Relation<T>) => void;
      noneBang: () => unknown;
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
      proxySelf._copyStateFrom(throughRel);
    } else {
      // Build via `buildHasManyRelation` so CP's inherited Relation
      // state matches `scope()` / direct Relation callers: default
      // scope from `targetModel.all()` is applied, the relation is
      // scope-proxied (so `options.scope` can call named scopes /
      // generated methods on it), and composite-PK validation runs.
      // Then `_copyStateFrom` onto `this`. Missing owner PK →
      // `_isNone = true` (Rails' NullRelation fallback).
      const seedRel = buildHasManyRelation(
        record,
        assocName,
        assocDef.options,
      ) as Relation<T> | null;
      if (seedRel === null) {
        proxySelf.noneBang();
      } else {
        proxySelf._copyStateFrom(seedRel);
      }
    }

    // Apply the `extend:` option — mirrors Rails
    // `CollectionProxy#initialize`, which does `extend(*extensions)` with
    // `association.extensions` (`reflection.extensions` =
    // `Array(options[:extend])`). Routing through `extendingBang` (rather
    // than binding methods directly onto the instance) records the
    // modules in `_extending`, so extension methods survive every spawned
    // scope (`owner.things.where(...).fooExtension()`) via the rebinding
    // in `_copyStateFrom`.
    const ext = assocDef.options.extend;
    if (ext) {
      const extensions = Array.isArray(ext) ? ext : [ext];
      this.extendingBang(...extensions);
    }

    this._installMutationTracker();
  }

  /**
   * Install instance-level wrappers for every `*Bang` method reachable
   * via the prototype chain. Each wrapper flips `_cpMutated` and
   * forwards to the original. Runs once per CP instance at ctor end,
   * AFTER seeding — so `noneBang()` / `whereBang()` calls from the
   * ctor itself don't trip the flag. The cost of a single O(N) walk
   * over the prototype chain (N ~ 25 bang methods) is amortized over
   * the proxy's lifetime; every subsequent `toArray()` / divergence
   * check is a single boolean read.
   */
  private _installMutationTracker(): void {
    // Explicit allowlist of SCOPE-mutator bangs — everything exported
    // from query-methods.ts (the `*Bang` chain mutators) plus
    // `mergeBang` from spawn-methods. Deliberately excludes finder
    // bangs (firstBang / lastBang / takeBang / findByBang) which
    // raise-on-missing but don't mutate scope, and save/persistence
    // bangs (saveBang / updateBang / destroyBang). Previously we
    // wrapped every `*Bang` name from the prototype chain, which
    // caused finder-bang calls to flip `_cpMutated` and force
    // toArray() to bypass the association cache.
    const SCOPE_MUTATOR_BANGS: readonly string[] = [
      "whereBang",
      "rewhereBang",
      "invertWhereBang",
      "orderBang",
      "reorderBang",
      "reverseOrderBang",
      "groupBang",
      "regroupBang",
      "havingBang",
      "limitBang",
      "offsetBang",
      "selectBang",
      "reselectBang",
      "distinctBang",
      "lockBang",
      "readonlyBang",
      "strictLoadingBang",
      "noneBang",
      "nullBang",
      "joinsBang",
      "leftOuterJoinsBang",
      "includesBang",
      "eagerLoadBang",
      "preloadBang",
      "referencesBang",
      "withBang",
      "withRecursiveBang",
      "fromBang",
      "createWithBang",
      "extendingBang",
      "optimizerHintsBang",
      "annotateBang",
      "uniqBang",
      "unscopeBang",
      "skipQueryCacheBang",
      "skipPreloadingBang",
      "excludingBang",
      "andBang",
      "orBang",
      "mergeBang",
    ];
    for (const name of SCOPE_MUTATOR_BANGS) {
      const original = (this as unknown as Record<string, unknown>)[name];
      if (typeof original !== "function") continue;
      Object.defineProperty(this, name, {
        value: function (this: CollectionProxy<T>, ...args: unknown[]) {
          (this as unknown as { _cpMutated: boolean })._cpMutated = true;
          // Use Relation#reset so all inherited load-state — including
          // `_loadToken` — is invalidated atomically. Bumping the token
          // lets in-flight super.toArray() completions detect that
          // they're stale and skip committing results; manually
          // clearing a subset of fields would race on the
          // diverged-toArray / load code paths. `_target` (the
          // association-local in-memory state) is NOT touched —
          // that's the owner's proxy state and survives scope
          // mutations.
          (
            Relation.prototype as unknown as { reset: (this: CollectionProxy<T>) => void }
          ).reset.call(this);
          return (original as (...a: unknown[]) => unknown).apply(this, args);
        },
        writable: true,
        configurable: true,
      });
    }
  }

  /** Whether any `*Bang` mutator has run on the proxy since seeding. */
  private _relationStateDiverged(): boolean {
    return this._cpMutated;
  }

  /**
   * Load and return all associated records.
   */
  async toArray(): Promise<T[]> {
    // Two paths:
    //
    // 1. Seed-only state (nothing mutated post-ctor): hit `loadHasMany`
    //    to reuse the owner's association cache + strict-loading
    //    enforcement. This is the common case (`await blog.posts`).
    // 2. State has diverged from the seed (e.g. `cp.whereBang(...)`
    //    was called directly on the proxy): delegate to
    //    `super.toArray()` so the query honors the mutations. The
    //    association cache is bypassed here because it's keyed on the
    //    unmutated scope and would return stale/incorrect data.
    if (this._relationStateDiverged()) {
      // Diverged path bypasses loadHasMany, which is where the
      // association's strict-loading enforcement normally lives. Run
      // the gate ourselves so owner._strictLoading still raises.
      this._checkStrictLoading();
      const results = await super.toArray();
      const unsaved = this._target.filter((r) => r.isNewRecord());
      return unsaved.length > 0 ? [...results, ...unsaved] : results;
    }
    const results = (await loadHasMany(
      this._record,
      this._assocName,
      this._assocDef.options,
    )) as T[];
    this._cascadeStrictLoading(results);
    const unsaved = this._target.filter((r) => r.isNewRecord());
    if (unsaved.length > 0) {
      return [...results, ...unsaved];
    }
    return results;
  }

  // @ts-expect-error CP's load returns the hydrated T[] (loaded records);
  //   Relation's returns LoadedRelation<this>. CP is thenable via load()
  //   so T[] is the correct contract here. Permanent divergence.
  async load(): Promise<T[]> {
    if (this._targetLoaded) return this._target;
    // Same divergence gate as `toArray()` — if the inherited Relation
    // state has been mutated via scope bangs (whereBang / orderBang /
    // ...), route through `super.toArray()` so `load()` / `await proxy`
    // honor the mutation. Without this, `cp.whereBang({...}); await cp`
    // would silently fall back to the full association-cache load.
    let results: T[];
    if (this._relationStateDiverged()) {
      // Diverged path bypasses loadHasMany — enforce strict-loading
      // explicitly, same as the toArray() diverged branch.
      this._checkStrictLoading();
      results = await super.toArray();
    } else {
      results = (await loadHasMany(this._record, this._assocName, this._assocDef.options)) as T[];
      this._cascadeStrictLoading(results);
    }
    // Merge: prefer existing in-memory instances (from push/build) over fresh DB records
    const existingByPk = new Map<string, T>();
    for (const r of this._target) {
      const id = this._identityFor(r);
      if (id != null) existingByPk.set(id, r);
    }
    const merged: T[] = results.map((r) => {
      const id = this._identityFor(r);
      return id != null && existingByPk.has(id) ? existingByPk.get(id)! : r;
    });
    const unsaved = this._target.filter((r) => r.isNewRecord());
    this._target = unsaved.length > 0 ? [...merged, ...unsaved] : merged;
    this._targetLoaded = true;
    return this._target;
  }

  private _identityFor(r: Base): string | null {
    const pk = (r.constructor as typeof Base).primaryKey;
    if (Array.isArray(pk)) {
      const vals = pk.map((col) => r._readAttribute(col));
      if (vals.some((v) => v == null)) return null;
      return JSON.stringify(vals);
    }
    const val = r._readAttribute(pk as string);
    return val == null ? null : String(val);
  }

  private get _isThrough(): boolean {
    return !!this._assocDef.options.through;
  }

  private _checkStrictLoading(): void {
    if (_violatesStrictLoading(this._record, this._assocDef.options)) {
      strictLoadingViolationBang(this._record, this._assocName, {
        className: this._assocDef.options.className ?? camelize(singularize(this._assocName)),
      });
    }
  }

  /**
   * Propagate the owner's strict-loading mode onto each loaded child —
   * mirrors `Association#set_strict_loading`, which Rails applies in
   * `find_target` / `exec_queries`. The functional `loadHasMany` path
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
   * Build a new associated record (unsaved).
   * For direct has_many, sets the FK on the target.
   * For through associations, builds the target without FK — the join
   * record is created later via create() or push().
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
    // Through association: build the target record (no FK on target)
    if (this._isThrough) {
      const record = this._buildThrough(attrs) as T;
      if (block) block(record);
      const allowed = fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
      if (allowed) {
        this._target.push(record);
        fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
      }
      return record;
    }

    const record = this._buildRaw(attrs) as T;
    if (block) block(record);
    const allowed = fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
    if (allowed) {
      this._target.push(record);
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    }
    return record;
  }

  private _buildRaw(attrs: Record<string, unknown> = {}): Base {
    const ctor = this._record.constructor as typeof Base;
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;

    // Polymorphic "as" option
    const asName = this._assocDef.options.as;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`);

    const buildAttrs: Record<string, unknown> = {
      ...attrs,
      [foreignKey as string]: this._record._readAttribute(primaryKey as string),
    };
    if (asName) {
      buildAttrs[`${underscore(asName)}_type`] = ctor.name;
    }

    let targetModel = this.model as typeof Base;

    // STI: resolve subclass from the caller-supplied inheritance column,
    // falling back to a value from scope_for_create (e.g.
    // `has_many :posts, -> { where(type: "SpecialPost") }`). Rails resolves
    // the subclass after scope-merge, so peek at scope here before
    // instantiation; the full scope_for_create filter still runs below.
    const sfcForSti = this._scopeForCreateRaw();
    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol) {
      const typeName = (buildAttrs[inheritanceCol] ?? sfcForSti[inheritanceCol]) as
        | string
        | undefined;
      if (typeName) targetModel = findStiClass(targetModel, typeName);
    }

    const record = new targetModel(buildAttrs);
    this._applyScopeForCreate(record, attrs, foreignKey as string | string[]);
    // Rails wires the inverse inside `initialize_attributes`, before any
    // build/create block runs — so a block can already see `child.owner`.
    _setCollectionInverseInstance(this._record, this._assocName, this._assocDef.options, record);
    return record;
  }

  private _buildThrough(attrs: Record<string, unknown> = {}): Base {
    let targetModel = this.model as typeof Base;

    const sfcForSti = this._scopeForCreateRaw();
    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol) {
      const typeName = (attrs[inheritanceCol] ?? sfcForSti[inheritanceCol]) as string | undefined;
      if (typeName) targetModel = findStiClass(targetModel, typeName);
    }

    const record = new targetModel(attrs);
    this._applyScopeForCreate(record, attrs);
    // Mirrors the inverse half of Rails' HasManyThroughAssociation#build_record:
    // pre-build the join row and wire it onto the target's inverse so the join
    // is created alongside the target on save.
    const built = buildThroughInverseFor(this._record, this._assocDef, record);
    if (built?.isCollection) {
      const invProxy = association(record, built.inverseName) as unknown as CollectionProxy;
      invProxy._target.push(built.throughRecord);
    } else if (built?.isHasOne) {
      const inv = (record as unknown as { association?: (n: string) => any }).association?.(
        built.inverseName,
      );
      if (inv) {
        inv.target = built.throughRecord;
        inv.setInverseInstance?.(built.throughRecord);
      }
    }
    return record;
  }

  private _scopeForCreateRaw(): Record<string, unknown> {
    const fn = (this as unknown as { scopeForCreate?: () => Record<string, unknown> })
      .scopeForCreate;
    return typeof fn === "function" ? fn.call(this) : {};
  }

  // Mirrors Rails' Association#initialize_attributes (association.rb:217):
  // pre-fill scope_for_create attrs. Caller-supplied / already-changed
  // keys normally win, except for skip_assign = [foreign_key,
  // foreign_type], where the scope value is allowed through (Rails
  // relies on this to re-anchor a scoped FK / polymorphic type).
  // `foreign_type` here is the polymorphic-belongs-to type column
  // (`${as}_type`), NOT the STI inheritance column.
  private _applyScopeForCreate(
    record: Base,
    exceptFromScope: Record<string, unknown>,
    foreignKey?: string | string[],
  ): void {
    const sfc = this._scopeForCreateRaw();
    if (!sfc || Object.keys(sfc).length === 0) return;

    // Rails' skip_assign is [foreign_key, foreign_type] — the polymorphic
    // type column on belongs_to (Reflection#type returns foreign_type, NOT
    // the STI inheritance column). For composite-key associations the FK
    // is an array; every column must land in skipAssign so scope values
    // for any of them can re-anchor (matches Array(reflection.foreign_key)
    // in Rails' initialize_attributes).
    const skipAssign = new Set<string>();
    if (Array.isArray(foreignKey)) {
      for (const k of foreignKey) if (k) skipAssign.add(k);
    } else if (foreignKey) {
      skipAssign.add(foreignKey);
    }
    const asName = this._assocDef.options.as;
    if (asName) skipAssign.add(`${underscore(asName)}_type`);

    const assigned = new Set<string>(
      ((record as any).changedAttributeNamesToSave ?? []) as string[],
    );
    for (const k of Object.keys(exceptFromScope)) assigned.add(k);

    const out = filterScopeForCreate(sfc, assigned, skipAssign);
    if (out) (record as any)._assignAttributes(out);
  }

  /**
   * Build and save a new associated record.
   *
   * Rails' `CollectionAssociation#_create_record` routes both regular and
   * :through associations through `add_to_target` (HasManyThroughAssociation
   * overrides only `build_record`/`insert_record`, not `_create_record`). The
   * non-:through path goes through `_addToTarget` directly; the :through path
   * builds + saves the target in `_createThrough`, then hands the in-memory
   * mutation to `_pushThrough`, which now also routes through `_addToTarget`
   * (shared set_inverse_instance + `@replaced_or_added_targets` dedup).
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
        records.push((await this.create(a, block)) as T);
      }
      return records;
    }
    this._ensureThroughWritable();
    if (this._isThrough) {
      return (await this._createThrough(attrs, block)) as T;
    }
    const record = this._buildRaw(attrs) as T;
    if (block) block(record);
    // Rails' add_to_target computes `replace: replace || association_scope.distinct_value`,
    // so a `distinct` association scope dedups in place rather than appending twice.
    await this._addToTarget(record, { replace: this.distinctValue }, () => record.save());
    return record;
  }

  /**
   * Add `record` to the in-memory target, firing add callbacks, wiring the
   * inverse instance, and deduping by identity via `_replacedOrAddedTargets`.
   * Mirrors `ActiveRecord::Associations::CollectionAssociation#replace_on_target`.
   *
   * `save`, when supplied, runs between `set_inverse_instance` and the target
   * mutation (Rails' `yield(record)` inside `replace_on_target`, used by
   * `create` to `insert_record`). If it resolves false the record is left out
   * of the target — matching the prior `if (saved)` gate. (Rails pushes
   * regardless and relies on the surrounding `transaction { ... } / raise
   * Rollback` to undo the DB write; trails' `create` has no transaction yet —
   * see `_createThrough` — so we gate the in-memory push on save success.)
   *
   * Rails' append branch is gated on `@_was_loaded || !loaded?`. On the create
   * path `@_was_loaded` is set true before the save and reset to `loaded?`
   * after, so that gate is always true; with `create` the sole caller it is
   * collapsed to an unconditional push here.
   * @internal
   */
  private async _addToTarget(
    record: T,
    options: { skipCallbacks?: boolean; replace?: boolean } = {},
    save?: () => Promise<boolean>,
  ): Promise<T | null> {
    const { skipCallbacks = false, replace = false } = options;
    let index = -1;
    if (replace && (!record.isNewRecord() || this._replacedOrAddedTargets.has(record))) {
      index = this._target.indexOf(record);
    }
    if (
      !skipCallbacks &&
      !fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)
    ) {
      return null;
    }
    _setCollectionInverseInstance(this._record, this._assocName, this._assocDef.options, record);
    if (save && !(await save())) return record;
    if (index === -1 && this._replacedOrAddedTargets.has(record)) {
      index = this._target.indexOf(record);
    }
    if (index !== -1 || record.isNewRecord()) {
      this._replacedOrAddedTargets.add(record);
    }
    if (index !== -1) {
      this._target[index] = record;
    } else {
      this._target.push(record);
      this._invalidateAssociationIds();
    }
    if (!skipCallbacks) fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    return record;
  }

  // NOTE: If _pushThrough fails after the target is saved, the target record
  // will be orphaned (no join row). Rails wraps this in a transaction. We don't
  // have transaction support yet — tracked in the roadmap under "Transactions".
  private async _createThrough(
    attrs: Record<string, unknown> = {},
    block?: (r: T) => void,
  ): Promise<Base> {
    const ctor = this._record.constructor as typeof Base;
    if (this._record.isNewRecord()) {
      throw new Error(`Cannot create through association on an unpersisted ${ctor.name}`);
    }
    const record = this._buildThrough(attrs) as T;
    if (block) block(record);
    const saved = await record.save();
    if (!saved) return record;
    await this._pushThrough([record]);
    return record;
  }

  /**
   * Build a DJAR for the disable-joins-through count fast path —
   * mirrors `_loadThroughViaDisableJoinsScope`'s setup but stops
   * after constructing the DJAR. Returns `null` when
   * `ownerHasUnresolvedThroughKey` fires (unsaved owner / null
   * PK) so the caller short-circuits to 0 — same correctness
   * guard the loader uses.
   */
  private async _djarForCount(): Promise<{ djar: unknown } | null> {
    const ctor = this._record.constructor as typeof Base;
    const reflection = (ctor as any)._reflectOnAssociation?.(this._assocName);
    if (!reflection) return null;
    if (ownerHasUnresolvedThroughKey(this._record, reflection)) return null;
    const { DisableJoinsAssociationScope } = await import("./disable-joins-association-scope.js");
    const klass = (reflection as { klass: typeof Base }).klass;
    // Box the DJAR so awaiting this helper doesn't unwrap it via
    // `Relation.then` (which resolves to the records array). Callers
    // read `.djar` off the resolved value.
    const djar = DisableJoinsAssociationScope.INSTANCE.scope({
      owner: this._record,
      reflection: reflection as any,
      klass,
    });
    return { djar };
  }

  /**
   * Count associated records.
   */
  async count(): Promise<number> {
    // Rails' CollectionAssociation#count: if the target is already
    // loaded, count the loaded array (no query). Otherwise issue a
    // real `COUNT(*)` on the scoped relation. Previously the non-
    // diverged branch loaded every row just to read `.length`, which
    // is a significant perf regression on large collections.
    if (this._targetLoaded) return this._target.length;
    // Strict loading only blocks paths that actually hit the DB —
    // a loaded target above returns without querying, matching
    // `size()`'s loaded-target fast path.
    this._checkStrictLoading();
    // Through-associations:
    //   * disable_joins: route through DJAS' chain walker and emit a
    //     single COUNT(*) on the final-step relation
    //     (DisableJoinsAssociationRelation#count). The intermediate
    //     plucks happen either way; this just avoids hydrating rows.
    //   * non-disable-joins shapes AssociationScope can route (the
    //     shared predicate already excludes nested-through and the
    //     polymorphic-without-sourceType cases): fall through to the
    //     scope().count() fast path below — `_buildThroughScope()`
    //     produces a COUNT-able JOIN/subquery relation.
    //   * Other through shapes (nested-through non-DJAS,
    //     polymorphic-has_many sources): scope() / _buildThroughScope
    //     produces SQL that references columns the target FROM
    //     doesn't have. Fall back to the loader for those (task #25
    //     covers the underlying scope-build issue).
    if (this._assocDef.options.through) {
      const ctor = this._record.constructor as typeof Base;
      const refl = (ctor as any)._reflectOnAssociation?.(this._assocName);
      // Disable-joins through: fast path goes through DJAR's
      // deferred walker + final-step COUNT. The divergence-aware
      // Relation.prototype.count fallthrough below handles any
      // in-place proxy mutations (whereBang / groupBang / etc.) —
      // DJAR construction here ignores those, so route diverged
      // proxies through the generic path instead.
      if (this._assocDef.options.disableJoins && !this._relationStateDiverged()) {
        const box = await this._djarForCount();
        if (!box) return 0;
        const djar = (box as { djar: unknown }).djar as {
          count: () => Promise<number | Record<string, number>>;
        };
        const c = await djar.count();
        if (typeof c !== "number") {
          throw new Error("Grouped counts are not supported for association collection counts");
        }
        return c;
      }
      // Non-disable-joins through shapes AssociationScope can't
      // route (nested / polymorphic-has_many / polymorphic-
      // belongsTo-without-sourceType): fall back to the loader.
      // Disable-joins diverged case also falls through here — the
      // generic Relation.prototype.count path below honors the
      // proxy's in-place mutations.
      if (
        !this._assocDef.options.disableJoins &&
        !_canRouteThroughViaAssociationScope(refl, this._assocDef.options)
      ) {
        const results = await loadHasMany(this._record, this._assocName, this._assocDef.options);
        return results.length;
      }
    }
    // On the diverged path `this` carries in-place proxy mutations
    // (whereBang etc.), so route through Relation.prototype.count to
    // avoid re-entering CP#count. On the non-diverged path route
    // through the underlying scoped Relation so it emits the same
    // `COUNT(*)` Rails would.
    const countFn = (
      Relation.prototype as unknown as {
        count: (this: unknown) => Promise<number | Record<string, number>>;
      }
    ).count;
    const counted = this._relationStateDiverged()
      ? await countFn.call(this)
      : await countFn.call(this.scope());
    // A grouped count (Record) would mean the caller added a
    // `groupBang(...)` on the proxy — ambiguous for CP#count (which
    // returns a single number). Fail loudly instead of silently
    // collapsing to the group count.
    if (typeof counted !== "number") {
      throw new Error("Grouped counts are not supported for association collection counts");
    }
    return counted;
  }

  // Aggregate SQL entry points inherited from Relation (via the
  // Calculations mixin) need the same divergence + strict-loading
  // treatment as pluck/pick/count. Without overriding, cp.sum('x') /
  // cp.whereBang({...}); cp.average('y') would both bypass the gate
  // and drop in-place mutations.
  async sum(column?: string): Promise<number | bigint | Record<string, number | bigint>> {
    this._checkStrictLoading();
    const fn = (
      Relation.prototype as unknown as {
        sum: (col?: string) => Promise<number | bigint | Record<string, number | bigint>>;
      }
    ).sum;
    if (this._relationStateDiverged()) return fn.call(this, column);
    const s = this.scope();
    return (
      s as unknown as {
        sum: (col?: string) => Promise<number | bigint | Record<string, number | bigint>>;
      }
    ).sum(column);
  }

  async average(column: string): Promise<unknown | null | Record<string, unknown>> {
    this._checkStrictLoading();
    const fn = (
      Relation.prototype as unknown as {
        average: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).average;
    if (this._relationStateDiverged()) return fn.call(this, column);
    const s = this.scope();
    return (
      s as unknown as {
        average: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).average(column);
  }

  async minimum(column: string): Promise<unknown | null | Record<string, unknown>> {
    this._checkStrictLoading();
    const fn = (
      Relation.prototype as unknown as {
        minimum: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).minimum;
    if (this._relationStateDiverged()) return fn.call(this, column);
    const s = this.scope();
    return (
      s as unknown as {
        minimum: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).minimum(column);
  }

  async maximum(column: string): Promise<unknown | null | Record<string, unknown>> {
    this._checkStrictLoading();
    const fn = (
      Relation.prototype as unknown as {
        maximum: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).maximum;
    if (this._relationStateDiverged()) return fn.call(this, column);
    const s = this.scope();
    return (
      s as unknown as {
        maximum: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).maximum(column);
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
      return unsaved + (await this.count());
    }
    return this.count();
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
   * Mirrors Association#foreign_key_present? — false for vanilla has_many; a
   * has_many :through whose through reflection is a belongs_to can load even a
   * new-record owner once the through FK is set (through_association.rb:90).
   * @internal
   */
  private _foreignKeyPresent(): boolean {
    if (!this._assocDef.options.through) return false;
    const ctor = this._record.constructor as typeof Base;
    const reflection = (ctor as any)._reflectOnAssociation?.(this._assocName);
    if (!reflection) return false;
    return throughForeignKeyPresent({ owner: this._record, reflection });
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
    // common shapes (loadHasMany fallback still loads for the rest).
    if (this._isThrough) return (await this.count()) === 0;
    return !(await this.exists());
  }

  /**
   * Add one or more records to the collection by setting the FK and saving.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#push / #<<
   */
  async push(...records: T[]): Promise<void> {
    this._ensureThroughWritable();
    this._raiseOnTypeMismatch(records);
    // Through association (including HABTM): create join records
    if (this._assocDef.options.through) {
      await this._pushThrough(records);
      return;
    }

    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ??
        this._assocDef.options.queryConstraints ??
        (Array.isArray(primaryKey)
          ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));
    const typeCol = asName ? `${underscore(asName)}_type` : null;
    // insert_record: assign the owner's FK/type onto the record, then save.
    // Mirrors Rails' `CollectionAssociation#insert_record` →
    // `set_owner_attributes` + `record.save`.
    const insertRecord = (record: T): Promise<boolean> => {
      if (Array.isArray(foreignKey)) {
        if (!Array.isArray(primaryKey) || primaryKey.length !== foreignKey.length) {
          throw new Error(
            `Composite foreignKey on "${this._assocName}" requires primaryKey to be an array of the same length`,
          );
        }
        for (let i = 0; i < foreignKey.length; i++) {
          record._writeAttribute(
            foreignKey[i],
            this._record._readAttribute(primaryKey[i] as string),
          );
        }
      } else {
        if (Array.isArray(primaryKey)) {
          throw new Error(
            `Association "${this._assocName}" with composite primaryKey requires a composite foreignKey array`,
          );
        }
        const pkValue = this._record._readAttribute(primaryKey as string);
        record._writeAttribute(foreignKey as string, pkValue);
      }
      if (typeCol) record._writeAttribute(typeCol, ctor.name);
      return record.save();
    };
    for (const record of records) {
      // Route through replace_on_target (via _addToTarget) so set_inverse_instance
      // and @replaced_or_added_targets dedup tracking run on push/<<, mirroring
      // Rails' concat_records → add_to_target(record) { insert_record }. A record
      // already wired into the loaded target by inverse-of setting is replaced in
      // place rather than appended twice.
      // Rails' add_to_target computes `replace: replace || association_scope.distinct_value`
      // so a `distinct` association scope dedups in place on append rather than appending twice.
      await this._addToTarget(record, { replace: this.distinctValue }, () => insertRecord(record));
    }
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
    // Mirror Reflection's foreignKey resolution (reflection.ts:520-535 +
    // deriveFkQueryConstraints at :548-585). When the owner has class-level
    // query constraints and no explicit option, the derived `<owner>_id`
    // *replaces* the owner-PK column inside the constraints list (rather
    // than taking the constraints verbatim, which would put `id` on the
    // join table instead of the actual FK column).
    let ownerFk: string | string[];
    if (throughAssoc.options.foreignKey !== undefined) {
      ownerFk = throughAssoc.options.foreignKey;
    } else if (throughAssoc.options.queryConstraints) {
      ownerFk = throughAssoc.options.queryConstraints;
    } else {
      const derivedFk = `${underscore(ctor.name)}_id`;
      const constraints = ownerHasQueryConstraints.call(ctor as any)
        ? ownerQueryConstraintsList.call(ctor as any)
        : null;
      if (!constraints) {
        ownerFk = derivedFk;
      } else if (constraints.includes(derivedFk)) {
        // Mirrors Reflection#deriveFkQueryConstraints (reflection.ts:573):
        // when the derived FK is itself one of the constraint columns, the
        // FK is just that scalar — the remaining constraints come from
        // scope chains, not the join FK.
        ownerFk = derivedFk;
      } else {
        // Mirror Reflection#deriveFkQueryConstraints validation
        // (reflection.ts:555-571): only 2-column constraints are derivable,
        // and the owner's scalar primary key must be one of them.
        if (constraints.length > 2) {
          throw new ConfigurationError(
            `The query constraints list on the \`${ctor.name}\` model has more than 2 ` +
              `attributes. Active Record is unable to derive the query constraints ` +
              `for the association. You need to explicitly define the query constraints ` +
              `for this association.`,
          );
        }
        const ownerPk = ctor.primaryKey;
        const ownerPkStr = Array.isArray(ownerPk) ? undefined : ownerPk;
        if (ownerPkStr && !constraints.includes(ownerPkStr)) {
          throw new ConfigurationError(
            `The query constraints on the \`${ctor.name}\` model does not include the primary ` +
              `key so Active Record is unable to derive the foreign key constraints for ` +
              `the association. You need to explicitly define the query constraints for this ` +
              `association.`,
          );
        }
        if (ownerPkStr && constraints[0] === ownerPkStr) {
          ownerFk = [derivedFk, constraints[1]];
        } else if (ownerPkStr && constraints[1] === ownerPkStr) {
          ownerFk = [constraints[0], derivedFk];
        } else {
          // Mirrors reflection.ts:583-588 — when constraints can't be
          // resolved (e.g. composite owner PK with class-level
          // queryConstraints), we cannot derive a join-table FK shape
          // without producing invalid columns.
          throw new ConfigurationError(
            `Active Record couldn't correctly interpret the query constraints ` +
              `for the \`${ctor.name}\` model. The query constraints on \`${ctor.name}\` are ` +
              `\`${constraints}\` and the foreign key is \`${derivedFk}\`. ` +
              `You need to explicitly set the query constraints for this association.`,
          );
        }
      }
    }
    const fkCols = Array.isArray(ownerFk) ? ownerFk : [ownerFk as string];

    // Mirror Reflection#active_record_primary_key (reflection.rb:587-603).
    // `options[:query_constraints]` describes the *foreign-key* shape on the
    // join table — Rails never reuses it as the owner PK. The owner PK comes
    // from the class-level `query_constraints_list`, falling back to the
    // model's primaryKey when the option is set on the association but the
    // owner class itself has no class-level constraints.
    let ownerPk: string | string[];
    if (throughAssoc.options.primaryKey !== undefined) {
      ownerPk = throughAssoc.options.primaryKey;
    } else if (
      ownerHasQueryConstraints.call(ctor as any) ||
      throughAssoc.options.queryConstraints
    ) {
      ownerPk =
        ownerQueryConstraintsList.call(ctor as any) ?? (ctor.primaryKey as string | string[]);
    } else if (
      // Rails' id-collapse: a scalar FK against a composite PK that includes
      // "id" pairs with the scalar "id" column (reflection.ts:791-793).
      fkCols.length === 1 &&
      Array.isArray(ctor.primaryKey) &&
      ctor.primaryKey.includes("id")
    ) {
      ownerPk = "id";
    } else {
      ownerPk = ctor.primaryKey as string | string[];
    }
    const pkCols = Array.isArray(ownerPk) ? ownerPk : [ownerPk as string];
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
    // owner identifier. Rails' `Reflection#active_record_primary_key`
    // (reflection.rb:587-604) freely returns a composite-PK array here, and
    // `check_validity!` (reflection.rb:621) explicitly *skips* the
    // composite-PK arity check for polymorphic associations — `join_id_for`
    // (reflection.rb:642-644) then writes an array of values into the
    // single `<as>_id` column, producing a silently-broken IN-shaped WHERE.
    // Trails surfaces the misconfiguration as `ConfigurationError` instead:
    // reject a composite `primaryKey:` outright, and require an explicit
    // single-column `primaryKey:` when the owner has a composite PK so the
    // chosen scalar identifier is deliberate, not silently collapsed.
    const ownerPkOption = throughAssoc.options.primaryKey;
    if (Array.isArray(ownerPkOption)) {
      throw new ConfigurationError(
        `Polymorphic-through "${this._assocName}" cannot use a composite primary key — ` +
          `the schema only supports a single \`${underscore(asName)}_id\`/\`${underscore(asName)}_type\` pair. ` +
          `Set \`primaryKey:\` to a single column on the association.`,
      );
    }
    if (ownerPkOption === undefined && Array.isArray(ctor.primaryKey)) {
      throw new ConfigurationError(
        `Polymorphic-through "${this._assocName}" requires an explicit single-column ` +
          `\`primaryKey:\` option because owner "${ctor.name}" has a composite primary key. ` +
          `The polymorphic schema only stores a single \`${underscore(asName)}_id\` value.`,
      );
    }
    const polyPk = (ownerPkOption ?? (ctor.primaryKey as string)) as string;
    return {
      idCol,
      idValue: this._record._readAttribute(polyPk),
      typeCol: `${underscore(asName)}_type`,
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

  private async _pushThrough(records: T[], skipCallbacks = false, bang = false): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new Error(
        `Through association "${this._assocDef.options.through}" not found on ${ctor.name}`,
      );
    }

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveAssocClass(this._record, throughAssoc.name, throughClassName);
    // Polymorphic-through uses a single `<as>_id`/`<as>_type` pair; the
    // composite-aware helper does not apply. Writes and reads share
    // _throughOwnerPolymorphic so they target the same column.
    const ownerJoinAttrs: Record<string, unknown> = throughAssoc.options.as
      ? (() => {
          const poly = this._throughOwnerPolymorphic(throughAssoc, ctor, throughAssoc.options.as!);
          return { [poly.idCol]: poly.idValue };
        })()
      : this._throughOwnerAttrs(throughAssoc, ctor);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    for (const record of records) {
      // Route the in-memory mutation through `_addToTarget` (Rails'
      // `replace_on_target`) so the through/HABTM branch shares the same
      // set_inverse_instance + `@replaced_or_added_targets` dedup tracking +
      // before/after_add callback handling as the non-through `push`/`<<`
      // path. The `save` callback carries the through-specific join-row work
      // (Rails' `HasManyThroughAssociation#insert_record`); when it resolves
      // false (`record.save` failed, or the join row didn't persist) the
      // record is left out of the target, matching the prior gating.
      const insertJoinRecord = async (): Promise<boolean> => {
        // Owner not yet persisted: defer the join insert. Mirrors Rails'
        // CollectionAssociation#concat_records, which only calls insert_record
        // when `!owner.new_record?` — otherwise it just adds the target to the
        // in-memory collection and lets the owner's after_create autosave
        // create the join row with the resolved owner FK. Inserting now would
        // write a null owner FK (the owner has no id yet) and double-insert
        // once the autosave runs.
        if (this._record.isNewRecord()) return true;
        // Save the target record if it's new
        if (record.isNewRecord()) {
          if (bang) {
            await record.saveBang(); // raises RecordInvalid if invalid
          } else if (!(await record.save())) {
            return false;
          }
        }
        // Create the join record
        const targetPk = (record.constructor as typeof Base).primaryKey;
        if (Array.isArray(targetPk)) {
          throw new ConfigurationError(
            `Through association "${this._assocName}" does not support a composite primary key on the target model "${(record.constructor as typeof Base).name}" — the join row needs a single source FK column.`,
          );
        }
        const joinAttrs: Record<string, unknown> = {
          ...ownerJoinAttrs,
          [sourceFk]: record._readAttribute(targetPk),
        };
        // Polymorphic through: ownerJoinAttrs already has the polymorphic
        // _id column from _throughOwnerPolymorphic; just add the _type.
        if (throughAssoc.options.as) {
          joinAttrs[`${underscore(throughAssoc.options.as)}_type`] = ctor.name;
        }
        let joinRecord: Base;
        if (bang) {
          // Bang form: raise RecordInvalid if join record is invalid (mirrors Rails' save!)
          joinRecord = new throughModel(joinAttrs);
          await joinRecord.saveBang();
        } else {
          joinRecord = await throughModel.create(joinAttrs);
        }
        return joinRecord.isPersisted();
      };
      await this._addToTarget(
        record,
        { skipCallbacks, replace: this.distinctValue },
        insertJoinRecord,
      );
    }
  }

  private _invalidateAssociationIds(): void {
    const assocInstance = (this._record as any)._associationInstances?.get(this._assocName);
    if (assocInstance) {
      (assocInstance as any)._associationIds = null;
      // Mirrors Rails' `reset_scope` after insert_record — without it an
      // instance that was previously loaded via the `record.collectionIds`
      // reader keeps `loaded`/`target` from the pre-push fetch and returns
      // stale data on the next read.
      if (typeof (assocInstance as any).reset === "function") {
        (assocInstance as any).reset();
      }
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
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
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
    const className =
      (opts.className as string | undefined) ?? camelize(singularize(this._assocName));
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
  async concat(...records: T[]): Promise<void> {
    return this.push(...records);
  }

  /**
   * Delete associated records by nullifying the FK (or removing join record for through).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#delete
   */
  // @ts-expect-error CP and Relation share the method name for genuinely
  //   different operations: Relation#delete removes by PK; CP#delete removes
  //   by record reference (association semantics). Intentional permanent
  //   divergence — renaming either would break the Rails API surface.
  //   Accepts Integer/String keys too, mirroring Rails' delete_or_destroy.
  async delete(...records: Array<T | number | string | bigint>): Promise<Base[]> {
    this._ensureThroughWritable();
    // Through (incl. HABTM): delegate to the association-layer delete_records.
    if (this._assocDef.options.through) {
      const assoc = this._record.association(this._assocName) as unknown as {
        delete: (...r: Array<Base | number | string | bigint>) => Promise<Base[]>;
      };
      const removed = await assoc.delete(...records);
      this._removeFromTarget(removed);
      return removed;
    }
    // Coerce id args via the scoped `find` (Rails delete_or_destroy).
    const modelRecords = records.every((r) => typeof r === "object")
      ? (records as T[])
      : ([await this.find(...(records as unknown[]))].flat().filter(Boolean) as T[]);

    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const ownerPk = this._assocDef.options.primaryKey ?? ctor.primaryKey;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ??
        this._assocDef.options.queryConstraints ??
        (Array.isArray(ownerPk)
          ? ownerPk.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));
    const typeCol = asName ? `${underscore(asName)}_type` : null;
    const removed: Base[] = [];
    for (const record of modelRecords) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record)) continue;
      if (Array.isArray(foreignKey)) {
        for (const fk of foreignKey) {
          record._writeAttribute(fk, null);
        }
      } else {
        record._writeAttribute(foreignKey as string, null);
      }
      if (typeCol) record._writeAttribute(typeCol, null);
      const saved = await record.save();
      if (saved) {
        removed.push(record);
        fireAssocCallbacks(this._assocDef.options.afterRemove, this._record, record);
      }
    }
    this._removeFromTarget(removed);
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

  private async _deleteThrough(records: Base[]): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) return;

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveAssocClass(this._record, throughAssoc.name, throughClassName);
    // Polymorphic through goes through _throughOwnerPolymorphic (same lookup
    // shape as _pushThrough / _buildThroughScope); composite owners go
    // through the column-paired helper.
    const throughAs = throughAssoc.options.as;
    const poly = throughAs ? this._throughOwnerPolymorphic(throughAssoc, ctor, throughAs) : null;
    const ownerConditions: Record<string, unknown> = poly
      ? { [poly.idCol]: poly.idValue, [poly.typeCol]: poly.typeValue }
      : this._throughOwnerAttrs(throughAssoc, ctor);
    // Guard against unsaved owners / missing composite components — otherwise
    // findBy({fk: null}) would translate to IS NULL and could destroy an
    // orphan join row. Mirrors the short-circuits in _buildThroughScope and
    // _deleteThroughAllSql.
    if (poly ? poly.idValue == null : Object.values(ownerConditions).some((v) => v == null)) {
      return;
    }
    // Apply the polymorphic-source discriminator the same way _deleteThroughAllSql
    // and _buildThroughScope do, so we don't destroy a join row belonging to a
    // different source type that happens to share the id.
    if (this._assocDef.options.sourceType) {
      const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
      ownerConditions[`${underscore(sourceName)}_type`] = this._assocDef.options.sourceType;
    }
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    const removed: Base[] = [];
    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record)) continue;
      const targetPk = record._readAttribute(
        (record.constructor as typeof Base).primaryKey as string,
      );
      const joinRecord = await throughModel.findBy({
        ...ownerConditions,
        [sourceFk]: targetPk,
      });
      if (joinRecord) {
        await joinRecord.destroy();
        if (joinRecord.isDestroyed()) {
          removed.push(record);
          fireAssocCallbacks(this._assocDef.options.afterRemove, this._record, record);
        }
      }
    }
    this._removeFromTarget(removed);
  }

  private async _deleteThroughAllSql(): Promise<number> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) return 0;

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveAssocClass(this._record, throughAssoc.name, throughClassName);
    const throughAs = throughAssoc.options.as;
    let conditions: Record<string, unknown>;
    if (throughAs) {
      const poly = this._throughOwnerPolymorphic(throughAssoc, ctor, throughAs);
      if (poly.idValue == null) return 0;
      conditions = { [poly.idCol]: poly.idValue, [poly.typeCol]: poly.typeValue };
    } else {
      conditions = this._throughOwnerAttrs(throughAssoc, ctor);
      if (Object.values(conditions).some((v) => v == null)) return 0;
    }
    if (this._assocDef.options.sourceType) {
      const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
      conditions[`${underscore(sourceName)}_type`] = this._assocDef.options.sourceType;
    }
    return (throughModel as any).where(conditions).deleteAll();
  }

  private _buildNullifyUpdates(): Record<string, null> {
    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;
    const foreignKey =
      this._assocDef.options.foreignKey ??
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
      updates[foreignKey as string] = null;
    }
    if (asName) updates[`${underscore(asName)}_type`] = null;
    return updates;
  }

  /**
   * Destroy associated records (runs callbacks and deletes from DB).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#destroy
   */
  // @ts-expect-error CP and Relation share the method name for genuinely
  //   different operations: Relation#destroy removes by PK; CP#destroy
  //   destroys by record reference (association semantics). Intentional
  //   permanent divergence — same rationale as CP#delete above.
  async destroy(...records: T[]): Promise<void> {
    const destroyed: Base[] = [];
    for (const record of records) {
      await record.destroy();
      if (record.isDestroyed()) destroyed.push(record);
    }
    // Remove join/through rows only for successfully destroyed records
    if (destroyed.length > 0) {
      if (this._isThrough) {
        await this._deleteThrough(destroyed);
      } else {
        this._removeFromTarget(destroyed);
      }
    }
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
      // Mirror `deleteAll`'s divergence guard: when in-place proxy mutations
      // (whereBang / ...) have run, `scope()` would rebuild the unmutated
      // association scope and remove MORE rows than the caller constrained, so
      // go through `super.*`.
      const diverged = this._relationStateDiverged();
      if (deleteRows) {
        await (diverged ? super.deleteAll() : this.scope().deleteAll());
      } else {
        const nullUpdates = this._buildNullifyUpdates();
        await (diverged ? super.updateAll(nullUpdates) : this.scope().updateAll(nullUpdates));
      }
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
      const className =
        (this._assocDef.options.className as string | undefined) ??
        camelize(singularize(this._assocName));
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
   * Return the first associated record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first
   */
  override first(): Promise<T | null>;
  override first(n: number): Promise<T[]>;
  override async first(n?: number): Promise<T | T[] | null> {
    if (n !== undefined) assertValidLimit(n);
    const records = await this.toArray();
    if (n === undefined) return records[0] ?? null;
    return records.slice(0, n);
  }

  /**
   * Return the last associated record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#last
   */
  override last(): Promise<T | null>;
  override last(n: number): Promise<T[]>;
  override async last(n?: number): Promise<T | T[] | null> {
    if (n !== undefined) assertValidLimit(n);
    const records = await this.toArray();
    if (n === undefined) return records[records.length - 1] ?? null;
    return records.slice(Math.max(0, records.length - n));
  }

  /**
   * Return the first n records (or first record if n omitted).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#take
   */
  override take(): Promise<T | null>;
  override take(limit: number): Promise<T[]>;
  override async take(n?: number): Promise<T | T[] | null> {
    if (n !== undefined) assertValidLimit(n);
    const records = await this.toArray();
    if (n === undefined) return records[0] ?? null;
    return records.slice(0, n);
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
    return (await this.count()) > 1;
  }

  /**
   * True if the collection has no records.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#none?
   */
  // @ts-expect-error Rails Relation#none? fires a query (Enumerable#none?
  //   via each); our Relation#isNone only checks the NullRelation flag.
  //   CP must fire a count query to check actual emptiness. Permanent.
  async isNone(predicate?: (record: T) => boolean): Promise<boolean> {
    if (predicate !== undefined) {
      const records = await this.loadTarget();
      for (const r of records) {
        if (predicate(r)) return false;
      }
      return true;
    }
    return (await this.count()) === 0;
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
      const targetModel = this.model as typeof Base;
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
   * Replace the collection with a new set of records.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#replace
   */
  async replace(records: T[]): Promise<void> {
    this._ensureThroughWritable();
    await this.clear();
    await this.push(...records);
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
   * Mirrors: ActiveRecord::Associations::CollectionProxy#find
   */
  override find(ids: unknown[]): Promise<T[]>;
  override find(id: unknown): Promise<T>;
  override find(...ids: unknown[]): Promise<T | T[]>;
  override async find(...args: unknown[]): Promise<T | T[]> {
    // Rails-faithful cache gate: CollectionAssociation#find in Rails
    // only uses the in-memory loaded target when BOTH `inverse_of` is
    // declared AND the association is `loaded?`. Otherwise it
    // delegates to `scope.find(...)` (i.e. Relation.find via SQL).
    // Gate runs FIRST so the non-cache path doesn't do duplicate
    // arg-normalization — super.find runs its own normalize.
    const inverseOf = this._assocDef.options.inverseOf;
    const useCache = !!inverseOf && this._targetLoaded;
    if (!useCache) {
      // Non-cache path hits the DB — enforce strict-loading the same
      // way the other query-executing proxy methods do. super.find
      // goes through Relation.where(...).toArray(), which wraps CP
      // as the `this` of its intermediate relations; the strict-
      // loading guard lives on AssociationRelation.toArray(), not
      // here. For the direct-on-CP call we check explicitly so
      // owner.strictLoadingBang() can't be bypassed via proxy.find.
      this._checkStrictLoading();
      return (await super.find(...args)) as T | T[];
    }

    const targetModel = this.model as typeof Base;
    const pk = targetModel.primaryKey ?? "id";
    const composite = Array.isArray(pk);

    // Shared arg normalization + deterministic-error raising (empty
    // list / composite arity). Same message + id shape as
    // Relation.performFind.
    const normalized = normalizeFindArgs(targetModel.name, pk, args);
    const { ids, wantArray, tuples } = normalized;

    const records = this._target;

    // Cast incoming ids through the target model's attribute types so
    // in-memory find matches Relation.find's WHERE-condition casting
    // (e.g. proxy.find("1") on an integer PK). For composite keys,
    // cast each tuple element by its PK column.
    const castFn = (
      targetModel as typeof Base & {
        _castAttributeValue?: (attributeName: string, value: unknown) => unknown;
      }
    )._castAttributeValue;
    const castId = (id: unknown): unknown => {
      if (composite) {
        const cols = pk as string[];
        const values = id as unknown[];
        return castFn ? cols.map((c, i) => castFn.call(targetModel, c, values[i])) : values;
      }
      return castFn ? castFn.call(targetModel, pk as string, id) : id;
    };

    // Index records by PK once — O(records + ids) instead of
    // O(records × ids). Composite keys join with a NUL separator
    // (unambiguous + bigint-safe; JSON.stringify throws on bigint
    // and this codebase's big_integer type casts to bigint).
    const TUPLE_SEP = "\u0000";
    const keyForTuple = (tuple: unknown[]): string => tuple.map((x) => String(x)).join(TUPLE_SEP);
    const keyForRecord = (r: Base): string => {
      if (composite) {
        const cols = pk as string[];
        return keyForTuple(cols.map((c) => r._readAttribute(c)));
      }
      return String(r._readAttribute(pk as string));
    };
    const keyForCastedId = (castedId: unknown): string => {
      if (composite) return keyForTuple(castedId as unknown[]);
      return String(castedId);
    };
    const byPk = new Map<string, T>();
    for (const r of records) byPk.set(keyForRecord(r), r);

    // Composite + any-multi: always use the "Couldn't find all" shape
    // (matches performFind). Simple-PK single-id uses "with 'pk'=id".
    if (tuples || wantArray || ids.length > 1) {
      // Duplicate-id handling matches performFind: compare distinct
      // found keys to requested count. `find([1, 1])` raises.
      const castedIds = ids.map(castId);
      const uniqueFoundKeys = new Set(castedIds.map(keyForCastedId).filter((k) => byPk.has(k)));
      if (uniqueFoundKeys.size !== ids.length) {
        raiseNotFoundAll(targetModel.name, pk, normalized);
      }
      // Return in DB/load order, matching performFind.
      const wantedKeys = new Set(castedIds.map(keyForCastedId));
      const found = records.filter((r) => wantedKeys.has(keyForRecord(r)));
      return wantArray ? found : found[0];
    }

    // Simple PK, single scalar id.
    const id = ids[0];
    const match = byPk.get(keyForCastedId(castId(id)));
    if (!match) raiseNotFoundSingle(targetModel.name, pk as string, id);
    return match;
  }

  /**
   * Set the collection to exactly the records identified by ids.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#ids=
   */
  async setIds(ids: (number | string)[]): Promise<void> {
    const targetModel = this.model as typeof Base;
    const cleanIds = ids.filter((id) => id !== null && id !== undefined && id !== "");
    const records = (await Promise.all(cleanIds.map((id) => targetModel.find(Number(id))))) as T[];
    await this.replace(records);
  }

  async pluck(
    ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]> {
    // Loaded-target fast path only handles bare string column names —
    // readAttribute can't resolve Arel nodes. For any non-string arg,
    // fall through to scope().pluck(...) so Relation's SQL path runs.
    const allStrings = columns.every((c) => typeof c === "string");
    if (allStrings && (this._isThrough || this._targetLoaded)) {
      const stringCols = columns as string[];
      const records = (this._isThrough ? await this.toArray() : this._target).filter(
        (r) => !r.isNewRecord(),
      );
      if (stringCols.length === 1) {
        return records.map((r) => r._readAttribute(stringCols[0]));
      }
      return records.map((r) => stringCols.map((c) => r._readAttribute(c)));
    }
    this._checkStrictLoading();
    // Scope bangs on the proxy itself: scope() rebuilds the unmutated
    // association relation and would drop the mutation. super.pluck
    // uses the inherited (mutated) Relation state instead.
    if (this._relationStateDiverged()) {
      return super.pluck(...columns);
    }
    return this.scope().pluck(...columns);
  }

  async pick(
    ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown> {
    const allStrings = columns.every((c) => typeof c === "string");
    if (allStrings && (this._isThrough || this._targetLoaded)) {
      const stringCols = columns as string[];
      const records = (this._isThrough ? await this.toArray() : this._target).filter(
        (r) => !r.isNewRecord(),
      );
      if (records.length === 0) return null;
      if (stringCols.length === 1) return records[0]._readAttribute(stringCols[0]);
      return stringCols.map((c) => records[0]._readAttribute(c));
    }
    this._checkStrictLoading();
    // Same divergence gate as pluck().
    if (this._relationStateDiverged()) {
      return super.pick(...columns);
    }
    return this.scope().pick(...columns);
  }

  async reload(): Promise<Omit<this, "then">> {
    this._targetLoaded = false;
    this._target = [];
    this._replacedOrAddedTargets.clear();
    await this.load();
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
    return this;
  }

  scope(): any {
    if (this._isThrough) {
      return this._wrapAsAssociationRelation(this._buildThroughScope());
    }

    const rel = buildHasManyRelation(this._record, this._assocName, this._assocDef.options);
    if (rel === null) {
      const targetModel = this.model as typeof Base;
      let emptyRel = (targetModel as any).all();
      if (this._assocDef.options.scope) {
        emptyRel = this._assocDef.options.scope(emptyRel);
      }
      return this._wrapAsAssociationRelation(emptyRel.none());
    }
    return this._wrapAsAssociationRelation(rel);
  }

  /**
   * Promote a plain Relation produced by `buildHasManyRelation` /
   * `_buildThroughScope` into an AssociationRelation bound to this proxy.
   * Matching Rails' CollectionAssociation#scope — writes on the returned
   * relation (build / create / create!) route back through the owning
   * association so FK, inverse, and loaded target stay in sync.
   */
  private _wrapAsAssociationRelation(rel: any): any {
    if (!_AssociationRelationCtor) {
      // Defensive: only reachable if a consumer deep-imports this file
      // without loading the @blazetrails/activerecord package entry,
      // which re-exports association-relation.ts (where the ctor
      // self-registers). A direct side-effect import here would
      // reintroduce the Base↔Relation↔AssociationRelation evaluation
      // cycle we used late-binding to break in the first place.
      throw new Error(
        "AssociationRelation constructor has not been registered. Import " +
          "from '@blazetrails/activerecord' (the package entry) rather than " +
          "deep-importing './associations/collection-proxy.js'.",
      );
    }
    const ar = new _AssociationRelationCtor(rel.model, this);
    ar._copyStateFrom(rel);
    return wrapWithScopeProxy(ar);
  }

  private _buildThroughScope(): any {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new Error(
        `Through association "${this._assocDef.options.through}" not found on ${ctor.name}`,
      );
    }

    const targetModel = this.model as typeof Base;
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveAssocClass(this._record, throughAssoc.name, throughClassName);
    const throughModelAssocs: AssociationDefinition[] = (throughModel as any)._associations ?? [];
    const sourceAssoc =
      throughModelAssocs.find((a) => a.name === sourceName) ??
      throughModelAssocs.find((a) => a.name === pluralize(sourceName));

    const throughAs = throughAssoc.options.as;
    const throughTable = new ArelTable(throughModel.tableName);
    const targetArelTable = new ArelTable(targetModel.tableName);
    const sourceAssocKind = sourceAssoc?.type ?? "belongsTo";

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

    if (sourceAssocKind === "belongsTo") {
      const targetFk = sourceAssoc?.options?.foreignKey ?? `${underscore(sourceName)}_id`;
      if (Array.isArray(targetFk)) {
        throw new ConfigurationError(
          `Through association "${this._assocName}" does not support a composite foreign key on the source belongsTo — the target-side IN-subquery needs a single column.`,
        );
      }
      if (Array.isArray(targetModel.primaryKey)) {
        throw new ConfigurationError(
          `Through association "${this._assocName}" does not support a composite primary key on the target model "${targetModel.name}" — the target-side IN-subquery needs a single column.`,
        );
      }
      const targetFkStr = targetFk;
      const targetPkCol = targetModel.primaryKey;

      // Handle sourceType for polymorphic belongsTo sources
      if (sourceAssoc?.options?.polymorphic && this._assocDef.options.sourceType) {
        const sourceTypeCol = `${underscore(sourceAssoc.name ?? sourceName)}_type`;
        throughSubquery = throughSubquery.where(
          throughTable.get(sourceTypeCol).eq(this._assocDef.options.sourceType),
        );
      }

      throughSubquery.project(throughTable.get(targetFkStr));
      const inNode = targetArelTable.get(targetPkCol).in(throughSubquery);

      let rel = (targetModel as any).all().where(inNode);
      if (this._assocDef.options.scope) rel = this._assocDef.options.scope(rel);
      return rel;
    } else {
      const sourceAsName = sourceAssoc?.options?.as;
      const sourceFk = sourceAsName
        ? (sourceAssoc?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
        : (sourceAssoc?.options?.foreignKey ?? `${underscore(throughClassName)}_id`);
      if (Array.isArray(sourceFk)) {
        throw new ConfigurationError(
          `Through association "${this._assocName}" does not support a composite foreign key on the hasMany source — the target-side IN-subquery needs a single column.`,
        );
      }
      if (Array.isArray(throughModel.primaryKey)) {
        throw new ConfigurationError(
          `Through association "${this._assocName}" does not support a composite primary key on the through model "${throughModel.name}" — the target-side IN-subquery needs a single column.`,
        );
      }
      const sourceFkStr = sourceFk;
      const throughPkCol = throughModel.primaryKey;

      throughSubquery.project(throughTable.get(throughPkCol));
      const inNode = targetArelTable.get(sourceFkStr).in(throughSubquery);

      let rel = (targetModel as any).all().where(inNode);
      if (sourceAsName) {
        rel = rel.where({ [`${underscore(sourceAsName)}_type`]: throughClassName });
      }
      if (this._assocDef.options.scope) rel = this._assocDef.options.scope(rel);
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
   * Build and save a new associated record, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#create!
   */
  async createBang(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async createBang(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async createBang(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attrs)) {
      const records: T[] = [];
      for (const a of attrs) records.push((await this.createBang(a, block)) as T);
      return records;
    }
    this._ensureThroughWritable();
    if (this._isThrough) {
      const ctor = this._record.constructor as typeof Base;
      if (this._record.isNewRecord()) {
        throw new RecordNotSaved(
          `Cannot create through association on an unpersisted ${ctor.name}`,
        );
      }
      const record = this._buildThrough(attrs) as T;
      if (block) block(record);
      if (!fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)) {
        throw new RecordNotSaved("Callback prevented record creation", record);
      }
      const saved = await record.save();
      if (!saved) throw new RecordInvalid(record);
      const targetBefore = this._target.length;
      await this._pushThrough([record], true);
      if (this._target.length === targetBefore) {
        throw new RecordNotSaved("Failed to create join record for through association", record);
      }
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
      return record;
    }
    const record = this._buildRaw(attrs) as T;
    if (block) block(record);
    if (!fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)) {
      throw new RecordNotSaved("Callback prevented record creation", record);
    }
    const saved = await record.save();
    if (!saved) throw new RecordInvalid(record);
    this._target.push(record);
    fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    return record;
  }

  /**
   * Delete all records from the collection according to the dependent strategy.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#delete_all
   */
  async deleteAll(dependent?: string): Promise<number> {
    this._ensureThroughWritable();
    // Rails normalizes dependent: :destroy → :delete_all for deleteAll,
    // because deleteAll should never run destroy callbacks (use destroyAll for that).
    const raw = dependent ?? (this._assocDef.options.dependent as string | undefined);
    let strategy: "delete_all" | "nullify";
    switch (raw) {
      case undefined:
      case "delete_all":
      case "deleteAll":
      case "delete":
      case "destroy":
        strategy = "delete_all";
        break;
      case "nullify":
        strategy = "nullify";
        break;
      default:
        throw new Error(
          `deleteAll only accepts "nullify", "delete_all", "deleteAll", "delete", or "destroy". Received: "${raw}"`,
        );
    }

    // If the proxy's inherited Relation state has been mutated in place
    // (e.g. cp.whereBang(...)), go through super.deleteAll() /
    // super.updateAll() directly — scope() would rebuild the
    // unmutated association scope and delete/nullify MORE rows than
    // the caller constrained. NOT `this.deleteAll()` / `this.updateAll()`
    // here: those resolve back to CollectionProxy's own methods and
    // would recurse.
    const diverged = this._relationStateDiverged();
    // Through and diverged paths bypass scope(), which is where AR
    // gates strict-loading. Enforce directly so deleteAll is
    // consistent regardless of through/diverged state. The
    // non-diverged non-through branch goes through scope() which
    // produces an AR and enforces the same gate on its own.
    if (this._isThrough || diverged) {
      this._checkStrictLoading();
    }
    let count: number;
    if (strategy === "delete_all") {
      if (this._isThrough) {
        // For through associations, delete join rows via SQL — not the target records
        count = await this._deleteThroughAllSql();
      } else if (diverged) {
        count = await super.deleteAll();
      } else {
        count = await this.scope().deleteAll();
      }
    } else {
      // Nullify: set-based SQL update to null FKs (no per-record callbacks)
      if (this._isThrough) {
        count = await this._deleteThroughAllSql();
      } else {
        const nullUpdates = this._buildNullifyUpdates();
        if (diverged) {
          count = await super.updateAll(nullUpdates);
        } else {
          count = await this.scope().updateAll(nullUpdates);
        }
      }
    }
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
   */
  async calculate(operation: "count", column?: string): Promise<number | Record<string, number>>;
  async calculate(
    operation: "sum",
    column: string,
  ): Promise<number | bigint | Record<string, number | bigint>>;
  async calculate(
    operation: "average",
    column: string,
  ): Promise<unknown | null | Record<string, unknown>>;
  async calculate(
    operation: "minimum" | "maximum",
    column: string,
  ): Promise<unknown | null | Record<string, unknown>>;
  async calculate(operation: string, columnName?: string): Promise<unknown> {
    const op =
      operation === "avg"
        ? "average"
        : operation === "min"
          ? "minimum"
          : operation === "max"
            ? "maximum"
            : operation;

    if (op !== "count" && columnName == null) {
      throw new Error(`Column name is required for calculation operation: ${op}`);
    }
    const s = this.scope();
    if (op === "count" && columnName == null && typeof s.count === "function") {
      return s.count();
    }
    if (typeof s.calculate === "function") {
      return s.calculate(op, columnName);
    }
    // Fallback: compute in-memory from loaded records
    const records = await this.loadTarget();
    if (op === "count") return records.length;
    if (columnName == null) {
      throw new Error(`Column name is required for calculation operation: ${op}`);
    }
    const values = records
      .map((r) => r.readAttribute(columnName))
      .filter((v) => v != null) as number[];
    switch (op) {
      case "sum":
        return values.reduce((a, b) => Number(a) + Number(b), 0);
      case "average":
        return values.length > 0
          ? values.reduce((a, b) => Number(a) + Number(b), 0) / values.length
          : null;
      case "minimum":
        return values.length > 0 ? Math.min(...values.map(Number)) : null;
      case "maximum":
        return values.length > 0 ? Math.max(...values.map(Number)) : null;
      default:
        throw new Error(`Unknown calculation operation: ${op}`);
    }
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
      reset: () => this.reset(),
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
   * Alias for push/<<.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#append
   */
  async append(...records: T[]): Promise<void> {
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
      await this._pushThrough(records, false, true);
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
      if (
        typeof (record as any).hasChangesToSave === "function" &&
        (record as any).hasChangesToSave()
      ) {
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
    // No-op: scope() rebuilds the relation each call, so there's nothing
    // cached to clear. Rails resets @scope/@offsets/@take here.
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
   * Mirrors: Ruby's Enumerable#each on CollectionProxy
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
  protected override _newRelation(): Relation<T> {
    if (!_AssociationRelationCtor) {
      throw new ConfigurationError(
        "CollectionProxy._newRelation: AssociationRelation constructor not set — " +
          "association-relation.ts must be loaded first",
      );
    }
    return new _AssociationRelationCtor(this.model as typeof Base, this) as Relation<T>;
  }
}

// Route `await proxy` through `load()` (not `toArray`) so the thenable
// also hydrates `_target` — matches the documented contract that
// `await proxy; proxy[0]` / `proxy.target.length` work after a single await.
// `toArray()` stays available for callers who want a fresh array
// without hydrating this proxy's `_target` / `_loaded` (it still goes
// through `loadHasMany`, which syncs into the record's association
// instance cache — only this proxy's local cache is left untouched).
applyThenable(CollectionProxy.prototype, "load");

// Register the constructor so associations.ts can late-bind (it can't
// value-import CP at module init without re-entering the cycle).
_setCollectionProxyCtor(
  CollectionProxy as unknown as Parameters<typeof _setCollectionProxyCtor>[0],
);

/** @internal */
function findNthWithLimit(
  proxy: CollectionProxy<any>,
  index: number,
  limit: number,
): Promise<any[]> {
  if (isFindFromTarget(proxy)) {
    // await target hydration before slicing — loadTarget() is async
    return Promise.resolve((proxy as any).loadTarget?.()).then(() => {
      const records = (proxy as any)._association?.target;
      return Array.isArray(records) ? records.slice(index, index + limit) : [];
    });
  }
  return (proxy as any).limit(limit).offset(index).toArray();
}

/** @internal */
function findNthFromLast(proxy: CollectionProxy<any>, index: number): Promise<any> {
  const records = (proxy as any)._association?.target;
  if (Array.isArray(records)) {
    // index=1 → last (records[-1]), index=2 → second-to-last (records[-2]), etc.
    // Matches Rails: records[-index] == records[length - index]
    return Promise.resolve(records[records.length - index] ?? null);
  }
  // Mirror finder-methods.ts: reverse order then take a positive offset
  // (negative offset is not valid SQL on most adapters)
  return (proxy as any)
    .reverseOrder?.()
    .offset(index - 1)
    .limit(1)
    .toArray()
    .then((r: any[]) => r[0] ?? null);
}

/** @internal */
function isNullScope(proxy: CollectionProxy<any>): boolean {
  return !!(proxy as any)._association?.isNullScope?.();
}

/** @internal */
function isFindFromTarget(proxy: CollectionProxy<any>): boolean {
  return !!(proxy as any)._association?.isFindFromTarget?.();
}

/** @internal */
function execQueries(proxy: CollectionProxy<any>): Promise<any[]> {
  return proxy.loadTarget() as Promise<any[]>;
}
