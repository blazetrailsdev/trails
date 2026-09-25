import type { Base } from "../base.js";
import {
  _builtAssociationScope,
  _ownerChainReflection,
  _loadSingularViaStatementCache,
  _scopeForAssociation,
  _skipSingularStatementCache,
} from "../associations.js";
import { Association } from "./association.js";
import { AssociationNotFoundError } from "./errors.js";
import { underscore } from "@blazetrails/activesupport";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import { strictLoadingViolationBang } from "../core.js";
import { RecordInvalid } from "../validations.js";

export class SingularAssociation extends Association<Base> {
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
    this.ensureKlassExistsBang();
    if (!this.isLoaded() || this.isStaleTarget()) {
      const reloaded = this.reload();
      if (reloaded instanceof Promise) return reloaded.then(() => this.target);
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

  protected override findTarget(): Promise<Base | null> {
    if (!this.disableJoins && this.isViolatesStrictLoading()) {
      strictLoadingViolationBang({ owner: this.owner.constructor, reflection: this.reflection });
    }
    return (async (): Promise<Base | null> => {
      const owner = this.owner;
      const assocName = this.reflection.name;
      const options = this.reflection.options;
      const ctor = owner.constructor as typeof Base;
      const reflection = ctor._reflectOnAssociation?.(assocName);
      if (!reflection) throw new AssociationNotFoundError(owner, assocName);
      const isBelongsTo = reflection.macro === "belongsTo";

      if (this.disableJoins) return this.scope().first();

      let targetModel: typeof Base;
      if (isBelongsTo && options.polymorphic) {
        const typeCol = options.foreignType ?? `${underscore(assocName)}_type`;
        const typeName = owner._readAttribute(typeCol) as string | null;
        if (!typeName) return null;
        targetModel = ctor.polymorphicClassFor(typeName);
      } else {
        targetModel = this.klass;
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
        result = await baseRelation.merge(built).take();
      }

      if (result) this.setInverseInstance(result);

      return result;
    })();
  }

  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    raiseError = false,
    block?: (record: Base) => void | Promise<void>,
  ): Promise<Base | null> {
    let yielded: unknown;
    const record = this.buildRecord(
      attributes,
      block &&
        ((record: Base) => {
          yielded = block(record);
        }),
    );
    if (!record) return null;
    await yielded;
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

  protected replace(record: Base | null, ..._rest: unknown[]): void | Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/associations/singular_association.rb:57
    throw new NotImplementedError("Subclasses must implement a replace(record) method");
  }

  protected setNewRecord(record: Base): void | Promise<void> {
    return this.replace(record);
  }
}

/** @internal */
function scopeForCreate(assoc: SingularAssociation): Record<string, unknown> {
  return (assoc as any).scope?.()?.scopeForCreate?.() ?? {};
}
