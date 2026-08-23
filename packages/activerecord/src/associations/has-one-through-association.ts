import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import { association, _buildAssociationInstance } from "./instance-methods.js";
import { camelize, underscore } from "@blazetrails/activesupport";
import { resolveAssocClass, _hmtNotFound } from "../associations.js";
import { HasOneAssociation, sameRecord } from "./has-one-association.js";
import { RecordInvalid } from "../validations.js";
import { ThroughAssociation, sourceReflection } from "./through-association.js";

/**
 * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation
 */
export class HasOneThroughAssociation extends HasOneAssociation {
  /**
   * Rails' `ThroughAssociation` / `HasOneThroughAssociation` instance methods,
   * installed onto the prototype at the bottom of this file (the trails mixin
   * idiom) so each is called on `this` with Rails' own argument list.
   *
   * @internal
   */
  declare createThroughRecord: (record: Base | null, save: boolean) => Promise<Base | null>;
  /** @internal */
  declare transaction: <R>(block: (tx?: any) => Promise<R>) => Promise<R | undefined>;
  /** @internal */
  declare throughReflection: () => unknown;
  /** @internal */
  declare throughAssociation: () => any;
  /** @internal */
  declare constructJoinAttributes: (...records: Base[]) => Record<string, unknown>;
  /** @internal */
  declare ensureMutable: () => void;
  /** @internal */
  declare ensureNotNested: () => void;

  /**
   * A has_one_through persists its association through a join-model
   * build/create/update/destroy (`createThroughRecord`), not the direct
   * foreign-key save the base `HasOneAssociation` uses, so it keeps its own
   * replace queue. Two roles survive, both Rails-faithful:
   *
   *   - **New owner** — Rails' `create_through_record` takes the
   *     `owner.new_record? || !save` arm and only *builds* the join record
   *     (has_one_through_association.rb:36-37); the row is written at the
   *     owner's first `save`. This marker carries that deferral.
   *   - **Sync `build`/`create` on a persisted owner** — the `!save` half of the
   *     same arm, reached from non-awaitable builders that cannot `await` the
   *     join-row reconcile; `autosaveHasOne` drains it via `persistReplace`
   *     inside the save.
   *
   * It is NOT a deferral for assignment to a persisted owner: `writer` runs
   * `persistReplace` inline (clearing the marker before it returns), mirroring
   * Rails' assignment-time `through_proxy.create` / `through_record.update`
   * (:30-40).
   */
  _pendingReplace: { record: Base | null; readonly previousTarget: Base | null } | null = null;

  /**
   * Set only when `constructThroughRecordInMemory` built a fresh join record on
   * a persisted owner whose pre-existing join row was UNLOADED (the else-branch
   * reconcile). It tells `persistReplace` to `reset()` the through proxy so its
   * `loadTarget` re-reads the join row from the DB — the freshly-built in-memory
   * record would otherwise mask an existing row and duplicate it. The already-
   * loaded reconcile (#4481) leaves this false so `persistReplace` keeps using
   * the proxy's memoized target (no forced re-query, no discarded mutations).
   */
  private _pendingUnloadedThroughReconcile = false;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /**
   * trails' two-step through loader: the join record is loaded first and drives
   * a second query, for the shapes AssociationScope cannot build a single JOIN
   * for. Rails has no counterpart — its `find_target` is always `scope.first` —
   * so this is not `find_target` itself but the arm
   * `SingularAssociation#findTarget` routes to when
   * `_routeThroughViaAssociationScope` says no.
   * @internal
   */
  protected loadHasOneThrough(): Promise<Base | null> {
    return loadHasOneThrough(this.owner, this.reflection.name, this.reflection.options);
  }

  override reset(): void {
    super.reset();
    this._pendingReplace = null;
    this._pendingUnloadedThroughReconcile = false;
  }

  /**
   * Mirrors Rails' `HasOneThroughAssociation#create_through_record`, which
   * loads the *through* proxy (`through_proxy.load_target`,
   * has_one_through_association.rb:15-19) — NOT the target join. The base
   * `HasOneAssociation` loads its own target for `build#{name}`, which for a
   * through would issue a `clubs` SELECT Rails never runs while skipping the
   * `memberships` SELECT it does. Override so the `build#{name}` accessor's
   * pre-build load (gated by Rails' `find_target?`, `findTargetNeeded`) reads
   * the through proxy, then `constructThroughRecordInMemory` reconciles
   * against the now-loaded join row (update-existing / build-when-absent),
   * exactly as Rails' `create_through_record` does.
   *
   * The name exists only because the base `HasOneAssociation` splits Rails'
   * inline `build_#{name}` target load into a `loadTargetForBuild` hook; both
   * the base hook and this override are `protected` (#5946), so neither counts
   * as public extra surface.
   *
   * @internal
   */
  protected override loadTargetForBuild(): Promise<unknown> {
    const throughProxy = this.throughAssociation() as {
      loadTarget?: () => unknown;
    } | null;
    return Promise.resolve(throughProxy?.loadTarget?.());
  }

