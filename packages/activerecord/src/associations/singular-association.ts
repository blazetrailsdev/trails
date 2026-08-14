import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import {
  _builtAssociationScope,
  _canRouteThroughViaDisableJoinsAssociationScope,
  _findTargetReachable,
  _loadSingularThroughViaDisableJoinsScope,
  _ownerChainReflection,
  _routeThroughViaAssociationScope,
  _loadSingularViaStatementCache,
  _resolveInverseName,
  _scopeForAssociation,
  _skipSingularStatementCache,
  _wireInverseAssociation,
  applyAssociationScope,
  resolveAssocClass,
  validateInverseOf,
} from "../associations.js";
import { Association } from "./association.js";
import { ownerForeignKeyColumns } from "./foreign-association.js";
import { AssociationNotFoundError, CompositePrimaryKeyMismatchError } from "./errors.js";
import {
  routeThroughCheckValidity,
  validateThroughReflection,
} from "./validate-through-reflection.js";
import { camelize, underscore } from "@blazetrails/activesupport";
import { strictLoadingViolationBang } from "../core.js";
import { RecordInvalid } from "../validations.js";

/**
 * Base class for has_one and belongs_to associations.
 *
 * Mirrors: ActiveRecord::Associations::SingularAssociation
 */
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
    this.target = null;
  }

  // has_one overrides this with an awaitable immediate-persist path that may
  // return a Promise; belongs_to keeps this synchronous body, which is already
  // faithful — Rails' `BelongsToAssociation#replace` (belongs_to_association.rb
  // :95-107) only sets the inverse and `replace_keys` the owner's foreign key,
  // both in memory, and issues no DB work of its own.
  writer(record: Base | null): void | Promise<void> {
    // Rails: `def writer(record) replace(record) end`
    // (singular_association.rb:19-21) — returned, so a subclass whose `replace`
    // persists (has_one) hands the caller its promise.
    return this.replace(record);
  }

  // has_one widens the return to a Promise: Rails' `set_new_record` →
  // `replace(record, false)` opens with `load_target` (the `unless load_target
  // || record` guard, has_one_association.rb:62, always evaluates its left
  // operand) and then removes the displaced row inline (`remove_target!`), and a
  // synchronous JS return has no other way to expose either query for `await`.
  // belongs_to keeps the plain synchronous return — its `set_new_record` only
  // writes the owner's foreign key in memory.
  build(
    attributes?: Record<string, unknown>,
    block?: (record: Base) => void,
  ): Base | null | Promise<Base | null> {
    // Rails is `record = build_record(attributes, &block); set_new_record(record)`
    // (singular_association.rb:29-33): construction — and the raise a bad
    // attribute produces — happens BEFORE `set_new_record` reaches `load_target`,
    // so an invalid build never queries. Keep that order here.
    // Rails yields the freshly built record inside `build_record`
    // (singular_association.rb:30 → association.rb:383-388), before it's set as
    // the new target, so a passed block can mutate persisted attributes
    // (e.g. `build_bulb { |b| b.color = ... }`).
    const record = this.buildRecord(attributes, block);
    // `set_new_record` → `replace(record, false)` runs `load_target` on EVERY
    // build, so a persisted owner whose target has never been loaded still
    // discovers (and displaces) the row in the DB. The load has to precede
    // `setNewRecord`, which overwrites the target and marks it loaded.
    const setNewRecord = (): Base | null | Promise<Base | null> => {
      // Rails removes before promoting: `remove_target!`
      // (has_one_association.rb:69), then `self.target = record` (:84). That
      // order is what leaves the displaced record cached when the removal
      // raises.
      const removal = this.detachDisplacedOnBuild(record);
      if (removal) {
        return removal.then(() => {
          if (record) this.setNewRecord(record);
          return record;
        });
      }
      if (record) this.setNewRecord(record);
      return record;
    };
    const load = this.loadDisplacedForBuild();
    if (load) return load.then(setNewRecord);
    return setNewRecord();
  }

  /**
   * Rails' leading `load_target` (has_one_association.rb:59-62), when it would
   * actually query — null otherwise, which is always the case for belongs_to
   * (`BelongsToAssociation#replace` neither loads nor removes anything).
   * Overridden by has_one; the promise returned here is what makes `build`
   * awaitable for the direct `record.association(name).build(...)` caller.
   *
   * @internal
   */
  protected loadDisplacedForBuild(): Promise<unknown> | null {
    return null;
  }

  /**
   * The DB half of the `remove_target!` Rails' has_one `set_new_record` runs
   * inline. It removes the association's own cached `target`, and callers run
   * it before `setNewRecord`. Null when there is nothing to remove, which is
   * always the case for belongs_to (`BelongsToAssociation#replace` only writes
   * the owner's foreign key in memory). Overridden by has_one, where the
   * returned promise both
   * performs the removal and is what widens `build`'s return so a direct
   * `record.association(name).build(...)` caller can `await` the write.
   *
   * @internal
   */
  protected detachDisplacedOnBuild(_record: Base | null): Promise<void> | null {
    return null;
  }

  async forceReloadReader(): Promise<Base | null> {
    await this.reload(true);
    return this.target;
  }

  /**
   * Reader for belongsTo / hasOne. Returns the loaded target, or a
   * Promise (when the FK is present but unloaded — use `await`).
   *
   * Phase R.3: under strict loading, sync access that would trigger a
   * lazy DB load throws `StrictLoadingViolationError` — pointing
   * users at the explicit async load path
   * (`post.loadBelongsTo("author")` / `post.loadHasOne("profile")`)
   * or an eager-load query (`Post.includes("author").find(id)`).
   *
   * The check only fires when a DB load would actually be needed — it
   * honors:
   *   - the holder's cached target (including a target of `null`, which
   *     represents an eagerly-loaded nil association — no query needed, no
   *     throw).
   *   - `findTargetNeeded()` — returns false when the FK is null
   *     (belongsTo), when the owner is a new record without a
   *     primary key (hasOne), etc. No query would run, so no throw.
   *
   * Toggles (all Rails-style):
   *   - Per-instance:  `record.strictLoadingBang()` enables;
   *                    `record.strictLoadingBang(false)` disables
   *                    (matches Rails' `strict_loading!(value = true)`).
   *   - Per-class:     `Post.strictLoadingByDefault = true` enables
   *                    for every instance of `Post`; set back to
   *                    `false` to restore the Rails default.
   *   - Global:        `Base.strictLoadingByDefault = true` enables
   *                    for every model; `false` restores the default.
   *   - Per-call mute: explicit `record.loadBelongsTo(...)` /
   *                    `loadHasOne(...)` bumps the bypass count for
   *                    the duration of the load, letting legitimate
   *                    lazy loads through.
   */
  get reader(): Base | null | Promise<Base | null> {
    if (this.loaded) {
      // Rails (singular_association.rb:10-13) reloads a loaded target when it
      // has gone stale — the owner's FK / key changed after the target was
      // loaded (`if !loaded? || stale_target?; reload`). `reload` resets the
      // cached target first so the subsequent `loadTarget` re-queries instead
      // of returning the stale cache. The reload requires DB I/O in Node, so
      // return a Promise resolving to the refreshed target, consistent with
      // the lazy-load path below. An inversed target stays non-stale because
      // its stale state is recaptured when the FK is seeded (BelongsTo
      // `inversedFrom` → replaceKeys → loadedBang), so this branch is skipped.
      if (this.isStaleTarget()) {
        return this.reload().then(() => this.target);
      }
      return this.target;
    }

    // An in-memory target (set via build / internal assignment paths
    // like Preloader::Association#associate_records_from_unscoped,
    // which can bind `association.target` without calling
    // `loadedBang()`) is already resolved — no DB load would run, so
    // strict loading should not fire. Mark it loaded to short-circuit
    // future reads.
    if (this.target != null) {
      this.loadedBang();
      return this.target;
    }

    // Sync resolution via preloaded / cached associations. `doFindTarget`
    // returns `undefined` if nothing is cached, or the (possibly null)
    // preloaded value if it is. A null from a preloaded key is a
    // legitimate "nil association" — no query needed, no throw.
    const cached = this.doFindTarget();
    if (cached !== undefined) {
      this.target = cached as Base | null;
      this.loadedBang();
      return this.target;
    }

    // A DB load would be required to answer.
    if (this.findTargetNeeded()) {
      if (this.isViolatesStrictLoading()) {
        const ctor = this.owner.constructor as typeof Base;
        const reflection = ctor._reflectOnAssociation?.(this.reflection.name);
        if (!reflection) throw new AssociationNotFoundError(this.owner, this.reflection.name);
        strictLoadingViolationBang({ owner: ctor, reflection });
      }
      // Rails loads synchronously; Node.js requires async I/O. The union
      // return type now forces callers to `await` — TypeScript enforces it
      // instead of the old `as unknown as Base | null` lie. The only cast
      // narrows loadTarget's `Base | Base[] | null` to the singular shape.
      return this.loadTarget() as Promise<Base | null>;
    }
    return this.target;
  }

  /**
   * Mirrors Rails' `SingularAssociation#scope_for_create`
   * (singular_association.rb:43):
   *
   *   def scope_for_create
   *     super.except!(*Array(klass.primary_key))
   *   end
   *
   * A belongs_to / has_one association scope constrains the target by its
   * own primary key (`where(humans.id => owner.human_id)` for belongs_to),
   * so the base `scope_for_create` surfaces that key. Carrying it into a
   * freshly-built target would stamp the existing parent's id onto the new
   * record — e.g. `face.create_human` would INSERT with the loaded fixture's
   * id and collide (`UNIQUE constraint failed: humans.id`). Stripping the
   * klass primary key(s) is exactly how Rails avoids that.
   *
   * @internal
   */
  override scopeForCreate(): Record<string, unknown> {
    const attrs = super.scopeForCreate();
    const pk = (this.klass as typeof Base | undefined)?.primaryKey;
    if (pk == null) return attrs;
    for (const key of Array.isArray(pk) ? pk : [pk]) delete attrs[key];
    return attrs;
  }

  /**
   * Mirrors: ActiveRecord::Associations::SingularAssociation#find_target
   * (singular_association.rb:47) — the singular target load, reading owner and
   * reflection off `this` exactly as Rails does. belongs_to and has_one both
   * inherit it: Rails defines `find_target` only here, on `Association`
   * (association.rb:248) and on `HasManyThroughAssociation`
   * (has_many_through_association.rb:225).
   *
   * One body serves belongs_to and has_one, as in Rails, because the macro
   * difference lives in the scope the reflection builds — `_builtAssociationScope`
   * is reached identically for both. `BelongsToAssociation` overrides only the
   * `find_target?` predicate (`belongs_to_association.rb:124-126`), never
   * `find_target`, which is why there is no belongs_to override either.
   *
   * It neither reads nor writes the association: Rails' body opens at the scope
   * and ends at `scope.first` (`singular_association.rb:47-55`), returning the
   * record. The cached read lives one level up in `Association#loadTarget` →
   * `_findTarget`, mirroring `load_target`'s
   * `(@stale_state && stale_target?) || find_target?` guard
   * (`association.rb:190`). `reflection.check_validity!` has likewise already
   * run in `Association#initialize` (`association.rb:41-45`), so a recursive or
   * missing `inverse_of` has surfaced before this body.
   *
   * The one macro-conditional step Rails has no counterpart for is the has_one
   * `:through` routing. It is a named helper rather than an inline branch so
   * this body keeps the shape of Rails'.
   *
   * `reflection` is re-read off the class rather than taken from `this`: the
   * definition `Association` holds carries no `macro` / `joinForeignKey` /
   * `scope`, which the scope builders below need. The name is already validated
   * by `Association#initialize`, so the miss is defensive.
   *
   * `_loaderWritebackSuppressed` is armed for the raise, not for a writeback:
   * the loader body writes nothing back, so what the flag buys here is
   * `setTarget` refusing a replacement that lands mid-query rather than losing
   * it silently. `Association#_findTarget` handles the complementary case the
   * raise cannot see — a bare FK change that never touches the holder.
   */
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

      // `SingularAssociation#find_target` (singular_association.rb:47-55) answers
      // a `disable_joins` association from `scope.first` and never calls `super`,
      // so that route never reaches the base body's strict-loading raise.
      if (
        !isBelongsTo &&
        options.through &&
        _canRouteThroughViaDisableJoinsAssociationScope(reflection, options)
      ) {
        return _loadSingularThroughViaDisableJoinsScope(owner, reflection, options);
      }

      // `Association#find_target`'s first statement (association.rb:248-250).
      // Gated by `find_target?`: a new-record owner without the key present never
      // reaches `find_target` and so never raises.
      if (
        this.isViolatesStrictLoading() &&
        _findTargetReachable(owner, assocName, options, isBelongsTo ? "belongsTo" : "foreign")
      ) {
        strictLoadingViolationBang({ owner: owner.constructor, reflection });
      }

      // has_one :through. Rails expresses `:through` inside the scope chain; trails
      // still routes the shapes AssociationScope cannot build through the two-step
      // `HasOneThroughAssociation#findTarget`.
      if (!isBelongsTo && options.through) {
        if (!_routeThroughViaAssociationScope(owner, reflection, options)) {
          return (
            this as unknown as { loadHasOneThrough(): Promise<Base | null> }
          ).loadHasOneThrough();
        }
        // Otherwise fall through to the scope path below.
      }

      let targetModel: typeof Base;
      if (isBelongsTo && options.polymorphic) {
        const typeCol = options.foreignType ?? `${underscore(assocName)}_type`;
        const typeName = owner._readAttribute(typeCol) as string | null;
        if (!typeName) return null;
        // Rails resolves a polymorphic belongs_to via the owner class's
        // polymorphic_class_for, honoring store_full_class_name and (when off)
        // namespace-relative compute_type — not a bare global registry lookup.
        targetModel = ctor.polymorphicClassFor(typeName);
      } else {
        targetModel = resolveAssocClass(owner, assocName, options.className ?? camelize(assocName));
      }

      if (options.inverseOf && !(isBelongsTo && options.polymorphic)) {
        validateInverseOf(targetModel, assocName, options.inverseOf);
      }

      if (!isBelongsTo) {
        _validateHasOnePolymorphicKeys(owner, assocName, options);
      }

      // Null-key short-circuit: read the SAME columns the eventual query reads, or
      // a mismatch silently returns null where a real query would have found the
      // row. That is `joinForeignKey` on the owner-side chain reflection for both
      // macros — the owner's FK for belongs_to, its activeRecordPrimaryKey for
      // has_one.
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
        // Rails `Association#find_target` via `reflection.association_scope_cache`
        // / `sc.execute(binds, c)`.
        result = await _loadSingularViaStatementCache(owner, assocName, reflection, targetModel);
      } else {
        // Rails' `scope.to_a` arm: AssociationScope builds the macro-specific WHERE
        // (scalar, composite, `:as`, STI, polymorphic) for both macros, and adds
        // LIMIT 1 because `reflection.isCollection()` is false.
        const built = _builtAssociationScope(owner, assocName, reflection, targetModel);
        const baseRelation = _scopeForAssociation(targetModel);
        let rel = baseRelation.merge(built);
        rel = applyAssociationScope(rel, this.reflection.scope, owner, reflection.scope);
        // Rails returns the array and calls `Array#first` — no ORDER BY in SQL.
        // `take` (unordered LIMIT 1) matches; `first` would route through
        // `ordered_relation` and add one. See has_one_associations_test
        // `test_has_one_does_not_use_order_by`.
        result = await rel.take();
      }

      // Mirrors `Association#set_inverse_instance`: resolve via the reflection so
      // automatic_inverse_of wires the parent too.
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
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    // Rails yields the record in `build_record` before the save (block can
    // mutate persisted attributes) — singular_association.rb:68.
    const record = this.buildRecord(attributes, block);
    if (!record) return null;
    // Match Rails' `SingularAssociation#_create_record` ordering: save first,
    // then `set_new_record`. The FK / polymorphic-type columns are already on
    // the built record via `buildRecord` → `initializeAttributes`
    // (scope_for_create), so the INSERT carries the owner reference without the
    // pre-save `setNewRecord`. For belongs_to this matters: `set_new_record`
    // copies the just-saved record's id into the owner's FK, so it must run
    // after `save` to see a non-nil id.
    let saved = true;
    if (typeof (record as any).save === "function") {
      saved = await (record as any).save();
    }
    // `set_new_record` → `replace` runs `remove_target!` before
    // `self.target = record` (has_one_association.rb:69, 84).
    const removal = this.detachDisplacedOnBuild(record);
    if (removal) await removal;
    this.setNewRecord(record);
    if (!saved && raise) {
      throw new RecordInvalid(record);
    }
    return record;
  }

  // Overloaded because a subclass' `replace` can persist (has_one's, whose
  // Rails body opens a transaction and saves): the one-argument form this class
  // and belongs_to use reaches no DB I/O and stays synchronous, so the
  // synchronous `setNewRecord` / `writer` call sites here type as `void`.
  protected replace(record: Base | null): void;
  protected replace(record: Base | null, save: boolean): void | Promise<void>;
  protected replace(record: Base | null, _save = true): void | Promise<void> {
    if (record) {
      this.setInverseInstance(record);
    } else if (this.target) {
      this.removeInverseInstance(this.target);
    }
    this.target = record;
    this.loadedBang();
  }

  protected setNewRecord(record: Base): void {
    this.replace(record);
  }
}

