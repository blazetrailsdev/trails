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
import { StrictLoadingViolationError, RecordNotSaved, ConfigurationError } from "../errors.js";
import { RecordInvalid } from "../validations.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughNestedAssociationsAreReadonly,
  HasManyThroughOrderError,
} from "./errors.js";
import { getInheritanceColumn, findStiClass } from "../inheritance.js";
import type { AssociationDefinition } from "../associations.js";
import {
  resolveModel,
  fireAssocCallbacks,
  buildHasManyRelation,
  loadHasMany,
  _canRouteThroughViaAssociationScope,
} from "../associations.js";
import { _setCollectionProxyCtor } from "./collection-proxy-slot.js";

// Declaration merging with `class CollectionProxy extends Relation`
// propagates Relation's method types into this interface. `load()`
// diverges (CP returns T[], Relation returns LoadedRelation<this>)
// and the conflict surfaces here too. Same PR B plan as on the class.
// @ts-expect-error see block comment above — declaration-merge `load()` divergence
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
  TExtensions extends Record<string, any> = Record<string, any>,
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
    const targetModel = resolveModel(className) as typeof Base;
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
      resolveModel(className); // throws if the target model isn't registered
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

    // Apply extend option — mix methods into this proxy instance
    const ext = assocDef.options.extend;
    if (ext) {
      const extensions = Array.isArray(ext) ? ext : [ext];
      for (const mod of extensions) {
        for (const [key, fn] of Object.entries(mod)) {
          if (typeof fn === "function") {
            (this as Record<string, unknown>)[key] = fn.bind(this);
          }
        }
      }
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
    const unsaved = this._target.filter((r) => r.isNewRecord());
    if (unsaved.length > 0) {
      return [...results, ...unsaved];
    }
    return results;
  }

  // @ts-expect-error CP's load returns loaded records (association-hydrated
  //   target), not a LoadedRelation<this>. Intentional divergence; PR B
  //   will remove CP's load in favor of Relation's.
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
      const vals = pk.map((col) => r.readAttribute(col));
      if (vals.some((v) => v == null)) return null;
      return JSON.stringify(vals);
    }
    const val = r.readAttribute(pk as string);
    return val == null ? null : String(val);
  }

  private get _isThrough(): boolean {
    return !!this._assocDef.options.through;
  }

  private _checkStrictLoading(): void {
    if (this._record._strictLoading && !this._record._strictLoadingBypassCount) {
      throw StrictLoadingViolationError.forAssociation(this._record, this._assocName);
    }
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
  build(attrs: Record<string, unknown> = {}): T {
    // Through association: build the target record (no FK on target)
    if (this._isThrough) {
      const record = this._buildThrough(attrs) as T;
      const allowed = fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
      if (allowed) {
        this._target.push(record);
        fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
      }
      return record;
    }

    const record = this._buildRaw(attrs) as T;
    const allowed = fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
    if (allowed) {
      this._target.push(record);
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    }
    return record;
  }

  private _buildRaw(attrs: Record<string, unknown> = {}): Base {
    const ctor = this._record.constructor as typeof Base;
    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;

    // Polymorphic "as" option
    const asName = this._assocDef.options.as;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`);

    const buildAttrs: Record<string, unknown> = {
      ...attrs,
      [foreignKey as string]: this._record.readAttribute(primaryKey as string),
    };
    if (asName) {
      buildAttrs[`${underscore(asName)}_type`] = ctor.name;
    }

    let targetModel = resolveModel(className);

    // STI: if a type attribute is provided, resolve to the correct subclass
    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol && buildAttrs[inheritanceCol]) {
      const typeName = buildAttrs[inheritanceCol] as string;
      targetModel = findStiClass(targetModel, typeName);
    }

    return new targetModel(buildAttrs);
  }

  private _buildThrough(attrs: Record<string, unknown> = {}): Base {
    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    let targetModel = resolveModel(className);

    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol && attrs[inheritanceCol]) {
      const typeName = attrs[inheritanceCol] as string;
      targetModel = findStiClass(targetModel, typeName);
    }

    return new targetModel(attrs);
  }

  /**
   * Build and save a new associated record.
   */
  async create(attrs: Record<string, unknown> = {}): Promise<T> {
    this._ensureThroughWritable();
    if (this._isThrough) {
      return (await this._createThrough(attrs)) as T;
    }
    const record = this._buildRaw(attrs) as T;
    if (!fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)) {
      return record;
    }
    const saved = await record.save();
    if (saved) {
      this._target.push(record);
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    }
    return record;
  }

  // NOTE: If _pushThrough fails after the target is saved, the target record
  // will be orphaned (no join row). Rails wraps this in a transaction. We don't
  // have transaction support yet — tracked in the roadmap under "Transactions".
  private async _createThrough(attrs: Record<string, unknown> = {}): Promise<Base> {
    const ctor = this._record.constructor as typeof Base;
    if (this._record.isNewRecord()) {
      throw new Error(`Cannot create through association on an unpersisted ${ctor.name}`);
    }
    const record = this._buildThrough(attrs) as T;
    const saved = await record.save();
    if (!saved) return record;
    await this._pushThrough([record]);
    return record;
  }

  /**
   * Count associated records.
   */
  // @ts-expect-error Relation defines `count` as a property (from the
  //   calculations mixin); CP declares it as a method with association
  //   semantics (loaded-target fast path). PR B will delete CP's count
  //   and let Relation's win.
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
    // `disable_joins: true` through-associations don't have a single
    // JOIN-based relation to count against — DJAS walks the chain in
    // separate queries and `this.scope()` returns the final-step's
    // relation without the prior chain's IN filters (nested-through
    // shapes surface as `no such column` errors when running a
    // direct COUNT). Fall back to the loader on that path.
    // Non-disable-joins through associations are handled by
    // `_buildThroughScope()` which builds a JOIN-based Relation that
    // counts correctly.
    // Through-associations: only take the scope().count() fast path
    // when the shape is one AssociationScope can route. The shared
    // predicate already excludes nested-through, disable-joins,
    // polymorphic-has_many sources, and polymorphic-belongsTo
    // sources without sourceType — all shapes where
    // _buildThroughScope produces SQL that either references the
    // wrong table's columns or can't disambiguate the target table.
    // For those, fall back to the loader (which has its own
    // per-shape handling). Matches the gate used by
    // loadHasMany / loadHasOne in associations.ts:659.
    if (this._assocDef.options.through) {
      const ctor = this._record.constructor as typeof Base;
      const refl = (ctor as any)._reflectOnAssociation?.(this._assocName);
      if (!_canRouteThroughViaAssociationScope(refl, this._assocDef.options)) {
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
  // @ts-expect-error sum is a property on Relation (Calculations mixin);
  //   method override is intentional to gate + honor divergence.
  async sum(column?: string): Promise<number | Record<string, number>> {
    this._checkStrictLoading();
    const fn = (
      Relation.prototype as unknown as {
        sum: (col?: string) => Promise<number | Record<string, number>>;
      }
    ).sum;
    if (this._relationStateDiverged()) return fn.call(this, column);
    const s = this.scope();
    return (
      s as unknown as { sum: (col?: string) => Promise<number | Record<string, number>> }
    ).sum(column);
  }

  // @ts-expect-error see `sum`.
  async average(column: string): Promise<number | null | Record<string, number>> {
    this._checkStrictLoading();
    const fn = (
      Relation.prototype as unknown as {
        average: (col: string) => Promise<number | null | Record<string, number>>;
      }
    ).average;
    if (this._relationStateDiverged()) return fn.call(this, column);
    const s = this.scope();
    return (
      s as unknown as { average: (col: string) => Promise<number | null | Record<string, number>> }
    ).average(column);
  }

  // @ts-expect-error see `sum`.
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

  // @ts-expect-error see `sum`.
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
    if (this._targetLoaded) return this._target.length;
    return this.count();
  }

  /**
   * Check if the collection is empty.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#empty?
   */
  async isEmpty(): Promise<boolean> {
    return (await this.count()) === 0;
  }

  /**
   * Add one or more records to the collection by setting the FK and saving.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#push / #<<
   */
  async push(...records: T[]): Promise<void> {
    this._ensureThroughWritable();
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
    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)) continue;
      if (Array.isArray(foreignKey)) {
        if (!Array.isArray(primaryKey) || primaryKey.length !== foreignKey.length) {
          throw new Error(
            `Composite foreignKey on "${this._assocName}" requires primaryKey to be an array of the same length`,
          );
        }
        for (let i = 0; i < foreignKey.length; i++) {
          record.writeAttribute(foreignKey[i], this._record.readAttribute(primaryKey[i] as string));
        }
      } else {
        if (Array.isArray(primaryKey)) {
          throw new Error(
            `Association "${this._assocName}" with composite primaryKey requires a composite foreignKey array`,
          );
        }
        const pkValue = this._record.readAttribute(primaryKey as string);
        record.writeAttribute(foreignKey as string, pkValue);
      }
      if (typeCol) record.writeAttribute(typeCol, ctor.name);
      const saved = await record.save();
      if (saved) {
        this._target.push(record);
        fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
      }
    }
  }

  private async _pushThrough(records: T[], skipCallbacks = false): Promise<void> {
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
    const throughModel = resolveModel(throughClassName);
    const ownerFk = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    if (Array.isArray(ownerFk)) {
      throw new Error(
        `Through associations do not support composite foreign keys on "${this._assocName}".`,
      );
    }
    const primaryKey = throughAssoc.options.primaryKey ?? ctor.primaryKey;
    if (Array.isArray(primaryKey)) {
      throw new Error(
        `Through associations do not support composite primary keys on "${this._assocName}".`,
      );
    }
    const pkValue = this._record.readAttribute(primaryKey);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    for (const record of records) {
      if (
        !skipCallbacks &&
        !fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)
      )
        continue;
      // Save the target record if it's new
      if (record.isNewRecord()) {
        const saved = await record.save();
        if (!saved) continue;
      }
      // Create the join record
      const joinAttrs: Record<string, unknown> = {
        [ownerFk as string]: pkValue,
        [sourceFk]: (() => {
          const targetPk = (record.constructor as typeof Base).primaryKey;
          if (Array.isArray(targetPk)) {
            throw new Error(
              `Through associations do not support composite primary keys on target model for "${this._assocName}".`,
            );
          }
          return record.readAttribute(targetPk);
        })(),
      };
      // Handle polymorphic through (as option on through association)
      if (throughAssoc.options.as) {
        const typeCol = `${underscore(throughAssoc.options.as)}_type`;
        joinAttrs[`${underscore(throughAssoc.options.as)}_id`] = pkValue;
        joinAttrs[typeCol] = ctor.name;
        delete joinAttrs[ownerFk as string];
      }
      const joinRecord = await throughModel.create(joinAttrs);
      if (joinRecord.isPersisted()) {
        this._target.push(record);
        if (!skipCallbacks) {
          fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
        }
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
  // @ts-expect-error Relation#delete(id) removes by PK; CP#delete removes
  //   loaded records via the association. Distinct API. PR B: rename or
  //   restructure.
  async delete(...records: T[]): Promise<void> {
    this._ensureThroughWritable();
    // Through association (including HABTM): delete the join records
    if (this._assocDef.options.through) {
      await this._deleteThrough(records);
      return;
    }

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
    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record)) continue;
      if (Array.isArray(foreignKey)) {
        for (const fk of foreignKey) {
          record.writeAttribute(fk, null);
        }
      } else {
        record.writeAttribute(foreignKey as string, null);
      }
      if (typeCol) record.writeAttribute(typeCol, null);
      const saved = await record.save();
      if (saved) {
        removed.push(record);
        fireAssocCallbacks(this._assocDef.options.afterRemove, this._record, record);
      }
    }
    this._removeFromTarget(removed);
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
  }

  private async _deleteThrough(records: Base[]): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) return;

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const ownerFk = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = throughAssoc.options.primaryKey ?? ctor.primaryKey;
    const pkValue = this._record.readAttribute(primaryKey as string);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    const removed: Base[] = [];
    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record)) continue;
      const targetPk = record.readAttribute(
        (record.constructor as typeof Base).primaryKey as string,
      );
      const joinRecord = await throughModel.findBy({
        [ownerFk as string]: pkValue,
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

  private async _deleteThroughAllSql(): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) return;

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const primaryKey = throughAssoc.options.primaryKey ?? ctor.primaryKey;
    if (Array.isArray(primaryKey)) {
      throw new Error(
        `deleteAll does not support composite primary keys for through associations on "${this._assocName}".`,
      );
    }
    const pkValue = this._record.readAttribute(primaryKey);
    if (pkValue == null) return;
    const throughAs = throughAssoc.options.as;
    const conditions: Record<string, unknown> = {};
    if (throughAs) {
      conditions[`${underscore(throughAs)}_id`] = pkValue;
      conditions[`${underscore(throughAs)}_type`] = ctor.name;
    } else {
      const ownerFk = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
      if (Array.isArray(ownerFk)) {
        throw new Error(
          `deleteAll does not support composite foreign keys for through associations on "${this._assocName}".`,
        );
      }
      conditions[ownerFk] = pkValue;
    }
    if (this._assocDef.options.sourceType) {
      const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
      conditions[`${underscore(sourceName)}_type`] = this._assocDef.options.sourceType;
    }
    await (throughModel as any).where(conditions).deleteAll();
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
  // @ts-expect-error Relation#destroy(id) destroys by PK; CP#destroy
  //   destroys loaded records. Same divergence as `delete`.
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
    return this._withoutStrictLoading(async () => {
      const records = await this.toArray();
      const persisted = records.filter((r) => !r.isNewRecord());
      if (persisted.length > 0) {
        await this.delete(...persisted);
      }
      const unsaved = this._target.filter((r) => r.isNewRecord());
      if (unsaved.length > 0) {
        this._removeFromTarget(unsaved);
      }
    });
  }

  /**
   * Check if a record is in the collection.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#include?
   */
  async isInclude(record: T): Promise<boolean> {
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
          const value = record.readAttribute(key);
          if (value == null) {
            allPresent = false;
            break;
          }
          condition[key] = value;
        }
        if (allPresent) return s.exists(condition);
      } else {
        const pkValue = record.readAttribute(primaryKey);
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
  async many(): Promise<boolean> {
    return (await this.count()) > 1;
  }

  /**
   * True if the collection has no records.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#none?
   */
  // @ts-expect-error Relation#isNone is sync (`_isNone` flag check). CP's
  //   isNone fires a query/loaded-target empty check. PR B will rename
  //   CP's to something like `isEmpty()` or drop it.
  async isNone(): Promise<boolean> {
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
      const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
      const targetModel = resolveModel(className);
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
  // @ts-expect-error Relation#destroyAll returns the destroyed T[]; CP's
  //   returns void (fires association callbacks + mutates target).
  //   PR B: align to return T[] or drop.
  async destroyAll(): Promise<void> {
    const records = await this.toArray();
    await this.destroy(...records);
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
        return keyForTuple(cols.map((c) => r.readAttribute(c)));
      }
      return String(r.readAttribute(pk as string));
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
    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    const targetModel = resolveModel(className);
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
        return records.map((r) => r.readAttribute(stringCols[0]));
      }
      return records.map((r) => stringCols.map((c) => r.readAttribute(c)));
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
      if (stringCols.length === 1) return records[0].readAttribute(stringCols[0]);
      return stringCols.map((c) => records[0].readAttribute(c));
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
    return this;
  }

  scope(): any {
    if (this._isThrough) {
      return this._wrapAsAssociationRelation(this._buildThroughScope());
    }

    const rel = buildHasManyRelation(this._record, this._assocName, this._assocDef.options);
    if (rel === null) {
      const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
      const targetModel = resolveModel(className);
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

    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    const targetModel = resolveModel(className);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const throughModelAssocs: AssociationDefinition[] = (throughModel as any)._associations ?? [];
    const sourceAssoc =
      throughModelAssocs.find((a) => a.name === sourceName) ??
      throughModelAssocs.find((a) => a.name === pluralize(sourceName));

    const throughAs = throughAssoc.options.as;
    const ownerFk = throughAs
      ? (throughAssoc.options.foreignKey ?? `${underscore(throughAs)}_id`)
      : (throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`);
    const ownerPk = throughAssoc.options.primaryKey ?? ctor.primaryKey;

    if (Array.isArray(ownerPk)) {
      throw new Error(
        `CollectionProxy#scope does not support composite primary keys for through associations on "${this._assocName}".`,
      );
    }

    const pkValue = this._record.readAttribute(ownerPk as string);
    if (pkValue == null) return (targetModel as any).all().none();

    const throughTable = new ArelTable(throughModel.tableName);
    const targetArelTable = new ArelTable(targetModel.tableName);
    const sourceAssocKind = sourceAssoc?.type ?? "belongsTo";

    // Build the through table subquery
    if (Array.isArray(ownerFk)) {
      throw new Error(
        `CollectionProxy#scope does not support composite foreign keys for through associations on "${this._assocName}".`,
      );
    }
    let throughSubquery = throughTable.from().where(throughTable.get(ownerFk).eq(pkValue));
    if (throughAs) {
      throughSubquery = throughSubquery.where(
        throughTable.get(`${underscore(throughAs)}_type`).eq(ctor.name),
      );
    }

    if (sourceAssocKind === "belongsTo") {
      const targetFk = sourceAssoc?.options?.foreignKey ?? `${underscore(sourceName)}_id`;
      if (Array.isArray(targetFk)) {
        throw new Error(
          `CollectionProxy#scope does not support composite foreign keys for through associations on "${this._assocName}".`,
        );
      }
      if (Array.isArray(targetModel.primaryKey)) {
        throw new Error(
          `CollectionProxy#scope does not support composite primary keys on target model for through associations on "${this._assocName}".`,
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
        throw new Error(
          `CollectionProxy#scope does not support composite foreign keys for through associations on "${this._assocName}".`,
        );
      }
      if (Array.isArray(throughModel.primaryKey)) {
        throw new Error(
          `CollectionProxy#scope does not support composite primary keys on through model for "${this._assocName}".`,
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
  async createBang(attrs: Record<string, unknown> = {}): Promise<T> {
    this._ensureThroughWritable();
    if (this._isThrough) {
      const ctor = this._record.constructor as typeof Base;
      if (this._record.isNewRecord()) {
        throw new RecordNotSaved(
          `Cannot create through association on an unpersisted ${ctor.name}`,
        );
      }
      const record = this._buildThrough(attrs) as T;
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
  // @ts-expect-error Relation#deleteAll returns affected-rows count; CP's
  //   returns void (dependent-strategy routing). PR B: align.
  async deleteAll(dependent?: string): Promise<void> {
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
    if (strategy === "delete_all") {
      if (this._isThrough) {
        // For through associations, delete join rows via SQL — not the target records
        await this._deleteThroughAllSql();
      } else if (diverged) {
        await super.deleteAll();
      } else {
        await this.scope().deleteAll();
      }
    } else {
      // Nullify: set-based SQL update to null FKs (no per-record callbacks)
      if (this._isThrough) {
        await this._deleteThroughAllSql();
      } else {
        const nullUpdates = this._buildNullifyUpdates();
        if (diverged) {
          await super.updateAll(nullUpdates);
        } else {
          await this.scope().updateAll(nullUpdates);
        }
      }
    }
    this._target = [];
    this._targetLoaded = true;
    this.resetScope();
  }

  /**
   * Perform a calculation on the association scope.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#calculate
   */
  // @ts-expect-error Relation#calculate is strongly typed per operation.
  //   CP's is looser (string-typed op). PR B: tighten CP's overloads.
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
