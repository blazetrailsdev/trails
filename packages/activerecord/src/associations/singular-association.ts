import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import {
  _builtAssociationScope,
  _canRouteThroughViaDisableJoinsAssociationScope,
  _findTargetReachable,
  _inlineOwnerKey,
  _inlinePolymorphicKeys,
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
  ownerReflectionForeignKey,
  resolveAssocClass,
  syncToAssociationInstance,
  validateInverseOf,
} from "../associations.js";
import { Association } from "./association.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import {
  routeThroughCheckValidity,
  validateThroughReflection,
} from "./validate-through-reflection.js";
import { polymorphicName } from "../inheritance.js";
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
 * Resolves which SingularAssociation subclass this load belongs to.
 *
 * Rails never needs this: `find_target` runs on an association instance whose
 * class already is `BelongsToAssociation` or `HasOneAssociation`. trails'
 * loader is a free function reached from several entry points, so the macro is
 * recovered from the reflection (or, for a declared-but-unreflected name, the
 * raw association definition). The options-shape fallback covers direct calls
 * for names that were never declared — `polymorphic`/`foreignType` are
 * belongs_to-only spellings, `as`/`through` has_one-only.
 *
 * @internal
 */
function _singularMacro(
  ctor: typeof Base,
  assocName: string,
  options: AssociationOptions,
): "belongsTo" | "hasOne" {
  const macro = ctor._reflectOnAssociation?.(assocName)?.macro;
  if (macro === "belongsTo" || macro === "hasOne") return macro;
  const defined = (ctor._associations ?? []).find(
    (a: AssociationDefinition) => a.name === assocName,
  )?.type;
  if (defined === "belongsTo" || defined === "hasOne") return defined;
  if (options.polymorphic || options.foreignType) return "belongsTo";
  return "hasOne";
}

/**
 * belongs_to's cached-target read. Unlike has_one it validates `inverse_of`
 * even on a cached hit, and honors `stale_target?` so a reassigned foreign key
 * re-queries.
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
  if (options.inverseOf && !options.polymorphic) {
    const targetModel =
      (cached?.constructor as typeof Base | undefined) ??
      resolveAssocClass(record, assocName, options.className ?? camelize(assocName));
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }
  if (!cached) return { hit: true, value: cached };
  // `_cacheSingularTarget` routes singular inverse writes through
  // `inversedFrom` (→ `replace_keys` → `loadedBang`), so the holder's
  // `isStaleTarget()` snapshot is authoritative.
  const holder = record._associationInstances.get(assocName) as
    | { isStaleTarget?: () => boolean }
    | undefined;
  const stale = typeof holder?.isStaleTarget === "function" && holder.isStaleTarget();
  if (stale) return { hit: false, value: null };
  const inverseName = _resolveInverseName(record.constructor as typeof Base, assocName, options);
  if (inverseName) _wireInverseAssociation(record, cached, inverseName);
  return { hit: true, value: cached };
}

/**
 * Owner-side and target-side key columns, as the macro spells them: belongs_to
 * holds the foreign key on the owner and matches the target's primary key;
 * has_one is the mirror image. Only the no-reflection fallback and the
 * null-key short-circuit consult these — with a reflection, `joinForeignKey`
 * supplies the same answer for both macros.
 *
 * @internal
 */
function _singularKeys(
  ctor: typeof Base,
  assocName: string,
  options: AssociationOptions,
  macro: "belongsTo" | "hasOne",
  targetModel: typeof Base,
): { foreignKey: string | string[]; primaryKey: string | string[] } {
  if (macro === "belongsTo") {
    const defaultFk = `${underscore(assocName)}_id`;
    return {
      foreignKey:
        options.foreignKey ??
        (options.queryConstraints
          ? options.queryConstraints
          : Array.isArray(targetModel.primaryKey) && !options.primaryKey
            ? targetModel.primaryKey.map((col: string) => `${underscore(assocName)}_${col}`)
            : defaultFk),
      primaryKey: options.primaryKey ?? targetModel.primaryKey,
    };
  }
  const primaryKey = options.primaryKey ?? ctor.primaryKey;
  // Prefer the rich reflection's foreign key so an STI subclass owner uses the
  // declaring class's column (see `ownerReflectionForeignKey`).
  const foreignKey = options.as
    ? (options.foreignKey ?? `${underscore(options.as)}_id`)
    : (options.foreignKey ??
      ownerReflectionForeignKey(ctor, assocName) ??
      (options.queryConstraints
        ? options.queryConstraints
        : Array.isArray(primaryKey)
          ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));
  return { foreignKey, primaryKey };
}

