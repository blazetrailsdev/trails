import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { DeleteRestrictionError, HasOnePersistedAssignmentError } from "./errors.js";
import { RecordNotSaved } from "../errors.js";
import { underscore } from "@blazetrails/activesupport";
import { reflectOnAllAssociations } from "../reflection.js";
import { ForeignAssociation, foreignKeyPresentFor } from "./foreign-association.js";
import type { AssociationReflection } from "../reflection.js";
import { findTarget, SingularAssociation } from "./singular-association.js";
import { polymorphicName } from "../inheritance.js";

/**
 * Manages has_one associations. Handles dependent destruction,
 * record replacement with FK nullification, and loading via
 * the loadHasOne function.
 *
 * Mirrors: ActiveRecord::Associations::HasOneAssociation
 */
export class HasOneAssociation extends SingularAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /**
   * Writer for the JS property setter (`owner.account = x`, builder/has-one.ts
   * `defineWriters`) and mass-assignment, neither of which can `await`.
   *
   * - **Unpersisted owner:** in-memory `replace` (FK + inverse set), exactly as
   *   Rails' `replace` does no I/O for a new-record owner (`save &&=
   *   owner.persisted?`, has_one_association.rb:66). Autosave persists at the
   *   owner's first `save()`.
   * - **Persisted owner:** THROW. Rails persists the displacement + new record
   *   inline at assignment; JS cannot do synchronous DB I/O from a property
   *   setter, so rather than deferring the writes to the owner's next `save()`
   *   (the order-undefined two-row race RFC 0068 exists to kill) we throw and
   *   name the awaitable replacement (`await owner.set#{Name}(x)`). See RFC
   *   0068-awaitable-has-one-setter ("Why 'loud' beats 'deferred'") for the
   *   ergonomic-tradeoff decision to deviate loudly from Rails' legal syntax.
   */
  syncWrite(record: Base | null): void {
    // Rails' `replace` raises a class mismatch as its very first statement
    // (has_one_association.rb:59-60), before any load/removal/persist — and so
    // before the persisted-owner deviation below. That guard is synchronous, so
    // preserve its ordering even on this non-awaitable path: `firm.account = 1`
    // must report `AssociationTypeMismatch`, not the awaitable-setter throw.
    if (record)
      (this as unknown as { raiseOnTypeMismatchBang(r: Base): void }).raiseOnTypeMismatchBang(
        record,
      );
    if ((this.owner as { isPersisted?: () => boolean }).isPersisted?.()) {
      throw new HasOnePersistedAssignmentError(this.reflection.name);
    }
    // Unpersisted owner: Rails' `replace` does no DB I/O here, so the sync
    // property setter is faithful — set the FK/inverse in memory and let the
    // owner's first `save()` autosave persist. No displacement can need DB
    // removal (a new owner keys no persisted row), so nothing is queued.
    this.replace(record);
  }

  /**
   * Mirrors Rails `HasOneAssociation#replace`, which persists on assignment to
   * a *saved* owner: the displaced record is nullified/deleted/destroyed and
   * the new record saved immediately. Returns a Promise so callers can `await`
   * the writes — the only floating-promise-free way to reach the immediate path
   * from JS (the sync property setter cannot await, so it uses `syncWrite`
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
    // Rails: `return target unless load_target || record`
    // (has_one_association.rb:61) — nothing associated and nothing being
    // assigned means no work, so return before the gate and before
    // `self.target = record`. This does NOT leave the association unloaded:
    // `load_target` calls `loaded!` unconditionally (association.rb:192), as
    // does the `loadTarget()` above.
    if (!displaced && !record) return;
    // Mirror Rails `replace`'s `assigning_another_record || has_changes_to_save?`
    // gate (:64-65): only touch the DB when the assignment actually changes
    // something, so a no-op re-assignment (e.g. `writer(null)` with no target)
    // opens no transaction. `hasChangesToSave` is a getter, read (not called)
    // per #4900. The `?.` is now just nil-safety on `record`; Rails' `return
    // target unless load_target || record` is ported as the early return above.
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
   * Set by the callers that own Rails' leading `load_target` and the
   * `remove_target!` that follows it themselves — the `build#{name}` accessor
   * (builder/has-one.ts, which runs `loadTargetForBuild` and awaits
   * `detachDisplacedTarget`) and the nested-attributes writer
   * (nested-attributes.ts, a synchronous property setter that starts
   * `detachDisplacedTarget` — for a loaded target — or
   * `detachDisplacedForSyncBuild` — for an unloaded one, which runs the leading
   * `load_target` itself — at assignment, and drains it in its `save` wrapper).
   * Both call `build` on their way through, and without this flag `build` would
   * re-run the load and start a *second*, concurrent removal of the same row.
   *
   * `protected` because it is association-internal bookkeeping, not API surface;
   * the two callers reach it through their existing duck-typed handles on the
   * association (both live outside the class hierarchy).
   *
   * @internal
   */
  protected buildDisplacementOwnedByCaller = false;

  /**
   * Rails' `set_new_record` → `replace(record, false)` opens with `load_target`
   * (has_one_association.rb:59-62): the guard is `return target unless
   * load_target || record`, and Ruby always evaluates the left operand, so
   * EVERY build queries for an existing target before deciding whether to
   * displace it — a never-loaded association included. `needsTargetLoadForBuild`
   * is Rails' `find_target?`, so the query runs exactly when Rails' would (a
   * persisted / FK-present owner whose target isn't loaded), and returning it
   * here is what makes `association(name).build(...)` awaitable on that path.
   *
   * @internal
   */
  protected override loadDisplacedForBuild(): Promise<unknown> | null {
    if (this.buildDisplacementOwnedByCaller) return null;
    if (!this.needsTargetLoadForBuild()) return null;
    return this.loadTargetForBuild();
  }

  /**
   * `build_#{name}` and `association(:name).build` are the same Rails method,
   * and both run `set_new_record` → `replace(record, false)` → `remove_target!`
   * (has_one_association.rb:87-93, 59-69): the displaced row's foreign key is
   * nullified (or the row destroyed/deleted per `:dependent`) inline. Our
   * `setNewRecord` is synchronous and does only the in-memory half, so a direct
   * `record.association("ship").build({...})` over a loaded, persisted target
   * used to leave that row attached in the DB. Returning the removal here makes
   * `build` hand the caller a promise to `await` — the only way a synchronous
   * return can expose an inline write in JS.
   *
   * `detachDisplacedTarget` supplies the remaining guards (a different,
   * non-destroyed record) and Rails' target-on-failure semantics.
   *
   * @internal
   */
  protected override detachDisplacedOnBuild(
    displaced: Base | null,
    record: Base | null,
  ): Promise<void> | null {
    if (this.buildDisplacementOwnedByCaller) return null;
    if (!displaced || sameRecord(displaced, record)) return null;
    // A displaced record that was never persisted keys no row: `remove_target!`'s
    // in-memory half already ran in `setNewRecord`, and its `target.save` is
    // gated on `target.persisted?` (has_one_association.rb:108). Returning null
    // keeps repeated `build`s (the common `assoc.build()` twice shape)
    // synchronous.
    if ((displaced as { isPersisted?: () => boolean }).isPersisted?.() !== true) return null;
    return this.detachDisplacedTarget(displaced);
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
    // raises before `set_new_record`. An UNLOADED target is surfaced by
    // `replace`'s leading `load_target`, ported through
    // `loadDisplacedTargetForCreate`.
    const [displaced, loadError] = await this.loadDisplacedTargetForCreate();
    const record = await super._createRecord(attributes, shouldRaise, block);
    // The build succeeded, so Rails would have reached `load_target` — and every
    // exception but `RecordNotFound` propagates out of it (association.rb:189-195).
    // Re-raise here, at the point Rails raises: after `build_record` and
    // `record.save`, before `remove_target!` detaches anything.
    if (loadError) throw loadError;
    // `super._createRecord` ran `setNewRecord` → `replace`, so `this.target` is
    // now the freshly created record; detach the displaced (previously attached)
    // one, matching `remove_target!` inside Rails' `replace`.
    await this.detachDisplacedTarget(displaced);
    return record;
  }

  /**
   * The record `create#{name}` displaces: Rails' `replace` opens with
   * `load_target` (has_one_association.rb:59), so `remove_target!` detaches a row
   * that only ever existed in the DB. Routed through `loadTargetForBuild` — gated
   * by `needsTargetLoadForBuild` (Rails' `find_target?`) so the SELECT runs only
   * when Rails' would, and overridden by has_one_through to load the *through*
   * proxy, since Rails' through `replace` issues no target load.
   *
   * Returns the displaced record and, separately, any error the load raised —
   * the caller re-raises it only once `super._createRecord` has succeeded. The
   * load must run FIRST (it is what surfaces the row to detach, and it has to
   * precede the new record's FK write), but Rails reaches `load_target` only
   * from `set_new_record`, i.e. *after* `build_record`. So a malformed
   * association (an inexistent foreign key) surfaces the build error, while a
   * genuine load failure unrelated to the build — a dropped connection, an
   * unrelated SQL error — still propagates out of `create#{name}` exactly as it
   * does in Rails, rather than being swallowed into `displaced = null`.
   * `load_target` itself rescues only `RecordNotFound` (association.rb:189-195),
   * which `loadTargetForBuild` already handles by returning null.
   *
   * @internal
   */
  private async loadDisplacedTargetForCreate(): Promise<[Base | null, unknown]> {
    if (!this.needsTargetLoadForBuild()) return [this.loaded ? this.target : null, null];
    try {
      return [(await this.loadTargetForBuild()) as Base | null, null];
    } catch (error) {
      return [null, error];
    }
  }

  /**
   * The single awaitable analog of the `remove_target!` Rails runs inside
   * `HasOneAssociation#replace` (has_one_association.rb:69) whenever another
   * record is assigned: nullify the displaced record's foreign key (or
   * destroy/delete it per `:dependent`). Our sync `replace`/`setNewRecord`
   * cannot `await` that write, so every caller that materializes a replacement
   * — the `build#{name}` / `create#{name}` accessors, `association(name).build`,
   * and the nested-attributes writer — runs it here, *after* the replacement is
   * already cached as `this.target`. A no-op unless a *different*,
   * non-destroyed record was displaced.
   *
   * The removal names `displaced` explicitly instead of parking it on
   * `this.target` for the duration: the nested-attributes property setter is
   * synchronous and returns to its caller mid-removal, so a parked target would
   * be briefly observable as `assoc.target` reverting to the displaced record
   * (Rails' own nested-attributes tests read the new target right after the
   * assignment). Rails' target-on-failure semantics — `self.target = record`
   * runs only after the transaction block, so a raising `remove_target!` (e.g.
   * a failed nullify save, has_one_association.rb:102-108) leaves the OLD
   * record cached — are preserved by restoring the target in the `catch`
   * instead, which is observable at exactly the same moment the caller sees the
   * error.
   *
   * No `isPersisted` pre-screen: Rails' `remove_target!` gates on persistence
   * only inside its `:destroy` and nullify arms; the `:delete` arm calls
   * `target.delete` unconditionally, and `Persistence#delete` still marks the
   * record destroyed and freezes it when the row does not exist
   * (persistence.rb:439-444). Let `removeTargetBang`'s arms make that call.
   *
   * @internal
   */
  async detachDisplacedTarget(displaced: Base | null): Promise<void> {
    if (!displaced) return;
    if ((displaced as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    if (sameRecord(displaced, this.target)) return;
    try {
      await removeTargetBang(this, (this.reflection.options.dependent as string) ?? "", displaced);
    } catch (error) {
      this.target = displaced;
      throw error;
    }
  }

  /**
   * The unloaded half of the nested-attributes writer's `remove_target!`.
   *
   * Rails' `set_new_record` -> `replace(record, false)` opens with `load_target`
   * (has_one_association.rb:59-62) on EVERY build, so a build over a *never
   * loaded* has_one on a persisted owner still discovers the existing row and
   * removes it. `detachDisplacedTarget` only covers what the caller already had
   * in memory; this covers the row that only ever existed in the DB.
   *
   * The synchronous writer (`pirate.shipAttributes = {...}`) cannot await the
   * SELECT, so it calls this at assignment — Rails' timing for *issuing* the
   * query — and parks the returned promise on the owner, draining it in the
   * `save` wrapper exactly like `detachDisplacedTarget`'s. Null when Rails would
   * issue no query at all (`find_target?`) or when the target is already loaded,
   * which keeps the writer synchronous on those paths.
   *
   * The find deliberately goes through `doAsyncFindTarget` rather than
   * `loadTargetForBuild`: by the time it resolves, the build has already
   * installed the replacement as `this.target`, and `load_target`'s writeback
   * would clobber it. We need only the displaced record, never the cache.
   *
   * @internal
   */
  detachDisplacedForSyncBuild(): Promise<void> | null {
    if (this.loaded) return null;
    if (!this.needsTargetLoadForBuild()) return null;
    return this.findThenDetachDisplaced();
  }

  private async findThenDetachDisplaced(): Promise<void> {
    await this.detachDisplacedTarget(await this.doAsyncFindTarget());
  }

  protected override async doAsyncFindTarget(): Promise<Base | null> {
    // `loadHasOne`'s tail writeback lands in this holder mid-await, so a target
    // replaced while the query is in flight would be silently clobbered. Arm
    // the same guard has_many uses (`HasManyAssociation#doAsyncFindTarget`):
    // suppress the loader's own writeback and let `setTarget` refuse the race.
    // See `Association#_loaderWritebackSuppressed`.
    this._loaderWritebackSuppressed++;
    try {
      return await findTarget(this.owner, this.reflection.name, this.reflection.options, "hasOne");
    } finally {
      this._loaderWritebackSuppressed--;
    }
  }

  private foreignKeyColumns(): string[] {
    const fk = this.reflection.options.foreignKey;
    if (typeof fk === "string") return [fk];
    if (Array.isArray(fk)) return fk;
    const ctor = (this.owner as any).constructor;
    if (this.reflection.options.as) {
      return [`${underscore(this.reflection.options.as)}_id`];
    }
    // Rails' `reflection.foreign_key` derives from `reflection.active_record`
    // — the class that *declared* the association — not the owner instance's
    // class. For an STI subclass owner (a `SpecialPost` whose
    // `has_one :very_special_comment` is declared on `Post`) that is `post_id`,
    // not `special_post_id`. The rich reflection already applies that rule.
    const declared = (
      ctor as {
        _reflectOnAssociation?: (n: string) => { foreignKey?: string | string[] } | undefined;
      }
    )._reflectOnAssociation?.(this.reflection.name)?.foreignKey;
    if (typeof declared === "string") return [declared];
    if (Array.isArray(declared)) return declared;
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
   * and clears its inverse. We run that in-memory half here; the DB half needs
   * an `await` this synchronous method cannot issue, so every caller that can
   * displace a persisted record issues it itself — `detachDisplacedTarget` from
   * the `build#{name}` / `create#{name}` accessors (builder/has-one.ts,
   * `_createRecord`), and the same method from the nested-attributes writer
   * (nested-attributes.ts, `detachDisplacedAtAssignment`). Nothing is queued
   * here: a queue drained at the owner's `save` would defer a write Rails makes
   * at assignment, and would double-remove records the awaiting callers have
   * already detached.
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
async function removeTargetBang(
  assoc: HasOneAssociation,
  method: string,
  // Rails' `remove_target!` always acts on `self.target`, which is still the
  // displaced record inside `replace`'s transaction (persistImmediate keeps that
  // shape, so it takes the default). Every deferred displacement path instead
  // removes a record while `assoc.target` is already the replacement — flipping
  // the cached target back mid-await is observable to synchronous readers — so
  // `detachDisplacedTarget` names the record explicitly.
  target: Base | null = assoc.target,
): Promise<void> {
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
    await preloadDestroyInverseBelongsTo(assoc, target);
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
