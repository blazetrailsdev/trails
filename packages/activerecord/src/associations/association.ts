import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { resolveModel, buildHasManyRelation } from "../associations.js";
import { AssociationScope } from "./association-scope.js";
import { camelize, singularize } from "@blazetrails/activesupport";

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
   * Memoized result of `associationScope()` — Rails' `@association_scope`
   * (association.rb:300-308). Built lazily on first access; reset by
   * `resetScope()` (called from `reload()` and on init). Skipped for
   * `disable_joins` paths — Rails creates a fresh
   * `DisableJoinsAssociationScope` per call (association.rb:107-117)
   * because the scope's chain walk depends on owner FK snapshots that
   * a long-lived cache would mask.
   */
  private _cachedAssociationScope: unknown = undefined;

  constructor(owner: Base, reflection: AssociationDefinition) {
    this.owner = owner;
    this.reflection = reflection;
    this.disableJoins = reflection.options.disableJoins || false;
    this.loaded = false;
    this.target = null;
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
   * Returns the scope (Relation) for this association. The base
   * implementation delegates to buildHasManyRelation, which builds
   * a WHERE clause in the has_many direction. Subclasses (e.g.
   * BelongsToAssociation) override for their own direction.
   */
  scope(): any {
    return buildHasManyRelation(this.owner, this.reflection.name, this.reflection.options);
  }

  resetScope(): void {
    this._cachedAssociationScope = undefined;
  }

  /**
   * Build (or return cached) JOIN-based association scope. Mirrors
   * Rails' `Association#association_scope` (association.rb:300-308):
   * memoized per-instance, reset on `reload()`.
   *
   * **Disable-joins routing happens upstream of this method.** Loaders
   * detect `disable_joins: true` early and route to the dedicated
   * DJAS loader (`_loadThroughViaDisableJoinsScope`); they never call
   * `associationScope()` for disable_joins associations. Keeping that
   * branch here would create a TDZ cycle:
   * base.ts → associations/association.ts → DJAS → DJAR → relation.ts
   * → base.ts. So `associationScope` is JOIN-only; calling it on a
   * disable-joins instance returns the JOIN-based scope (which is
   * not what disable_joins users want, but is also not how loaders
   * reach this code).
   *
   * Cache contract (Rails-equivalent): the cached scope captures
   * owner FK / polymorphic-type values at build time. Mutating the
   * owner's FK after a first load does NOT invalidate the cache —
   * Rails behaves the same (`@association_scope` only resets via
   * `reset_scope`, called on init and `reload()`). Callers that
   * mutate FKs and want a fresh query must `reload()`.
   */
  associationScope(): unknown {
    // Mirror Rails' `if klass` guard (association.rb:301): polymorphic
    // belongs_to with a blank type column has no resolvable target
    // class. Return undefined and skip caching so the next access
    // (after the type column is set) builds a fresh scope.
    const klass = this.klass as typeof Base | undefined;
    if (!klass) return undefined;
    // `this.reflection` here is the lightweight AssociationDefinition
    // attached at macro time. AssociationScope needs the rich
    // Reflection (with `chain`, `joinPrimaryKey`, etc.) that lives on
    // the model class via `_reflectOnAssociation(name)`. Resolve once
    // per call — the result is small and the cache stores the BUILT
    // scope, not the reflection.
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => unknown;
    };
    const richReflection = ctor._reflectOnAssociation?.(this.reflection.name) ?? this.reflection;
    if (this._cachedAssociationScope === undefined) {
      this._cachedAssociationScope = AssociationScope.scope({
        owner: this.owner,
        reflection: richReflection as never,
        klass: klass as never,
      });
    }
    return this._cachedAssociationScope;
  }

  /**
   * Apply strict loading settings from the owner to a loaded record.
   */
  setStrictLoading(record: Base): Base {
    const recordAny = record as any;
    if (typeof recordAny.strictLoadingBang === "function") {
      if (
        typeof this.owner.isStrictLoadingNPlusOneOnly === "function" &&
        (this.owner as any).isStrictLoadingNPlusOneOnly() &&
        this.reflection.type === "hasMany"
      ) {
        recordAny.strictLoadingBang();
      } else if ((this.owner as any)._strictLoading) {
        recordAny.strictLoadingBang();
      }
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
   * Set the inverse instance on a newly built record. Subclasses
   * (CollectionAssociation, HasOneAssociation) override to also set
   * FK/type columns via setOwnerAttributes.
   */
  initializeAttributes(record: Base, _exceptFromScopeAttributes?: Record<string, unknown>): void {
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
    const ownerAny = this.owner as any;
    const name = this.reflection.name;

    if (ownerAny._cachedAssociations?.has(name)) {
      return ownerAny._cachedAssociations.get(name);
    }
    if (ownerAny._preloadedAssociations?.has(name)) {
      return ownerAny._preloadedAssociations.get(name);
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
    const inverseOf = this.reflection.options.inverseOf;
    if (!inverseOf) return null;
    const recordAny = record as any;
    if (typeof recordAny.association === "function") {
      try {
        return recordAny.association(inverseOf);
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
}