/**
 * The no-reflection load. Rails has no equivalent: `find_target` always runs
 * against a registered reflection. trails reaches this only for direct loader
 * calls naming an association the model never declared, so the WHERE clause is
 * rebuilt from `options` — which is the one place the two macros cannot share
 * code, the foreign key pointing opposite ways.
 *
 * @internal
 */
async function _inlineSingularTarget(
  record: Base,
  assocName: string,
  options: AssociationOptions,
  macro: "belongsTo" | "hasOne",
  targetModel: typeof Base,
  foreignKey: string | string[],
  primaryKey: string | string[],
): Promise<Base | null> {
  const ctor = record.constructor as typeof Base;

  if (macro === "belongsTo") {
    if (Array.isArray(foreignKey)) {
      const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey];
      if (pkCols.length !== foreignKey.length) {
        // Route through the reflection's canonical checkValidityBang (Rails'
        // single raise site) so the error carries the Rails-faithful message.
        routeThroughCheckValidity(ctor, assocName);
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
      return targetModel.findBy(conditions);
    }
    return targetModel.findBy({
      [primaryKey as string]: record._readAttribute(foreignKey),
    });
  }

  if (Array.isArray(foreignKey)) {
    const ownerKey = _inlineOwnerKey(ctor, options, primaryKey);
    const pkCols = Array.isArray(ownerKey) ? ownerKey : [ownerKey];
    if (pkCols.length !== foreignKey.length) {
      routeThroughCheckValidity(ctor, assocName);
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey: pkCols,
        foreignKey,
      });
    }
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < foreignKey.length; i++) {
      conditions[foreignKey[i]] = record._readAttribute(pkCols[i]);
    }
    return targetModel.findBy(conditions);
  }
  if (options.as) {
    const typeCol = `${underscore(options.as)}_type`;
    const { fkCols, ownerKeyCols } = _inlinePolymorphicKeys(ctor, options, primaryKey, foreignKey);
    const conditions: Record<string, unknown> = { [typeCol]: polymorphicName(ctor) };
    for (let i = 0; i < fkCols.length; i++) {
      conditions[fkCols[i]] = record._readAttribute(ownerKeyCols[i]);
    }
    return targetModel.findBy(conditions);
  }
  const ownerKey = _inlineOwnerKey(ctor, options, primaryKey);
  if (options.scope) {
    let rel = targetModel.all().where({ [foreignKey]: record._readAttribute(ownerKey as string) });
    rel = applyAssociationScope(rel, options.scope, record);
    return rel.take();
  }
  return targetModel.findBy({
    [foreignKey]: record._readAttribute(ownerKey as string),
  });
}

/**
 * Loads a singular association's target.
 *
 * Mirrors: ActiveRecord::Associations::SingularAssociation#find_target
 * (`singular_association.rb:47`), which delegates the query itself to
 * `Association#find_target` (`association.rb`) and takes `Array#first` of the
 * loaded rows.
 *
 * One body serves belongs_to and has_one, as in Rails, because the macro
 * difference lives in the scope the reflection builds — `_builtAssociationScope`
 * below is reached identically for both. `BelongsToAssociation` overrides only
 * the `find_target?` predicate (`belongs_to_association.rb:124-126`), never
 * `find_target`, which is why there is no belongs_to override here either.
 *
 * The macro-conditional steps are the ones Rails has no counterpart for: the
 * cached-target read (trails caches on the owner, Rails on the association
 * instance), the has_one `:through` routing, and the no-reflection fallback.
 * They are named helpers rather than inline branches so this body stays the
 * shape of Rails'.
 *
 * @internal
 */
