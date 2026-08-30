import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { association, _buildAssociationInstance } from "./instance-methods.js";
import { camelize, underscore } from "@blazetrails/activesupport";
import { resolveAssocClass, _hmtNotFound } from "../associations.js";
import { HasOneAssociation, sameRecord } from "./has-one-association.js";
import { RecordInvalid } from "../validations.js";
import { ThroughAssociation, sourceReflection } from "./through-association.js";

export class HasOneThroughAssociation extends HasOneAssociation {
  /** @internal */
  declare createThroughRecord: (record: Base | null, save: boolean) => Promise<Base | null>;
  /** @internal */
  declare transaction: <R>(block: (tx?: any) => Promise<R>) => Promise<R | undefined>;
  /** @internal */
  declare throughReflection: () => unknown;
  /** @internal */
  declare throughAssociation: () => any;
  /** @internal */
  declare constructJoinAttributes: (...records: Base[]) => Record<string, unknown>;
  /** @internal */
  declare ensureMutable: () => void;
  /** @internal */
  declare ensureNotNested: () => void;

  _pendingReplace: { record: Base | null; readonly previousTarget: Base | null } | null = null;

  private _pendingUnloadedThroughReconcile = false;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /** @internal */
  protected loadHasOneThrough(): Promise<Base | null> {
    return loadHasOneThrough(this.owner, this.reflection.name, this.reflection.options);
  }

  override reset(): void {
    super.reset();
    this._pendingReplace = null;
    this._pendingUnloadedThroughReconcile = false;
  }

  /** @internal */
  protected override loadTargetForBuild(): Promise<unknown> {
    const throughProxy = this.throughAssociation() as {
      loadTarget?: () => unknown;
    } | null;
    return Promise.resolve(throughProxy?.loadTarget?.());
  }

  /** @internal */
  protected override async detachDisplacedTarget(): Promise<void> {}

  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    let record: Base | null;
    try {
      record = await super._createRecord(attributes, raise, block);
    } catch (error) {
      if (error instanceof RecordInvalid && this._pendingReplace) {
        await this.persistReplace(false);
      }
      throw error;
    }
    if (record && this._pendingReplace) {
      await this.persistReplace(false);
    }
    return record;
  }

  protected override setNewRecord(record: Base): void {
    this.replace(record, false);
  }

  /** @internal */
  protected override detachDisplacedOnBuild(): Promise<void> | null {
    return null;
  }

  /** @internal */
  protected override loadDisplacedForBuild(): Promise<unknown> | null {
    return null;
  }

  /** @internal */
  protected override displacementNeedsAwait(): boolean {
    return false;
  }

  override writer(record: Base | null): void | Promise<void> {
    this.replace(record);
    if ((this.owner as { isPersisted?: () => boolean }).isPersisted?.() && this._pendingReplace) {
      return this.persistReplace();
    }
  }

  sourceReflection(): unknown {
    return sourceReflection(this);
  }

  /** @missingRailsCall create_through_record — PERMANENT */
  protected override replace(record: Base | null, save = true): void {
    if (record) (this as any).raiseOnTypeMismatchBang(record);
    const inMemory = record != null && ((this.owner as any).isNewRecord?.() || !save);
    if (!inMemory) {
      const assigningAnother = !sameRecord(this.target, record);
      const mightNeedDelete = record === null && !this.isLoaded();
      if (assigningAnother || mightNeedDelete || record?.hasChangesToSave === true) {
        if (save) {
          if (this._pendingReplace) {
            const wasAssignedAnother = !sameRecord(
              this._pendingReplace.previousTarget,
              this._pendingReplace.record,
            );
            if (wasAssignedAnother && sameRecord(record, this._pendingReplace.previousTarget)) {
              this._pendingReplace = null;
            } else {
              this._pendingReplace.record = record;
            }
          } else {
            this._pendingReplace = { record, previousTarget: this.target };
          }
        }
      }
    }
    this.target = record;
    if (record) this.constructThroughRecordInMemory(record, save);
  }

  /** @internal */
  private constructThroughRecordInMemory(record: Base, save: boolean): void {
    if (!((this.owner as any).isNewRecord?.() || !save)) return;

    this.ensureNotNested();
    const throughProxy = this.throughAssociation();
    if (!throughProxy) return;
    const attrs = this.constructJoinAttributes(record);
    const throughRecord = (throughProxy as { target?: Base | null }).target ?? null;
    if (throughRecord) {
      if ((throughRecord as any).isNewRecord?.()) {
        void (throughRecord as any).assignAttributes?.(attrs);
        if (this._pendingReplace) this._pendingReplace.record = record;
      } else {
        void (throughRecord as any).assignAttributes?.(attrs);
        if (this._pendingReplace) {
          this._pendingReplace.record = record;
        } else {
          this._pendingReplace = { record, previousTarget: null };
        }
      }
    } else {
      buildThroughProxyRecord(throughProxy, attrs);
      if (!((this.owner as any).isNewRecord?.() ?? true)) {
        if (this._pendingReplace) {
          this._pendingReplace.record = record;
        } else {
          this._pendingReplace = { record, previousTarget: null };
        }
        this._pendingUnloadedThroughReconcile = true;
        const tp = throughProxy as {
          _pendingReplace?: { record: Base | null; previousTarget: Base | null } | null;
        };
        if (tp._pendingReplace == null) {
          tp._pendingReplace = { record: null, previousTarget: null };
        }
      }
    }
  }

  /** @noRailsEquivalent PERMANENT */
  async persistReplace(save = true): Promise<void> {
    const pending = this._pendingReplace;
    this._pendingReplace = null;
    if (this._pendingUnloadedThroughReconcile) {
      this._pendingUnloadedThroughReconcile = false;
      const tp = this.throughAssociation() as {
        reset?: () => void;
        _pendingReplace?: unknown;
      } | null;
      tp?.reset?.();
      if (tp) tp._pendingReplace = null;
    }
    if (!pending) return;
    await this.transaction(async () => {
      await this.createThroughRecord(pending.record, save);
    });
  }
}

