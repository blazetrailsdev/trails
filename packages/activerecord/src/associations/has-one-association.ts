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
   * Writer for mass-assignment (`new Firm({ account })`,
   * `firm.assignAttributes({ account })`), which cannot `await`. RFC 0087 §1
   * removed the `owner.account = x` property setter that was its other caller;
   * the mass-assignment arm itself goes in that RFC's
   * `retire-sync-association-mass-assignment-arms`, and this method with it.
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
   *
   * `protected`: its callers (`attribute-assignment.ts`'s hasOne arm, and the
   * through-inverse wiring in collection-proxy.ts / has-many-through-association.ts)
   * reach the association through a structural handle rather than the class
   * type. The Rails-named surface is `writer` / `set#{Name}`.
   *
   * RFC 0087 §1 listed this for deletion with the `#{name}=` property setter it
   * backed. The setter is gone; this survives deliberately, because Rails'
   * `assign_attributes` returns nil and assigns inline
   * (`activemodel/lib/active_model/attribute_assignment.rb:32-35`) — trails
   * matches that, so mass assignment can never await and this stays its route
   * into the has_one writer.
   *
   * @internal
   */
  protected syncWrite(record: Base | null): void {
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
    // `save` is passed false because Rails' `save &&= owner.persisted?`
    // (has_one_association.rb:66) already reduced it to false for this owner,
    // which is exactly what makes the remainder of `replace` awaitless.
    this.replace(record, false);
  }

  /**
   * Mirrors Rails `HasOneAssociation#replace`, which persists on assignment to
   * a *saved* owner: the displaced record is nullified/deleted/destroyed and
   * the new record saved immediately. Returns a Promise so callers can `await`
   * the writes — the only floating-promise-free way to reach the immediate path
   * from JS (mass-assignment cannot await, so it uses `syncWrite` instead). For a *new* owner the foreign key isn't known yet, so persistence
   * defers to the owner's next save (`autosaveHasOne`).
   */
  override writer(record: Base | null): void | Promise<void> {
    // Rails' `SingularAssociation#writer` is `replace(record)`
    // (singular_association.rb:19-21); `replace` returns a promise on the
    // persisting arm, so the base `void | Promise<void>` signature carries it.
    return this.replace(record);
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
    return foreignKeyPresentFor(this.reflection as unknown as AssociationReflection, this.owner);
  }

  /**
   * Handle the :dependent option when the owner is being destroyed.
   */
  async handleDependency(): Promise<void | false> {
    switch (this.reflection.options.dependent) {
      case "restrictWithException":
        if (await this.loadTarget()) {
          throw new DeleteRestrictionError(this.reflection.name);
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
          owner.errors.add("base", ":restrict_dependent_destroy.has_one", { record });
          return false;
        }
        break;

      default:
        return await this.delete();
    }
  }

  /**
   * Delete the associated record using the given method.
   * Supports: delete, destroy, nullify.
   *
   * @missingRailsCall fetch — PERMANENT: Ruby `options.fetch(:ensuring_owner_was, nil)`
   *   (has_one_association.rb:51); a JS object has no `fetch`, so the stored-nil
   *   semantics are spelled as an own-key check at the call site.
   */
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
        // Rails: `throw(:abort) unless target.destroyed?` — if the child's own
        // destroy aborted (e.g. a restrict_with_error grandchild), propagate
        // the abort so the owner is not deleted either.
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
          // Ruby `options.fetch(:ensuring_owner_was, nil)` returns a stored
          // `nil`/`false`; `??` would substitute the default for it.
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
    // Rails' HasOneAssociation#delete (has_one_association.rb:26-52) returns
    // right after the `case` and never resets `self.target`. We must not reset
    // it either: in the mutual `dependent: :destroy` cycle the target is already
    // frozen by the time control returns here, and writing its inverse FK would
    // raise FrozenError.
  }

  /**
   * Rails' `set_new_record` → `replace(record, false)` opens with `load_target`
   * (has_one_association.rb:59-62): the guard is `return target unless
   * load_target || record`, and Ruby always evaluates the left operand, so
   * EVERY build queries for an existing target before deciding whether to
   * displace it — a never-loaded association included. `findTargetNeeded` is
   * Rails' `find_target?`, so the query runs exactly when Rails' would (a
   * persisted / FK-present owner whose target isn't loaded), and returning it
   * here is what makes `association(name).build(...)` awaitable on that path.
   *
   * @internal
   */
  protected override loadDisplacedForBuild(): Promise<unknown> | null {
    if (!this.findTargetNeeded()) return null;
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
   * `detachDisplacedTarget` supplies the remaining guards (a non-destroyed
   * record) and, by running before `setNewRecord`, Rails' target-on-failure
   * semantics.
   *
   * @internal
   */
  protected override detachDisplacedOnBuild(record: Base | null): Promise<void> | null {
    const displaced = this.loaded ? this.target : null;
    if (!displaced || sameRecord(displaced, record)) return null;
    // Only the nullify arm may skip an unpersisted displaced record. Rails gates
    // on `target.persisted?` inside that arm's `target.save`
    // (has_one_association.rb:108) and inside `:destroy`'s `target.destroy`
    // (:100) — but `:delete` calls `target.delete` unconditionally (:97), and
    // `:destroy` still writes `destroyed_by_association` (:99) before its gate.
    // The nullify arm's remaining work is in-memory and `setNewRecord` already
    // ran it, so skipping there is a true no-op — and it is what keeps repeated
    // `build`s (the common `assoc.build()` twice shape) synchronous.
    const dependent = (this.reflection.options.dependent as string) ?? "";
    if (
      dependent !== "delete" &&
      dependent !== "destroy" &&
      (displaced as { isPersisted?: () => boolean }).isPersisted?.() !== true
    )
      return null;
    return this.detachDisplacedTarget();
  }

  /**
   * The load run before the new record is constructed, gated by Rails'
   * `find_target?` (`findTargetNeeded`). A direct-FK has_one loads its own
   * target —
   * Rails' `set_new_record` → `replace(record, false)` runs `load_target`
   * (has_one_association.rb:59). A has_one_through overrides this: Rails'
   * `HasOneThroughAssociation#replace` has NO `load_target`; its
   * `create_through_record` loads the *through* proxy instead
   * (has_one_through_association.rb:15-19), so the through must issue the
   * join-model SELECT here, never a target SELECT.
   *
   * `protected`: association-internal bookkeeping, not API surface. The
   * generated `build#{name}` accessor reaches it through its duck-typed
   * handle, as it does `findTargetNeeded`.
   *
   * @internal
   */
  protected loadTargetForBuild(): Promise<unknown> {
    return Promise.resolve(this.loadTarget());
  }

  /**
   * Mirrors Rails' `HasOneAssociation#replace` (has_one_association.rb:59-85).
   *
   * The `save = false` arm — Rails' `set_new_record` → `replace(record, false)`,
   * and a new owner, whose `save &&= owner.persisted?` (:66) has already reduced
   * the flag — reaches no DB I/O in Rails either: `transaction_if(false)` yields
   * directly and `if save && !record.save` (:75) is skipped, leaving only the
   * in-memory `set_owner_attributes` / `set_inverse_instance`. That arm is
   * therefore synchronous here, which is what lets the synchronous callers
   * (`setNewRecord`, `syncWrite`) reach it at all. `remove_target!` (:69) needs
   * an `await` those callers cannot issue, so it is run by the awaiting callers
   * (`detachDisplacedTarget`) — see `setNewRecord`.
   *
   * The persisting arm is the same body with the awaits Rails does not need,
   * returned as a promise so `writer` can hand it to the caller.
   */
  protected override replace(record: Base | null, save: false): void;
  protected override replace(record: Base | null, save?: boolean): void | Promise<void>;
  protected override replace(record: Base | null, save = true): void | Promise<void> {
    if (save) {
      return (async () => {
        // Rails raises the class mismatch as `replace`'s very first statement
        // (:60), before `load_target`. Raised inside the promise on this arm so
        // a saved owner's `await owner.set#{Name}(x)` rejects rather than
        // throwing out of the synchronous call — the JS spelling of the same
        // raise site.
        if (record) (this as any).raiseOnTypeMismatchBang(record);
        // Rails' leading `load_target` (:61): materialize the currently
        // associated record (possibly a DB row on a freshly-found owner) so it
        // can be nullified/removed rather than silently orphaned.
        if (!this.loaded) await this.loadTarget();
        // Rails: `return target unless load_target || record` (:61) — nothing
        // associated and nothing being assigned means no work. This does NOT
        // leave the association unloaded: `load_target` calls `loaded!`
        // unconditionally (association.rb:192), as does the `loadTarget()`.
        if (!this.target && !record) return;
        const assigningAnotherRecord = !sameRecord(this.target, record);
        if (assigningAnotherRecord || record?.hasChangesToSave === true) {
          // Rails: `save &&= owner.persisted?` (:66).
          save = (this.owner as { isPersisted?: () => boolean }).isPersisted?.() === true;
          // `this.target` still holds the displaced record for the whole block —
          // Rails reaches `self.target = record` (:84) only after it — so a throw
          // anywhere inside (a failed `remove_target!` nullify, or the
          // `RecordNotSaved` on a failed save) leaves the OLD record cached.
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
        // Rails' `remove_target!(options[:dependent])` (:69) runs on this arm
        // too — `save = false` gates only `transaction_if` (:68) and
        // `record.save` (:75). Its default arm is `nullify_owner_attributes` +
        // `remove_inverse_instance` (:104-106), both in memory, so they run
        // here. Only `target.save` (:108) and the `:delete` / `:destroy` arms
        // (:97-101) need an `await` this synchronous arm cannot issue, so the
        // awaitable callers run those — `detachDisplacedTarget` from the
        // `build#{name}` / `create#{name}` accessors (builder/has-one.ts,
        // `_createRecord`) and from the nested-attributes writer
        // (nested-attributes.ts, `detachDisplacedThenSetNewRecord`).
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
          // Set the foreign key (from the owner's — possibly still-nil — primary
          // key) and inverse in memory. Persistence is Rails'
          // `save_has_one_association` (our `autosaveHasOne`), which re-derives
          // the FK once the owner has a primary key and saves the record.
          this.setOwnerAttributes(record);
          this.setInverseInstance(record);
        }
      }
      this.target = record;
      return;
    }
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
    raise = false,
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
    // `loadDisplacedTargetForCreate`, which caches the row as `this.target`;
    // `super._createRecord` removes it via `detachDisplacedOnBuild`.
    const loadError = await this.loadDisplacedTargetForCreate();
    const record = await super._createRecord(attributes, raise, block);
    // Every exception but `RecordNotFound` propagates out of `load_target`
    // (association.rb:189-195). Re-raise at the point Rails raises: after
    // `build_record` and `record.save`. A failed load cached nothing, so the
    // removal above was already a no-op.
    if (loadError) throw loadError;
    return record;
  }

  /**
   * The record `create#{name}` displaces: Rails' `replace` opens with
   * `load_target` (has_one_association.rb:59), so `remove_target!` detaches a row
   * that only ever existed in the DB. Routed through `loadTargetForBuild` — gated
   * by `findTargetNeeded` (Rails' `find_target?`) so the SELECT runs only
   * when Rails' would, and overridden by has_one_through to load the *through*
   * proxy, since Rails' through `replace` issues no target load.
   *
   * The load caches the displaced record as `this.target`, so the removal that
   * follows needs no handle on it. Returns any error the load raised — the
   * caller re-raises it only once `super._createRecord` has succeeded. The
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
  private async loadDisplacedTargetForCreate(): Promise<unknown> {
    if (!this.findTargetNeeded()) return null;
    try {
      await this.loadTargetForBuild();
      return null;
    } catch (error) {
      return error;
    }
  }

  /**
   * The single awaitable analog of the `remove_target!` Rails runs inside
   * `HasOneAssociation#replace` (has_one_association.rb:69) whenever another
   * record is assigned: nullify the displaced record's foreign key (or
   * destroy/delete it per `:dependent`). Our sync `replace`/`setNewRecord`
   * cannot `await` that write, so every caller that materializes a replacement
   * — the `build#{name}` / `create#{name}` accessors, `association(name).build`,
   * and the nested-attributes writer — runs it here, on the record the
   * association is currently caching. A no-op unless a non-destroyed record is
   * cached.
   *
   * It takes no argument and removes `this.target`, as Rails' `remove_target!`
   * does. The awaited callers run it *before* installing the replacement, so
   * Rails' target-on-failure semantics fall out of the ordering: `self.target =
   * record` (:84) is never reached when `remove_target!` raises (e.g. a failed
   * nullify save, has_one_association.rb:102-108).
   *
   * There is no synchronous caller: every writer that can displace a record is
   * awaitable, so each of them runs Rails' order intact.
   *
   * No `isPersisted` pre-screen: Rails' `remove_target!` gates on persistence
   * only inside its `:destroy` and nullify arms; the `:delete` arm calls
   * `target.delete` unconditionally, and `Persistence#delete` still marks the
   * record destroyed and freezes it when the row does not exist
   * (persistence.rb:439-444). Let `removeTargetBang`'s arms make that call.
   *
   * `protected` because this is association-internal bookkeeping, not API
   * surface — Rails' `remove_target!` is private too. The nested-attributes
   * writer lives outside the class hierarchy and reaches it through its
   * duck-typed `OneToOneAssociation` handle, exactly as it does the sibling
   * `displacementNeedsAwait`.
   *
   * @internal
   */
  protected async detachDisplacedTarget(): Promise<void> {
    if (!this.target) return;
    if ((this.target as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    await this.removeTargetBang((this.reflection.options.dependent as string) ?? "");
  }

  /**
   * Whether a nested-attributes build over this association would reach DB I/O
   * — the `load_target` (has_one_association.rb:59) / `remove_target!` (:69)
   * pair Rails runs inline. Rails answers it by just running them; ours asks
   * first, because a build that displaces nothing is pure in-memory work and
   * has to stay synchronous for `new Model({shipAttributes: {…}})` to build the
   * associated record inside the constructor, as Rails' does.
   *
   * True on both displacing arms: an already-loaded record to remove, and an
   * unloaded association whose `find_target?` (`findTargetNeeded`) says Rails
   * would query for one — the guard is `return target unless load_target ||
   * record`, and Ruby always evaluates the left operand, so a never-loaded
   * has_one on a persisted owner still discovers (and removes) the row. False
   * when the build displaces nothing, which keeps that assignment synchronous.
   *
   * `protected` because this is association-internal bookkeeping, not API
   * surface. The nested-attributes writer lives outside the class hierarchy and
   * reaches it through its duck-typed handle, as it does `detachDisplacedTarget`.
   *
   * @internal
   */
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
      // Rails writes `owner.class.base_class.name` (polymorphic_name), so STI
      // subclasses store their base class name in the `as:` type column.
      const typeName = (ctor as typeof Base).polymorphicName();
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(type, typeName);
      } else {
        (record as any)[type] = typeName;
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
   * `_createRecord`), and the same method from the awaitable nested-attributes
   * writer (nested-attributes.ts, `detachDisplacedThenSetNewRecord`). Nothing is queued
   * here: a queue drained at the owner's `save` would defer a write Rails makes
   * at assignment, and would double-remove records the awaiting callers have
   * already detached.
   */
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
 * Mirrors Rails' `target != record` in `HasOneAssociation#replace`, where `!=`
 * is `ActiveRecord::Core#==` — two records are the "same" when they are the
 * identical object, or persisted instances of the same class with the same id.
 * Using object identity alone would treat a freshly-found record (e.g.
 * `Account.find(1)`) as a *different* record from the already-loaded target,
 * triggering a spurious nullify/destroy of the row being re-assigned.
 *
 * @internal
 * @noRailsEquivalent PERMANENT Ruby's `target != record` dispatches Core#== (core.rb:344); JS `!==` is identity only, so the comparison needs a named port.
 */
export function sameRecord(a: Base | null, b: Base | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return (a as { equals?: (other: unknown) => boolean }).equals?.(b) === true;
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
