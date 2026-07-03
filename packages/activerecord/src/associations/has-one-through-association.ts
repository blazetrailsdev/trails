import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { HasOneAssociation, sameRecord } from "./has-one-association.js";
import {
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import {
  sourceReflection,
  staleStateImpl as throughStaleState,
  throughForeignKeyPresent,
  throughTargetScope,
} from "./through-association.js";

function safeKlass(refl: { klass?: unknown } | null | undefined): any {
  try {
    return refl?.klass ?? null;
  } catch {
    return null;
  }
}

/**
 * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation
 */
export class HasOneThroughAssociation extends HasOneAssociation {
  /**
   * A has_one_through persists its association through a join-model
   * build/create/update/destroy (`createThroughRecord`), not the direct
   * foreign-key save the base `HasOneAssociation` uses. The through target
   * therefore keeps its own deferred-replace queue (flushed post-commit by
   * `flushPendingReplaces` → `persistReplace`); the base has_one converged onto
   * the single `autosaveHasOne` path and no longer carries this.
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

  override reset(): void {
    super.reset();
    this._pendingReplace = null;
    this._pendingUnloadedThroughReconcile = false;
  }

  /**
   * The deferred (non-awaitable) property-setter / mass-assignment path. The
   * base `queueWrite` records a displaced record for the direct-FK autosave to
   * remove, but a through routes displacement through the join model
   * (`createThroughRecord` destroys the stale join), so we defer purely to
   * `replace` (which queues `_pendingReplace`).
   */
  override queueWrite(record: Base | null): void {
    this.replace(record);
  }

  /**
   * Mirrors Rails `HasOneThroughAssociation#replace` immediate persist to a
   * saved owner. The base `writer` saves the target's foreign key directly,
   * which is wrong for a through (persistence routes through the join model), so
   * we override to run the deferred `persistReplace` instead. For a new owner
   * persistence defers to the owner's next save (`flushPendingReplaces`).
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
   * Mirrors Rails' `ThroughAssociation#target_scope` override.
   * @internal
   */
  protected override targetScope(): unknown {
    return throughTargetScope(this, super["targetScope"]());
  }

  /**
   * Mirrors Rails' `ThroughAssociation#stale_state` — when the through
   * reflection is a `belongs_to`, the association goes stale as the owner's
   * through foreign key changes (e.g. `minivan.speedometer_id = …`).
   * @internal
   */
  protected override staleState(): unknown {
    const vals = throughStaleState(this);
    if (!vals) return null;
    return vals.length === 1 ? vals[0] : JSON.stringify(vals);
  }

  /**
   * Mirrors Rails' `ThroughAssociation#foreign_key_present?` — a
   * has_*_through is loadable for a *new* owner only when the through is a
   * `belongsTo` and every through foreign-key column is set on the owner
   * (e.g. an unpersisted `Cpk::BookWithOrderAgreements` whose `order` FK is
   * populated from an in-memory persisted order). Without this override the
   * base `foreignKeyPresent()` returns false, so `find_target?` refuses to
   * query and the reader nils out.
   * @internal
   */
  protected override foreignKeyPresent(): boolean {
    return throughForeignKeyPresent(this);
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation#replace
   *
   * Dispatches through createThroughRecord instead of setting a direct FK.
   * DB work is deferred via _pendingReplace and flushed by persistReplace.
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
      if (assigningAnother || mightNeedDelete || (record as any)?.hasChangesToSave?.()) {
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
    this.loadedBang();
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

    ensureNotNested(this);
    const throughProxy = throughAssociation(this);
    if (!throughProxy) return;
    const attrs = constructJoinAttributes(this, record);
    const throughRecord = (throughProxy as { target?: Base | null }).target ?? null;
    if (throughRecord) {
      if ((throughRecord as any).isNewRecord?.()) {
        (throughRecord as any).assignAttributes?.(attrs);
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
        (throughRecord as any).assignAttributes?.(attrs);
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
      throughProxy.build?.(attrs);
      if (!((this.owner as any).isNewRecord?.() ?? true)) {
        if (this._pendingReplace) {
          this._pendingReplace.record = record;
        } else {
          this._pendingReplace = { record, previousTarget: null };
        }
        // The just-built in-memory join record masks any UNLOADED pre-existing
        // DB row, so `persistReplace` must reset the proxy and re-read from the
        // DB. Only this branch needs that — the already-loaded reconcile keeps
        // the proxy's memoized target intact.
        this._pendingUnloadedThroughReconcile = true;
        // Suppress the general has_one autosave from independently persisting the
        // just-built join row (which would double-write against the existing DB
        // row): a truthy `_pendingReplace` marker on the through proxy makes
        // `autosaveHasOne` skip it. The through proxy is a plain has_one with no
        // `persistReplace`, so `flushPendingReplaces` never invokes the marker —
        // our `persistReplace` is the sole persister, regardless of the order
        // `flushPendingReplaces` visits associations.
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
   * (has_one_through_association.rb:15-42): build/update/destroy the join row
   * via `createThroughRecord`. It does NOT save the end record; that is the
   * `record.save` arm of Rails' `save_has_one_association`
   * (autosave_association.rb:503), which `autosaveHasOne` runs separately after
   * calling this (skipping only the through's foreign-key write, per
   * autosave_association.rb:489).
   *
   * `autosaveHasOne` calls this for every loaded through association during the
   * owner's save, replacing the post-commit `flushPendingReplaces` deferral for
   * the sync `build`/`create`-on-persisted-owner path: those queue
   * `_pendingReplace` in `replace`/`constructThroughRecordInMemory` (no `await`
   * is possible from the sync builder), and this flushes it inside the save. The
   * awaitable `writer` already persists on assignment (clearing the marker), so
   * this no-ops there; it also no-ops for a merely-cached target (no marker),
   * matching Rails, which creates the join only on assignment.
   */
  async persistThroughRecord(): Promise<void> {
    await this.persistReplace();
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation — deferred DB flush.
   *
   * Runs `createThroughRecord`, which creates/updates/destroys the join-model
   * record as needed. Reached two ways: the awaitable `writer` calls it inline
   * on assignment to a persisted owner (immediate persist), and
   * `persistThroughRecord` calls it from `autosaveHasOne` during the owner's
   * save for the sync `build`/`create` path that could not `await`.
   */
  async persistReplace(): Promise<void> {
    const pending = this._pendingReplace;
    // Clear before the first `await` — mirrors HasOneAssociation#persistReplace.
    // The new awaitable `writer` (inherited from HasOneAssociation) makes this
    // path reachable concurrently (`await writer(a); await writer(b)`); without
    // the early clear a second `replace` would mutate the shared `_pendingReplace`
    // object still captured by reference in this call's `pending`.
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
    // duck-typed `_pendingReplace`: the base `HasOneAssociation#reset` clears
    // only `_displacedRecord` (it never declares `_pendingReplace`, having
    // converged onto `_displacedRecord` + `autosaveHasOne`), so without this the
    // sentinel would linger and permanently make `autosaveHasOne` skip the
    // proxy — silently dropping any *later* independent write to
    // `owner.currentMembership` on this same instance. Runs before the `!pending`
    // early return so a reverted build (which nulls `this._pendingReplace`) can't
    // strand the sentinel either.
    if (this._pendingUnloadedThroughReconcile) {
      this._pendingUnloadedThroughReconcile = false;
      const tp = throughAssociation(this) as {
        reset?: () => void;
        _pendingReplace?: unknown;
      } | null;
      tp?.reset?.();
      if (tp) tp._pendingReplace = null;
    }
    if (!pending) return;
    await transaction(this, async () => {
      await createThroughRecord(this, pending.record, true);
    });
  }
}

/** @internal */
async function createThroughRecord(
  assoc: HasOneThroughAssociation,
  record: Base | null,
  save: boolean,
): Promise<Base | null> {
  ensureNotNested(assoc);

  const throughProxy = throughAssociation(assoc);
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
    // Mutability is enforced inside constructJoinAttributes — keep the
    // precondition in one place.
    const attrs = constructJoinAttributes(assoc, record);

    if (throughRecord) {
      if (throughRecord.isNewRecord?.()) {
        await throughRecord.assignAttributes?.(attrs);
      } else {
        await throughRecord.update?.(attrs);
      }
    } else if ((assoc.owner as any).isNewRecord?.() || !save) {
      throughProxy.build?.(attrs);
    } else {
      await throughProxy.create?.(attrs);
    }
  }
  return record;
}

/**
 * Wrap `block` in a transaction on the through-reflection's class. Falls
 * back to invoking the block directly when no through klass is available.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#transaction
 *
 * @internal
 */
function transaction<R>(
  assoc: HasOneThroughAssociation,
  block: (tx?: any) => Promise<R>,
): Promise<R | undefined> {
  const tr = throughReflection(assoc) as { klass?: unknown } | null;
  const klass = safeKlass(tr) as { transaction?: (...args: any[]) => any } | null;
  if (klass && typeof klass.transaction === "function") {
    return klass.transaction(block) as Promise<R | undefined>;
  }
  return block() as Promise<R | undefined>;
}

/**
 * Resolves the AssociationReflection for the `:through` join model.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#through_reflection
 *
 * @internal
 */
function throughReflection(assoc: HasOneThroughAssociation): unknown {
  // Resolve the rich reflection first — assoc.reflection is the
  // AssociationDefinition (no throughReflection getter), so we need
  // ThroughReflection#throughReflection from the registry.
  type Refl = {
    throughReflection?: Refl | null;
    isThroughReflection?: () => boolean;
  };
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => Refl | null };
  let refl: Refl | null =
    (ctor._reflectOnAssociation?.(assoc.reflection.name) as Refl | null)?.throughReflection ?? null;
  if (!refl) {
    const throughName = assoc.reflection.options.through;
    if (!throughName) return null;
    refl = ctor._reflectOnAssociation?.(throughName) ?? null;
  }
  while (refl?.isThroughReflection?.() && refl.throughReflection) {
    refl = refl.throughReflection;
  }
  return refl;
}

/**
 * Returns the live Association wrapper that owns the join model — i.e.,
 * `owner.association(throughReflection.name)`.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#through_association
 *
 * @internal
 */
function throughAssociation(assoc: HasOneThroughAssociation): any {
  const tr = throughReflection(assoc) as { name?: string } | null;
  if (!tr?.name) return null;
  return (assoc.owner as any).association?.(tr.name);
}

/**
 * Build the join-table attribute hash pairing `record` with the owner via
 * the source reflection's foreign key (or the source association name when
 * the join is composite-keyed). Used when constructing through records.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#construct_join_attributes
 *
 * @internal
 */
function constructJoinAttributes(
  assoc: HasOneThroughAssociation,
  ...records: Base[]
): Record<string, unknown> {
  ensureMutable(assoc);
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  if (!sourceRefl) return {};
  const reflKlass = safeKlass(refl);
  const assocPk =
    (typeof sourceRefl.associationPrimaryKeyFor === "function"
      ? sourceRefl.associationPrimaryKeyFor(reflKlass)
      : sourceRefl.associationPrimaryKey) ??
    sourceRefl.primaryKey ??
    "id";
  const pkArr: string[] = Array.isArray(assocPk) ? assocPk : [assocPk];
  // Mirrors Rails' `Array(association_primary_key) == reflection.klass.composite_query_constraints_list`.
  // For a single-PK join model this is `["id"] == ["id"]` → true, so the join
  // is expressed in association-form (`{ club: record }`) rather than by raw
  // FK value. That form carries the (possibly unsaved) source record itself, so
  // owner autosave cascades to persist it — the FK-value form would stamp a nil
  // id for a new source record.
  const compositeConstraints: string[] = reflKlass
    ? compositeQueryConstraintsList.call(reflKlass)
    : [];

  let joinAttributes: Record<string, unknown>;
  if (
    pkArr.length === compositeConstraints.length &&
    pkArr.every((k: string, i: number) => k === compositeConstraints[i]) &&
    !refl.options?.sourceType
  ) {
    joinAttributes = { [sourceRefl.name]: records.length === 1 ? records[0] : records };
  } else {
    const fk: string = sourceRefl.foreignKey ?? `${sourceRefl.name}_id`;
    const read = (r: any, k: string) => r._readAttribute?.(k) ?? r.readAttribute?.(k);
    const values = records.map((r: any) =>
      pkArr.length === 1 ? (read(r, pkArr[0]) ?? r.id) : pkArr.map((k: string) => read(r, k)),
    );
    joinAttributes = { [fk]: records.length === 1 ? values[0] : values };
  }

  if (refl.options?.sourceType) {
    const foreignType: string = sourceRefl.foreignType ?? `${sourceRefl.name}_type`;
    joinAttributes[foreignType] =
      records.length === 1 ? refl.options.sourceType : [refl.options.sourceType];
  }
  return joinAttributes;
}

/**
 * Throws when the source reflection is not a `belongsTo` — through
 * associations with a non-belongsTo source are read-only because mutating
 * the source side isn't well-defined.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#ensure_mutable
 *
 * @internal
 */
function ensureMutable(assoc: HasOneThroughAssociation): void {
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name);
  const sourceRefl = refl?.sourceReflection as
    | { isBelongsTo?: () => boolean; macro?: string }
    | undefined;
  const isBelongs = sourceRefl?.isBelongsTo?.() ?? sourceRefl?.macro === "belongsTo";
  if (!isBelongs) {
    throw new HasOneThroughCantAssociateThroughHasOneOrManyReflection(
      (assoc.owner.constructor as { name: string }).name,
      assoc.reflection.name,
    );
  }
}

/**
 * Throws when this through-association points at another through-association
 * (a "nested through"). Rails treats nested-through chains as read-only.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#ensure_not_nested
 *
 * @internal
 */
function ensureNotNested(assoc: HasOneThroughAssociation): void {
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) as {
    isNested?: () => boolean;
  } | null;
  if (refl?.isNested?.()) {
    throw new HasOneThroughNestedAssociationsAreReadonly(
      (assoc.owner.constructor as { name: string }).name,
      assoc.reflection.name,
    );
  }
}
