import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { AssociationScope, type AssociationScopeable } from "./association-scope.js";
import { ActiveRecord, Associations } from "../namespaces.js";
import type { AssociationReflection, ThroughReflection } from "../reflection.js";
import { kernelArray, safeConstantize, tryCall } from "@blazetrails/activesupport";
import {
  except,
  hasKey,
  rbEnsure,
  rbEqual,
  rbInspect,
  rbObjClass,
  rbObjClassname,
  rbObjId,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjIvarSet,
} from "@blazetrails/ruby-compat";
import { AssociationTypeMismatch, RecordNotFound } from "../errors.js";
import { assertAssignedSynchronously } from "@blazetrails/activemodel";

export abstract class Association<Target extends Base | Base[] = Base | Base[]> {
  owner: Base;
  reflection: AssociationDefinition;
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

  get target(): Target | null {
    return this._targetStore as Target | null;
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

  /** @internal */
  protected _skipStrictLoading = false;

  private _staleState: unknown = undefined;
  private _staleStateSnapshotted = false;
  private _cachedScope: unknown = undefined;

  constructor(owner: Base, reflection: AssociationDefinition) {
    reflection.checkValidityBang();

    this.owner = owner;
    this.reflection = reflection;
    this.disableJoins = this.reflection.options.disableJoins || false;
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
    return this.loaded && !rbEqual(this._staleState, this.staleState());
  }

  reset(): void {
    this.loaded = false;
    this._staleState = undefined;
    this._staleStateSnapshotted = false;
  }

  resetNegativeCache(): void {
    if (this.loaded && this.target == null) {
      this.reset();
    }
  }

  /** @inventedArm if — CONVERGEABLE singular-association-find-target-and-reader-take-rails-bodies */
  reload(force = false): this | null | Promise<this | null> {
    if (force && this.klass) this.klass.connectionPool().clearQueryCache();
    this.reset();
    this.resetScope();
    const loaded = this.loadTarget();
    if (loaded instanceof Promise) {
      return loaded.then(() => {
        if (this.target != null) return this;
        return null;
      });
    }
    if (this.target != null) return this;
    return null;
  }

  setTarget(target: Base | Base[] | null): void {
    this.target = target;
  }

  scope(): any {
    let scope: any;
    if (this.disableJoins) {
      return Associations.DisableJoinsAssociationScope.create().scope(
        this as unknown as AssociationScopeable,
      );
    } else if ((scope = this.klass.currentScope()) && tryCall(scope, "proxyAssociation") === this) {
      return scope.spawn();
    } else if ((scope = this.klass.globalCurrentScope())) {
      return this.targetScope().mergeBang(this.associationScope()).mergeBang(scope);
    } else {
      return this.targetScope().mergeBang(this.associationScope());
    }
  }

  /** @internal */
  associationScope(): any {
    if (this.klass) {
      return (this._cachedScope ||= this.disableJoins
        ? Associations.DisableJoinsAssociationScope.scope(this as unknown as AssociationScopeable)
        : AssociationScope.scope(this as unknown as AssociationScopeable));
    }
  }

  resetScope(): void {
    this._cachedScope = undefined;
  }

  setStrictLoading(record: Base): boolean {
    if (this.owner.isStrictLoadingNPlusOneOnly() && this.reflection.macro === "hasMany") {
      return record.strictLoadingBang();
    } else {
      return record.strictLoadingBang(false, { mode: this.owner.strictLoadingMode() });
    }
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
    if (inverse) {
      inverse.inversedFrom(null);
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

  get klass(): typeof Base {
    return this.reflection.klass;
  }

  get extensions(): any[] {
    let extensions = [
      ...new Set([...this.klass.defaultExtensions(), ...this.reflection.extensions()]),
    ];

    if (this.reflection.scope) {
      extensions = [
        ...new Set([
          ...extensions,
          ...this.reflection.scopeFor(this.klass.unscoped(), this.owner).extensions,
        ]),
      ];
    }

    return extensions;
  }

  loadTarget(): Promise<Base | Base[] | null> | Base | Base[] | null {
    const loaded = (): Base | Base[] | null => {
      if (!this.isLoaded()) this.loadedBang();
      return this.target;
    };
    if ((this._staleState != null && this.isStaleTarget()) || this.isFindTarget()) {
      const target = this._findTarget({ async: false });
      return (async () => {
        try {
          await target;
          return loaded();
        } catch (error) {
          if (error instanceof RecordNotFound) {
            this.reset();
            return null;
          }
          throw error;
        }
      })();
    }

    return loaded();
  }

  private _findTarget(options: { async: boolean }): Promise<void> {
    const staleStateBeforeLoad = this.staleState();
    return this.findTarget(options).then((result) => {
      if (result !== undefined) {
        if (result !== null && !Array.isArray(result)) this.setStrictLoading(result);
        if (
          this.loaded &&
          (!this.isStaleTarget() || !rbEqual(this.staleState(), staleStateBeforeLoad))
        )
          return;
        this._writeTargetStore(result);
      }
    });
  }

  async asyncLoadTarget(): Promise<null> {
    if ((this._staleState != null && this.isStaleTarget()) || this.isFindTarget()) {
      await this._findTarget({ async: true });
    }

    if (!this.isLoaded()) this.loadedBang();
    return null;
  }

  marshalDump(): [string, [string, unknown][]] {
    const ivars = rbObjInstanceVariables(this)
      .filter((name) => !["@reflection", "@through_reflection"].includes(name))
      .map((name): [string, unknown] => [name, rbObjIvarGet(this, name)]);
    return [this.reflection.name, ivars];
  }

  marshalLoad(data: [string, [string, unknown][]]): void {
    const [reflectionName, ivars] = data;
    for (const [name, val] of ivars) rbObjIvarSet(this, name, val);
    this.reflection = (this.owner.constructor as typeof Base)._reflectOnAssociation(
      reflectionName,
    ) as AssociationDefinition;
  }

  initializeAttributes(record: Base, exceptFromScopeAttributes?: Record<string, unknown>): void {
    exceptFromScopeAttributes ??= {};
    const skipAssign: (string | string[])[] = [
      this.reflection.foreignKey(),
      this.reflection.type,
    ].filter((key) => key != null);
    let assignedKeys = record.changedAttributeNamesToSave;
    assignedKeys = assignedKeys.concat(Object.keys(exceptFromScopeAttributes).map(String));
    const attributes = except(
      this.scopeForCreate(),
      ...assignedKeys.filter((key) => !skipAssign.includes(key)),
    );
    if (Object.keys(attributes).length > 0) {
      assertAssignedSynchronously(
        record._assignAttributes(attributes) as Promise<void> | undefined,
        "initializeAttributes",
      );
    }
    this.setInverseInstance(record);
  }

  async create(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    block?: (record: Base) => void | Promise<void>,
  ): Promise<Base | Base[] | null> {
    return this._createRecord(attributes, false, block);
  }

  async createBang(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    block?: (record: Base) => void | Promise<void>,
  ): Promise<Base | Base[]> {
    return this._createRecord(attributes, true, block) as Promise<Base | Base[]>;
  }

  isCollection(): boolean {
    return false;
  }

  protected staleState(): unknown {
    return undefined;
  }

  protected foreignKeyPresent(): boolean {
    return false;
  }

  protected abstract _createRecord(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    raise?: boolean,
    block?: (record: Base) => void | Promise<void>,
  ): Promise<Base | Base[] | null>;

  /** @internal */
  buildRecord(attributes?: Record<string, unknown>, block?: (record: Base) => void): Base | null {
    return this.reflection.buildAssociation(attributes, (record: Base) => {
      this.initializeAttributes(record, attributes);
      if (block) block(record);
    });
  }

  private inverseAssociationFor(record: Base): Association | null {
    if (this.isInvertibleFor(record)) {
      return record.association(this.inverseReflectionFor(record)!.name);
    }
    return null;
  }

  private inversable(record: Base | null): boolean {
    return (
      record != null &&
      (!record.isPersisted() || !this.owner.isPersisted() || this.matchesForeignKey(record))
    );
  }

  /** @internal */
  matchesForeignKey(record: Base): boolean {
    if (this.isForeignKeyFor(record)) {
      return (
        rbEqual(record.readAttribute(String(this.reflection.foreignKey())), this.owner.id) ||
        (this.isForeignKeyFor(this.owner) &&
          rbEqual(this.owner.readAttribute(String(this.reflection.foreignKey())), record.id))
      );
    }
    return rbEqual(this.owner.readAttribute(String(this.reflection.foreignKey())), record.id);
  }

  /** @internal */
  protected ensureKlassExistsBang(): void {
    void this.klass;
  }

  protected async findTarget(_options: { async?: boolean } = {}): Promise<Base | Base[] | null> {
    return null;
  }

  /** @internal */
  protected skipStrictLoading<T>(block: () => T): T {
    const skipStrictLoadingWas = this._skipStrictLoading;
    return rbEnsure(
      () => {
        this._skipStrictLoading = true;
        return block();
      },
      () => {
        this._skipStrictLoading = skipStrictLoadingWas;
      },
    );
  }

  /** @internal */
  protected isViolatesStrictLoading(): boolean {
    if (this._skipStrictLoading) return false;

    if ((this.owner as { _validationContext?: unknown })._validationContext != null) return false;

    if (hasKey(this.reflection.options, "strictLoading")) {
      return this.reflection.options.strictLoading === true;
    }

    return this.owner.isStrictLoading() && !this.owner.isStrictLoadingNPlusOneOnly();
  }

  /** @internal */
  protected targetScope(): any {
    return ActiveRecord.AssociationRelation.create(this.klass, this).mergeBang(
      this.klass.scopeForAssociation(),
    );
  }

  /** @internal */
  scopeForCreate(): Record<string, unknown> {
    return this.scope().scopeForCreate();
  }

  /** @internal */
  isFindTarget(): boolean {
    return (
      !this.isLoaded() && (!this.owner.isNewRecord() || this.foreignKeyPresent()) && !!this.klass
    );
  }

  protected raiseOnTypeMismatchBang(record: Base): void {
    if (!(record instanceof this.reflection.klass)) {
      const freshClass = safeConstantize(this.reflection.className) as typeof Base | null;
      if (!(freshClass && (record as object) instanceof freshClass)) {
        const message =
          `${this.reflection.className}(#${rbObjId(this.reflection.klass)}) expected, ` +
          `got ${rbInspect(record)} which is an instance of ${rbObjClassname(record)}(#${rbObjId(rbObjClass(record))})`;
        throw new AssociationTypeMismatch(message);
      }
    }
  }

  protected inverseReflectionFor(_record: Base): AssociationReflection | ThroughReflection | null {
    return this.reflection.inverseOf();
  }

  /** @internal */
  protected isInvertibleFor(record: Base): boolean {
    return this.isForeignKeyFor(record) && !!this.inverseReflectionFor(record);
  }

  protected isForeignKeyFor(record: Base): boolean {
    const foreignKey = kernelArray(this.reflection.foreignKey());
    return foreignKey.every((key) =>
      (record as Base & { _hasAttribute(attrName: string): boolean })._hasAttribute(key),
    );
  }

  private isSkipStatementCache(scope: Relation<Base>): boolean {
    return (
      this.reflection.hasScope() ||
      scope.isEagerLoading ||
      this.klass.isScopeAttributes() ||
      this.reflection.sourceReflection!.activeRecord.defaultScopes.some(
        (defaultScope) => defaultScope != null,
      )
    );
  }

  protected enqueueDestroyAssociation(options: Record<string, unknown>): void {
    const jobClass = (this.owner.constructor as any).destroyAssociationAsyncJob;
    if (jobClass) {
      (this.owner as any)._afterCommitJobs.push([jobClass, options]);
    }
  }
}
