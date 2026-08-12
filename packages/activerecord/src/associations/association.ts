import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { autoloadModel, _preloadedHolderTarget } from "../associations.js";
import { AssociationScope, type AssociationScopeable } from "./association-scope.js";
import { associationKeysEqual } from "./key-normalization.js";
import { getDjasScopeBuilder, getAssociationRelationFactory } from "./_scope-slots.js";
import { validateReflectionValidity } from "./validate-through-reflection.js";
import {
  camelize,
  constantize,
  except,
  safeConstantize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";
import {
  AssociationTargetReplacedDuringLoad,
  AssociationTypeMismatch,
  NameError,
} from "../errors.js";

/**
 * Base class for all association proxies. An Association wraps a single
 * association between an owner record and its target(s).
 *
 * In Rails, each record lazily creates Association instances via
 * `record.association(:name)`. The instance manages loading, caching,
 * and lifecycle for that association on that specific record.
 *
 * Mirrors: ActiveRecord::Associations::Association
 */
export class Association {
  owner: Base;
  readonly reflection: AssociationDefinition;
  readonly disableJoins: boolean;
  /** @internal */
  protected _targetStore: Base | Base[] | null = null;
  /** @internal */
  protected _loadedStore = false;

  get loaded(): boolean {
    return this._loadedStore;
  }

  set loaded(value: boolean) {
    this._loadedStore = value;
  }

  get target(): Base | Base[] | null {
    return this._targetStore;
  }

  set target(value: Base | Base[] | null) {
    this._targetStore = value;
  }

  /** @internal */
  get _rawTarget(): Base | Base[] | null {
    return this._targetStore;
  }

  /** @internal */
  get _rawLoaded(): boolean {
    return this._loadedStore;
  }

  /**
   * True when `target` was set by an *explicit* assignment / inverse-of seed
   * (the writer paths routed through `_cacheSingularTarget`), as opposed to a
   * query load. The inner functional loaders (`loadBelongsTo` / `loadHasOne`)
   * short-circuit only on explicit sets — a prior query load must NOT memoize,
   * so they can re-query after a mutation (e.g. a has_one :through deleted via
   * its writer). This is the holder-resident successor to the old
   * `_cachedAssociations` write-shadow, which only ever held explicit writes.
   */
  _explicitTarget = false;
  /**
   * True when `target` was set by a preload / eager-load path (the standard
   * `Preloader`, `JoinDependency`, or the preloader batch's loaded-nil default),
   * as opposed to a lazy query load. This is the holder-resident successor to
   * the legacy `_preloadedAssociations` shadow `Map`: readers that previously
   * gated on `record._preloadedAssociations.has(name)` now gate on
   * `holder.isLoaded() && holder._loadedFromPreload`, distinguishing a preloaded
   * target (including a preloaded-nil) from a lazy load that must re-query.
   */
  _loadedFromPreload = false;
  /** True after asyncLoadTarget() completes a full DB load — signals the dotted
   *  collection proxy that it can hydrate from this instance's target. */
  _loadedViaAsync = false;
  /**
   * Nonzero while THIS holder is itself driving a loader through `findTarget`.
   *
   * Two jobs, and only the second is still live for singular associations:
   * `syncToAssociationInstance` skips the loader's own writeback into this
   * holder (still load-bearing for `CollectionAssociation`, whose loader tail
   * writes back), and `raiseIfLoadInFlight` refuses a caller's replacement that
   * lands inside the load window. The singular loader's tail writeback is gone
   * (`singular_association.rb:47-55` ends at `scope.first`), so there the flag
   * is retained purely for the raise.
   *
   * Rails needs no such flag: `Association#find_target`
   * (association.rb:248) is synchronous, so nothing can touch the holder
   * between issuing the query and assigning the result. Ours awaits, and an
   * assignment landing in that window (`firm.association("clients")
   * .setTarget([other])`) was silently clobbered by the loader's redundant
   * writeback.
   *
   * **Scoping — this flag is holder-scoped, not loader-scoped.** While it is
   * set, `syncToAssociationInstance` suppresses *every* writeback into this
   * holder, not just the driving loader's own. A concurrent
   * `findTarget(owner, sameName, differentOptions)` carrying differently
   * scoped rows is therefore dropped from the holder too (it still returns its
   * rows to its own caller; only the holder cache goes unwritten, and the
   * driving load assigns the holder immediately after). Making it
   * loader-scoped would require threading a per-load token through
   * `findTarget`; the holder-scoped version is what the guard needs, since a
   * collection that legitimately mutates its own target mid-load (dirty
   * targets, in-memory built/pushed records, target merging) is unaffected
   * either way.
   * @internal
   */
  _loaderWritebackSuppressed = 0;

  /** @internal Rails' `@skip_strict_loading`, raised by `skipStrictLoading`. */
  protected _skipStrictLoading = false;

  private _staleState: unknown = undefined;
  private _staleStateSnapshotted = false;
  /**
   * Memoized result of `scope()` — Rails' `@association_scope`
   * (association.rb:300-308). Built lazily on first access; reset by
   * `resetScope()` (called from `reload()` and on init). Skipped for
   * `disable_joins` paths — Rails creates a fresh
   * `DisableJoinsAssociationScope` per call (association.rb:107-117)
   * because the scope's chain walk depends on owner FK snapshots that
   * a long-lived cache would mask.
   */
  private _cachedScope: unknown = undefined;

  constructor(owner: Base, reflection: AssociationDefinition) {
    this.owner = owner;
    this.reflection = reflection;
    this.disableJoins = reflection.options.disableJoins || false;

    // Rails' `check_validity! → klass → compute_class` raises NameError
    // synchronously in the constructor, so `record.association(:name)` itself
    // throws rather than `load_target`. Mirrors association.rb:41-42. This runs
    // first because in Rails the *first* `klass` access inside `check_validity!`
    // is what raises NameError for an unknown class — our reflection-level
    // validity checks reach `klass` too but surface a less specific error, so
    // resolve the class (and raise the faithful NameError) up front.
    this.checkKlass();
    // Rails' `Association#initialize` runs `reflection.check_validity!`
    // for EVERY macro (association.rb:39), so every Rails-named
    // misconfiguration surfaces at first use: missing/recursive inverse-of,
    // composite-PK/FK length mismatch, polymorphic-through, missing source,
    // source-type shape, has-one-through-collection, and out-of-order
    // declaration. Delegates to the reflection's `checkValidityBang` (the
    // macro-specific override) via a memoized helper.
    validateReflectionValidity(owner.constructor as typeof Base, reflection.name);
  }

  /**
   * Resolve the target class name eagerly — mirrors the Rails path
   * `check_validity!` (association.rb:42) → `klass` → `compute_class`
   * (reflection.rb). Called from the constructor so `record.association(:name)`
   * raises synchronously for unknown classes. Skipped for polymorphic, through,
   * and anonymous-class associations (HABTM join model side).
   */
  protected checkKlass(): void {
    const opts = this.reflection.options as AssociationOptions & { anonymousClass?: unknown };
    if (opts.polymorphic || opts.through || opts.anonymousClass) return;
    const name = this.reflection.name;
    // Prefer the rich reflection's klass getter — it does Ruby-style
    // namespace-relative resolution (compute_class → compute_type), so a
    // convention `belongs_to :region` on Admin::RegionalUser resolves to
    // Admin::Region rather than a bare top-level "Region". On failure fall
    // through to the bare lookup below, which raises the faithful NameError
    // Rails' check_validity! surfaces for a genuinely missing class.
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { klass?: typeof Base } | null;
    };
    try {
      if (ctor._reflectOnAssociation?.(name)?.klass) return;
    } catch (e) {
      // Rails rescues only the missing-constant NameError from compute_class and
      // re-raises anything else — notably the ArgumentError "resolved constant is
      // not an ActiveRecord::Base subclass" guard (reflection.rb:495-508). Mirror
      // that: a missing-class NameError falls through to the constant lookup
      // below (which re-raises the same faithful NameError); every other error
      // — config/reflection failures — propagates unchanged.
      if (!(e instanceof NameError)) throw e;
    }
    const className =
      opts.className ?? camelize(this.reflection.macro === "hasMany" ? singularize(name) : name);
    autoloadModel(className);
    constantize(className);
  }

  get name(): string {
    return this.reflection.name;
  }

  get options(): AssociationOptions {
    return this.reflection.options;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  loadedBang(): void {
    this.loaded = true;
    this._staleState = this.staleState();
    this._staleStateSnapshotted = true;
  }

  /** @internal */
  get _staleStateIsSnapshotted(): boolean {
    return this._staleStateSnapshotted;
  }

  isStaleTarget(): boolean {
    return this.loaded && this._staleState !== this.staleState();
  }

  reset(): void {
    this.loaded = false;
    this.target = null;
    this._staleState = undefined;
    this._staleStateSnapshotted = false;
    this._explicitTarget = false;
    this._loadedFromPreload = false;
    this._loadedViaAsync = false;
  }

  resetNegativeCache(): void {
    if (this.loaded && this.target == null) {
      this.reset();
    }
  }

  async reload(force = false): Promise<this> {
    // Mirrors Rails `Association#reload` (association.rb:72-78): a *forced*
    // reload (the generated `reload_<name>` reader) clears the query cache
    // first, so the re-fetch bypasses any cached SELECT for this record.
    if (force) {
      this.klass.connectionPool().clearQueryCache();
    }
    this.reset();
    this.resetScope();
    await this.loadTarget();
    return this;
  }

  setTarget(target: Base | Base[] | null): void {
    this.raiseIfLoadInFlight();
    this._setTargetFromLoader(target);
  }

  /**
   * Assign the target WITHOUT the in-flight guard — the entry point for code
   * that is itself a loader (the `Preloader`), as opposed to a caller
   * replacing the target.
   *
   * Loader-vs-loader is not the race we refuse: both sides are reads of the
   * same association, so whichever lands last is a legitimate result rather
   * than a lost intent. Raising here would instead abort an entire preload
   * batch because one unrelated owner happened to have a lazy load in flight.
   * @internal
   */
  _setTargetFromLoader(target: Base | Base[] | null): void {
    this.target = target;
    this.loadedBang();
  }

  /**
   * Raise if a load for this association is still in flight. Guards the
   * *assignment* paths (`setTarget`, `CollectionAssociation#replace`) — the
   * ones that carry a caller's explicit intent.
   *
   * Refuses the race rather than silently picking a winner. `find_target` is
   * synchronous in Rails (association.rb:248) so this cannot arise there; ours
   * awaits, and an assignment landing inside that window used to be silently
   * clobbered by the load. `_loaderWritebackSuppressed` is what makes this safe
   * to raise on: a loader's own writeback never reaches an assignment path, so
   * only a genuine external replacement trips it.
   * @internal
   */
  protected raiseIfLoadInFlight(): void {
    if (!this._loaderWritebackSuppressed) return;
    throw new AssociationTargetReplacedDuringLoad(
      `Cannot replace the target of association \`${this.reflection.name}\` while a load for it is still in flight. ` +
        `Await the load (or the reader) before assigning.`,
    );
  }

  /**
   * Mirrors Rails' `Association#scope` (association.rb:107-117).
   *
   * Four branches, in order:
   * 1. `disable_joins`: delegate to `DisableJoinsAssociationScope` via a
   *    late-binding slot (populated when DJAS is first loaded; avoids the
   *    TDZ cycle DJAS→DJAR→relation.ts→associations.ts→association.ts).
   * 2. `klass.current_scope.proxyAssociation === this`: spawn the current
   *    scope (fires only inside a CollectionProxy.scoping block — not yet
   *    implemented, so this branch is structurally present but unreachable).
   * 3. `global_current_scope` present: merge it into the result.
   * 4. else: `targetScope().merge!(association_scope)`.
   *
   * Cache: only the `AssociationScope.scope` result is memoized in
   * `_cachedScope` (Rails' `@association_scope`); `targetScope()` and
   * current-scope branches are re-evaluated each call (association.rb:294-307).
   */
  scope(): any {
    const klass = this.klass as typeof Base | undefined;
    if (!klass) return undefined;
    // Branch 1: disable_joins — delegate to DisableJoinsAssociationScope.
    if (this.disableJoins) {
      const djas = getDjasScopeBuilder();
      if (!djas)
        throw new Error(
          "DisableJoinsAssociationScope not initialized — import '@blazetrails/activerecord/associations' before using disable_joins associations",
        );
      return djas(this);
    }
    // Branch 2: klass.current_scope.proxy_association == self.
    // Fires when CollectionProxy.scoping sets an AssociationRelation as
    // klass.currentScope; not yet implemented, so this is unreachable.
    const currentScope = (klass as any).currentScope();
    if (currentScope && currentScope.proxyAssociation === this) {
      return typeof currentScope.spawn === "function" ? currentScope.spawn() : currentScope;
    }
    // Branches 3 + 4.
    const associationScope = this.associationScope();
    const target = this.targetScope();
    const base =
      target != null && typeof target.merge === "function"
        ? target.merge(associationScope)
        : associationScope;
    const globalScope = klass?.globalCurrentScope();
    return globalScope && typeof base?.merge === "function" ? base.merge(globalScope) : base;
  }

  /**
   * The scope for this association — the JOIN-based constraints memoized in
   * `_cachedScope` (Rails' `@association_scope`). `scope()` merges this into
   * `targetScope()` at call time so surrounding `scoping {}`/`unscoped {}`
   * blocks can still affect the final query.
   *
   * Mirrors: ActiveRecord::Associations::Association#association_scope
   *
   * @internal
   */
  associationScope(): any {
    const klass = this.klass as typeof Base | undefined;
    if (!klass) return undefined;
    // Same relaxed staleness rule as `loadTarget` — reset the cached scope
    // when the target went stale, including the nil-target-then-FK-set case
    // (`_staleState == null && target == null`), so the reload re-derives the
    // scope from the now-populated foreign key.
    if (this.isStaleTarget() && (this._staleState != null || this.target == null)) {
      this.resetScope();
    }
    if (this._cachedScope === undefined) {
      if (this.disableJoins) {
        const djas = getDjasScopeBuilder();
        if (!djas)
          throw new Error(
            "DisableJoinsAssociationScope not initialized — import '@blazetrails/activerecord/associations' before using disable_joins associations",
          );
        this._cachedScope = djas(this);
      } else {
        this._cachedScope = AssociationScope.scope(this as unknown as AssociationScopeable);
      }
    }
    return this._cachedScope;
  }

  resetScope(): void {
    this._cachedScope = undefined;
  }

  /**
   * Apply strict loading settings from the owner to a loaded record.
   */
  setStrictLoading(record: Base): Base {
    const recordAny = record as any;
    if (typeof recordAny.strictLoadingBang !== "function") return record;
    const ownerAny = this.owner as any;
    if (
      typeof ownerAny.isStrictLoadingNPlusOneOnly === "function" &&
      ownerAny.isStrictLoadingNPlusOneOnly() &&
      (this.reflection.macro === "hasMany" || this.reflection.macro === "hasAndBelongsToMany")
    ) {
      recordAny.strictLoadingBang();
    } else {
      recordAny.strictLoadingBang(false, { mode: ownerAny.strictLoadingMode?.() ?? undefined });
    }
    return record;
  }

  /**
   * Set the inverse association on the given record, so that
   * `record.association(inverse_name).target` points back to owner.
   *
   * `_explicitTarget` has no Rails analog — `inversed_from` alone is the whole
   * of `set_inverse_instance` there. It is the trails flag (RFC 0022) that
   * `_loadedSingularTarget` consults before the inner belongs_to/has_one
   * loaders query, so it is raised here exactly as `_cacheSingularTarget` does
   * on the other seeding path; without it an inverse wired through this method
   * reads back as an unset target and re-queries.
   */
  setInverseInstance(record: Base): Base {
    const inverse = this.inverseAssociationFor(record);
    if (inverse) {
      inverse.inversedFrom(this.owner);
      if (!inverse.isCollection()) inverse._explicitTarget = true;
    }
    return record;
  }

  setInverseInstanceFromQueries(record: Base): Base {
    const inverse = this.inverseAssociationFor(record);
    if (inverse) {
      inverse.inversedFromQueries(this.owner);
    }
    return record;
  }

  removeInverseInstance(record: Base): void {
    const inverse = this.inverseAssociationFor(record);
    if (!inverse) return;

    if (inverse.isCollection() && Array.isArray(inverse.target)) {
      const idx = inverse.target.indexOf(this.owner);
      if (idx !== -1) {
        inverse.target.splice(idx, 1);
      }
    } else {
      inverse.inversedFrom(null as any);
    }
  }

  inversedFrom(record: Base | null): void {
    this.assignInversedTarget(record);
    this.loadedBang();
  }

  inversedFromQueries(record: Base | null): void {
    if (this.inversable(record)) {
      this.assignInversedTarget(record);
      this.loadedBang();
    }
  }

  private assignInversedTarget(record: Base | null): void {
    if (!this.isCollection()) {
      this.target = record;
      return;
    }
    if (record === null) {
      this.target = [];
      return;
    }
    const target = Array.isArray(this.target) ? this.target : [];
    if (!target.includes(record)) {
      target.push(record);
    }
    this.target = target;
  }

  /**
   * Returns the class of the target. belongs_to polymorphic overrides
   * this to look at the polymorphic_type field on the owner.
   */
  /**
   * Mirrors: AssociationReflection#derive_class_name (reflection.rb:821-825) —
   * `class_name.singularize if collection?`, then camelize.
   * @internal
   */
  private deriveClassName(): string {
    const name = this.reflection.name;
    return camelize(this.isCollection() ? singularize(name) : name);
  }

  get klass(): typeof Base {
    // Use the rich reflection's klass getter when available — it does
    // namespace-relative resolution, matching Rails' compute_type walk.
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { klass?: typeof Base } | null;
    };
    const richKlass = ctor._reflectOnAssociation?.(this.reflection.name)?.klass;
    if (richKlass) return richKlass;
    const className = this.reflection.options.className ?? this.deriveClassName();
    autoloadModel(className);
    return constantize(className) as typeof Base;
  }

  get extensions(): any[] {
    const ext = this.reflection.options.extend;
    if (!ext) return [];
    return Array.isArray(ext) ? ext : [ext];
  }

  /**
   * Loads the target if needed and returns it. Checks caches first,
   * then falls back to the async load functions in associations.ts.
   *
   * Mirrors: ActiveRecord::Associations::Association#load_target
   */
  async loadTarget(): Promise<Base | Base[] | null> {
    // Corresponds to Rails' guard `(@stale_state && stale_target?) ||
    // find_target?` (association.rb:190). Rails relies on
    // `SingularAssociation#reader` resetting a stale association *before*
    // `load_target` runs (reset clears `@stale_state` to nil, so it's
    // `find_target?` that fires post-reset — the `@stale_state &&` factor is
    // moot on that path). trails' reader does not reset-before-load, so
    // `loadTarget` must itself reload a stale target. We relax Rails'
    // `@stale_state != null` factor for exactly one extra case: a target that
    // is currently *nil* (`this.target == null`). A has_one_through belongs_to
    // whose through FK was nil at load time captures `_staleState == null`;
    // setting the FK afterward (`minivan.speedometer_id = …`) must reload even
    // though the prior stale state was null — and reloading a nil target
    // discards nothing. We must NOT reload when there is a real in-memory
    // target with a null prior stale state (e.g. a nested-attributes-built
    // record assigned before its owner FK was set): that would clobber the
    // unsaved build. The stale and find-target branches stay mutually exclusive
    // (`stale_target?` requires loaded, `find_target?` requires not-loaded).
    if (this.isStaleTarget() && (this._staleState != null || this.target == null)) {
      // Rails `find_target` always issues a query; skip the in-memory
      // `doFindTarget` cache so a stale target is actually re-fetched.
      await this._findTarget();
    } else if (this.findTargetNeeded()) {
      const cached = this.doFindTarget();
      if (cached !== undefined) {
        this.target = cached;
      } else {
        await this._findTarget();
      }
    }

    this.loadedBang();
    return this.target;
  }

  /**
   * Runs `find_target` and stores what it fetched: issues a query (never the
   * in-memory cache) and applies `set_strict_loading` per freshly loaded
   * record. Rails inlines this in `load_target` / `async_load_target`
   * (association.rb:189, :198); the split exists only because the assignment
   * is shared by both call sites above.
   *
   * The `staleStateBeforeLoad` re-check is a trails-only guard with no Rails
   * counterpart, and it is here because this is the one writeback site. Rails'
   * `find_target` (association.rb:248) is synchronous, so the owner's stale
   * state cannot move between issuing the query and storing the row. Ours
   * awaits DB I/O: an in-flight reader (`node.parent` accessed but never
   * awaited) can still be pending when the caller reassigns the association
   * with a new FK, and once RFC 0063 made `save` genuinely await the validation
   * chain that window widened enough for the stale query to resolve mid-save
   * and clobber the freshly-assigned target, dropping the FK change from
   * `previousChanges`. Keeping it here rather than in the query body leaves
   * staleness decided in one place, next to `loadTarget`'s guard.
   */
  private async _findTarget(): Promise<void> {
    const staleStateBeforeLoad = this.staleState();
    const result = await this.findTarget();
    if (result !== undefined) {
      // Rails applies set_strict_loading per record in find_target's DB
      // execute block — only freshly loaded records, never cached ones.
      if (result !== null) this.setStrictLoading(result as Base);
      if (this.loaded && this.staleState() !== staleStateBeforeLoad) return;
      // Deliberately a direct assignment, not `setTarget`: this is the loader
      // storing what it just fetched, not a caller replacing the target, so it
      // must not trip `setTarget`'s in-flight guard.
      this.target = result;
    }
  }

  /**
   * Mirrors: ActiveRecord::Associations::Association#async_load_target
   * In Rails this kicks off an async load and returns nil immediately.
   * In our async-native implementation, this is identical to loadTarget.
   */
  async asyncLoadTarget(): Promise<Base | Base[] | null> {
    const result = await this.loadTarget();
    this._loadedViaAsync = true;
    // Share the loaded target with the dotted collection proxy if it already
    // exists (e.g. firm.clients was accessed before the async load completed).
    const name = this.reflection.name;
    const proxy = this.owner._collectionProxies.get(name) as
      | { loaded?: boolean; _hydrateFromPreload?(r: Base[]): void }
      | undefined;
    if (proxy && !proxy.loaded && typeof proxy._hydrateFromPreload === "function") {
      const records = Array.isArray(result) ? result : result != null ? [result] : [];
      proxy._hydrateFromPreload(records);
    }
    return result;
  }

  marshalDump(): [string, Record<string, unknown>] {
    return [
      this.reflection.name,
      {
        loaded: this.loaded,
        target: this.target,
      },
    ];
  }

  marshalLoad(data: [string, Record<string, unknown>]): void {
    const [, ivars] = data;
    this.loaded = ivars.loaded as boolean;
    this.target = ivars.target as Base | Base[] | null;
    if (this.loaded) {
      this._staleState = this.staleState();
    }
  }

  initializeAttributes(record: Base, exceptFromScopeAttributes?: Record<string, unknown>): void {
    exceptFromScopeAttributes ??= {};
    const skipAssign = [...this.resolveForeignKey(), this.resolveReflectionType()].filter(
      (key) => key != null,
    );
    let assignedKeys = record.changedAttributeNamesToSave;
    assignedKeys = assignedKeys.concat(Object.keys(exceptFromScopeAttributes).map(String));
    const attributes = except(
      this.scopeForCreate(),
      ...assignedKeys.filter((key) => !skipAssign.includes(key)),
    );
    if (Object.keys(attributes).length > 0) record._assignAttributes(attributes);
    this.setInverseInstance(record);
  }

  async create(
    attributes?: Record<string, unknown>,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    return this._createRecord(attributes, false, block);
  }

  async createBang(
    attributes?: Record<string, unknown>,
    block?: (record: Base) => void,
  ): Promise<Base> {
    const record = await this._createRecord(attributes, true, block);
    if (!record) {
      throw new Error("Failed to create associated record");
    }
    return record;
  }

  isCollection(): boolean {
    return false;
  }

  get reader(): Base | Base[] | null | Promise<Base | null> {
    return this.target;
  }

  // --- Protected / hook methods for subclasses ---

  protected staleState(): unknown {
    return undefined;
  }

  /**
   * Synchronous find — checks caches and preloaded data. Returns
   * undefined if no cached data is available.
   */
  protected doFindTarget(): Base | Base[] | null | undefined {
    const owner = this.owner;
    const name = this.reflection.name;

    const cached = owner._associationCache(name);
    if (cached !== undefined) {
      return cached.target as Base | Base[] | null;
    }
    const preloaded = _preloadedHolderTarget(owner, name);
    if (preloaded) {
      return preloaded.value;
    }
    return undefined;
  }

  protected findTargetNeeded(): boolean {
    // Mirrors Rails `find_target?` (association.rb:320):
    //   !loaded? && (!owner.new_record? || foreign_key_present?) && klass
    // The trailing `&& klass` short-circuits when the target class is absent
    // (e.g. a polymorphic belongs_to whose `_type` column is nil/unresolvable),
    // so no query is attempted. `klass` is evaluated last, matching Ruby's
    // left-to-right `&&`, so it is never touched when the FK guard is false.
    if (this.loaded) return false;
    const isNew = this.owner.isNewRecord();
    return (!isNew || this.foreignKeyPresent()) && !!this.klass;
  }

  protected foreignKeyPresent(): boolean {
    return false;
  }

  protected async _createRecord(
    attributes?: Record<string, unknown>,
    shouldRaise = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    // Rails yields the record inside `build_record` (association.rb:383-388),
    // before the save — so the block can mutate attributes that get persisted.
    const record = this.buildRecord(attributes, block);
    if (!record) return null;
    if (typeof (record as any).save === "function") {
      const saved = await (record as any).save();
      if (!saved && shouldRaise) {
        throw new Error(`Failed to save the new associated ${this.reflection.name}.`);
      }
    }
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Associations::Association#build_record
   * (association.rb:383-388).
   * @internal
   */
  buildRecord(attributes?: Record<string, unknown>, block?: (record: Base) => void): Base | null {
    const Klass = this.klass;
    if (!Klass) return null;
    // Rails' `build_record` passes `initialize_attributes` as the block to
    // `reflection.build_association(attributes)`; `Core#initialize` yields that
    // block (core.rb:479) BEFORE `_run_initialize_callbacks`. So both the
    // scope_for_create attrs (e.g. the association FK) AND the inverse instance
    // wired by `initialize_attributes` (association.rb:224) are visible to
    // `after_initialize` hooks — as is a caller-supplied block, which Rails
    // yields inside the same block (association.rb:383-388).
    // `this.reflection` is the lightweight `AssociationDefinition` a macro
    // builds, which carries no `build_association`; the rich reflection off the
    // owner's class is the one that does (reflection.rb:182). Resolve it the
    // same way `klass` above does, and fall back to the plain construction when
    // there is none (synthetic definitions built by hand).
    const reflection = (
      this.owner.constructor as typeof Base & {
        _reflectOnAssociation?: (n: string) => {
          buildAssociation?: (
            attributes: Record<string, unknown>,
            block?: (record: Base) => void,
          ) => Base;
        } | null;
      }
    )._reflectOnAssociation?.(this.reflection.name);
    if (reflection?.buildAssociation) {
      return reflection.buildAssociation(attributes ?? {}, (record: Base) => {
        this.initializeAttributes(record, attributes);
        if (block) block(record);
      });
    }
    return new (Klass as any)(attributes ?? {}, (record: Base) => {
      this.initializeAttributes(record, attributes);
      if (block) block(record);
    });
  }

  private inverseAssociationFor(record: Base): Association | null {
    if (this.isInvertibleFor(record)) {
      const inverseReflection = this.inverseReflectionFor(record) as
        | { name?: string }
        | string
        | null;
      const inverseName =
        typeof inverseReflection === "string"
          ? inverseReflection
          : (inverseReflection?.name ?? null);
      if (!inverseName) return null;
      const recordAny = record as any;
      if (typeof recordAny.association !== "function") return null;
      // `invertible_for?` establishes the inverse exists on the OWNER's side,
      // which for a polymorphic belongs_to is a different class than the
      // record's — so `record.association` can still raise here.
      try {
        return recordAny.association(inverseName);
      } catch {
        return null;
      }
    }
    return null;
  }

  private inversable(record: Base | null): boolean {
    // Rails `Association#inversable?` (association.rb:406):
    //   record && ((!record.persisted? || !owner.persisted?) ||
    //              matches_foreign_key?(record))
    // The base method previously omitted the `matches_foreign_key?` clause, so
    // when both owner and record were persisted it never wired the inverse —
    // the FK-match was reimplemented inline in `AssociationRelation.toArray`.
    if (!record) return false;
    return !record.isPersisted() || !this.owner.isPersisted() || this.matchesForeignKey(record);
  }

  /**
   * Rails `Association#matches_foreign_key?` (association.rb:411):
   *
   *   if foreign_key_for?(record)
   *     record.read_attribute(reflection.foreign_key) == owner.id ||
   *       (foreign_key_for?(owner) && owner.read_attribute(reflection.foreign_key) == record.id)
   *   else
   *     owner.read_attribute(reflection.foreign_key) == record.id
   *   end
   *
   * Value-equality (`associationKeysEqual`) bridges a child FK (int4 number)
   * and an owner PK (int8 BigInt under PG bigserial) as Ruby's `Integer ==`
   * does, so the inverse still wires across the number/BigInt boundary.
   * @internal
   */
  matchesForeignKey(record: Base): boolean {
    if (this.isForeignKeyFor(record)) {
      return (
        this.keyValuesEqual(
          this.resolveForeignKey().map((key) => record.readAttribute(key)),
          this.owner.id,
        ) ||
        (this.isForeignKeyFor(this.owner) &&
          this.keyValuesEqual(
            this.resolveForeignKey().map((key) => this.owner.readAttribute(key)),
            record.id,
          ))
      );
    }
    return this.keyValuesEqual(
      this.resolveForeignKey().map((key) => this.owner.readAttribute(key)),
      record.id,
    );
  }

  private resolveForeignKey(): string[] {
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { foreignKey?: string | string[] } | null;
    };
    const fk =
      ctor._reflectOnAssociation?.(this.reflection.name)?.foreignKey ??
      (this.reflection.options as any).foreignKey;
    return (Array.isArray(fk) ? fk : [fk]).filter((k) => k != null).map(String);
  }

  /**
   * Mirrors: AssociationReflection#type (reflection.rb) — the
   * polymorphic-belongs-to foreign-type column, NOT the STI inheritance
   * column. `this.reflection` is the lightweight AssociationDefinition, whose
   * `type` is the macro name, so the rich Reflection is resolved through
   * `_reflectOnAssociation` (the sibling of `resolveForeignKey`) and
   * `options.as` covers the window before macro registration finishes.
   */
  private resolveReflectionType(): string | null {
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { type?: string | null } | null;
    };
    const rich = ctor._reflectOnAssociation?.(this.reflection.name);
    if (rich?.type != null) return rich.type;
    const as = (this.reflection.options as AssociationOptions).as;
    return as ? `${underscore(as)}_type` : null;
  }

  /**
   * Ruby compares `read_attribute(reflection.foreign_key) == owner.id` directly;
   * with a composite key both sides are arrays, and `associationKeysEqual`
   * bridges a child FK (int4 number) and an owner PK (int8 BigInt under PG
   * bigserial) as Ruby's `Integer ==` does.
   */
  private keyValuesEqual(a: unknown, b: unknown): boolean {
    const left = Array.isArray(a) ? a : [a];
    const right = Array.isArray(b) ? b : [b];
    if (left.length === 0 || left.length !== right.length) return false;
    return left.every((value, i) => associationKeysEqual(value, right[i]));
  }

  private ensureKlassExistsBang(): typeof Base {
    const k = this.klass;
    if (!k) throw new Error(`Could not find the association ${this.reflection.name}`);
    return k;
  }

  /**
   * Mirrors: ActiveRecord::Associations::Association#find_target
   * (association.rb:248) — the seam `load_target` (association.rb:189) and
   * `CollectionAssociation#load_target` (collection_association.rb:272) run to
   * fetch the target. Subclasses override it with the actual query.
   */
  protected async findTarget(): Promise<Base | Base[] | null> {
    return null;
  }

  /**
   * Rails' `Association#skip_strict_loading` (association.rb). A
   * promise-returning block keeps the flag raised until it settles — Ruby's
   * `ensure` fires after the block has fully run, and restoring at the first
   * `await` would let the query it guards raise `StrictLoadingViolationError`.
   * @internal
   */
  protected skipStrictLoading<T>(block: () => T): T {
    const prev = this._skipStrictLoading;
    this._skipStrictLoading = true;
    const restore = (): void => {
      this._skipStrictLoading = prev;
    };
    let result: T;
    try {
      result = block();
    } catch (error) {
      restore();
      throw error;
    }
    if (result instanceof Promise) {
      return result.finally(restore) as T;
    }
    restore();
    return result;
  }

  private isViolatesStrictLoading(): boolean {
    if (this._skipStrictLoading) return false;

    if ((this.owner as { _validationContext?: unknown })._validationContext != null) return false;

    if ("strictLoading" in (this.reflection.options as object)) {
      return (this.reflection as { strictLoading?: boolean }).strictLoading ?? false;
    }

    return this.owner.isStrictLoading() && !this.owner.isStrictLoadingNPlusOneOnly();
  }

  /**
   * Mirrors Rails' `Association#target_scope` (association.rb:310-314):
   *
   *   AssociationRelation.create(klass, self)
   *     .merge!(klass.scope_for_association)
   *
   * Returns an `AssociationRelation` bound to `this` association so that
   * `klass.current_scope.proxyAssociation === this` (branch 2 of `scope()`)
   * can hold when a future `CollectionProxy.scoping` implementation sets the
   * AR as the class-level current scope. Uses `scopeForAssociation()` (not
   * `all()`) so ordinary `Model.where(...).scoping {}` blocks don't leak in.
   * The through-association chain merge is in `throughTargetScope`.
   *
   * @internal
   */
  protected targetScope(): any {
    const klass = this.klass as typeof Base | undefined;
    if (!klass) return null;
    const sfa = (klass as any).scopeForAssociation?.() ?? null;
    const arFactory = getAssociationRelationFactory();
    if (!arFactory) return sfa;
    const ar = arFactory(klass, this);
    return sfa ? (ar as any).merge(sfa) : ar;
  }

  /** @internal */
  scopeForCreate(): Record<string, unknown> {
    return this.scope()?.scopeForCreate?.() ?? {};
  }

  private isFindTarget(): boolean {
    return this.findTargetNeeded();
  }

  protected raiseOnTypeMismatchBang(record: Base): void {
    const klass = this.klass;
    if (klass && !(record instanceof (klass as any))) {
      // Rails names the expected side with `reflection.class_name` — the
      // demodulized convention name (`belongs_to :region` → "Region"), NOT the
      // resolved `klass.name` (which for a namespace-relative target would be
      // the flattened "AdminRegion"). Prefer the rich reflection's `className`.
      const ctor = this.owner.constructor as typeof Base & {
        _reflectOnAssociation?: (n: string) => { className?: string } | null;
      };
      // Rails' `reflection.class_name` — the only string it constantizes
      // (association.rb:341), and always defined. Never `klass.name` (a
      // flattened namespaced ctor) or the bare association name, either of
      // which could resolve to an unrelated class and swallow a genuine
      // mismatch. `derive_class_name` singularizes only for a collection
      // (reflection.rb:821-825), so a belongs_to named `status` or `series`
      // must not be singularized into the wrong constant.
      const expectedType =
        ctor._reflectOnAssociation?.(this.reflection.name)?.className ??
        this.reflection.options.className ??
        this.deriveClassName();
      const freshClass = safeConstantize(expectedType) as typeof Base | undefined;
      if (freshClass && record instanceof (freshClass as any)) return;
      const actualType =
        record == null
          ? String(record)
          : ((record.constructor as { name?: string }).name ?? "Object");
      // Mirrors Rails' message shape: `<Expected> expected, got <record.inspect>
      // which is an instance of <record.class>`. The `(#<object_id>)` segments
      // Rails appends are unreplicable in JS and omitted.
      throw new AssociationTypeMismatch(
        expectedType,
        `${inspectMismatchedRecord(record)} which is an instance of ${actualType}`,
      );
    }
  }

  protected inverseReflectionFor(_record: Base): unknown {
    return (this.reflection as { inverseOf?: () => unknown }).inverseOf?.() ?? null;
  }

  /**
   * Mirrors Rails' `Association#invertible_for?` (association.rb:365-367).
   * Overridden by `BelongsToAssociation` and `HasManyThroughAssociation`.
   * @internal
   */
  protected isInvertibleFor(record: Base): boolean {
    return this.isForeignKeyFor(record) && !!this.inverseReflectionFor(record);
  }

  protected isForeignKeyFor(record: Base): boolean {
    // Rails: `Array(reflection.foreign_key).all? { |key| record._has_attribute?(key) }`
    // (association.rb:370-373), where `_has_attribute?` checks the record's
    // attribute SET (`@attributes.key?`).
    const fk = this.reflection.foreignKey ?? (this.reflection.options as any).foreignKey;
    const fkArr = Array.isArray(fk) ? fk : [fk];
    const hasAttr = (record as any)._hasAttribute as ((k: string) => boolean) | undefined;
    return fkArr.every((key) => {
      if (key == null) return false;
      return typeof hasAttr === "function" ? hasAttr.call(record, String(key)) : false;
    });
  }

  private isSkipStatementCache(scope: any): boolean {
    // Rails: reflection.has_scope? || scope.eager_loading? ||
    //        klass.scope_attributes? || reflection.source_reflection.active_record.default_scopes.any?
    const refl = this.reflection as any;
    const hasReflScope = !!(refl.hasScope?.() ?? refl.options?.scope);
    const eagerLoading = !!scope?.eagerLoading?.();
    const scopeAttrs = !!(this.klass as any)?.hasScopeAttributes?.();
    const sourceDefaultScopes = !!refl.sourceReflection?.()?.activeRecord?.defaultScopes?.length;
    return hasReflScope || eagerLoading || scopeAttrs || sourceDefaultScopes;
  }

  private enqueueDestroyAssociation(options: Record<string, unknown>): void {
    const jobClass = (this.owner.constructor as any).destroyAssociationAsyncJob();
    if (jobClass) {
      const ownerAny = this.owner as any;
      ownerAny._afterCommitJobs ??= [];
      ownerAny._afterCommitJobs.push([jobClass, options]);
    }
  }
}

/**
 * Best-effort analogue of Ruby's `record.inspect` for the `AssociationTypeMismatch`
 * message. Non-record values (the wrong-type primitives Rails' tests assign, e.g.
 * `1` or `"wrong value"`) render via `JSON.stringify` so a string shows quoted
 * exactly as Ruby's `"wrong value"`; records render as `#<ClassName>` since the
 * full attribute dump Rails emits is not needed by the message's consumers.
 * @internal
 */
function inspectMismatchedRecord(record: unknown): string {
  if (record == null) return String(record);
  if (typeof record === "object") {
    const ctorName = (record.constructor as { name?: string })?.name ?? "Object";
    return `#<${ctorName}>`;
  }
  try {
    return JSON.stringify(record) ?? String(record);
  } catch {
    return String(record);
  }
}
