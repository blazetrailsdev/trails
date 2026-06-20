import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { loadHasOne } from "../associations.js";
import { DeleteRestrictionError } from "./errors.js";
import { RecordNotSaved } from "../errors.js";
import { underscore } from "@blazetrails/activesupport";
import { ForeignAssociation } from "./foreign-association.js";
import { SingularAssociation } from "./singular-association.js";
import { polymorphicName } from "../inheritance.js";

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
   * Queue-only writer for the JS property setter (`owner.account = x`,
   * builder/has-one.ts `defineWriters`) and mass-assignment, neither of which
   * can `await`. Records the pending change (FK set in-memory via `replace`)
   * and defers persistence to the owner's next `save()` (`flushPendingReplaces`
   * → `persistReplace`) — no DB I/O, no Promise returned, no floating promise.
   * The awaitable `writer` below is the Rails-faithful immediate-persist path.
   */
  queueWrite(record: Base | null): void {
    this.replace(record);
  }

  /**
   * Mirrors Rails `HasOneAssociation#replace`, which persists on assignment to
   * a *saved* owner: the displaced record is nullified/deleted/destroyed and
   * the new record saved immediately. Returns the `persistReplace()` Promise so
   * callers can `await` the writes — the only floating-promise-free way to
   * reach the immediate path from JS (the sync property setter cannot await, so
   * it uses `queueWrite` instead). For a *new* owner the foreign key isn't known
   * yet, so persistence defers to the owner's next save (`flushPendingReplaces`).
   */
  override writer(record: Base | null): void | Promise<void> {
    this.replace(record);
    if ((this.owner as { isPersisted?: () => boolean }).isPersisted?.() && this._pendingReplace) {
      return this.persistReplace();
    }
  }

  /**
   * Handle the :dependent option when the owner is being destroyed.
   */
  async handleDependency(): Promise<void | false> {
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
          // Rails: owner.errors.add(:base, ...); throw(:abort). The owner is
          // NOT destroyed and no exception is raised — `destroy` returns false.
          // We return false here; the before_destroy wrapper (builder/association.ts
          // addDestroyCallbacks) translates that into throwAbort() to halt the chain.
          const owner = this.owner as Base & {
            errors: { add(a: string, t: string, opts?: Record<string, unknown>): void };
          };
          const ctor = owner.constructor as typeof Base & {
            humanAttributeName(attr: string): string;
          };
          const record = ctor.humanAttributeName(this.reflection.name).toLowerCase();
          owner.errors.add("base", "invalid", {
            message: `Cannot delete record because a dependent ${record} exists`,
          });
          return false;
        }
        break;

      default:
        return await this.delete(dependent);
    }
  }

  /**
   * Delete the associated record using the given method.
   * Supports: delete, destroy, nullify.
   */
  async delete(method?: string): Promise<void | false> {
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
        // Rails: `throw(:abort) unless target.destroyed?` — if the child's own
        // destroy aborted (e.g. a restrict_with_error grandchild), propagate
        // the abort so the owner is not deleted either.
        if (typeof (target as any).isDestroyed === "function" && !(target as any).isDestroyed()) {
          return false;
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
    // Rails' HasOneAssociation#delete (has_one_association.rb:26-52) returns
    // right after the `case` and never resets `self.target`. We must not reset
    // it either: in the mutual `dependent: :destroy` cycle the target is already
    // frozen by the time control returns here, and writing its inverse FK would
    // raise FrozenError.
  }

  protected override replace(record: Base | null, save = true): void {
    if (record) (this as any).raiseOnTypeMismatchBang(record);
    const assigningAnother = !sameRecord(this.target, record);
    if (assigningAnother || (record as any)?.hasChangesToSave) {
      if (record) {
        this.setOwnerAttributes(record);
        this.setInverseInstance(record);
      }
      if (save && (this.owner as any).isPersisted?.()) {
        // The record currently associated (about to be displaced by `record`).
        const displaced = this.target;
        if (this._pendingReplace) {
          // Only clear on a true revert: a different-record assignment being set back.
          // Same-record (dirty) assignments must not clear even if record === previousTarget.
          const wasAssignedAnother = !sameRecord(
            this._pendingReplace.previousTarget,
            this._pendingReplace.record,
          );
          if (wasAssignedAnother && sameRecord(record, this._pendingReplace.previousTarget)) {
            this._pendingReplace = null;
          } else if (
            displaced &&
            (displaced as any).isPersisted?.() &&
            !sameRecord(displaced, record)
          ) {
            // The previously-pending record was persisted independently (e.g.
            // built then saved directly), so it is now the real associated
            // record being displaced and must have its FK nullified. This case
            // arises because our `setNewRecord` calls `replace(record)` with the
            // default `save=true` (Rails passes `false`), so `build` leaves a
            // `_pendingReplace` with `previousTarget: null`; a later `writer`
            // for a different record must promote the now-persisted built record
            // to `previousTarget`. Exercised by "has one assignment triggers
            // save on change on replacing object".
            this._pendingReplace = { record, previousTarget: displaced };
          } else {
            this._pendingReplace.record = record;
          }
        } else {
          this._pendingReplace = { record, previousTarget: displaced };
        }
      } else if (save && record && (this.owner as any).isNewRecord?.()) {
        // New owner: the foreign key isn't known yet, so defer persistence
        // until the owner is saved (`flushPendingReplaces`), mirroring Rails'
        // default has_one save-on-create autosave.
        this._pendingReplace = { record, previousTarget: null };
      }
    }
    this.target = record;
    this.loadedBang();
  }

  async persistReplace(): Promise<void> {
    const pending = this._pendingReplace;
    if (!pending) return;
    // Clear before the first `await`. Two consecutive synchronous property-setter
    // assignments (`owner.account = a; owner.account = b`) each run `replace` then
    // queue; clearing now means a concurrent `persistReplace` sees a null
    // `_pendingReplace` and processes its own captured `pending` rather than
    // racing on a mutated object. A failed save surfaces through the awaiting
    // caller / `save()` rejection, so clearing early costs nothing on the error path.
    this._pendingReplace = null;
    await transactionIf(this, true, async () => {
      if (
        pending.previousTarget &&
        !(pending.previousTarget as any).isDestroyed?.() &&
        !sameRecord(pending.previousTarget, pending.record)
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
        // Re-derive the foreign key from the owner: on the new-owner path the
        // owner's PK was unknown when `replace` ran, so set it now that the
        // owner has been persisted.
        this.setOwnerAttributes(pending.record);
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
      // Rails writes `owner.class.base_class.name` (polymorphic_name), so STI
      // subclasses store their base class name in the `as:` type column.
      const typeName = polymorphicName(ctor as typeof Base);
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, typeName);
      } else {
        (record as any)[typeCol] = typeName;
      }
    }
  }

  private nullifyOwnerAttributes(record: Base): void {
    // Source the column list from the Rails-named helper so custom
    // foreignKey/foreignType (incl. composite PKs and polymorphic `as`)
    // honor the same derivation rules used by reflection itself.
    const attrs = nullifiedOwnerAttributes(this);
    for (const col of Object.keys(attrs)) {
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(col, null);
      } else {
        (record as any)[col] = null;
      }
    }
  }
}

