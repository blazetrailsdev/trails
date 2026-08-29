import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { associationInstanceGet, _associateRecordsToOwner } from "../associations.js";
import { AssociationScope, type AssociationScopeable } from "./association-scope.js";
import { associationKeysEqual } from "./key-normalization.js";
import { getDjasScopeBuilder, getAssociationRelationFactory } from "./_scope-slots.js";
import { validateReflectionValidity } from "./validate-through-reflection.js";
import { ThroughAssociation } from "./through-association.js";
import { parkNestedReaderLoad } from "../nested-attributes.js";
import { camelize, except, safeConstantize, singularize } from "@blazetrails/activesupport";
import { AssociationTargetReplacedDuringLoad, AssociationTypeMismatch } from "../errors.js";

/** @noRailsEquivalent CONVERGEABLE retire-ad-hoc-association-definition-holders */
function _richReflectionFor(owner: Base, reflection: AssociationDefinition): AssociationDefinition {
  if (Object.getPrototypeOf(reflection) !== Object.prototype) return reflection;
  const rich = (owner.constructor as typeof Base)._reflectOnAssociation?.(reflection.name);
  if (!rich) return reflection;
  return Object.create(
    rich as object,
    Object.getOwnPropertyDescriptors(reflection),
  ) as AssociationDefinition;
}

