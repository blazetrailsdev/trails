import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { loadHasOne } from "../associations.js";
import { DeleteRestrictionError } from "./errors.js";
import { RecordNotSaved } from "../errors.js";
import { underscore } from "@blazetrails/activesupport";
import { reflectOnAllAssociations } from "../reflection.js";
import { ForeignAssociation, foreignKeyPresentFor } from "./foreign-association.js";
import type { AssociationReflection } from "../reflection.js";
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
  /**
   * The record that was displaced by a deferred (non-awaitable) assignment to a
   * *persisted* owner — recorded by `queueWrite`/mass-assignment and removed
   * (FK-nullified/destroyed per `:dependent`) by the owner's `save`-time
   * has_one autosave callback (`autosaveHasOne` → `removeDisplaced`). Rails does
   * this removal synchronously inside `replace`; the JS property setter cannot
   * `await`, so we carry the displaced record forward to the single autosave
   * persistence path rather than running a parallel `persistReplace`.
   *
   * This is an *ordered collection*, not a single slot: a has_one owner can
   * displace more than one persisted record before its `save()` drains the
   * queue (`owner.x = b; owner.x = c` displaces both the original target and
   * `b`). Rails removes each inline inside `replace`, so every displacement is
   * accounted for; we accumulate them and remove all at save time, in
   * displacement order.
   */
  _displacedRecords: Base[] = [];

  /**
   * Set when a deferred assignment displaces an *unloaded* has_one on a persisted
   * owner: at queue time the current target has not been materialized, so there
   * is no in-memory `_displacedRecords` entry to remove — but a DB row keyed by the
   * owner may still exist and must be removed (nullified, or per `:dependent`).
   * Rails loads the current target synchronously inside `replace`; the JS
   * property setter cannot `await`, so we defer the load to `removeDisplaced`,
   * which queries the existing DB-associated record and runs the remove.
   */
  _removeDisplacedFromDb = false;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  override reset(): void {
    super.reset();
    this._displacedRecords = [];
    this._removeDisplacedFromDb = false;
  }

  /**
   * Queue-only writer for the JS property setter (`owner.account = x`,
   * builder/has-one.ts `defineWriters`) and mass-assignment, neither of which
   * can `await`. Sets the foreign key and inverse in memory via `replace` and
   * defers persistence to the owner's next `save()`, where the has_one autosave
   * callback (`autosaveHasOne`) persists the new record and removes any
   * displaced one — the single Rails `save_has_one_association` path. No DB I/O,
   * no Promise returned, no floating promise. The awaitable `writer` below is
   * the Rails-faithful immediate-persist path.
   */
  queueWrite(record: Base | null): void {
    const wasLoaded = this.loaded;
    const displaced = this.target;
    this.replace(record);
    if (!(this.owner as { isPersisted?: () => boolean }).isPersisted?.()) return;
    // Rails `HasOneAssociation#replace` runs `remove_target!` on the current
    // `target` for *every* assigning-another replacement (has_one_association.rb
    // :64-84, :69) before `self.target = record`, so the record this assignment
    // displaces must be queued regardless of whether the assignment also reverts
    // an earlier displacement. Only a *persisted* displaced record has a
    // row/foreign key to nullify; a transient in-memory target has none.
    if (
      displaced &&
      (displaced as { isPersisted?: () => boolean }).isPersisted?.() &&
      !(displaced as { isDestroyed?: () => boolean }).isDestroyed?.() &&
      !sameRecord(displaced, record)
    ) {
      this._displacedRecords.push(displaced);
    } else if (!wasLoaded && !displaced) {
      // The current target was never materialized, so we have no in-memory
      // displaced record — but a DB row keyed by the owner may exist. Rails'
      // `replace` always evaluates `load_target` (has_one_association.rb:59), so
      // it materializes and `remove_target!`s any displaced row regardless of
      // `:dependent` — the `else` branch nullifies the old FK even with no
      // `:dependent`. We defer that load to `removeDisplaced` at the owner's save.
      this._removeDisplacedFromDb = true;
    }
    // Reverting to a record already queued for removal cancels *just its*
    // removal (`owner.x = other; owner.x = original`) — the now-target record no
    // longer needs its FK nullified. This runs after the queue above so it only
    // cancels the reverted record, never the one this same assignment displaced
    // (which the push guard guarantees is a different record). Leaves every other
    // pending displacement intact.
    if (record) {
      const idx = this._displacedRecords.findIndex((r) => sameRecord(record, r));
      if (idx !== -1) this._displacedRecords.splice(idx, 1);
    }
  }

  /**
   * Mirrors Rails `HasOneAssociation#replace`, which persists on assignment to
   * a *saved* owner: the displaced record is nullified/deleted/destroyed and
   * the new record saved immediately. Returns a Promise so callers can `await`
   * the writes — the only floating-promise-free way to reach the immediate path
   * from JS (the sync property setter cannot await, so it uses `queueWrite`
   * instead). For a *new* owner the foreign key isn't known yet, so persistence
   * defers to the owner's next save (`autosaveHasOne`).
   */
  override writer(record: Base | null): void | Promise<void> {
    // Delegate to an async helper rather than making `writer` itself `async`, so
    // the base `void | Promise<void>` signature (shared with the through
    // override, which can return synchronously) is preserved.
    return this.writeImmediate(record);
  }

  private async writeImmediate(record: Base | null): Promise<void> {
    // Rails' `replace` raises on a class mismatch as its very first statement,
    // before `load_target` (has_one_association.rb:60). The persist path below no
    // longer routes through `replace` up front (the target is committed only
    // after the transaction succeeds), so hoist the check here — a saved owner
    // must reject `writer(someOtherModel)` before any DB I/O.
    if (record) (this as any).raiseOnTypeMismatchBang(record);
    // Mirror Rails `replace`'s leading `load_target`: materialize the currently
    // associated record (possibly a DB row on a freshly-found owner) so it can
    // be nullified/removed, rather than silently orphaning it.
    if (!this.loaded) await this.loadTarget();
    const displaced = this.target;
    // Mirror Rails `replace`'s `assigning_another_record || has_changes_to_save?`
    // gate (:64-65): only touch the DB when the assignment actually changes
    // something, so a no-op re-assignment (e.g. `writer(null)` with no target)
    // opens no transaction. `hasChangesToSave` is a getter, read (not called)
    // per #4900. The `?.` stands in for Rails' `return target unless
    // load_target || record` (:62): with both sides nil `sameRecord` is true
    // and this short-circuits to undefined, which is falsy — exactly where
    // Rails would have returned.
    const changed = !sameRecord(displaced, record) || record?.hasChangesToSave === true;
    if (changed) {
      // Rails: `save &&= owner.persisted?` (:66) — a new owner does not gate the
      // block itself, only `transaction_if` (:68) and `record.save` (:75).
      // `remove_target!` (:69) runs regardless; its own
      // `target.persisted? && owner.persisted?` gate (:108) skips the DB save.
      const save = (this.owner as { isPersisted?: () => boolean }).isPersisted?.() === true;
      return this.persistImmediate(record, displaced, save);
    }
    this.replace(record);
  }

  /**
   * The awaitable immediate-persist body for `HasOneAssociation#replace`'s
   * transaction (has_one_association.rb:68-84): remove the displaced record
   * (:69), then re-derive the foreign key and save the new record (:71-80), and
   * promote the new target only after the transaction commits. `save` is Rails'
   * post-`&&=` flag (:66): false for a non-persisted owner, which both skips the
   * transaction (:68) and gates the new record's save (:75).
   *
   * `this.target` is left as `displaced` throughout — writeImmediate has not
   * called `replace` — so a throw anywhere in the block (a failed `remove_target!`
   * nullify, or the `RecordNotSaved` on a failed save) leaves the OLD record
   * cached, exactly as Rails reaches `self.target = record` (:84) only after the
   * block. Same target-on-failure invariant as `detachDisplacedTarget`.
   */
  private async persistImmediate(
    record: Base | null,
    displaced: Base | null,
    save: boolean,
  ): Promise<void> {
    await transactionIf(this, save, async () => {
      // `this.target` is still `displaced`, so `removeTargetBang` removes it.
      if (displaced && !(displaced as any).isDestroyed?.() && !sameRecord(displaced, record)) {
        await removeTargetBang(this, (this.reflection.options.dependent as string) ?? "");
      }
      if (record) {
        this.setOwnerAttributes(record);
        this.setInverseInstance(record);
        if (save && !(await record.save())) {
          this.nullifyOwnerAttributes(record);
          if (displaced) this.setOwnerAttributes(displaced);
          throw new RecordNotSaved(
            `Failed to save the new associated ${this.reflection.name}.`,
            record,
          );
        }
      }
    });
    // Transaction committed: promote the new record to the target (Rails'
    // `self.target = record`, :84). `replace` re-applies the FK/inverse (a no-op
    // repeat of the in-transaction work) and, for `record === null`, clears the
    // inverse on the now-removed displaced record.
    this.replace(record);
  }

  /**
   * Remove the record displaced by a deferred assignment to a persisted owner.
   * Called by the has_one autosave callback (`autosaveHasOne`) before persisting
   * the new target — the deferred analog of the `remove_target!` Rails runs
   * inside `HasOneAssociation#replace`.
   */
  async removeDisplaced(): Promise<void> {
    // Drain the whole collection, removing each displaced record in
    // displacement order (Rails removes each inline inside `replace`).
    const queued = this._displacedRecords;
    this._displacedRecords = [];
    for (const record of queued) {
      await this.removeOne(record);
    }
    let displaced: Base | null = null;
    if (this._removeDisplacedFromDb) {
      // Unloaded property-setter replace: materialize the existing DB-associated
      // record now (the owner still keys the pre-replace row, since the new
      // target has not been persisted yet) so its `:dependent` remove runs.
      // Mirrors Rails' synchronous `load_target` inside `replace`. `replace`
      // already cached the new (unsaved) target, so clear it around the find to
      // force a DB query instead of returning that cached record.
      this._removeDisplacedFromDb = false;
      const savedTarget = this.target;
      const savedLoaded = this.loaded;
      this.target = null;
      this.loaded = false;
      let found: Base | null = null;
      try {
        found = await this.doAsyncFindTarget();
      } finally {
        this.target = savedTarget;
        this.loaded = savedLoaded;
      }
      if (found && !sameRecord(found, savedTarget)) displaced = found;
    }
    if (displaced) await this.removeOne(displaced);
  }

  /**
   * Run `remove_target!` for a single displaced record, honoring the
   * reflection's `:dependent` (delete/destroy/else-nullify). Temporarily sets
   * `target` to the displaced record so `removeTargetBang` acts on it, then
   * restores the current target.
   */
  private async removeOne(displaced: Base): Promise<void> {
    const currentTarget = this.target;
    this.target = displaced;
    try {
      await removeTargetBang(this, (this.reflection.options.dependent as string) ?? "");
    } finally {
      this.target = currentTarget;
    }
  }

  /**
   * Whether the target can be fetched for a new-record owner. A vanilla has_one
   * requires the owner's `active_record_primary_key` to be present
   * (`ForeignAssociation#foreign_key_present?`, foreign_association.rb:5), so a
   * new-record owner with its PK assigned (e.g. `Author.new(id: 42)`) can still
   * load its child. Mirrors `CollectionAssociation#foreignKeyPresent` — the
   * rich reflection is resolved so a custom-PK owner isn't misreported.
   *
   * @internal
   */
  protected override foreignKeyPresent(): boolean {
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => unknown;
    };
    const reflection = (ctor._reflectOnAssociation?.(this.reflection.name) ??
      this.reflection) as unknown as AssociationReflection;
    return foreignKeyPresentFor(reflection, this.owner);
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
        await preloadDestroyInverseBelongsTo(this);
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

  /**
   * Whether a `build#{name}` accessor call must first run Rails'
   * `load_target` — mirrors `HasOneAssociation#set_new_record` →
   * `replace(record, false)`, whose leading `load_target`
   * (has_one_association.rb:59) materializes the current target before the
   * freshly-built record displaces it. The sync `build` / nested-attributes
   * paths can't await, so the awaitable accessor (builder/has-one.ts) consults
   * this and issues the SELECT only when a query would actually run
   * (`find_target?`): a persisted / FK-present owner whose target isn't loaded.
   * `findTargetNeeded()` already returns false when the target is loaded
   * (association.ts, `if (this.loaded) return false`), so it is the whole gate.
   *
   * @internal
   */
  needsTargetLoadForBuild(): boolean {
    return this.findTargetNeeded();
  }

  /**
   * The load the `build#{name}` accessor awaits before constructing the new
   * record. A direct-FK has_one loads its own target — Rails'
   * `set_new_record` → `replace(record, false)` runs `load_target`
   * (has_one_association.rb:59). A has_one_through overrides this: Rails'
   * `HasOneThroughAssociation#replace` has NO `load_target`; its
   * `create_through_record` loads the *through* proxy instead
   * (has_one_through_association.rb:15-19), so the through must issue the
   * join-model SELECT here, never a target SELECT.
   *
   * @internal
   */
  loadTargetForBuild(): Promise<unknown> {
    return this.loadTarget();
  }

  protected override replace(record: Base | null, _save = true): void {
    if (record) (this as any).raiseOnTypeMismatchBang(record);
    const assigningAnother = !sameRecord(this.target, record);
    if (assigningAnother || record?.hasChangesToSave === true) {
      if (record) {
        // Set the foreign key (from the owner's — possibly still-nil — primary
        // key) and inverse in memory. Persistence is Rails'
        // `save_has_one_association` (our `autosaveHasOne`), which re-derives the
        // FK once the owner has a primary key and saves the record. This method
        // does no DB I/O; the immediate-persist path lives in `writer` →
        // `persistImmediate`.
        this.setOwnerAttributes(record);
        this.setInverseInstance(record);
      }
    }
    this.target = record;
    this.loadedBang();
  }

  /**
   * Mirrors Rails' `HasOneAssociation#_create_record`
   * (has_one_association.rb:133-138): guard that the owner is persisted before
   * creating the associated record, then delegate to the base
   * `SingularAssociation#_create_record`. A has_one foreign key lives on the
   * child and points at the owner's primary key, so creating the child against
   * an unsaved owner would persist a row with a nil FK — Rails refuses with
   * `RecordNotSaved` rather than silently orphaning it. (belongs_to has no such
   * guard: its FK lives on the owner, so the child can be created first.)
   */
  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    shouldRaise = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    if (!(this.owner as { isPersisted?: () => boolean }).isPersisted?.()) {
      throw new RecordNotSaved("You cannot call create unless the parent is saved", this.owner);
    }
    // Mirror Rails' `HasOneAssociation#replace` (has_one_association.rb:59-69),
    // which `set_new_record` reaches via `replace(record, false)`: `remove_target!`
    // detaches the currently associated record (FK nullified / destroyed per
    // `:dependent`) whenever another record is being assigned. `replace`'s leading
    // `load_target` returns the already-cached target, so when the caller has
    // loaded it (`readHasOne` / preload), that OLD record is the one removed. Our
    // `replace`/`setNewRecord` are sync and cannot `await` that removal, so we run
    // it here. Capture the loaded target BEFORE `super._createRecord`, which
    // builds the new record first — an invalid build (e.g. an inexistent foreign
    // key) must raise before any removal runs, exactly as Rails' `build_record`
    // raises before `set_new_record`. An unloaded target is left to the property-
    // setter displacement path (`queueWrite` flags), matching Rails' behaviour of
    // only removing what `load_target` surfaces.
    const displaced = this.loaded ? this.target : null;
    const record = await super._createRecord(attributes, shouldRaise, block);
    // `super._createRecord` ran `setNewRecord` → `replace`, so `this.target` is
    // now the freshly created record; detach the displaced (previously attached)
    // one, matching `remove_target!` inside Rails' `replace`.
    await this.detachDisplacedTarget(displaced, record);
    return record;
  }

  /**
   * Detach the record displaced by a `create#{name}` / `build#{name}` over an
   * already-**loaded** has_one target — the awaitable analog of the
   * `remove_target!` Rails runs inside `HasOneAssociation#replace`
   * (has_one_association.rb:69) whenever another record is assigned. Nullifies
   * the displaced record's foreign key (or destroys/deletes it per
   * `:dependent`). Our sync `replace`/`setNewRecord` cannot `await` that removal,
   * so the async create/build accessors run it here after materializing the
   * replacement. A no-op unless a *different*, non-destroyed record was loaded.
   *
   * @internal
   */
  async detachDisplacedTarget(displaced: Base | null, replacement: Base | null): Promise<void> {
    if (!displaced) return;
    if ((displaced as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    if (sameRecord(displaced, replacement)) return;
    // Mirror Rails' `HasOneAssociation#replace`, where `self.target = record` runs
    // only after the transaction block: if `remove_target!` raises (e.g. a failed
    // nullify save, which restores the old record's owner attributes before
    // raising — has_one_association.rb:102-108), the cached target stays the OLD
    // record. So point the target at `displaced` across the removal and only
    // promote the `replacement` on success — a throw leaves `displaced` cached.
    this.target = displaced;
    await removeTargetBang(this, (this.reflection.options.dependent as string) ?? "");
    this.target = replacement;
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
      const typeCol =
        this.reflection.options.foreignType ?? `${underscore(this.reflection.options.as)}_type`;
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

  /**
   * Mirrors Rails' `HasOneAssociation#set_new_record` (has_one_association.rb
   * :87-93): `replace(record, false)`. The save flag is false because the
   * foreign keys are set when the record is instantiated (via
   * `scope_for_create`), so they don't need updating within `replace`. The base
   * `replace` no longer branches on the flag (it only sets the FK/inverse in
   * memory), but the through override still honors it, and a create-path child
   * is already persisted, so the owner's next `autosaveHasOne` sees it unchanged
   * and does not re-save.
   *
   * `save = false` gates only `transaction_if(save)` (:68) and `if save &&
   * !record.save` (:75) — `remove_target!` (:69) runs regardless, so building
   * over an existing target still nullifies the displaced record's foreign key
   * and clears its inverse. We run that in-memory half here and hand the
   * displaced record to `removeDisplaced` (the owner's `autosaveHasOne`) for the
   * DB half — `build` is synchronous and cannot await a save. Only a *persisted*
   * displaced record has a row to remove, so a transient in-memory target is not
   * queued (matching `queueWrite`).
   */
  protected override setNewRecord(record: Base): void {
    const displaced = this.target;
    const assigningAnother = !sameRecord(displaced, record);
    this.replace(record, false);
    if (!displaced || !assigningAnother) return;
    if ((displaced as { isPersisted?: () => boolean }).isPersisted?.() !== true) return;
    if ((displaced as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    const dependent = (this.reflection.options.dependent as string) ?? "";
    if (dependent !== "delete" && dependent !== "destroy") {
      // `remove_target!`'s else branch (:104-106) is synchronous in Rails; only
      // its `target.save` (:108) needs an await, so do the memory half now.
      this.nullifyOwnerAttributes(displaced);
      this.removeInverseInstance(displaced);
    }
    this._displacedRecords.push(displaced);
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

/**
 * Before a `dependent: :destroy` cascade runs the target's `destroy`, eagerly
 * load the target's `belongs_to` back-reference(s) to the owner so the target's
 * synchronous `before_destroy` callbacks can read a freshly-queried parent.
 *
 * Rails relies on the child's `belongs_to` reader lazily issuing a synchronous
 * DB query inside the callback (e.g. Account#before_destroy reads `account.firm`
 * to record `destroyed_account_ids[firm.id]`). Our `belongs_to` reader is async,
 * so an unloaded parent would surface as a Promise the sync callback must skip.
 * Since the cascade itself runs on an async path, we pre-issue that query here:
 * we load every back-reference that shares the cascading reflection's foreign
 * key (and whose target class the owner is an instance of). The callback then
 * reads the actual queried record — matching Rails' observable behaviour
 * exactly, with no in-memory-owner substitution and no `inverse_of` tie-break.
 *
 * Automatic `inverse_of` does not fire for this pair: the explicit `foreign_key`
 * on `has_one :account` blocks it in both directions, exactly as in Rails, so
 * `set_inverse_instance` never seeds the child and Rails falls back to a real
 * query. The foreign-key match is what scopes this preload to the relevant
 * back-references; loading a same-FK sibling (e.g. `Account#unautosaved_firm`
 * alongside `Account#firm`) is harmless — each resolves to the same owner row,
 * so the order in which they appear no longer matters.
 *
 * @internal
 */
async function preloadDestroyInverseBelongsTo(assoc: HasOneAssociation): Promise<void> {
  const target = assoc.target;
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
    // The owner must actually be an instance of the belongs_to's target class,
    // so we don't query an unrelated association that happens to share the FK.
    if (klass && !(owner instanceof (klass as any))) continue;
    try {
      await (target as any).association(ref.name).loadTarget();
    } catch {
      // A non-loadable back-reference (e.g. a missing FK row) is simply skipped;
      // the callback then sees an unloaded association, as it would in Rails.
    }
  }
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
    await preloadDestroyInverseBelongsTo(assoc);
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
