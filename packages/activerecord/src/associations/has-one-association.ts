import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { loadHasOne } from "../associations.js";
import { DeleteRestrictionError } from "./errors.js";
import { RecordNotSaved } from "../errors.js";
import { underscore } from "@blazetrails/activesupport";
import { SingularAssociation } from "./singular-association.js";

/**
 * Manages has_one associations. Handles dependent destruction,
 * record replacement with FK nullification, and loading via
 * the loadHasOne function.
 *
 * Mirrors: ActiveRecord::Associations::HasOneAssociation
 */
export class HasOneAssociation extends SingularAssociation {
  _pendingReplace: { record: Base | null; readonly previousTarget: Base | null } | null = null;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  override reset(): void {
    super.reset();
    this._pendingReplace = null;
  }

  /**
   * Handle the :dependent option when the owner is being destroyed.
   */
  async handleDependency(): Promise<void> {
    const dependent = this.reflection.options.dependent;
    if (!dependent) return;

    switch (dependent) {
      case "restrictWithException":
        if (await this.loadTarget()) {
          throw new DeleteRestrictionError(this.owner, this.reflection.name);
        }
        break;

      case "restrictWithError":
        if (await this.loadTarget()) {
          const ownerAny = this.owner as any;
          if (typeof ownerAny.errors?.add === "function") {
            ownerAny.errors.add("base", "invalid", {
              message: `Cannot delete record because dependent ${this.reflection.name} exists`,
            });
          }
          throw new DeleteRestrictionError(this.owner, this.reflection.name);
        }
        break;

      default:
        await this.delete(dependent);
    }
  }

  /**
   * Delete the associated record using the given method.
   * Supports: delete, destroy, nullify.
   */
  async delete(method?: string): Promise<void> {
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
        if (typeof (target as any).destroy === "function") {
          await (target as any).destroy();
        }
        break;

      case "nullify":
        if (target.isPersisted()) {
          this.nullifyOwnerAttributes(target);
          if (typeof (target as any).save === "function") {
            await (target as any).save();
          }
        }
        break;

      default:
        if (typeof (target as any).destroy === "function") {
          await (target as any).destroy();
        }
    }

    super.replace(null);
  }

  protected override replace(record: Base | null, save = true): void {
    if (record) (this as any).raiseOnTypeMismatchBang(record);
    const assigningAnother = this.target !== record;
    if (assigningAnother || (record as any)?.hasChangesToSave?.()) {
      if (record) {
        this.setOwnerAttributes(record);
        this.setInverseInstance(record);
      }
      if (save && (this.owner as any).isPersisted?.()) {
        if (this._pendingReplace) {
          // Only clear on a true revert: a different-record assignment being set back.
          // Same-record (dirty) assignments must not clear even if record === previousTarget.
          const wasAssignedAnother =
            this._pendingReplace.previousTarget !== this._pendingReplace.record;
          if (wasAssignedAnother && record === this._pendingReplace.previousTarget) {
            this._pendingReplace = null;
          } else {
            this._pendingReplace.record = record;
          }
        } else {
          this._pendingReplace = { record, previousTarget: this.target };
        }
      }
    }
    this.target = record;
    this.loadedBang();
  }

  async persistReplace(): Promise<void> {
    const pending = this._pendingReplace;
    if (!pending) return;
    await transactionIf(this, true, async () => {
      if (
        pending.previousTarget &&
        !(pending.previousTarget as any).isDestroyed?.() &&
        pending.previousTarget !== pending.record
      ) {
        // removeTargetBang reads assoc.target; temporarily restore previousTarget
        // so it operates on the old record, not the new one already set in replace()
        const currentTarget = this.target;
        this.target = pending.previousTarget;
        try {
          await removeTargetBang(this, (this.reflection.options.dependent as string) ?? "");
        } finally {
          this.target = currentTarget;
        }
      }
      if (pending.record && typeof (pending.record as any).save === "function") {
        const saved = await (pending.record as any).save();
        if (!saved) {
          this.nullifyOwnerAttributes(pending.record);
          if (pending.previousTarget) this.setOwnerAttributes(pending.previousTarget);
          throw new RecordNotSaved(
            `Failed to save the new associated ${this.reflection.name}.`,
            pending.record,
          );
        }
      }
    });
    // Clear only after success — leave intact on error so save() retry can re-attempt
    this._pendingReplace = null;
  }

  protected override async doAsyncFindTarget(): Promise<Base | null> {
    return loadHasOne(this.owner, this.reflection.name, this.reflection.options);
  }

  private foreignKeyColumns(): string[] {
    const fk = this.reflection.options.foreignKey;
    if (typeof fk === "string") return [fk];
    if (Array.isArray(fk)) return fk;
    const ctor = (this.owner as any).constructor;
    if (this.reflection.options.as) {
      return [`${underscore(this.reflection.options.as)}_id`];
    }
    const pk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    if (Array.isArray(pk)) {
      return pk.map((col: string) => `${underscore(ctor.name)}_${col}`);
    }
    return [`${underscore(ctor.name)}_id`];
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  private setOwnerAttributes(record: Base): void {
    const ctor = (this.owner as any).constructor;
    const configuredPk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    const pks = Array.isArray(configuredPk) ? configuredPk : [configuredPk];
    const fk = this.foreignKeyColumn();
    const fks = Array.isArray(this.reflection.options.foreignKey)
      ? this.reflection.options.foreignKey
      : [fk];

    for (let i = 0; i < fks.length; i++) {
      const pkCol = pks[i] ?? pks[0];
      const pkValue =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(pkCol)
          : (this.owner as any)[pkCol];

      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(fks[i], pkValue);
      } else {
        (record as any)[fks[i]] = pkValue;
      }
    }

    if (this.reflection.options.as) {
      const typeCol = `${underscore(this.reflection.options.as)}_type`;
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, ctor.name);
      } else {
        (record as any)[typeCol] = ctor.name;
      }
    }
  }

  private nullifyOwnerAttributes(record: Base): void {
    const fks = Array.isArray(this.reflection.options.foreignKey)
      ? this.reflection.options.foreignKey
      : [this.foreignKeyColumn()];
    for (const fk of fks) {
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(fk, null);
      } else {
        (record as any)[fk] = null;
      }
    }

    if (this.reflection.options.as) {
      const typeCol = `${underscore(this.reflection.options.as)}_type`;
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, null);
      } else {
        (record as any)[typeCol] = null;
      }
    }
  }
}

/** @internal */
function removeTargetBang(assoc: HasOneAssociation, method: string): Promise<void> {
  const target = assoc.target as Base | null;
  if (!target) return Promise.resolve();
  if (method === "delete") return (target as any).delete?.() ?? Promise.resolve();
  if (method === "destroy") return (target as any).destroy?.() ?? Promise.resolve();
  if (method === "nullify") {
    if (target.isPersisted()) {
      (assoc as any).nullifyOwnerAttributes(target);
      return (target as any).save?.() ?? Promise.resolve();
    }
    return Promise.resolve();
  }
  return Promise.resolve();
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