  /**
   * Rails' `HasOneThroughAssociation#replace` (has_one_through_association.rb:9-13)
   * has NO `remove_target!` — displacing a through target is handled entirely by
   * `create_through_record` mutating the join row (update / destroy), never by
   * nullifying or destroying the *target* record's own foreign key (a through
   * target has no FK back to the owner). The base `HasOneAssociation` runs
   * `remove_target!` on the displaced target; inheriting that would wrongly
   * nullify/destroy the previously-associated end record. Override to a no-op so
   * the `build#{name}` / `create#{name}` accessors leave displacement to the
   * through's own `createThroughRecord` / `persistReplace`.
   *
   * Same shape as `loadTargetForBuild` above: Rails has no `remove_target!`
   * hook of this kind at all, and this override only neutralizes the base
   * class's. `protected` on both since #5946.
   *
   * @internal
   */
  protected override async detachDisplacedTarget(): Promise<void> {}

  /**
   * Runs the DB half of Rails' `create_through_record`
   * (has_one_through_association.rb:15-40) that our synchronous `replace`
   * cannot: `through_proxy.load_target` (:17) and the arm it selects. Rails
   * reaches it from `set_new_record` → `replace(record, false)` *after*
   * `build_record` + `record.save` (singular_association.rb:67-71), so the
   * load runs here, after `super`, never before — an invalid build must raise
   * before any join-model query, as it does in Rails.
   *
   * `save` is `false` on this path (`set_new_record`), so `createThroughRecord`
   * picks Rails' own branches: `update` an existing *persisted* join row inline
   * (:33), or merely `build` when absent (:36-37), leaving that row for the
   * owner's next save.
   *
   * Rails runs `set_new_record` BEFORE `raise RecordInvalid` (:69-70), so a
   * `create#{name}!` whose child fails validation still reconciles the join
   * row — `update` writes the unsaved record, blanking the join foreign key.
   * `super` raises from inside itself, hence the reconcile in the `catch`.
   */
  protected override async _createRecord(
    attributes?: Record<string, unknown>,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | null> {
    let record: Base | null;
    try {
      record = await super._createRecord(attributes, raise, block);
    } catch (error) {
      if (error instanceof RecordInvalid && this._pendingReplace) {
        await this.persistReplace(false);
      }
      throw error;
    }
    if (record && this._pendingReplace) {
      await this.persistReplace(false);
    }
    return record;
  }

  protected override setNewRecord(record: Base): void {
    this.replace(record, false);
  }

  /**
   * A through `build` displaces nothing: Rails'
   * `HasOneThroughAssociation#replace` has no `load_target`/`remove_target!`
   * (has_one_through_association.rb:15-42) — the join row, not the end record,
   * carries the association, and displacement is `createThroughRecord` /
   * `persistReplace`'s job. Same reason as `detachDisplacedTarget` above; this
   * also keeps `build`'s return synchronous for the through builders.
   *
   * @internal
   */
  protected override detachDisplacedOnBuild(): Promise<void> | null {
    return null;
  }

  /**
   * No load either: `HasOneThroughAssociation#replace` has no `load_target`
   * (has_one_through_association.rb:9-13) — Rails loads the *through* proxy
   * from `create_through_record` (:15-19), which our `build#{name}` accessor
   * drives via `loadTargetForBuild`. Building through `association(name).build`
   * must not issue that join-model SELECT here, so return null and keep the
   * synchronous return the through builders expect — Rails'
   * `association(:club).build` is synchronous
   * (has_one_through_associations_test.rb:60-70).
   *
   * @internal
   */
  protected override loadDisplacedForBuild(): Promise<unknown> | null {
    return null;
  }

  /**
   * No load and no removal, for the same reason as `loadDisplacedForBuild`
   * above: a through `replace` has no `load_target`, so a nested-attributes
   * build issues no target SELECT and detaches no displaced *end* record for a
   * has_one_through — so the writer has nothing to await.
   *
   * @internal
   */
  protected override displacementNeedsAwait(): boolean {
    return false;
  }

  /**
   * Mirrors Rails `HasOneThroughAssociation#replace` immediate persist to a
   * saved owner. The base `writer` saves the target's foreign key directly,
   * which is wrong for a through (persistence routes through the join model), so
   * we override to run `persistReplace` — the join-row create/update/destroy of
   * `create_through_record` (:15-40) — inline, before this returns. For a new
   * owner Rails takes the `owner.new_record?` build arm (:36-37), so persistence
   * defers to the owner's next save.
   */
  override writer(record: Base | null): void | Promise<void> {
    this.replace(record);
    if ((this.owner as { isPersisted?: () => boolean }).isPersisted?.() && this._pendingReplace) {
      return this.persistReplace();
    }
  }

  /**
   * Mirrors Rails' `delegate :source_reflection, to: :reflection`
   * (ThroughAssociation, mixed into HasOneThroughAssociation).
   */
  sourceReflection(): unknown {
    return sourceReflection(this);
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation#replace
   *
   * Dispatches through createThroughRecord instead of setting a direct FK.
   * This body is the in-memory half only; it records the join-row work as
   * `_pendingReplace` for `persistReplace` to carry out. On a *persisted*
   * owner that is not a deferral — `writer` drains the marker before it
   * returns, matching Rails' assignment-time `create_through_record`. Only the
   * new-owner / `save: false` build arms leave it for the owner's next save,
   * which is Rails' own shape (has_one_through_association.rb:33-37).
   *
   * @missingRailsCall create_through_record — PERMANENT: Verified per-site (RFC 0106):
   *   `create_through_record(record, save)`
   *   (has_one_through_association.rb:10-12) writes the join row, so it is async
   *   in trails. `replace` cannot be — it is reached from the synchronous
   *   `writer`/`setNewRecord` path that RFC 0087 requires to stay sync — so the
   *   body queues `_pendingReplace` and `persistReplace`/`autosaveHasOne` awaits
   *   `createThroughRecord` one frame later. Same sync-setter shortcoming as the
   *   `setX()` idiom.
   */
  protected override replace(record: Base | null, save = true): void {
    if (record) (this as any).raiseOnTypeMismatchBang(record);
    // Rails' `create_through_record` build/assign arms (`owner.new_record? ||
    // !save`) construct the join record in memory — no DB query. We run those
    // synchronously here and persist the built through via its own has_one
    // save on the owner's next `save` (`constructThroughRecordInMemory`), so
    // we must NOT also queue a deferred `createThroughRecord` on this
    // (has_one_through) association — that would double-write the join row.
    const inMemory = record != null && ((this.owner as any).isNewRecord?.() || !save);
    if (!inMemory) {
      const assigningAnother = !sameRecord(this.target, record);
      // When assigning nil to an unloaded association, the through record may
      // still exist in the DB. Schedule the pending replace so persistReplace
      // loads the through proxy and destroys it when present — matching Rails'
      // create_through_record(nil) which calls through_proxy.load_target first.
      const mightNeedDelete = record === null && !this.isLoaded();
      if (assigningAnother || mightNeedDelete || record?.hasChangesToSave === true) {
        if (save) {
          if (this._pendingReplace) {
            const wasAssignedAnother = !sameRecord(
              this._pendingReplace.previousTarget,
              this._pendingReplace.record,
            );
            if (wasAssignedAnother && sameRecord(record, this._pendingReplace.previousTarget)) {
              this._pendingReplace = null;
            } else {
              this._pendingReplace.record = record;
            }
          } else {
            this._pendingReplace = { record, previousTarget: this.target };
          }
        }
      }
    }
    this.target = record;
    if (record) this.constructThroughRecordInMemory(record, save);
  }

  /**
   * Rails' `create_through_record` builds the join record synchronously
   * inside `replace`. We otherwise defer that DB work to `persistReplace`
   * (TS writers are sync, DB ops async). But two of Rails' arms are pure
   * in-memory `build`/`assign_attributes` — no query — so we run them
   * eagerly here, matching Rails' `create_through_record`:
   *
   *   - `owner.new_record? || !save` → `through_proxy.build(attributes)`
   *     (the `!save` arm covers `build`/`create` on a *persisted* owner:
   *     `member.association(:club).build` / `create_club`).
   *   - an already-loaded *new* through record → `assign_attributes`.
   *
   * The persisted-through `update` and existing-through `create` arms are DB
   * writes and stay on the deferred `persistReplace` → `createThroughRecord`
   * path. This makes `owner.through` present (and `new_record?`) immediately
   * after `build`/assignment, and lets owner autosave persist the built
   * through record plus its source on the owner's next `save`.
   *
   * We only read the through proxy's in-memory `target` here, never `loadTarget`
   * (async). When that target is present and *persisted* — a persisted owner
   * that already has a loaded join row (e.g. `create_current_membership!` then
   * `build_club`) — we reconcile as Rails' `load_target` + `update` arm does:
   * `assign_attributes` in memory and defer the join-row `update` to
   * `createThroughRecord`, rather than building a duplicate.
   *
   * When there is no in-memory target we still `build` (so `owner.through` is
   * present and `new_record?` immediately). For a *new* owner that is exact —
   * no PK, so Rails' `load_target` could not query either. For a *persisted*
   * owner the through proxy may hide an UNLOADED pre-existing join row we cannot
   * see synchronously; Rails' `load_target` would query and `update` it. So we
   * additionally queue this association's own deferred `createThroughRecord`
   * (via `_pendingReplace`) and suppress the through proxy's autosave of the
   * just-built row — `persistReplace` then resets the proxy, re-reads the join
   * row from the DB, and reconciles (update existing / create when absent),
   * never inserting a duplicate. This makes `build`/`create` on a persisted
   * owner faithful whether the pre-existing join row was loaded or not.
   * @internal
   */
  private constructThroughRecordInMemory(record: Base, save: boolean): void {
    if (!((this.owner as any).isNewRecord?.() || !save)) return;

    this.ensureNotNested();
    const throughProxy = this.throughAssociation();
    if (!throughProxy) return;
    const attrs = this.constructJoinAttributes(record);
    const throughRecord = (throughProxy as { target?: Base | null }).target ?? null;
    if (throughRecord) {
      if ((throughRecord as any).isNewRecord?.()) {
        void (throughRecord as any).assignAttributes?.(attrs);
        // On a persisted owner, a prior build of an UNLOADED join row queued
        // this association's deferred reconcile (`_pendingReplace`, else-branch
        // below). `persistReplace` resets the through proxy and rebuilds attrs
        // from `pending.record`, so the freshly-assigned in-memory through
        // record is discarded — we must re-point the pending record at the
        // latest source too, or a repeated `build`/`create` before save would
        // silently revert to the earlier one (last build must win, as in Rails'
        // synchronous `through_record.update`). A *new* owner never queues this
        // (it persists via the through proxy), so the guard leaves it untouched.
        if (this._pendingReplace) this._pendingReplace.record = record;
      } else {
        // Persisted owner already has a (loaded) join row: Rails'
        // create_through_record runs `through_record.update(attributes)` on it
        // rather than building a duplicate. We assign the new source in memory
        // now (so the has_one_through source reads through immediately, e.g.
        // `member.club == new_club` after `build_club`) and queue this
        // association's own deferred `createThroughRecord`, which re-loads the
        // persisted join row and `update`s it on the owner's next save. That
        // deferred path — not the through proxy's `_pendingReplace` below —
        // owns the persistence here, so the built/new-record autosave arm is
        // skipped (throughRecord is not new) and no duplicate join is written.
        void (throughRecord as any).assignAttributes?.(attrs);
        // Repeated build/create before save must re-point `record` at the
        // latest source (mirrors the `_pendingReplace.record = record`
        // reassignment in `replace()`): Rails runs `through_record.update`
        // synchronously every call, so the last build wins. Leaving a stale
        // `record` here would make the deferred `createThroughRecord`
        // reconstruct attrs from an earlier club and silently revert the
        // in-memory assignment on save.
        // `previousTarget` is unread on this path: HasOneThroughAssociation's
        // persistReplace consumes only `pending.record` (the base class's
        // displaced-record nullify logic doesn't apply — the join row is
        // reconciled via `update`, not replaced), so `null` is inert here.
        if (this._pendingReplace) {
          this._pendingReplace.record = record;
        } else {
          this._pendingReplace = { record, previousTarget: null };
        }
      }
    } else {
      // Build the join record in memory on the through proxy so the owner's
      // through reads (`member.currentMembership`) present it synchronously,
      // matching Rails after `build`. For a *new* owner the built record's own
      // has_one autosave persists it (cascading to its belongs_to source, e.g.
      // an unsaved `club`) — no DB row can pre-exist. For a *persisted* owner the
      // through proxy may hide an UNLOADED pre-existing join row we cannot see on
      // this sync path: Rails' create_through_record calls `through_proxy.
      // load_target` first and `update`s that row rather than inserting a
      // duplicate. So queue this association's own deferred `createThroughRecord`,
      // whose `persistReplace` resets the through proxy and re-reads the join row
      // from the DB, then reconciles (update existing / create when absent).
      buildThroughProxyRecord(throughProxy, attrs);
      if (!((this.owner as any).isNewRecord?.() ?? true)) {
        if (this._pendingReplace) {
          this._pendingReplace.record = record;
        } else {
          this._pendingReplace = { record, previousTarget: null };
        }
        this._pendingUnloadedThroughReconcile = true;
        const tp = throughProxy as {
          _pendingReplace?: { record: Base | null; previousTarget: Base | null } | null;
        };
        if (tp._pendingReplace == null) {
          tp._pendingReplace = { record: null, previousTarget: null };
        }
      }
    }
  }

  /**
   * Persists ONLY the join-model side of the through — the deferred analog of
   * Rails' assignment-time `create_through_record`
   * (has_one_through_association.rb:15-42): runs `createThroughRecord`, which
   * builds/updates/destroys the join row. It does NOT save the end record; that
   * is the `record.save` arm of Rails' `save_has_one_association`
   * (autosave_association.rb:503), which `autosaveHasOne` runs separately after
   * calling this (skipping only the through's foreign-key write, per
   * autosave_association.rb:489).
   *
   * Reached two ways: the awaitable `writer` calls it inline on assignment to a
   * persisted owner (immediate persist), and `autosaveHasOne` calls it for every
   * loaded through association during the owner's save, which is what covers the
   * sync `build`/`create`-on-persisted-owner path: those queue `_pendingReplace`
   * in `replace`/`constructThroughRecordInMemory` and this flushes it inside the
   * save. It no-ops when the marker is already consumed (an awaited `writer`) or
   * absent (a merely-cached target), matching Rails, which creates the join only
   * on assignment.
   *
   * @noRailsEquivalent PERMANENT Rails does this DB work inline inside
   * `create_through_record`, reached from the SYNCHRONOUS `replace` /
   * `build_#{name}` / `create_#{name}` entry points. In JS those entry points
   * cannot `await`, so the DB half has to be a separately-callable method the
   * async save path drains — a language-level split with no Ruby counterpart to
   * name it after. Rails' own `create_through_record` is ported under that name
   * (the in-memory half); this is the DB half it cannot inline.
   */
  async persistReplace(save = true): Promise<void> {
    const pending = this._pendingReplace;
    this._pendingReplace = null;
    // Only when we built a fresh in-memory join record over an UNLOADED
    // pre-existing row (else-branch reconcile): reset the through proxy so
    // `createThroughRecord`'s `loadTarget` re-reads the join row from the DB
    // instead of returning the just-built record — otherwise it would mask the
    // existing row and insert a duplicate. Rails does this read via
    // `through_proxy.load_target`; we defer that async read to here. The already-
    // loaded reconcile (#4481) leaves the flag false so the proxy's memoized
    // target (and any independent in-memory mutations on it) survives, matching
    // Rails' `load_target` returning the same object on an already-loaded proxy.
    //
    // We also clear the suppression sentinel we set on the through proxy's
    // duck-typed `_pendingReplace`: the base `HasOneAssociation` never declares
    // `_pendingReplace` (its displacement removal runs inline, via
    // `detachDisplacedTarget`), so its `reset` does not clear it and without
    // this the
    // sentinel would linger and permanently make `autosaveHasOne` skip the
    // proxy — silently dropping any *later* independent write to
    // `owner.currentMembership` on this same instance. Runs before the `!pending`
    // early return so a reverted build (which nulls `this._pendingReplace`) can't
    // strand the sentinel either.
    if (this._pendingUnloadedThroughReconcile) {
      this._pendingUnloadedThroughReconcile = false;
      const tp = this.throughAssociation() as {
        reset?: () => void;
        _pendingReplace?: unknown;
      } | null;
      tp?.reset?.();
      if (tp) tp._pendingReplace = null;
    }
    if (!pending) return;
    await this.transaction(async () => {
      await this.createThroughRecord(pending.record, save);
    });
  }
}

/** @internal */
async function createThroughRecord(
  this: HasOneThroughAssociation,
  record: Base | null,
  save: boolean,
): Promise<Base | null> {
  this.ensureNotNested();

  const throughProxy = this.throughAssociation();
  if (!throughProxy) return null;

  let throughRecord = await throughProxy.loadTarget?.();

  if (throughRecord && throughRecord.isDestroyed?.()) {
    await throughProxy.reload?.();
    throughRecord = throughProxy.target ?? null;
  }

  if (throughRecord && !record) {
    await throughRecord.destroy?.();
    return null;
  }

  if (record) {
    const attrs = this.constructJoinAttributes(record);

    if (throughRecord) {
      if (throughRecord.isNewRecord?.()) {
        await throughRecord.assignAttributes?.(attrs);
      } else {
        await throughRecord.update?.(attrs);
      }
    } else if ((this.owner as any).isNewRecord?.() || !save) {
      buildThroughProxyRecord(throughProxy, attrs);
    } else {
      await throughProxy.create?.(attrs);
    }
  }
  return record;
}

/**
 * The body of `HasOneThroughAssociation#loadHasOneThrough` — trails' two-step
 * through loader, for the shapes AssociationScope cannot build a JOIN for.
 *
 * Mirrors: SingularAssociation#find_target as inherited by
 * HasOneThroughAssociation (has_one_through_association.rb).
 *
 * A has_many through step is loaded on a freshly built (uncached) holder: it
 * runs under the *through* association's own name and options, so it must not
 * disturb the owner's cached holder for that name.
 */
async function loadHasOneThrough(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = ctor._associations ?? [];
  const throughAssoc = associations.find((a) => a.name === options.through);
  if (!throughAssoc) {
    throw _hmtNotFound(ctor, assocName, options.through!);
  }

  let throughRecord: Base | null;
  if (throughAssoc.type === "hasOne") {
    throughRecord = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
  } else if (throughAssoc.type === "belongsTo") {
    throughRecord = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
  } else if (throughAssoc.type === "hasMany") {
    const throughHolder = _buildAssociationInstance.call(record, {
      name: throughAssoc.name,
      type: "hasMany",
      options: throughAssoc.options,
    }) as unknown as { findTarget(): Promise<Base[]> };
    const throughRecords = await throughHolder.findTarget();
    throughRecord = throughRecords[0] ?? null;
  } else {
    throughRecord = null;
  }

  if (!throughRecord) return null;

  const sourceName = options.source ?? assocName;
  const throughCtor = throughRecord.constructor as typeof Base;
  const throughAssociations: AssociationDefinition[] = throughCtor._associations ?? [];
  const sourceAssoc = throughAssociations.find((a) => a.name === sourceName);

  if (sourceAssoc) {
    if (sourceAssoc.type === "belongsTo") {
      return (await association.call(throughRecord, sourceName).loadTarget()) as Base | null;
    } else if (sourceAssoc.type === "hasOne") {
      return (await association.call(throughRecord, sourceName).loadTarget()) as Base | null;
    }
  }

  const className = options.className ?? camelize(sourceName);
  const targetFk = `${underscore(sourceName)}_id`;
  const fkValue = throughRecord._readAttribute(targetFk);
  if (fkValue === null || fkValue === undefined) return null;
  const targetModel = resolveAssocClass(throughRecord, sourceName, className);
  return targetModel.findBy({ [targetModel.primaryKey as string]: fkValue });
}

/**
 * Build the join record on the through proxy without its own `load_target` /
 * `remove_target!`: a has_one through proxy is itself a has_one association, and
 * Rails' `create_through_record` (has_one_through_association.rb:15-40) — not
 * `SingularAssociation#build` — owns the join row's displacement, loading the
 * proxy and updating/destroying the existing row. Letting the proxy's own build
 * query here would both duplicate that load and make this synchronous
 * reconstruction return a promise.
 *
 * Rails' `SingularAssociation#build` is `build_record` then `set_new_record`
 * (singular_association.rb:29-31), and only the second reaches `load_target` /
 * `remove_target!` (has_one_association.rb:59-69). Running the two halves
 * separately gets the in-memory result without either.
 *
 * @internal
 */
function buildThroughProxyRecord(throughProxy: any, attrs: Record<string, unknown>): void {
  const record = throughProxy.buildRecord?.(attrs);
  if (record) throughProxy.setNewRecord?.(record);
}

/**
 * Rails' `ThroughAssociation` / `HasOneThroughAssociation` instance methods.
 * Installed on the prototype (Ruby `include`) rather than passed a host
 * argument, so every call site reads exactly as the Ruby does.
 */
Object.assign(HasOneThroughAssociation.prototype, {
  createThroughRecord,
  ...ThroughAssociation,
});