/**
 * Mirrors Rails' `target != record` in `HasOneAssociation#replace`, where `!=`
 * is `ActiveRecord::Core#==` — two records are the "same" when they are the
 * identical object, or persisted instances of the same class with the same id.
 * Using object identity alone would treat a freshly-found record (e.g.
 * `Account.find(1)`) as a *different* record from the already-loaded target,
 * triggering a spurious nullify/destroy of the row being re-assigned.
 *
 * @internal
 */
export function sameRecord(a: Base | null, b: Base | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return (a as { isEqual?: (other: unknown) => boolean }).isEqual?.(b) === true;
}

/** @internal */
async function removeTargetBang(assoc: HasOneAssociation, method: string): Promise<void> {
  const target = assoc.target;
  if (!target) return;
  if (method === "delete") {
    await ((target as any).delete?.() ?? Promise.resolve());
    return;
  }
  if (method === "destroy") {
    // Mirrors Rails HasOneAssociation#remove_target!: tag the record with the
    // association that is destroying it (so its own destroy callbacks can read
    // `destroyed_by_association`) before destroying, and only destroy when the
    // record is actually persisted.
    (target as any).destroyedByAssociation = assoc.reflection;
    if (target.isPersisted()) await ((target as any).destroy?.() ?? Promise.resolve());
    return;
  }
  // Mirrors Rails HasOneAssociation#remove_target!'s `else` branch (no
  // `dependent`, or `:nullify`): drop the foreign key on the previously
  // associated record, clear the inverse, and save it. A plain replacement
  // always nullifies the old record's FK; the `dependent` option only governs
  // the owner-destroy path. A failed nullify-save aborts the replacement.
  (assoc as any).nullifyOwnerAttributes(target);
  assoc.removeInverseInstance(target);
  if (target.isPersisted() && (assoc.owner as any).isPersisted?.()) {
    const saved = await ((target as any).save?.() ?? Promise.resolve(true));
    if (saved === false) {
      (assoc as any).setOwnerAttributes(target);
      throw new RecordNotSaved(
        `Failed to remove the existing associated ${assoc.reflection.name}. ` +
          `The record failed to save after its foreign key was set to nil.`,
        target,
      );
    }
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

/**
 * Build the attribute hash that nullifies the owner-side foreign key (and
 * polymorphic type column, when applicable) on the dependent record — used
 * by `dependent: :nullify` to drop the FK without destroying the row.
 *
 * Mirrors: ActiveRecord::Associations::ForeignAssociation#nullified_owner_attributes
 *
 * @internal
 */
function nullifiedOwnerAttributes(assoc: HasOneAssociation): Record<string, null> {
  // Resolve the rich reflection so foreignKey expansion (composite PKs,
  // primaryKey overrides, polymorphic foreignType) matches what the
  // association itself uses. Fall back to the HasOneAssociation's own
  // foreignKeyColumns() derivation, then to options-based defaults.
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
