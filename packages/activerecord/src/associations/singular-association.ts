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
  _loadedSingularTarget,
  _resolveInverseName,
  _scopeForAssociation,
  _skipSingularStatementCache,
  _violatesStrictLoading,
  _wireInverseAssociation,
  applyAssociationScope,
  resolveAssocClass,
  syncToAssociationInstance,
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
    this.replace(record);
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
    const record = this.buildRecord(attributes);
    // Rails yields the freshly built record before it's set as the new target
    // (`build_record(attributes, &block)`), so a passed block can mutate
    // persisted attributes (e.g. `build_bulb { |b| b.color = ... }`).
    if (record && block) block(record);
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
      if (this._isStrictOnOwner()) {
        strictLoadingViolationBang(this.owner, this.reflection.name, {
          polymorphic: this.reflection.options?.polymorphic,
          className: this.reflection.options?.className,
        });
      }
      // Rails loads synchronously; Node.js requires async I/O. The union
      // return type now forces callers to `await` — TypeScript enforces it
      // instead of the old `as unknown as Base | null` lie. The only cast
      // narrows loadTarget's `Base | Base[] | null` to the singular shape.
      return this.loadTarget() as Promise<Base | null>;
    }
    return this.target;
  }

  private _isStrictOnOwner(): boolean {
    const owner = this.owner as any;
    return Boolean(owner._strictLoading) && !owner._strictLoadingBypassCount;
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
   * The query itself lives in the functional loader below, which the reader
   * sugar and the through loaders reach without an association instance; that
   * owner/name/options triple is a trails-only calling convention, not Rails
   * surface.
   */
  protected override async findTarget(): Promise<Base | null> {
    // The loader's tail writeback lands in this holder mid-await, so a target
    // replaced while the query is in flight would be silently clobbered:
    // suppress the loader's own writeback and let `setTarget` refuse the race.
    // #4919 already guards a mid-load *FK* change for belongs_to; this also
    // covers a same-FK reassignment that leaves the FK put, which the
    // stale-key check cannot see. See `Association#_loaderWritebackSuppressed`.
    this._loaderWritebackSuppressed++;
    try {
      return await findTarget(this.owner, this.reflection.name, this.reflection.options);
    } finally {
      this._loaderWritebackSuppressed--;
    }
  }

  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    shouldRaise = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    const record = this.buildRecord(attributes);
    if (!record) return null;
    // Rails yields the record in `build_record` before the save (block can
    // mutate persisted attributes).
    if (block) block(record);
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
    if (!saved && shouldRaise) {
      throw new RecordInvalid(record);
    }
    return record;
  }

  protected replace(record: Base | null): void {
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
 * belongs_to's cached-target read. Unlike has_one it validates `inverse_of`
 * even on a cached hit, and honors `stale_target?` so a reassigned foreign key
 * re-queries.
 *
 * Rails has no counterpart: it caches the target on the association instance,
 * so `find_target` is only ever reached on a miss.
 *
 * @internal
 */
function _belongsToCachedHit(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): { hit: boolean; value: Base | null } {
  const loaded = _loadedSingularTarget(record, assocName);
  if (!loaded) return { hit: false, value: null };
  const cached = loaded.value;

  // Validate inverseOf before the null check: an invalid name must throw even
  // when the cached value is null (e.g. the preloader stored null for a missing
  // row), consistent with the cache-miss path.
  if (options.inverseOf && !options.polymorphic) {
    const targetModel =
      (cached?.constructor as typeof Base | undefined) ??
      resolveAssocClass(record, assocName, options.className ?? camelize(assocName));
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }
  if (!cached) return { hit: true, value: null };

  // `_cacheSingularTarget` routes singular inverse writes through
  // `inversedFrom` (→ `replace_keys` → `loadedBang`), so the holder's
  // `isStaleTarget()` snapshot is authoritative.
  const holder = record._associationInstances.get(assocName) as
    | { isStaleTarget?: () => boolean }
    | undefined;
  if (typeof holder?.isStaleTarget === "function" && holder.isStaleTarget()) {
    return { hit: false, value: null };
  }

  const inverseName = _resolveInverseName(record.constructor as typeof Base, assocName, options);
  if (inverseName) _wireInverseAssociation(record, cached, inverseName);
  return { hit: true, value: cached };
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

/**
 * Loads a singular association's target.
 *
 * Mirrors: ActiveRecord::Associations::SingularAssociation#find_target
 * (`singular_association.rb:47`), which delegates the query itself to
 * `Association#find_target` (`association.rb`) and takes `Array#first` of the
 * loaded rows. Like Rails, which builds an `Association` from a validated
 * reflection (`association.rb:41-45`), a name the model never declared raises
 * `AssociationNotFoundError` (`associations.rb:56`) before any load runs.
 *
 * One body serves belongs_to and has_one, as in Rails, because the macro
 * difference lives in the scope the reflection builds — `_builtAssociationScope`
 * below is reached identically for both. `BelongsToAssociation` overrides only
 * the `find_target?` predicate (`belongs_to_association.rb:124-126`), never
 * `find_target`, which is why there is no belongs_to override here either.
 *
 * The macro-conditional steps are the ones Rails has no counterpart for: the
 * cached-target read (trails caches on the owner, Rails on the association
 * instance) and the has_one `:through` routing. They are named helpers rather
 * than inline branches so this body keeps the shape of Rails'.
 *
 * @internal
 */
export async function findTarget(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  const ctor = record.constructor as typeof Base;
  const reflection = ctor._reflectOnAssociation?.(assocName);
  if (!reflection) throw new AssociationNotFoundError(record, assocName);
  const isBelongsTo = reflection.macro === "belongsTo";

  if (options.through) {
    validateThroughReflection(ctor, assocName);
  }

  // Rails runs `reflection.check_validity!` in `Association#initialize`
  // (mirrored in the `Association` constructor via
  // `validateReflectionValidity`), so a recursive/missing `inverse_of` has
  // already surfaced by now — no load-path recursion shim is needed.
  if (isBelongsTo) {
    const cached = _belongsToCachedHit(record, assocName, options);
    if (cached.hit) return cached.value;
  } else {
    const loaded = _loadedSingularTarget(record, assocName);
    if (loaded) return loaded.value;
  }

  // Rails `Association#find_target`'s first statement. Gated by `find_target?`:
  // a new-record owner without the key present never reaches `find_target` and
  // so never raises.
  if (
    _violatesStrictLoading(record, options) &&
    _findTargetReachable(record, assocName, options, isBelongsTo ? "belongsTo" : "foreign")
  ) {
    strictLoadingViolationBang(record, assocName, {
      polymorphic: isBelongsTo ? options.polymorphic : undefined,
      className: options.className,
    });
  }

  // has_one :through. Rails expresses `:through` inside the scope chain; trails
  // still routes the shapes AssociationScope cannot build through the two-step
  // `HasOneThroughAssociation#findTarget`.
  if (!isBelongsTo && options.through) {
    if (_canRouteThroughViaDisableJoinsAssociationScope(reflection, options)) {
      return _loadSingularThroughViaDisableJoinsScope(record, reflection, options);
    }
    if (!_routeThroughViaAssociationScope(record, reflection, options)) {
      const { findTarget: findThroughTarget } = await import("./has-one-through-association.js");
      return findThroughTarget(record, assocName, options);
    }
    // Otherwise fall through to the scope path below.
  }

  let targetModel: typeof Base;
  if (isBelongsTo && options.polymorphic) {
    const typeCol = options.foreignType ?? `${underscore(assocName)}_type`;
    const typeName = record._readAttribute(typeCol) as string | null;
    if (!typeName) return null;
    // Rails resolves a polymorphic belongs_to via the owner class's
    // polymorphic_class_for, honoring store_full_class_name and (when off)
    // namespace-relative compute_type — not a bare global registry lookup.
    targetModel = ctor.polymorphicClassFor(typeName);
  } else {
    targetModel = resolveAssocClass(record, assocName, options.className ?? camelize(assocName));
  }

  if (options.inverseOf && !(isBelongsTo && options.polymorphic)) {
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }

  if (!isBelongsTo) {
    _validateHasOnePolymorphicKeys(record, assocName, options);
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
    const v = record._readAttribute(col);
    if (v === null || v === undefined) return null;
  }

  // The staleness key mirrors Rails' `stale_state`: the FK column(s), plus
  // `foreign_type` for a polymorphic belongs_to
  // (belongs_to_polymorphic_association.rb:43-46), so a reassignment keeping the
  // same id but changing the target class is still detected after the await.
  const staleCols =
    isBelongsTo && options.polymorphic
      ? [...keyColsForCheck, options.foreignType ?? `${underscore(assocName)}_type`]
      : keyColsForCheck;
  const staleSnapshot: unknown[] = isBelongsTo
    ? staleCols.map((col: string) => record._readAttribute(col))
    : [];

  let result: Base | null;
  if (!_skipSingularStatementCache(reflection, targetModel, options)) {
    // Rails `Association#find_target` via `reflection.association_scope_cache`
    // / `sc.execute(binds, c)`.
    result = await _loadSingularViaStatementCache(record, assocName, reflection, targetModel);
  } else {
    // Rails' `scope.to_a` arm: AssociationScope builds the macro-specific WHERE
    // (scalar, composite, `:as`, STI, polymorphic) for both macros, and adds
    // LIMIT 1 because `reflection.isCollection()` is false.
    const built = _builtAssociationScope(record, assocName, reflection, targetModel);
    const baseRelation = _scopeForAssociation(targetModel);
    let rel = baseRelation.merge(built);
    rel = applyAssociationScope(rel, options.scope, record, reflection.scope);
    // Rails returns the array and calls `Array#first` — no ORDER BY in SQL.
    // `take` (unordered LIMIT 1) matches; `first` would route through
    // `ordered_relation` and add one. See has_one_associations_test
    // `test_has_one_does_not_use_order_by`.
    result = await rel.take();
  }

  // Rails' `find_target` is synchronous and never observes the owner's foreign
  // key changing mid-load. Ours awaits DB I/O: an in-flight reader query (e.g.
  // `node.parent` accessed but never awaited) can still be pending when the
  // caller reassigns the association with a new FK. Once RFC 0063 made `save`
  // genuinely await the validation chain, that window widened enough for the
  // stale query to resolve mid-save and clobber the freshly-assigned holder
  // target, dropping the FK change from `previousChanges`.
  if (
    isBelongsTo &&
    staleCols.some((col: string, i: number) => record._readAttribute(col) !== staleSnapshot[i])
  ) {
    const holder = record._associationInstances.get(assocName) as
      | { isLoaded?: () => boolean; target?: Base | null }
      | undefined;
    if (holder?.isLoaded?.()) return holder.target ?? null;
  }

  // Mirrors `Association#set_inverse_instance`: resolve via the reflection so
  // automatic_inverse_of wires the parent too.
  if (result) {
    const inverseName = _resolveInverseName(ctor, assocName, options);
    if (inverseName) _wireInverseAssociation(record, result, inverseName);
  }

  syncToAssociationInstance(record, assocName, result);
  return result;
}
