import { fetch, kernelThrow, rbEqual } from "@blazetrails/ruby-compat";
import { Associations } from "../namespaces.js";
import type { Base } from "../base.js";
import { DeleteRestrictionError } from "./errors.js";
import { RecordNotSaved } from "../errors.js";
import { kernelArray, underscore } from "@blazetrails/activesupport";
import { reflectOnAllAssociations } from "../reflection.js";
import {
  ForeignAssociation,
  foreignKeyPresent,
  setOwnerAttributes,
} from "./foreign-association.js";
import { SingularAssociation } from "./singular-association.js";
import { queryConstraintsList } from "../persistence.js";
import { assertAssignedSynchronously } from "@blazetrails/activemodel";

export class HasOneAssociation extends SingularAssociation {
  /** @internal */
  protected syncWrite(record: Base | null): void {
    assertAssignedSynchronously(this.replace(record, false), `${this.reflection.name}=`);
  }

  async handleDependency(): Promise<void> {
    switch (this.reflection.options.dependent) {
      case "restrictWithException":
        if (await this.loadTarget()) {
          throw new DeleteRestrictionError(this.reflection.name);
        }
        break;

      case "restrictWithError":
        if (await this.loadTarget()) {
          const owner = this.owner as Base & {
            errors: { add(a: string, t: string, opts?: Record<string, unknown>): void };
          };
          const ctor = owner.constructor as typeof Base & {
            humanAttributeName(attr: string): string;
          };
          const record = ctor.humanAttributeName(this.reflection.name).toLowerCase();
          owner.errors.add("base", ":restrict_dependent_destroy.has_one", { record });
          kernelThrow(":abort");
        }
        break;

      default:
        return await this.delete();
    }
  }

  async delete(
    method: string | undefined = this.reflection.options.dependent as string | undefined,
  ): Promise<void> {
    if (await this.loadTarget()) {
      const target = this.target as any;
      switch (method) {
        case "delete":
          await target.delete();
          break;
        case "destroy":
          target.destroyedByAssociation = this.reflection;
          await preloadDestroyInverseBelongsTo(this);
          await target.destroy();
          if (!target.isDestroyed()) kernelThrow(":abort");
          break;
        case "destroyAsync": {
          let primaryKeyColumn: string | string[];
          let id: unknown;
          if (queryConstraintsList.call(target.constructor)) {
            primaryKeyColumn = queryConstraintsList.call(target.constructor)!;
            id = primaryKeyColumn.map((col) => target[col]);
          } else {
            primaryKeyColumn = target.constructor.primaryKey as string;
            id = target[primaryKeyColumn];
          }

          this.enqueueDestroyAssociation({
            ownerModelName: this.owner.constructor.name,
            ownerId: (this.owner as any).id,
            associationClass: String(this.reflection.klass.name),
            associationIds: [id],
            associationPrimaryKeyColumn: primaryKeyColumn,
            ensuringOwnerWasMethod: fetch(this.reflection.options, "ensuringOwnerWas", null),
          });
          break;
        }
        case "nullify":
          if (target.isPersisted()) await target.updateColumns(nullifiedOwnerAttributes(this));
          break;
      }
    }
  }

  /** @internal */
  protected override loadDisplacedForBuild(): Promise<unknown> | null {
    if (!this.isFindTarget()) return null;
    return this.loadTargetForBuild();
  }

  /** @internal */
  protected override detachDisplacedOnBuild(record: Base | null): Promise<void> | null {
    const displaced = this.loaded ? this.target : null;
    if (!displaced || rbEqual(displaced, record)) return null;
    const dependent = (this.reflection.options.dependent as string) ?? "";
    if (
      dependent !== "delete" &&
      dependent !== "destroy" &&
      (displaced as { isPersisted?: () => boolean }).isPersisted?.() !== true
    )
      return null;
    return this.detachDisplacedTarget();
  }