/** @internal */
async function createThroughRecord(
  this: HasOneThroughAssociation,
  record: Base | null,
  save: boolean,
): Promise<Base | null> {
  this.ensureNotNested();

  const throughProxy = this.throughAssociation();
  if (!throughProxy) return null;

  let throughRecord = await throughProxy.loadTarget?.();

  if (throughRecord && throughRecord.isDestroyed?.()) {
    await throughProxy.reload?.();
    throughRecord = throughProxy.target ?? null;
  }

  if (throughRecord && !record) {
    await throughRecord.destroy?.();
    return null;
  }

  if (record) {
    const attrs = this.constructJoinAttributes(record);

    if (throughRecord) {
      if (throughRecord.isNewRecord?.()) {
        await throughRecord.assignAttributes?.(attrs);
      } else {
        await throughRecord.update?.(attrs);
      }
    } else if ((this.owner as any).isNewRecord?.() || !save) {
      buildThroughProxyRecord(throughProxy, attrs);
    } else {
      await throughProxy.create?.(attrs);
    }
  }
  return record;
}

async function loadHasOneThrough(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  const ctor = record.constructor as typeof Base;
  const throughAssoc = ctor._reflectOnAssociation(
    options.through!,
  ) as unknown as AssociationDefinition | null;
  if (!throughAssoc) {
    throw _hmtNotFound(ctor, assocName);
  }

  let throughRecord: Base | null;
  if (throughAssoc.macro === "hasOne") {
    throughRecord = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
  } else if (throughAssoc.macro === "belongsTo") {
    throughRecord = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
  } else if (throughAssoc.macro === "hasMany") {
    const throughHolder = _buildAssociationInstance.call(record, throughAssoc) as unknown as {
      findTarget(): Promise<Base[]>;
    };
    const throughRecords = await throughHolder.findTarget();
    throughRecord = throughRecords[0] ?? null;
  } else {
    throughRecord = null;
  }

  if (!throughRecord) return null;

  const sourceName = options.source ?? assocName;
  const throughCtor = throughRecord.constructor as typeof Base;
  const sourceAssoc = throughCtor._reflectOnAssociation(sourceName);

  if (sourceAssoc) {
    if (sourceAssoc.macro === "belongsTo") {
      return (await association.call(throughRecord, sourceName).loadTarget()) as Base | null;
    } else if (sourceAssoc.macro === "hasOne") {
      return (await association.call(throughRecord, sourceName).loadTarget()) as Base | null;
    }
  }

  const className = options.className ?? camelize(sourceName);
  const targetFk = `${underscore(sourceName)}_id`;
  const fkValue = throughRecord._readAttribute(targetFk);
  if (fkValue === null || fkValue === undefined) return null;
  const targetModel = resolveAssocClass(throughRecord, sourceName, className);
  return targetModel.findBy({ [targetModel.primaryKey as string]: fkValue });
}

/** @internal */
function buildThroughProxyRecord(throughProxy: any, attrs: Record<string, unknown>): void {
  const record = throughProxy.buildRecord?.(attrs);
  if (record) throughProxy.setNewRecord?.(record);
}

Object.assign(HasOneThroughAssociation.prototype, {
  createThroughRecord,
  ...ThroughAssociation,
});
