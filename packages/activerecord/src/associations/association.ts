import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { resolveModel, buildHasManyRelation } from "../associations.js";
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
    // Subclasses may cache the scope; reset any cached value.
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