  /** @internal */
  protected loadTargetForBuild(): Promise<unknown> {
    return Promise.resolve(this.loadTarget());
  }

  protected override replace(record: Base | null, save: false): Base | null | Promise<Base | null>;
  protected override replace(
    record: Base | null,
    save?: boolean,
  ): Base | null | Promise<Base | null>;
  /** @inventedArm if — CONVERGEABLE has-one-replace-sync-arm-skips-load-and-remove-target */
  protected override replace(record: Base | null, save = true): Base | null | Promise<Base | null> {
    if (save) {
      return (async () => {
        if (record) (this as any).raiseOnTypeMismatchBang(record);
        if (!((await this.loadTarget()) || record)) return this.target;
        const assigningAnotherRecord = !rbEqual(this.target, record);
        if (assigningAnotherRecord || record!.hasChangesToSave) {
          save &&= this.owner.isPersisted();
          await transactionIf(this, save, async () => {
            if (this.target && !this.target.isDestroyed() && assigningAnotherRecord) {
              await this.removeTargetBang(this.options.dependent as string | undefined);
            }
            if (record) {
              this.setOwnerAttributes(record);
              this.setInverseInstance(record);
              if (save && !(await record.save())) {
                this.nullifyOwnerAttributes(record);
                if (this.target) this.setOwnerAttributes(this.target);
                throw new RecordNotSaved(
                  `Failed to save the new associated ${this.reflection.name}.`,
                  record,
                );
              }
            }
          });
        }
        return (this.target = record);
      })();
    }
    {
      if (record) (this as any).raiseOnTypeMismatchBang(record);
      const assigningAnotherRecord = !rbEqual(this.target, record);
      if (assigningAnotherRecord || record?.hasChangesToSave === true) {
        if (
          this.target &&
          assigningAnotherRecord &&
          (this.target as { isDestroyed?: () => boolean }).isDestroyed?.() !== true
        ) {
          const dependent = (this.reflection.options.dependent as string) ?? "";
          if (dependent !== "delete" && dependent !== "destroy") {
            this.nullifyOwnerAttributes(this.target);
            this.removeInverseInstance(this.target);
          }
        }
        if (record) {
          this.setOwnerAttributes(record);
          this.setInverseInstance(record);
        }
      }
      return (this.target = record);
    }
  }

