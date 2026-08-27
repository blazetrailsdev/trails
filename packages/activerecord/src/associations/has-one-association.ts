import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { DeleteRestrictionError, HasOnePersistedAssignmentError } from "./errors.js";
import { RecordNotSaved } from "../errors.js";
import { underscore, wrap as arrayWrap } from "@blazetrails/activesupport";
import { _reflectOnAssociation, reflectOnAllAssociations } from "../reflection.js";
import {
  ForeignAssociation,
  foreignKeyPresentFor,
  ownerForeignKeyColumns,
} from "./foreign-association.js";
import type { AssociationReflection } from "../reflection.js";
import { SingularAssociation } from "./singular-association.js";
import { queryConstraintsList } from "../persistence.js";

export class HasOneAssociation extends SingularAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /** @internal */
  protected syncWrite(record: Base | null): void {
    if (record)
      (this as unknown as { raiseOnTypeMismatchBang(r: Base): void }).raiseOnTypeMismatchBang(
        record,
      );
    if ((this.owner as { isPersisted?: () => boolean }).isPersisted?.()) {
      throw new HasOnePersistedAssignmentError(this.reflection.name);
    }
    this.replace(record, false);
  }

  override writer(record: Base | null): void | Promise<void> {
    return this.replace(record);
  }

  /** @internal */
  protected override foreignKeyPresent(): boolean {
    return foreignKeyPresentFor(this.reflection as unknown as AssociationReflection, this.owner);
  }

  async handleDependency(): Promise<void | false> {
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
          return false;
        }
        break;

      default:
        return await this.delete();
    }
  }

  /** @missingRailsCall fetch — PERMANENT */
  async delete(
    method: string | undefined = this.reflection.options.dependent as string | undefined,
  ): Promise<void | false> {
    if (!(await this.loadTarget())) return;
    const target = this.target!;

    switch (method) {
      case "delete":
        if (typeof (target as any).delete === "function") {
          await (target as any).delete();
        }
        break;

      case "destroy":
        (target as any).destroyedByAssociation = this.reflection;
        await preloadDestroyInverseBelongsTo(this);
        if (typeof (target as any).destroy === "function") {
          await (target as any).destroy();
        }
        if (typeof (target as any).isDestroyed === "function" && !(target as any).isDestroyed()) {
          return false;
        }
        break;

      case "destroyAsync": {
        let primaryKeyColumn: string | string[];
        let id: unknown;
        const targetClass = target.constructor as typeof Base;
        if (queryConstraintsList.call(targetClass as any)) {
          primaryKeyColumn = queryConstraintsList.call(targetClass as any)!;
          id = primaryKeyColumn.map((col) => (target as any)[col]);
        } else {
          primaryKeyColumn = targetClass.primaryKey as string;
          id = (target as any)[primaryKeyColumn];
        }

        this.enqueueDestroyAssociation({
          ownerModelName: this.owner.constructor.name,
          ownerId: (this.owner as any).id,
          associationClass: String((this.reflection.klass as typeof Base).name),
          associationIds: [id],
          associationPrimaryKeyColumn: primaryKeyColumn,
          ensuringOwnerWasMethod:
            "ensuringOwnerWas" in this.reflection.options
              ? (this.reflection.options as any).ensuringOwnerWas
              : null,
        });
        break;
      }

      case "nullify":
        if (target.isPersisted()) {
          await (target as any).updateColumns(nullifiedOwnerAttributes(this));
        }
        break;

      default:
        if (typeof (target as any).destroy === "function") {
          await (target as any).destroy();
        }
    }
  }

  /** @internal */
  protected override loadDisplacedForBuild(): Promise<unknown> | null {
    if (!this.findTargetNeeded()) return null;
    return this.loadTargetForBuild();
  }

  /** @internal */
  protected override detachDisplacedOnBuild(record: Base | null): Promise<void> | null {
    const displaced = this.loaded ? this.target : null;
    if (!displaced || sameRecord(displaced, record)) return null;
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

  protected override replace(record: Base | null, save: false): void;
  protected override replace(record: Base | null, save?: boolean): void | Promise<void>;
  protected override replace(record: Base | null, save = true): void | Promise<void> {
    if (save) {
      return (async () => {
        if (record) (this as any).raiseOnTypeMismatchBang(record);
        if (!this.loaded) await this.loadTarget();
        if (!this.target && !record) return;
        const assigningAnotherRecord = !sameRecord(this.target, record);
        if (assigningAnotherRecord || record?.hasChangesToSave === true) {
          save = (this.owner as { isPersisted?: () => boolean }).isPersisted?.() === true;
          await transactionIf(this, save, async () => {
            if (this.target && !(this.target as any).isDestroyed?.() && assigningAnotherRecord) {
              await this.removeTargetBang((this.reflection.options.dependent as string) ?? "");
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
        this.target = record;
      })();
    }
    {
      if (record) (this as any).raiseOnTypeMismatchBang(record);
      const assigningAnotherRecord = !sameRecord(this.target, record);
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
      this.target = record;
      return;
    }
  }

  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    if (!(this.owner as { isPersisted?: () => boolean }).isPersisted?.()) {
      throw new RecordNotSaved("You cannot call create unless the parent is saved", this.owner);
    }
    const loadError = await this.loadDisplacedTargetForCreate();
    const record = await super._createRecord(attributes, raise, block);
    if (loadError) throw loadError;
    return record;
  }

  /** @internal */
  private async loadDisplacedTargetForCreate(): Promise<unknown> {
    if (!this.findTargetNeeded()) return null;
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
    await this.removeTargetBang((this.reflection.options.dependent as string) ?? "");
  }

  /** @internal */
  protected displacementNeedsAwait(): boolean {
    if (!this.loaded) return this.findTargetNeeded();
    const displaced = this.target;
    if (!displaced) return false;
    return (displaced as { isDestroyed?: () => boolean }).isDestroyed?.() !== true;
  }

  private foreignKeyColumns(): string[] {
    return ownerForeignKeyColumns(
      this.owner.constructor as typeof Base,
      this.reflection.name,
      this.reflection.options as Parameters<typeof ownerForeignKeyColumns>[2],
    );
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  private setOwnerAttributes(record: Base): void {
    if (this.reflection.options.through) return;

    const ctor = (this.owner as any).constructor;
    const richReflection = ctor._reflectOnAssociation?.(this.reflection.name) as {
      joinPrimaryKey?: (klass?: typeof Base) => string | string[];
      joinForeignKey?: string | string[];
      type?: string | null;
    } | null;

    const configuredPk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    const primaryKeyAttributeNames = arrayWrap(
      richReflection?.joinPrimaryKey?.() ??
        (Array.isArray(this.reflection.foreignKey)
          ? this.reflection.foreignKey
          : this.foreignKeyColumn()),
    );
    const foreignKeyAttributeNames = arrayWrap(richReflection?.joinForeignKey ?? configuredPk);

    for (const [i, primaryKey] of primaryKeyAttributeNames.entries()) {
      const foreignKey = foreignKeyAttributeNames[i] ?? foreignKeyAttributeNames[0];
      const value =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(foreignKey)
          : (this.owner as any)[foreignKey];

      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(primaryKey, value);
      } else {
        (record as any)[primaryKey] = value;
      }
    }

    const type = richReflection?.type ?? null;
    if (type) {
      const typeName = (ctor as typeof Base).polymorphicName();
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(type, typeName);
      } else {
        (record as any)[type] = typeName;
      }
    }
  }

  protected override setNewRecord(record: Base): void {
    this.replace(record, false);
  }

  private async removeTargetBang(method: string): Promise<void> {
    const target = this.target;
    if (!target) return;
    if (method === "delete") {
      await ((target as any).delete?.() ?? Promise.resolve());
      return;
    }
    if (method === "destroy") {
      (target as any).destroyedByAssociation = this.reflection;
      await preloadDestroyInverseBelongsTo(this, target);
      if (target.isPersisted()) await ((target as any).destroy?.() ?? Promise.resolve());
      return;
    }
    this.nullifyOwnerAttributes(target);
    this.removeInverseInstance(target);
    if (target.isPersisted() && (this.owner as any).isPersisted?.()) {
      const saved = await ((target as any).save?.() ?? Promise.resolve(true));
      if (saved === false) {
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
    const reflection = _reflectOnAssociation(
      this.owner.constructor as typeof Base,
      this.reflection.name,
    );
    const foreignKey = reflection?.foreignKey;
    const primaryKey = (record.constructor as typeof Base).primaryKey;
    const primaryKeys =
      primaryKey == null ? [] : Array.isArray(primaryKey) ? primaryKey : [primaryKey];
    for (const foreignKeyColumn of foreignKey == null
      ? []
      : Array.isArray(foreignKey)
        ? foreignKey
        : [foreignKey]) {
      if (!primaryKeys.includes(foreignKeyColumn)) record.writeAttribute(foreignKeyColumn, null);
    }
  }
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function sameRecord(a: Base | null, b: Base | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return (a as { equals?: (other: unknown) => boolean }).equals?.(b) === true;
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
    const concrete = ref as unknown as { name: string; foreignKey: unknown; klass?: typeof Base };
    let fk: unknown;
    let klass: typeof Base | undefined;
    try {
      fk = concrete.foreignKey;
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
  condition: boolean,
  block: () => Promise<void>,
): Promise<void> {
  if (condition) {
    const klass = assoc.klass;
    if (klass && typeof (klass as any).transaction === "function") {
      return (klass as any).transaction(block);
    }
  }
  return block();
}

/** @internal */
function nullifiedOwnerAttributes(assoc: HasOneAssociation): Record<string, null> {
  const ctor = assoc.owner.constructor as {
    name: string;
    _reflectOnAssociation?: (n: string) => {
      foreignKey?: string | string[];
      foreignType?: string;
    } | null;
  };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) ?? null;
  let foreignKey: string | string[] | undefined = refl?.foreignKey;
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
  return ForeignAssociation.nullifiedOwnerAttributes({ foreignKey, type: typeCol });
}
