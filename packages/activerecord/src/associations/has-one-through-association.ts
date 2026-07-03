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
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
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
   * We only read the through proxy's in-memory `target`, never `loadTarget`
   * (async): when the through has no loaded target we `build`. This is exact
   * for a new owner (no PK → Rails could not query either) and for the
   * fresh `build`/`create` cases the tests exercise (no pre-existing join
   * row loaded); a persisted owner with an unloaded pre-existing join row
   * still reconciles on the deferred path.
   * @internal
   */
  private constructThroughRecordInMemory(record: Base, save: boolean): void {
    if (!((this.owner as any).isNewRecord?.() || !save)) return;

    ensureNotNested(this);
    const throughProxy = throughAssociation(this);
    if (!throughProxy) return;
    const attrs = constructJoinAttributes(this, record);
    let throughRecord = (throughProxy as { target?: Base | null }).target ?? null;
    if (throughRecord) {
      if ((throughRecord as any).isNewRecord?.()) {
        (throughRecord as any).assignAttributes?.(attrs);
      }
    } else {
      throughRecord = throughProxy.build?.(attrs) ?? null;
    }
    // trails gates the unconditional has_one autosave callback on
    // `options.autosave` (autosave-association.ts), so a join record with no
    // pending replace would never be written on owner.save. Rails persists it
    // via the through's has_one autosave (`save_has_one_association`); we
    // reproduce that by queueing the built/assigned join record on the through
    // association's own pending replace, which `flushPendingReplaces` runs on
    // the owner's next save (cascading to the join record's belongs_to source,
    // e.g. an unsaved `club`).
    if (
      throughRecord &&
      (throughRecord as any).isNewRecord?.() &&
      !(throughProxy as { _pendingReplace?: unknown })._pendingReplace
    ) {
      (throughProxy as { _pendingReplace?: unknown })._pendingReplace = {
        record: throughRecord,
        previousTarget: null,
      };
    }
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation — deferred DB flush.
   *
   * Called by autosave after owner.save(). Calls createThroughRecord which
   * creates/updates/destroys the join-model record as needed.
   */
  override async persistReplace(): Promise<void> {
    const pending = this._pendingReplace;
    if (!pending) return;
    // Clear before the first `await` — mirrors HasOneAssociation#persistReplace.
    // The new awaitable `writer` (inherited from HasOneAssociation) makes this
    // path reachable concurrently (`await writer(a); await writer(b)`); without
    // the early clear a second `replace` would mutate the shared `_pendingReplace`
    // object still captured by reference in this call's `pending`.
    this._pendingReplace = null;
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
