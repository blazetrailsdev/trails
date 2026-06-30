import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { resolveModel, _preloadedHolderTarget } from "../associations.js";
import { AssociationScope } from "./association-scope.js";
import { associationKeysEqual } from "./key-normalization.js";
import { ScopeRegistry } from "../scoping.js";
import { getDjasScopeBuilder, getAssociationRelationFactory } from "./_scope-slots.js";
import { validateReflectionValidity } from "./validate-through-reflection.js";
import { camelize, singularize, underscore } from "@blazetrails/activesupport";
import { AssociationTypeMismatch } from "../errors.js";

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
  loaded: boolean;
  target: Base | Base[] | null;
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

  private _staleState: unknown = undefined;
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
    this.loaded = false;
    this.target = null;

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
    } catch {
      // namespace resolution failed — defer to the resolveModel NameError
    }
    const className =
      opts.className ?? camelize(this.reflection.type === "hasMany" ? singularize(name) : name);
    resolveModel(className);
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
  }

  isStaleTarget(): boolean {
    return this.loaded && this._staleState !== this.staleState();
  }

  reset(): void {
    this.loaded = false;
    this.target = null;
    this._staleState = undefined;
    this._explicitTarget = false;
    this._loadedFromPreload = false;
    this._loadedViaAsync = false;
  }

  resetNegativeCache(): void {
    if (this.loaded && this.target == null) {
      this.reset();
    }
  }

  async reload(): Promise<this> {
    this.reset();
    this.resetScope();
    await this.loadTarget();
    return this;
  }

  setTarget(target: Base | Base[] | null): void {
    this.target = target;
    this.loadedBang();
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
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => unknown;
    };
    const richReflection = ctor._reflectOnAssociation?.(this.reflection.name) ?? this.reflection;
    // Branch 1: disable_joins — delegate to DisableJoinsAssociationScope.
    if (this.disableJoins) {
      const djas = getDjasScopeBuilder();
      if (!djas)
        throw new Error(
          "DisableJoinsAssociationScope not initialized — call initializeAssociations() before using disable_joins associations",
        );
      return djas({ owner: this.owner, reflection: richReflection, klass });
    }
    // Branch 2: klass.current_scope.proxy_association == self.
    // Fires when CollectionProxy.scoping sets an AssociationRelation as
    // klass.currentScope; not yet implemented, so this is unreachable.
    const currentScope = (klass as any).currentScope;
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
    const globalScope = ScopeRegistry.globalCurrentScope(klass as unknown as object);
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
    if (this._staleState != null && this.isStaleTarget()) this.resetScope();
    if (this._cachedScope === undefined) {
      const ctor = this.owner.constructor as typeof Base & {
        _reflectOnAssociation?: (n: string) => unknown;
      };
      const richReflection = ctor._reflectOnAssociation?.(this.reflection.name) ?? this.reflection;
      if (this.disableJoins) {
        const djas = getDjasScopeBuilder();
        if (!djas)
          throw new Error(
            "DisableJoinsAssociationScope not initialized — call initializeAssociations() before using disable_joins associations",
          );
        this._cachedScope = djas({ owner: this.owner, reflection: richReflection, klass });
      } else {
        this._cachedScope = AssociationScope.scope({
          owner: this.owner,
          reflection: richReflection as never,
          klass: klass as never,
        });
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
      (this.reflection.type === "hasMany" || this.reflection.type === "hasAndBelongsToMany")
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
   */
  setInverseInstance(record: Base): Base {
    const inverse = this.inverseAssociationFor(record);
    if (inverse) {
      inverse.inversedFrom(this.owner);
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
  get klass(): typeof Base {
    // Use the rich reflection's klass getter when available — it does
    // namespace-relative resolution, matching Rails' compute_type walk.
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { klass?: typeof Base } | null;
    };
    const richKlass = ctor._reflectOnAssociation?.(this.reflection.name)?.klass;
    if (richKlass) return richKlass;
    const className =
      this.reflection.options.className ?? camelize(singularize(this.reflection.name));
    return resolveModel(className);
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
    // Mirrors Rails' guard `(@stale_state && stale_target?) || find_target?`
    // (association.rb:190). The `@stale_state &&` factor uses Ruby truthiness
    // (nil/false falsy; `0`/`""` truthy) — here `!= null`, not `Boolean()`.
    // The stale and find-target branches are mutually exclusive (`stale_target?`
    // requires loaded, `find_target?` requires not-loaded), so they split cleanly.
    if (this._staleState != null && this.isStaleTarget()) {
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
   * Mirrors Rails' `find_target` DB load: issues a query (never the in-memory
   * cache) and applies `set_strict_loading` per freshly loaded record.
   */
  private async _findTarget(): Promise<void> {
    const result = await this.doAsyncFindTarget();
    if (result !== undefined) {
      // Rails applies set_strict_loading per record in find_target's DB
      // execute block — only freshly loaded records, never cached ones.
      if (result !== null) this.setStrictLoading(result as Base);
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

  /**
   * Mirrors Rails' `Association#initialize_attributes` (association.rb:217):
   * pre-fill the newly built record with attributes derived from the
   * association's `scope_for_create` (where-conditions on the scope).
   * Caller-supplied / already-changed keys normally win; the exception is
   * `skip_assign = [foreign_key, foreign_type]`, where the scope value is
   * allowed through (Rails relies on this so a scoped association's FK /
   * polymorphic type gets anchored from the scope). `foreign_type` is the
   * polymorphic-belongs-to type column — NOT the STI inheritance column.
   */
  initializeAttributes(record: Base, exceptFromScopeAttributes?: Record<string, unknown>): void {
    applyScopeForCreate(this, record, exceptFromScopeAttributes);
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

  /**
   * Async find — delegates to the actual load functions in associations.ts.
   * Subclasses override to call the appropriate load function.
   */
  protected async doAsyncFindTarget(): Promise<Base | Base[] | null> {
    return null;
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
    const record = this.buildRecord(attributes);
    if (!record) return null;
    // Rails yields the record inside `build_record` (association.rb), before the
    // save — so the block can mutate attributes that get persisted.
    if (block) block(record);
    if (typeof (record as any).save === "function") {
      const saved = await (record as any).save();
      if (!saved && shouldRaise) {
        throw new Error(`Failed to save the new associated ${this.reflection.name}.`);
      }
    }
    return record;
  }

  protected buildRecord(attributes?: Record<string, unknown>): Base | null {
    const Klass = this.klass;
    if (!Klass) return null;
    const record = new (Klass as any)(attributes ?? {});
    this.initializeAttributes(record, attributes);
    return record;
  }

  private inverseAssociationFor(record: Base): Association | null {
    // Rails routes both polymorphic and non-polymorphic through
    // `inverse_reflection_for(record)` (association.rb:350-361). For
    // polymorphic belongs_to, the override raises
    // `InverseOfAssociationNotFoundError` when the configured
    // inverse name doesn't exist on the assigned record's class
    // (belongs_to_polymorphic_association.rb:35-37, reflection.rb:678).
    let inverseName: string | null = null;
    if ((this.reflection.options as any).polymorphic) {
      const inv = this.inverseReflectionFor(record) as any;
      if (!inv) return null;
      inverseName = typeof inv === "string" ? inv : (inv.name ?? null);
    } else {
      // Route through `reflection.inverseName()` rather than reading
      // `options.inverseOf` directly, so automatic inverse detection
      // (via `automaticInverseOf()`) fires when `inverseOf` is not
      // explicitly set. Mirrors Rails' `inverse_reflection_for`, which
      // returns `reflection.inverse_of` (reflection.rb:258 → inverse_name).
      const ctor = this.owner.constructor as {
        _reflectOnAssociation?: (n: string) => { inverseName?: () => string | null } | null;
      };
      const richReflection = ctor._reflectOnAssociation?.(this.reflection.name);
      inverseName =
        richReflection?.inverseName?.() ??
        (this.reflection.options.inverseOf as string | undefined) ??
        null;
    }
    if (!inverseName) return null;
    // Rails gates `inverse_association_for` on `invertible_for?` (association.rb
    // :350-367). For the base (has_many / has_one) direction that requires
    // `foreign_key_for?(record)` — the record must actually carry the FK —
    // without which an inverse can wire onto a record that lacks the FK column.
    // `isInvertibleFor` is overridden by `BelongsToAssociation` (no FK check)
    // and `HasManyThroughAssociation` (always false), mirroring their Rails
    // overrides. The inverse-reflection-present half is already covered by the
    // `inverseName` resolution above.
    if (!this.isInvertibleFor(record)) return null;
    const recordAny = record as any;
    if (typeof recordAny.association === "function") {
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
        this.keyValuesEqual(this.foreignKeyValues(record), this.idValues(this.owner)) ||
        (this.isForeignKeyFor(this.owner) &&
          this.keyValuesEqual(this.foreignKeyValues(this.owner), this.idValues(record)))
      );
    }
    return this.keyValuesEqual(this.foreignKeyValues(this.owner), this.idValues(record));
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

  private foreignKeyValues(record: Base): unknown[] {
    return this.resolveForeignKey().map((key) => (record as any)._readAttribute(key));
  }

  private idValues(record: Base): unknown[] {
    const pk = (record.constructor as typeof Base).primaryKey;
    return (Array.isArray(pk) ? pk : [pk]).map((key) => (record as any)._readAttribute(key));
  }

  private keyValuesEqual(a: unknown[], b: unknown[]): boolean {
    if (a.length === 0 || a.length !== b.length) return false;
    return a.every((value, i) => associationKeysEqual(value, b[i]));
  }

  private ensureKlassExistsBang(): typeof Base {
    const k = this.klass;
    if (!k) throw new Error(`Could not find the association ${this.reflection.name}`);
    return k;
  }

  private async findTarget(): Promise<Base | Base[] | null> {
    return this.loadTarget();
  }

  private skipStrictLoading<T>(block: () => T): T {
    const prev = (this as any)._skipStrictLoading;
    (this as any)._skipStrictLoading = true;
    try {
      return block();
    } finally {
      (this as any)._skipStrictLoading = prev;
    }
  }

  private isViolatesStrictLoading(): boolean {
    const ownerAny = this.owner as any;
    if ((this as any)._skipStrictLoading) return false;
    return !!(
      ownerAny._strictLoading && !ownerAny._strictLoadingWhitelist?.includes(this.reflection.name)
    );
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
    // Rails (association.rb:340-347) does a two-step check: `record.is_a?(reflection.klass)`
    // and, on failure, `record.is_a?(reflection.class_name.safe_constantize)`. The second
    // step exists only to tolerate constant reloading in development mode, which has no
    // JS analogue, so a single `instanceof` is faithful here.
    if (klass && !(record instanceof (klass as any))) {
      // Rails names the expected side with `reflection.class_name` — the
      // demodulized convention name (`belongs_to :region` → "Region"), NOT the
      // resolved `klass.name` (which for a namespace-relative target would be
      // the flattened "AdminRegion"). Prefer the rich reflection's `className`.
      const ctor = this.owner.constructor as typeof Base & {
        _reflectOnAssociation?: (n: string) => { className?: string } | null;
      };
      const expectedType =
        ctor._reflectOnAssociation?.(this.reflection.name)?.className ??
        this.reflection.options.className ??
        (klass as any).name ??
        this.reflection.name;
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
    return (this.reflection as any).inverseOf ?? null;
  }

  /**
   * Mirrors Rails' `Association#invertible_for?` (association.rb:365-367):
   * `foreign_key_for?(record) && inverse_reflection_for(record)`. The
   * inverse-reflection-present half is checked by the caller
   * (`inverseAssociationFor` resolves the inverse name first), so here we
   * gate on the foreign-key half. Overridden by `BelongsToAssociation` and
   * `HasManyThroughAssociation`.
   * @internal
   */
  protected isInvertibleFor(record: Base): boolean {
    return this.isForeignKeyFor(record);
  }

  protected isForeignKeyFor(record: Base): boolean {
    // Rails: `Array(reflection.foreign_key).all? { |key| record._has_attribute?(key) }`
    // (association.rb:370-373), where `_has_attribute?` checks the record's
    // attribute SET (`@attributes.key?`). Resolve the computed foreign key
    // from the rich reflection (the lightweight `options.foreignKey` is unset
    // when the FK is derived rather than explicit), then probe the record via
    // its `_has_attribute?` instance method.
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { foreignKey?: string | string[] } | null;
    };
    const fk =
      ctor._reflectOnAssociation?.(this.reflection.name)?.foreignKey ??
      (this.reflection.options as any).foreignKey;
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
    const jobClass = (this.owner.constructor as any).destroyAssociationAsyncJob;
    if (jobClass) {
      const ownerAny = this.owner as any;
      ownerAny._afterCommitJobs ??= [];
      ownerAny._afterCommitJobs.push([jobClass, options]);
    }
  }

  private isMatchesForeignKey(record: Base): boolean {
    const fk = (this.reflection.options as any).foreignKey;
    const fkArr: string[] = Array.isArray(fk) ? fk : [String(fk)];
    if (this.isForeignKeyFor(record)) {
      return (
        fkArr.every((key) => (record as any).readAttribute(key) === (this.owner as any).id) ||
        (this.isForeignKeyFor(this.owner) &&
          fkArr.every((key) => (this.owner as any).readAttribute(key) === (record as any).id))
      );
    }
    return fkArr.every((key) => (this.owner as any).readAttribute(key) === (record as any).id);
  }
}

/**
 * Apply scope_for_create attrs to `record`, mirroring Rails'
 * `initialize_attributes` (association.rb:217). Caller-supplied attrs
 * normally win — except for `skip_assign = [foreign_key, foreign_type]`,
 * where the scope value is allowed through even when already assigned
 * (Rails relies on this so a scoped association's FK / polymorphic type
 * gets re-anchored from the scope). Note: `foreign_type` is the
 * polymorphic-belongs-to type column, NOT the STI inheritance column.
 *
 * @internal
 */
export function applyScopeForCreate(
  assoc: Association,
  record: Base,
  exceptFromScopeAttributes?: Record<string, unknown>,
): void {
  const scope = assoc.scopeForCreate();
  if (!scope || Object.keys(scope).length === 0) return;

  // `assoc.reflection` is the lightweight AssociationDefinition (its `type`
  // is the macro name — "belongsTo" / etc. — not the polymorphic foreign
  // type column). Resolve the rich Reflection via `_reflectOnAssociation`
  // to read Rails-equivalent `foreignKey` / `type` accessors. Fall back to
  // `options.foreignKey` when the rich reflection isn't installed (e.g.
  // before macro registration finishes).
  const ctor = assoc.owner.constructor as typeof Base & {
    _reflectOnAssociation?: (n: string) => unknown;
  };
  const rich = ctor._reflectOnAssociation?.(assoc.reflection.name) as
    | { foreignKey?: string | string[]; type?: string | null }
    | undefined;
  const options = assoc.reflection.options as {
    foreignKey?: string | string[];
    as?: string;
  };
  const fk = rich?.foreignKey ?? options.foreignKey;
  // Polymorphic foreign-type column derives from `:as` when the rich
  // reflection isn't yet installed (same shape `setOwnerAttributes` uses).
  const foreignType = rich?.type ?? (options.as ? `${underscore(options.as)}_type` : null);
  const skipAssign = new Set<string>();
  if (Array.isArray(fk)) {
    for (const k of fk) if (k) skipAssign.add(String(k));
  } else if (fk) {
    skipAssign.add(String(fk));
  }
  if (foreignType) skipAssign.add(String(foreignType));

  const assigned = new Set<string>(((record as any).changedAttributeNamesToSave ?? []) as string[]);
  if (exceptFromScopeAttributes) {
    for (const k of Object.keys(exceptFromScopeAttributes)) assigned.add(k);
  }

  const attributes = filterScopeForCreate(scope, assigned, skipAssign);
  // Route through AR's `_assignAttributes` (mixed onto Base) so
  // multiparameter / nested-attribute handling applies — matches
  // Rails' `record.send(:_assign_attributes, ...)` dispatch.
  if (attributes) (record as any)._assignAttributes(attributes);
}

/**
 * Core of Rails' `scope_for_create.except!(*(assigned - skip_assign))`
 * filter: returns the attribute hash to apply, or `null` when nothing
 * is left after filtering. Shared between `applyScopeForCreate` (the
 * `Association#initializeAttributes` path) and `CollectionProxy`'s
 * direct-build paths.
 *
 * @internal
 */
export function filterScopeForCreate(
  scope: Record<string, unknown>,
  assigned: Set<string>,
  skipAssign: Set<string>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [k, v] of Object.entries(scope)) {
    if (assigned.has(k) && !skipAssign.has(k)) continue;
    out[k] = v;
    any = true;
  }
  return any ? out : null;
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
