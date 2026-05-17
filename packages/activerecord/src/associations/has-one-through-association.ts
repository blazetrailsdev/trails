import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { HasOneAssociation } from "./has-one-association.js";
import {
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { queryConstraintsList } from "../persistence.js";
import { throughTargetScope } from "./through-association.js";

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
   * Mirrors Rails' `ThroughAssociation#target_scope` override.
   * @internal
   */
  protected override targetScope(): unknown {
    return throughTargetScope(this, super["targetScope"]());
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation#replace
   *
   * Dispatches through createThroughRecord instead of setting a direct FK.
   * DB work is deferred via _pendingReplace and flushed by persistReplace.
   */
  protected override replace(record: Base | null, save = true): void {
    if (record) (this as any).raiseOnTypeMismatchBang(record);
    const assigningAnother = this.target !== record;
    if (assigningAnother || (record as any)?.hasChangesToSave?.()) {
      if (save) {
        // Store pending regardless of owner.isPersisted() — for new owners,
        // persistReplace runs after owner.save() when owner is now persisted.
        if (this._pendingReplace) {
          const wasAssignedAnother =
            this._pendingReplace.previousTarget !== this._pendingReplace.record;
          if (wasAssignedAnother && record === this._pendingReplace.previousTarget) {
            this._pendingReplace = null;
          } else {
            this._pendingReplace.record = record;
          }
        } else {
          this._pendingReplace = { record, previousTarget: this.target };
        }
      }
    }
    this.target = record;
    this.loadedBang();
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
    await transaction(this, async () => {
      await createThroughRecord(this, pending.record, true);
    });
    this._pendingReplace = null;
  }
}

/** @internal */
async function createThroughRecord(
  assoc: HasOneThroughAssociation,
  record: Base | null,
  save: boolean,
): Promise<Base | null> {
  ensureNotNested(assoc);

  const throughName = assoc.reflection.options.through as string | undefined;
  if (!throughName) return null;
  const throughProxy = (assoc.owner as any).association?.(throughName);
  if (!throughProxy) return null;

  let throughRecord = await throughProxy.loadTarget?.();

  if (throughRecord && (throughRecord as any).isDestroyed?.()) {
    await throughProxy.reload?.();
    throughRecord = (throughProxy as any).target ?? null;
  }

  if (throughRecord && !record) {
    await (throughRecord as any).destroy?.();
    return null;
  }

  if (record) {
    // Mutability is enforced inside constructJoinAttributes — keep the
    // precondition in one place.
    const attrs = constructJoinAttributes(assoc, record);

    if (throughRecord) {
      if ((throughRecord as any).isNewRecord?.()) {
        await (throughRecord as any).assignAttributes?.(attrs);
      } else {
        await (throughRecord as any).update?.(attrs);
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
    const throughName = assoc.reflection.options.through as string | undefined;
    if (!throughName) return null;
    refl = ctor._reflectOnAssociation?.(throughName) ?? null;
  }
  while (refl?.isThroughReflection?.() && refl.throughReflection) {
    refl = refl.throughReflection;
  }
  return refl;
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
  const sourceRefl = refl?.sourceReflection as any;
  if (!sourceRefl) return {};
  const reflKlass = safeKlass(refl);
  const assocPk =
    (typeof sourceRefl.associationPrimaryKeyFor === "function"
      ? sourceRefl.associationPrimaryKeyFor(reflKlass)
      : sourceRefl.associationPrimaryKey) ??
    sourceRefl.primaryKey ??
    "id";
  const pkArr: string[] = Array.isArray(assocPk) ? assocPk : [assocPk];
  // compositeQueryConstraintsList falls back to the PK for simple string PKs, which would
  // incorrectly trigger the "pass object" branch. queryConstraintsList returns null for
  // simple single-PK models (avoiding that branch) and the composite PK for CPK models.
  const queryConstraints: string[] | null = reflKlass ? queryConstraintsList.call(reflKlass) : null;
  const compositeConstraints: string[] = queryConstraints ?? [];

  let joinAttributes: Record<string, unknown>;
  if (
    queryConstraints &&
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
