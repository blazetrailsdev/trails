import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import {
  _builtAssociationScope,
  _ownerChainReflection,
  _loadSingularViaStatementCache,
  _resolveInverseName,
  _scopeForAssociation,
  _skipSingularStatementCache,
  _wireInverseAssociation,
  applyAssociationScope,
  resolveAssocClass,
} from "../associations.js";
import { Association } from "./association.js";
import { AssociationNotFoundError } from "./errors.js";
import { validateThroughReflection } from "./validate-through-reflection.js";
import { camelize, underscore } from "@blazetrails/activesupport";
import { strictLoadingViolationBang } from "../core.js";
import { RecordInvalid } from "../validations.js";

export class SingularAssociation extends Association {
  override get target(): Base | null {
    return super.target as Base | null;
  }

  override set target(value: Base | Base[] | null) {
    super.target = value;
  }

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  override reset(): void {
    super.reset();
    this._writeTargetStore(null);
  }

  writer(record: Base | null): void | Promise<void> {
    return this.replace(record);
  }

  build(
    attributes?: Record<string, unknown>,
    block?: (record: Base) => void,
  ): Base | null | Promise<Base | null> {
    const record = this.buildRecord(attributes, block);
    const setNewRecord = (): Base | null | Promise<Base | null> => {
      const removal = this.detachDisplacedOnBuild(record);
      if (removal) {
        return removal.then(async () => {
          if (record) await this.setNewRecord(record);
          return record;
        });
      }
      const assigned = record ? this.setNewRecord(record) : undefined;
      if (assigned) return assigned.then(() => record);
      return record;
    };
    const load = this.loadDisplacedForBuild();
    if (load) return load.then(setNewRecord);
    return setNewRecord();
  }

  /** @internal */
  protected loadDisplacedForBuild(): Promise<unknown> | null {
    return null;
  }

  /** @internal */
  protected detachDisplacedOnBuild(_record: Base | null): Promise<void> | null {
    return null;
  }

  async forceReloadReader(): Promise<Base | null> {
    await this.reload(true);
    return this.target;
  }

  get reader(): Base | null | Promise<Base | null> {
    if (this.loaded) {
      if (this.isStaleTarget()) {
        return this.reload().then(() => this.target);
      }
      return this.target;
    }

    if (this.target != null) {
      this.loadedBang();
      return this.target;
    }

    const cached = this.doFindTarget();
    if (cached !== undefined) {
      this.target = cached as Base | null;
      return this.target;
    }

    if (this.findTargetNeeded()) {
      if (this.isViolatesStrictLoading()) {
        const ctor = this.owner.constructor as typeof Base;
        const reflection = ctor._reflectOnAssociation?.(this.reflection.name);
        if (!reflection) throw new AssociationNotFoundError(this.owner, this.reflection.name);
        strictLoadingViolationBang({ owner: ctor, reflection });
      }
      return this.loadTarget() as Promise<Base | null>;
    }
    return this.target;
  }

  /** @internal */
  override scopeForCreate(): Record<string, unknown> {
    const attrs = super.scopeForCreate();
    const pk = (this.klass as typeof Base | undefined)?.primaryKey;
    if (pk == null) return attrs;
    for (const key of Array.isArray(pk) ? pk : [pk]) delete attrs[key];
    return attrs;
  }

  protected override async findTarget(): Promise<Base | null> {
    this._loaderWritebackSuppressed++;
    try {
      const owner = this.owner;
      const assocName = this.reflection.name;
      const options = this.reflection.options;
      const ctor = owner.constructor as typeof Base;
      const reflection = ctor._reflectOnAssociation?.(assocName);
      if (!reflection) throw new AssociationNotFoundError(owner, assocName);
      const isBelongsTo = reflection.macro === "belongsTo";

      if (options.through) {
        validateThroughReflection(ctor, assocName);
      }

      if (this.disableJoins) return this.scope().first();

      if (this.isViolatesStrictLoading()) {
        strictLoadingViolationBang({ owner: owner.constructor, reflection });
      }

      let targetModel: typeof Base;
      if (isBelongsTo && options.polymorphic) {
        const typeCol = options.foreignType ?? `${underscore(assocName)}_type`;
        const typeName = owner._readAttribute(typeCol) as string | null;
        if (!typeName) return null;
        targetModel = ctor.polymorphicClassFor(typeName);
      } else {
        targetModel = resolveAssocClass(owner, assocName, options.className ?? camelize(assocName));
      }

      const ownerSideReflection = _ownerChainReflection(reflection) ?? reflection;
      const keyColsForCheck = Array.isArray(ownerSideReflection.joinForeignKey)
        ? ownerSideReflection.joinForeignKey
        : [ownerSideReflection.joinForeignKey];
      for (const col of keyColsForCheck) {
        const v = owner._readAttribute(col);
        if (v === null || v === undefined) return null;
      }

      let result: Base | null;
      if (!_skipSingularStatementCache(reflection, targetModel, options)) {
        result = await _loadSingularViaStatementCache(owner, assocName, reflection, targetModel);
      } else {
        const built = _builtAssociationScope(owner, assocName, reflection, targetModel);
        const baseRelation = _scopeForAssociation(targetModel);
        let rel = baseRelation.merge(built);
        rel = applyAssociationScope(rel, this.reflection.scope, owner, reflection.scope);
        result = await rel.take();
      }

      if (result) {
        const inverseName = _resolveInverseName(ctor, assocName, options);
        if (inverseName) _wireInverseAssociation(owner, result, inverseName);
      }

      return result;
    } finally {
      this._loaderWritebackSuppressed--;
    }
  }

  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    raiseError = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    const record = this.buildRecord(attributes, block);
    if (!record) return null;
    let saved = true;
    if (typeof (record as any).save === "function") {
      saved = await (record as any).save();
    }
    const removal = this.detachDisplacedOnBuild(record);
    if (removal) await removal;
    await this.setNewRecord(record);
    if (!saved && raiseError) {
      throw new RecordInvalid(record);
    }
    return record;
  }

  protected replace(record: Base | null): void;
  protected replace(record: Base | null, save: boolean): void | Promise<void>;
  protected replace(record: Base | null, _save = true): void | Promise<void> {
    if (record) {
      this.setInverseInstance(record);
    } else if (this.target) {
      this.removeInverseInstance(this.target);
    }
    this.target = record;
  }

  protected setNewRecord(record: Base): void | Promise<void> {
    return this.replace(record);
  }
}

/** @internal */
function scopeForCreate(assoc: SingularAssociation): Record<string, unknown> {
  return (assoc as any).scope?.()?.scopeForCreate?.() ?? {};
}