  /**
   * @inventedArm if — CONVERGEABLE has-one-replace-sync-arm-skips-load-and-remove-target
   * @inventedArm throw — CONVERGEABLE has-one-replace-sync-arm-skips-load-and-remove-target
   */
  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    raiseError = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    if (!this.owner.isPersisted()) {
      throw new RecordNotSaved("You cannot call create unless the parent is saved", this.owner);
    }
    const loadError = await this.loadDisplacedTargetForCreate();
    const record = await super._createRecord(attributes, raiseError, block);
    if (loadError) throw loadError;
    return record;
  }

  /** @internal */
  private async loadDisplacedTargetForCreate(): Promise<unknown> {
    if (!this.isFindTarget()) return null;
    try {
      await this.loadTargetForBuild();
      return null;
    } catch (error) {
      return error;
    }
  }

  /** @internal */
  protected async detachDisplacedTarget(): Promise<void> {
    if (!this.target) return;
    if ((this.target as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    await this.removeTargetBang(this.options.dependent as string | undefined);
  }

  /** @internal */
  protected displacementNeedsAwait(): boolean {
    if (!this.loaded) return this.isFindTarget();
    const displaced = this.target;
    if (!displaced) return false;
    return (displaced as { isDestroyed?: () => boolean }).isDestroyed?.() !== true;
  }

  private foreignKeyColumns(): string[] {
    const foreignKey = this.reflection.foreignKey();
    return Array.isArray(foreignKey) ? foreignKey : [foreignKey];
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  /** @internal */
  declare setOwnerAttributes: (record: Base) => void;

  protected override setNewRecord(record: Base): Base | null | Promise<Base | null> {
    return this.replace(record, false);
  }

  private async removeTargetBang(method: string | undefined): Promise<void> {
    const target = this.target as any;
    switch (method) {
      case "delete":
        await target.delete();
        break;
      case "destroy":
        target.destroyedByAssociation = this.reflection;
        await preloadDestroyInverseBelongsTo(this, target);
        if (target.isPersisted()) {
          await target.destroy();
        }
        break;
      default:
        this.nullifyOwnerAttributes(target);
        this.removeInverseInstance(target);

        if (target.isPersisted() && this.owner.isPersisted() && !(await target.save())) {
          this.setOwnerAttributes(target);
          throw new RecordNotSaved(
            `Failed to remove the existing associated ${this.reflection.name}. ` +
              `The record failed to save after its foreign key was set to nil.`,
            target,
          );
        }
    }
  }

  private nullifyOwnerAttributes(record: Base): void {
    for (const foreignKeyColumn of kernelArray(this.reflection.foreignKey())) {
      if (!kernelArray((record.constructor as typeof Base).primaryKey).includes(foreignKeyColumn)) {
        record.writeAttribute(foreignKeyColumn, null);
      }
    }
  }
}

/** @internal */
async function preloadDestroyInverseBelongsTo(
  assoc: HasOneAssociation,
  target: Base | null = assoc.target,
): Promise<void> {
  if (!target) return;
  const owner = assoc.owner;
  const targetCtor = (target as any).constructor as typeof Base;
  if (typeof (target as any).association !== "function") return;
  const ownFk = JSON.stringify((assoc as any).foreignKeyColumns());

  for (const ref of reflectOnAllAssociations(targetCtor, "belongsTo")) {
    const concrete = ref as unknown as {
      name: string;
      foreignKey: () => unknown;
      klass?: typeof Base;
    };
    let fk: unknown;
    let klass: typeof Base | undefined;
    try {
      fk = concrete.foreignKey();
      klass = concrete.klass;
    } catch {
      continue;
    }
    if (JSON.stringify(Array.isArray(fk) ? fk : [fk]) !== ownFk) continue;
    if (klass && !(owner instanceof (klass as any))) continue;
    try {
      await (target as any).association(ref.name).loadTarget();
    } catch {}
  }
}

/** @internal */
function transactionIf(
  assoc: HasOneAssociation,
  value: boolean,
  block: () => Promise<void>,
): Promise<void> {
  if (value) {
    return (assoc.reflection.klass as any).transaction(block);
  } else {
    return block();
  }
}

/** @internal */
function nullifiedOwnerAttributes(assoc: HasOneAssociation): Record<string, null> {
  const ctor = assoc.owner.constructor as {
    name: string;
    _reflectOnAssociation?: (n: string) => {
      foreignKey?: () => string | string[];
      foreignType?: string;
    } | null;
  };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) ?? null;
  let foreignKey: string | string[] | undefined = refl?.foreignKey?.();
  const reflTypeCol: string | null = refl?.foreignType ?? null;
  if (foreignKey == null) {
    const fks = (assoc as unknown as { foreignKeyColumns?: () => string[] }).foreignKeyColumns?.();
    if (fks?.length) foreignKey = fks;
  }
  if (foreignKey == null) {
    const opts = assoc.reflection.options as { foreignKey?: string | string[]; as?: string };
    foreignKey =
      opts.foreignKey ?? (opts.as ? `${underscore(opts.as)}_id` : `${underscore(ctor.name)}_id`);
  }
  const asName = assoc.reflection.options.as;
  const typeCol = reflTypeCol ?? (asName ? `${underscore(asName)}_type` : null);
  return ForeignAssociation.nullifiedOwnerAttributes({
    foreignKey: () => foreignKey,
    type: typeCol,
  });
}

Object.assign(HasOneAssociation.prototype, { foreignKeyPresent, setOwnerAttributes });

Associations.HasOneAssociation = HasOneAssociation;