/** @internal */
function scopeForCreate(assoc: SingularAssociation): Record<string, unknown> {
  return (assoc as any).scope?.()?.scopeForCreate?.() ?? {};
}

/**
 * has_one's polymorphic `:as` key guard: a composite FK is always rejected, and
 * a composite owner PK collapses to "id" when present (matching Rails'
 * `join_id_for`); otherwise it is rejected too.
 *
 * @internal
 */
function _validateHasOnePolymorphicKeys(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): void {
  if (!options.as) return;
  const ctor = record.constructor as typeof Base;
  const primaryKey = options.primaryKey ?? ctor.primaryKey;
  const foreignKeyColumns = ownerForeignKeyColumns(ctor, assocName, { ...options, primaryKey });
  const foreignKey: string | string[] =
    foreignKeyColumns.length === 1 ? foreignKeyColumns[0] : foreignKeyColumns;
  if (!Array.isArray(foreignKey) && !(Array.isArray(primaryKey) && !primaryKey.includes("id"))) {
    return;
  }
  // Route through the reflection's canonical checkValidityBang (Rails' single
  // raise site) so the error carries the Rails-faithful message; it is a no-op
  // for polymorphic `:as`, which Rails never allows a composite key on.
  routeThroughCheckValidity(ctor, assocName);
  throw new CompositePrimaryKeyMismatchError({
    activeRecord: ctor.name,
    name: assocName,
    primaryKey,
    foreignKey,
  });
}