export async function findTarget(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  const ctor = record.constructor as typeof Base;
  const macro = _singularMacro(ctor, assocName, options);
  const isBelongsTo = macro === "belongsTo";

  if (options.through) {
    validateThroughReflection(ctor, assocName);
  }

  // Rails runs `reflection.check_validity!` in `Association#initialize` (mirrored
  // in the `Association` constructor), so a recursive/missing `inverse_of` has
  // already surfaced by now — no load-path recursion shim is needed.
  if (isBelongsTo) {
    const cached = _belongsToCachedHit(record, assocName, options);
    if (cached.hit) return cached.value;
  } else {
    // Read the loaded target off the singular holder (Rails' @target), with the
    // legacy mirror + preload fallback for direct calls on undeclared names.
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
    const reflEarly = ctor._reflectOnAssociation?.(assocName);
    if (_canRouteThroughViaDisableJoinsAssociationScope(reflEarly, options)) {
      return _loadSingularThroughViaDisableJoinsScope(record, reflEarly, options);
    }
    if (!_routeThroughViaAssociationScope(record, reflEarly, options)) {
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

  const { foreignKey, primaryKey } = _singularKeys(ctor, assocName, options, macro, targetModel);

  if (!isBelongsTo && options.as) {
    // Polymorphic `:as` requires a scalar FK: a composite FK is always rejected,
    // and a composite owner PK collapses to "id" when present (matching Rails'
    // join_id_for). Route through the reflection's canonical checkValidityBang
    // (Rails' single raise site) so the error carries the Rails-faithful
    // message; it is a no-op for polymorphic `:as`, which Rails never allows a
    // composite key on.
    if (Array.isArray(foreignKey) || (Array.isArray(primaryKey) && !primaryKey.includes("id"))) {
      routeThroughCheckValidity(ctor, assocName);
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
  }

  const reflection = ctor._reflectOnAssociation?.(assocName);

  // Null-key short-circuit: read the SAME columns the eventual query reads, or
  // a mismatch silently returns null where a real query would have found the
  // row. With a reflection that is `joinForeignKey` on the owner-side chain
  // reflection for both macros; without one it is the macro's own key.
  const ownerSideReflection = _ownerChainReflection(reflection);
  const keyColsForCheck = ownerSideReflection
    ? Array.isArray(ownerSideReflection.joinForeignKey)
      ? ownerSideReflection.joinForeignKey
      : [ownerSideReflection.joinForeignKey]
    : isBelongsTo
      ? Array.isArray(foreignKey)
        ? foreignKey
        : [foreignKey]
      : Array.isArray(primaryKey)
        ? primaryKey
        : [primaryKey];
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
  if (reflection) {
    if (!_skipSingularStatementCache(reflection, targetModel, options)) {
      // Rails `Association#find_target` via `reflection.association_scope_cache`
      // / `sc.execute(binds, c)`.
      result = await _loadSingularViaStatementCache(record, assocName, reflection, targetModel);
    } else {
      // Rails' `scope.to_a` arm: AssociationScope builds the macro-specific
      // WHERE (scalar, composite, `:as`, STI, polymorphic) for both macros, and
      // adds LIMIT 1 because `reflection.isCollection()` is false.
      const built = _builtAssociationScope(record, assocName, reflection, targetModel);
      let rel = _scopeForAssociation(targetModel).merge(built);
      rel = applyAssociationScope(rel, options.scope, record, reflection.scope);
      // Rails returns the array and calls `Array#first` — no ORDER BY in SQL.
      // `take` (unordered LIMIT 1) matches; `first` would route through
      // `ordered_relation` and add one. See has_one_associations_test
      // `test_has_one_does_not_use_order_by`.
      result = await rel.take();
    }
  } else {
    result = await _inlineSingularTarget(
      record,
      assocName,
      options,
      macro,
      targetModel,
      foreignKey,
      primaryKey,
    );
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