export class Association {
  owner: Base;
  readonly reflection: AssociationDefinition;
  readonly disableJoins: boolean;
  /** @internal */
  _targetStore: Base | Base[] | null = null;
  /** @internal */
  _loadedStore = false;

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
    this._writeTargetStore(value);
    this.loadedBang();
  }

  /** @internal */
  _writeTargetStore(value: Base | Base[] | null): void {
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

  _loadedViaAsync = false;
  /** @internal */
  _loaderWritebackSuppressed = 0;

  /** @internal */
  protected _skipStrictLoading = false;

  private _staleState: unknown = undefined;
  private _staleStateSnapshotted = false;
  private _cachedScope: unknown = undefined;

  constructor(owner: Base, reflection: AssociationDefinition) {
    this.owner = owner;
    this.reflection = _richReflectionFor(owner, reflection);
    this.disableJoins = this.reflection.options.disableJoins || false;

    validateReflectionValidity(owner.constructor as typeof Base, reflection.name);
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
    this._staleState = undefined;
    this._staleStateSnapshotted = false;
    this._loadedViaAsync = false;
  }

  resetNegativeCache(): void {
    if (this.loaded && this.target == null) {
      this.reset();
    }
  }

  async reload(force = false): Promise<this> {
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

  /** @internal */
  _setTargetFromLoader(target: Base | Base[] | null): void {
    this.target = target;
  }

  /** @internal */
  protected raiseIfLoadInFlight(): void {
    if (!this._loaderWritebackSuppressed) return;
    throw new AssociationTargetReplacedDuringLoad(
      `Cannot replace the target of association \`${this.reflection.name}\` while a load for it is still in flight. ` +
        `Await the load (or the reader) before assigning.`,
    );
  }

  /** @missingRailsCall create — PERMANENT */
  scope(): any {
    const klass = this.klass as typeof Base | undefined;
    if (!klass) return undefined;
    if (this.disableJoins) {
      const djas = getDjasScopeBuilder();
      if (!djas)
        throw new Error(
          "DisableJoinsAssociationScope not initialized — import '@blazetrails/activerecord/associations' before using disable_joins associations",
        );
      const ctor = this.owner.constructor as typeof Base;
      const reflection = ctor._reflectOnAssociation?.(this.reflection.name) ?? this.reflection;
      return djas({ owner: this.owner, reflection, klass } as never);
    }
    const currentScope = (klass as any).currentScope();
    if (currentScope && currentScope.proxyAssociation === this) {
      return typeof currentScope.spawn === "function" ? currentScope.spawn() : currentScope;
    }
    const associationScope = this.associationScope();
    const scope = klass.globalCurrentScope();
    const targetScope = this.targetScope();
    const base =
      targetScope != null && typeof targetScope.mergeBang === "function"
        ? targetScope.mergeBang(associationScope)
        : associationScope;
    if (scope) {
      return typeof base?.mergeBang === "function" ? base.mergeBang(scope) : base;
    }
    return base;
  }

  /** @internal */
  associationScope(): any {
    const klass = this.klass as typeof Base | undefined;
    if (!klass) return undefined;
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
    this.target = record;
  }

  inversedFromQueries(record: Base | null): void {
    if (this.inversable(record)) {
      this.target = record;
    }
  }

  /** @internal */
  private deriveClassName(): string {
    const name = this.reflection.name;
    return camelize(this.isCollection() ? singularize(name) : name);
  }

  get klass(): typeof Base {
    return this.reflection.klass as typeof Base;
  }

  /** @missingRailsCall order:scopeFor,unscoped — PERMANENT */
  get extensions(): any[] {
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => AssociationDefinition | null;
    };
    const reflection = (ctor._reflectOnAssociation?.(this.reflection.name) ??
      this.reflection) as AssociationDefinition;

    let extensions = [
      ...new Set([...this.klass.defaultExtensions(), ...(reflection.extensions?.() ?? [])]),
    ];

    if (reflection.scope) {
      extensions = [
        ...new Set([
          ...extensions,
          ...reflection.scopeFor!(this.klass.unscoped(), this.owner).extensions,
        ]),
      ];
    }

    return extensions;
  }

  loadTarget(): Promise<Base | Base[] | null> | Base | Base[] | null {
    const loaded = (): Base | Base[] | null => {
      this.loadedBang();
      return this.target;
    };
    if (this.isStaleTarget() && (this._staleState != null || this.target == null)) {
      return this._findTarget().then(loaded);
    } else if (this.findTargetNeeded()) {
      const cached = this.doFindTarget();
      if (cached !== undefined) {
        this._writeTargetStore(cached);
      } else {
        return this._findTarget().then(loaded);
      }
    }

    return loaded();
  }

  private async _findTarget(): Promise<void> {
    const staleStateBeforeLoad = this.staleState();
    const result = await this.findTarget();
    if (result !== undefined) {
      if (result !== null) this.setStrictLoading(result as Base);
      if (this.loaded && this.staleState() !== staleStateBeforeLoad) return;
      this._writeTargetStore(result);
    }
  }

  async asyncLoadTarget(): Promise<Base | Base[] | null> {
    const result = await this.loadTarget();
    this._loadedViaAsync = true;
    const name = this.reflection.name;
    const proxy = this.owner._collectionProxies.get(name) as
      | { loaded?: boolean; proxyAssociation?: Association }
      | undefined;
    const association = proxy && !proxy.loaded ? proxy.proxyAssociation : undefined;
    if (association) {
      const records = Array.isArray(result) ? result : result != null ? [result] : [];
      _associateRecordsToOwner(association, records);
    }
    return result;
  }

  /** @missingRailsCall map — PERMANENT */
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
    this._writeTargetStore(ivars.target as Base | Base[] | null);
    if (this.loaded) {
      this._staleState = this.staleState();
    }
  }

  initializeAttributes(
    record: Base,
    exceptFromScopeAttributes?: Record<string, unknown>,
  ): Promise<void> | void {
    exceptFromScopeAttributes ??= {};
    const skipAssign: (string | string[])[] = [
      this.reflection.foreignKey,
      this.reflection.type,
    ].filter((key) => key != null);
    let assignedKeys = record.changedAttributeNamesToSave;
    assignedKeys = assignedKeys.concat(Object.keys(exceptFromScopeAttributes).map(String));
    const attributes = except(
      this.scopeForCreate(),
      ...assignedKeys.filter((key) => !skipAssign.includes(key)),
    );
    const pending =
      Object.keys(attributes).length > 0
        ? (record._assignAttributes(attributes) as Promise<void> | undefined)
        : undefined;
    if (pending) {
      return pending.then(() => {
        this.setInverseInstance(record);
      });
    }
    this.setInverseInstance(record);
  }

  async create(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    block?: (record: Base) => void,
  ): Promise<Base | Base[] | null> {
    return this._createRecord(attributes, false, block);
  }

  async createBang(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    block?: (record: Base) => void,
  ): Promise<Base | Base[]> {
    const record = await this._createRecord(attributes, true, block);
    if (!record) {
      throw new Error("Failed to create associated record");
    }
    return record;
  }

  isCollection(): boolean {
    return false;
  }

  get reader(): Base | Base[] | null | Promise<Base | Base[] | null> {
    return this.target;
  }

  protected staleState(): unknown {
    return undefined;
  }

  protected doFindTarget(): Base | Base[] | null | undefined {
    const owner = this.owner;
    const name = this.reflection.name;

    const cached = owner._associationCache(name);
    if (cached !== undefined && (cached as unknown) !== (this as unknown)) {
      return cached.target as Base | Base[] | null;
    }
    const holder = associationInstanceGet.call(owner, name) as Association | null;
    if (holder?.isLoaded() && !(holder._staleStateIsSnapshotted && holder.isStaleTarget())) {
      return holder.target ?? null;
    }
    return undefined;
  }

  protected findTargetNeeded(): boolean {
    if (this.loaded) return false;
    const isNew = this.owner.isNewRecord();
    return (!isNew || this.foreignKeyPresent()) && !!this.klass;
  }

  protected foreignKeyPresent(): boolean {
    return false;
  }

  protected async _createRecord(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | Base[] | null> {
    const record = this.buildRecord(attributes as Record<string, unknown> | undefined, block);
    if (!record) return null;
    if (typeof (record as any).save === "function") {
      const saved = await (record as any).save();
      if (!saved && raise) {
        throw new Error(`Failed to save the new associated ${this.reflection.name}.`);
      }
    }
    return record;
  }

  /** @internal */
  buildRecord(attributes?: Record<string, unknown>, block?: (record: Base) => void): Base | null {
    const Klass = this.klass;
    if (!Klass) return null;
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
    const initializeAndYield = (record: Base): void => {
      const pending = this.initializeAttributes(record, attributes);
      if (pending) parkNestedReaderLoad(record, pending);
      if (block) block(record);
    };
    if (reflection?.buildAssociation) {
      return reflection.buildAssociation(attributes ?? {}, initializeAndYield);
    }
    return new (Klass as any)(attributes ?? {}, initializeAndYield);
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
    return !record.isPersisted() || !this.owner.isPersisted() || this.matchesForeignKey(record);
  }

  /** @internal */
  matchesForeignKey(record: Base): boolean {
    if (this.isForeignKeyFor(record)) {
      return (
        associationKeysEqual(
          record.readAttribute(String(this.reflection.foreignKey)),
          this.owner.id,
        ) ||
        (this.isForeignKeyFor(this.owner) &&
          associationKeysEqual(
            this.owner.readAttribute(String(this.reflection.foreignKey)),
            record.id,
          ))
      );
    }
    return associationKeysEqual(
      this.owner.readAttribute(String(this.reflection.foreignKey)),
      record.id,
    );
  }

  private ensureKlassExistsBang(): typeof Base {
    const k = this.klass;
    if (!k) throw new Error(`Could not find the association ${this.reflection.name}`);
    return k;
  }

  protected async findTarget(): Promise<Base | Base[] | null> {
    return null;
  }

  /** @internal */
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

  /** @internal */
  protected isViolatesStrictLoading(): boolean {
    if (this._skipStrictLoading) return false;
    if (this.owner._strictLoadingBypassCount) return false;

    if ((this.owner as { _validationContext?: unknown })._validationContext != null) return false;

    if (Object.prototype.hasOwnProperty.call(this.reflection.options, "strictLoading")) {
      return this.reflection.options.strictLoading === true;
    }

    return this.owner.isStrictLoading() && !this.owner.isStrictLoadingNPlusOneOnly();
  }

  /**
   * @internal
   * @missingRailsCall create — PERMANENT
   */
  protected targetScope(): any {
    const klass = this.klass as typeof Base | undefined;
    if (!klass) return null;
    const scopeForAssociation = (klass as any).scopeForAssociation?.() ?? null;
    const arFactory = getAssociationRelationFactory();
    if (!arFactory) return scopeForAssociation;
    const ar = arFactory(klass, this);
    return scopeForAssociation ? (ar as any).mergeBang(scopeForAssociation) : ar;
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
      const ctor = this.owner.constructor as typeof Base & {
        _reflectOnAssociation?: (n: string) => { className?: string } | null;
      };
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
      throw new AssociationTypeMismatch(
        expectedType,
        `${inspectMismatchedRecord(record)} which is an instance of ${actualType}`,
      );
    }
  }

  protected inverseReflectionFor(_record: Base): unknown {
    return (this.reflection as { inverseOf?: () => unknown }).inverseOf?.() ?? null;
  }

  /** @internal */
  protected isInvertibleFor(record: Base): boolean {
    return this.isForeignKeyFor(record) && !!this.inverseReflectionFor(record);
  }

  protected isForeignKeyFor(record: Base): boolean {
    const fk = this.reflection.foreignKey ?? (this.reflection.options as any).foreignKey;
    const fkArr = Array.isArray(fk) ? fk : [fk];
    const hasAttr = (record as any)._hasAttribute as ((k: string) => boolean) | undefined;
    return fkArr.every((key) => {
      if (key == null) return false;
      return typeof hasAttr === "function" ? hasAttr.call(record, String(key)) : false;
    });
  }

  /** @missingRailsCall any? — PERMANENT */
  private isSkipStatementCache(scope: any): boolean {
    const refl = this.reflection as any;
    const hasReflScope = !!(refl.hasScope?.() ?? refl.scope);
    const eagerLoading = !!scope?.isEagerLoading;
    const scopeAttrs = !!(this.klass as any)?.hasScopeAttributes?.();
    const sourceDefaultScopes = !!refl.sourceReflection?.()?.activeRecord?.defaultScopes?.length;
    return hasReflScope || eagerLoading || scopeAttrs || sourceDefaultScopes;
  }

  protected enqueueDestroyAssociation(options: Record<string, unknown>): void {
    const jobClass = (this.owner.constructor as any).destroyAssociationAsyncJob();
    if (jobClass) {
      const ownerAny = this.owner as any;
      ownerAny._afterCommitJobs ??= [];
      ownerAny._afterCommitJobs.push([jobClass, options]);
    }
  }
}

/** @internal */
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

Object.setPrototypeOf(ThroughAssociation, Association.prototype);
