import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { resolveModel } from "../associations.js";
import { AssociationScope } from "./association-scope.js";
import { ScopeRegistry } from "../scoping.js";
import { getDjasScopeBuilder, getAssociationRelationFactory } from "./_scope-slots.js";
import { validateThroughReflection } from "./validate-through-reflection.js";
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

    // Rails' `Association#initialize` runs `reflection.check_validity!`
    // so every Rails-named misconfiguration surfaces at first use
    // (polymorphic-through, missing source, source-type shape,
    // has-one-through-collection, out-of-order declaration, and
    // inverse-of misses). Delegates to
    // `ThroughReflection#checkValidityBang` via a memoized helper.
    validateThroughReflection(owner.constructor as typeof Base, reflection.name);
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
    // Memoize @association_scope (JOIN-based constraints only).
    if (this._cachedScope === undefined) {
      this._cachedScope = AssociationScope.scope({
        owner: this.owner,
        reflection: richReflection as never,
        klass: klass as never,
      });
    }
    // Branch 2: klass.current_scope.proxy_association == self.
    // Fires when CollectionProxy.scoping sets an AssociationRelation as
    // klass.currentScope; not yet implemented, so this is unreachable.
    const currentScope = (klass as any).currentScope;
    if (currentScope && (currentScope as any).proxyAssociation === this) {
      return typeof (currentScope as any).spawn === "function"
        ? (currentScope as any).spawn()
        : currentScope;
    }
    // Branches 3 + 4.
    const target = this.targetScope();
    const base =
      target != null && typeof (target as any).merge === "function"
        ? (target as any).merge(this._cachedScope)
        : this._cachedScope;
    const globalScope = ScopeRegistry.globalCurrentScope(klass as unknown as object);
    return globalScope && typeof (base as any)?.merge === "function"
      ? (base as any).merge(globalScope)
      : base;
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
      this.reflection.type === "hasMany"
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
    if (this.isStaleTarget() || this.findTargetNeeded()) {
      const cached = this.doFindTarget();
      if (cached !== undefined) {
        this.target = cached;
      } else {
        const result = await this.doAsyncFindTarget();
        if (result !== undefined) {
          // Rails applies set_strict_loading per record in find_target's DB
          // execute block — only freshly loaded records, never cached ones.
          if (result !== null) this.setStrictLoading(result as Base);
          this.target = result;
        }
      }
    }

    this.loadedBang();
    return this.target;
  }

  /**
   * Mirrors: ActiveRecord::Associations::Association#async_load_target
   * In Rails this kicks off an async load and returns nil immediately.
   * In our async-native implementation, this is identical to loadTarget.
   */
  async asyncLoadTarget(): Promise<Base | Base[] | null> {
    return this.loadTarget();
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

  async create(attributes?: Record<string, unknown>): Promise<Base | null> {
    return this._createRecord(attributes, false);
  }

  async createBang(attributes?: Record<string, unknown>): Promise<Base> {
    const record = await this._createRecord(attributes, true);
    if (!record) {
      throw new Error("Failed to create associated record");
    }
    return record;
  }

  isCollection(): boolean {
    return false;
  }

  get reader(): Base | Base[] | null {
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
    if (owner._preloadedAssociations.has(name)) {
      return owner._preloadedAssociations.get(name) as Base | Base[] | null;
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
    if (this.loaded) return false;
    const isNew = this.owner.isNewRecord();
    return !isNew || this.foreignKeyPresent();
  }

  protected foreignKeyPresent(): boolean {
    return false;
  }

  protected async _createRecord(
    attributes?: Record<string, unknown>,
    shouldRaise = false,
  ): Promise<Base | null> {
    const record = this.buildRecord(attributes);
    if (!record) return null;
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
    if (!record) return false;
    return record.isNewRecord() || this.owner.isNewRecord();
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
    return (this.scope() as any)?.scopeForCreate?.() ?? {};
  }

  private isFindTarget(): boolean {
    return this.findTargetNeeded();
  }

  protected raiseOnTypeMismatchBang(record: Base): void {
    const klass = this.klass;
    if (klass && !(record instanceof (klass as any))) {
      const expectedType =
        (klass as any).name ??
        (this.reflection as any).klass?.name ??
        (this.reflection as any).className ??
        this.reflection.name;
      const actualType = record.constructor.name;
      throw new AssociationTypeMismatch(expectedType, `an instance of ${actualType}`);
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
