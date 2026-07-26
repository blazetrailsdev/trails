import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import {
  _builtAssociationScope,
  _findTargetReachable,
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
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import { routeThroughCheckValidity } from "./validate-through-reflection.js";
import { camelize, underscore } from "@blazetrails/activesupport";
import { strictLoadingViolationBang } from "../core.js";
import { RecordInvalid } from "../validations.js";

/**
 * Base class for has_one and belongs_to associations.
 *
 * Mirrors: ActiveRecord::Associations::SingularAssociation
 */
export class SingularAssociation extends Association {
  declare target: Base | null;

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

  build(attributes?: Record<string, unknown>, block?: (record: Base) => void): Base | null {
    const record = this.buildRecord(attributes);
    if (record) {
      // Rails yields the freshly built record before it's set as the new
      // target (`build_record(attributes, &block)`), so a passed block can
      // mutate persisted attributes (e.g. `build_bulb { |b| b.color = ... }`).
      if (block) block(record);
      this.setNewRecord(record);
    }
    return record;
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
 * Load a belongs_to association's target.
 *
 * Mirrors: ActiveRecord::Associations::SingularAssociation#find_target
 * (`singular_association.rb:47`), as specialized for belongs_to by
 * `BelongsToAssociation#find_target?` (`belongs_to_association.rb:124`) —
 * the reachability gate is `_findTargetReachable(..., "belongsTo")` below.
 *
 * It lives here rather than in `belongs-to-association.ts` because
 * `belongs_to_association.rb` defines no `find_target` of its own: Rails
 * inherits the singular one and specializes only the `find_target?` predicate.
 * Putting the loader under the belongs_to file would name a method Rails does
 * not declare there.
 *
 * @internal
 */
export async function findTarget(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  // Rails runs `reflection.check_validity!` in `Association#initialize`
  // (now mirrored in the `Association` constructor via
  // `validateReflectionValidity`), so a recursive/missing `inverse_of` already
  // surfaced at first access. No load-path recursion shim is needed here.

  // Check cached (inverse_of) first, then preloaded.
  // Even for cached/preloaded hits, wire inverseOf so the parent's association
  // cache points back to this child instance (mirrors Rails behavior).
  // For non-polymorphic associations, validate inverseOf before checking whether
  // the value is null: an invalid name must throw even when the cached value is
  // null (e.g. preloader stored null for a missing row), consistent with the
  // cache-miss path that validates before the FK/null short-circuit.
  // Read the loaded target off the singular holder (Rails' @target), with the
  // legacy mirror + preload fallback for direct-loader calls on undeclared
  // names. A loaded-nil target (null) is distinguished from "not loaded".
  const loaded = _loadedSingularTarget(record, assocName);
  if (loaded) {
    const cached = loaded.value;
    if (options.inverseOf && !options.polymorphic) {
      // Resolve target class from instance if available, otherwise from options.
      const targetModel =
        (cached?.constructor as typeof Base | undefined) ??
        resolveAssocClass(record, assocName, options.className ?? camelize(assocName));
      validateInverseOf(targetModel, assocName, options.inverseOf);
    }
    if (cached) {
      // Honor staleness (Rails' `stale_target?`): if the owner's FK changed so
      // it no longer points at the cached target, the cache is stale — fall
      // through to re-query. `_cacheSingularTarget` routes singular inverse
      // writes through `inversedFrom` (→ `replace_keys` → `loadedBang`), so the
      // holder's `isStaleTarget()` snapshot is now authoritative.
      const holder = record._associationInstances.get(assocName) as
        | { isStaleTarget?: () => boolean }
        | undefined;
      const stale = typeof holder?.isStaleTarget === "function" && holder.isStaleTarget();
      if (!stale) {
        const inverseName = _resolveInverseName(
          record.constructor as typeof Base,
          assocName,
          options,
        );
        if (inverseName) _wireInverseAssociation(record, cached, inverseName);
        return cached;
      }
    } else {
      return cached;
    }
  }

  // Strict loading check: this is a lazy load. Gated by `find_target?` — a
  // new-record owner without the FK present never reaches `find_target` and so
  // never raises (it falls through to the null-FK short-circuit below).
  if (
    _violatesStrictLoading(record, options) &&
    _findTargetReachable(record, assocName, options, "belongsTo")
  ) {
    strictLoadingViolationBang(record, assocName, {
      polymorphic: options.polymorphic,
      className: options.className,
    });
  }

  const ctor = record.constructor as typeof Base;
  const defaultFk = `${underscore(assocName)}_id`;

  // Polymorphic: use the _type column to determine the target model
  let targetModel: typeof Base;
  if (options.polymorphic) {
    const typeCol = options.foreignType ?? `${underscore(assocName)}_type`;
    const typeName = record._readAttribute(typeCol) as string | null;
    if (!typeName) return null;
    // Rails resolves a polymorphic belongs_to's target via the owner class's
    // polymorphic_class_for, which honors store_full_class_name and (when off)
    // namespace-relative compute_type — not a bare global registry lookup.
    targetModel = ctor.polymorphicClassFor(typeName);
  } else {
    const className = options.className ?? camelize(assocName);
    targetModel = resolveAssocClass(record, assocName, className);
  }

  if (options.inverseOf && !options.polymorphic) {
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }

  // Resolve foreign key and primary key (may be arrays for CPK).
  const foreignKey =
    options.foreignKey ??
    (options.queryConstraints
      ? options.queryConstraints
      : Array.isArray(targetModel.primaryKey) && !options.primaryKey
        ? targetModel.primaryKey.map((col: string) => `${underscore(assocName)}_${col}`)
        : defaultFk);
  const primaryKey = options.primaryKey ?? targetModel.primaryKey;

  // Route through AssociationScope when reflection is registered.
  // For polymorphic belongsTo, AssociationScope receives the
  // runtime-resolved klass; the reflection's own joinPrimaryKey
  // returns associationPrimaryKey (target's PK) and joinForeignKey
  // returns the owner-side FK, so the WHERE shape is identical to
  // the non-polymorphic case.
  const reflection = ctor._reflectOnAssociation?.(assocName);
  // Null-FK short-circuit: avoid a query when owner's FK column is null.
  // The check must read the SAME columns the eventual query uses —
  // reflection.joinForeignKey when routing through AssociationScope,
  // options-derived foreignKey otherwise. Reading from a different
  // column would silently return null while a real query would have
  // found the row (or vice versa).
  const fkColsForCheck = reflection
    ? Array.isArray(reflection.joinForeignKey)
      ? reflection.joinForeignKey
      : [reflection.joinForeignKey]
    : Array.isArray(foreignKey)
      ? foreignKey
      : [foreignKey];
  for (const fk of fkColsForCheck) {
    const v = record._readAttribute(fk);
    if (v === null || v === undefined) return null;
  }
  // The staleness key mirrors Rails' `stale_state`: the FK column(s), plus the
  // `foreign_type` for a polymorphic belongs_to
  // (belongs_to_polymorphic_association.rb:43-46), so a reassignment that keeps
  // the same id but changes the target class is still detected below.
  const staleCols = options.polymorphic
    ? [...fkColsForCheck, options.foreignType ?? `${underscore(assocName)}_type`]
    : fkColsForCheck;
  const staleSnapshot = staleCols.map((col) => record._readAttribute(col));

  let result: Base | null;
  if (reflection) {
    if (!_skipSingularStatementCache(reflection, targetModel, options)) {
      // Statement-cache path (Rails `Association#find_target` via
      // `reflection.association_scope_cache` / `sc.execute(binds, c)`).
      result = await _loadSingularViaStatementCache(record, assocName, reflection, targetModel);
    } else {
      const built = _builtAssociationScope(record, assocName, reflection, targetModel);
      const baseRelation = _scopeForAssociation(targetModel);
      let rel = baseRelation.merge(built);
      rel = applyAssociationScope(rel, options.scope, record, reflection.scope);
      // Rails' normal singular-load path (`Association#find_target` via the
      // statement cache) returns an array and calls `Array#first` — no ORDER BY
      // in SQL. `take` (unordered LIMIT 1) is the closest equivalent; `first`
      // would route through `ordered_relation` and add a spurious ORDER BY. See
      // has_one_associations_test `test_has_one_does_not_use_order_by`.
      result = await rel.take();
    }
  } else {
    // Inline fallback: no reflection registered.
    if (Array.isArray(foreignKey)) {
      const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey];
      if (pkCols.length !== foreignKey.length) {
        // Route through the reflection's canonical checkValidityBang (Rails'
        // single raise site) so the error carries the Rails-faithful message.
        routeThroughCheckValidity(ctor, assocName);
        // No reflection registered (lower-level test helper) — minimal guard.
        throw new CompositePrimaryKeyMismatchError({
          activeRecord: ctor.name,
          name: assocName,
          primaryKey: pkCols,
          foreignKey,
        });
      }
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.length; i++) {
        conditions[pkCols[i]] = record._readAttribute(foreignKey[i]);
      }
      result = await targetModel.findBy(conditions);
    } else {
      result = await targetModel.findBy({
        [primaryKey as string]: record._readAttribute(foreignKey),
      });
    }
  }

  // Rails' `find_target` is synchronous, so it never observes the owner's
  // foreign key change mid-load. Our loader awaits DB I/O: an in-flight reader
  // query (e.g. `node.parent` accessed but never awaited) can still be pending
  // when the caller synchronously reassigns the association
  // (`node.parent = other`) with a new FK. Once RFC 0063 made `save` genuinely
  // await the validation chain, that window widened enough for the stale query
  // to resolve mid-save and `syncToAssociationInstance` clobber the
  // freshly-assigned holder target with the old record — dropping the FK change
  // from `previousChanges`. If the owner's stale key moved off the snapshot we
  // queried, the fetched record is stale: leave the holder's newer target
  // intact and return it instead of the stale row.
  const fkMovedDuringLoad = staleCols.some(
    (col, i) => record._readAttribute(col) !== staleSnapshot[i],
  );
  if (fkMovedDuringLoad) {
    const holder = record._associationInstances.get(assocName) as
      | { isLoaded?: () => boolean; target?: Base | null }
      | undefined;
    if (holder?.isLoaded?.()) return holder.target ?? null;
  }

  // Set inverse_of: store reference back to the owner. Resolve via the
  // reflection so automatic_inverse_of also wires the parent — mirrors
  // ActiveRecord::Associations::Association#set_inverse_instance.
  if (result) {
    const inverseName = _resolveInverseName(ctor, assocName, options);
    if (inverseName) _wireInverseAssociation(record, result, inverseName);
  }

  syncToAssociationInstance(record, assocName, result);
  return result;
}
