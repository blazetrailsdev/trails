import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { HasManyAssociation } from "./has-many-association.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import { raiseValidationError } from "../validations.js";
import { underscore, singularize, camelize } from "@blazetrails/activesupport";
import { resolveAssocClass } from "../associations.js";

function safeKlass(refl: { klass?: unknown } | null | undefined): any {
  try {
    return refl?.klass ?? null;
  } catch {
    return null;
  }
}

/**
 * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation
 */
export class HasManyThroughAssociation extends HasManyAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  // Rails uses scope.pluck(*reflection.association_primary_key) where `scope`
  // is a JOIN-aware AssociationScope relation.  Our `scope()` only builds a
  // direct-FK WHERE clause, which produces "no such column: target.owner_id"
  // for through/HABTM associations.  Load via doAsyncFindTarget (which
  // correctly uses the join-table path) and cache the PKs instead.
  override async idsReader(): Promise<unknown[]> {
    if (this.isLoaded()) {
      return this.target.map((r) => this.primaryKeyValue(r));
    }
    if (this._associationIds) return this._associationIds as unknown[];
    const records = await this.doAsyncFindTarget();
    this._associationIds = records.map((r) => this.primaryKeyValue(r));
    return this._associationIds as unknown[];
  }

  /**
   * Mirrors Rails' HasManyThroughAssociation#insert_record
   * (has_many_through_association.rb:24-34):
   *
   *   ensure_not_nested
   *   if record.new_record? || record.has_changes_to_save?
   *     return unless super
   *   end
   *   save_through_record(record)
   *   record
   *
   * Saves the target via `super` (HasManyAssociation#insertRecord — which
   * no-ops setOwnerAttributes for through and just calls `record.save`),
   * then creates/saves the join row via the through association.
   */
  override async insertRecord(record: Base, validate = true, raise = false): Promise<boolean> {
    ensureNotNested(this);
    const needsTargetSave =
      record.isNewRecord() ||
      (typeof (record as any).hasChangesToSave === "function" &&
        (record as any).hasChangesToSave());
    if (needsTargetSave) {
      const saved = await super.insertRecord(record, validate, raise);
      if (!saved) return false;
    }

    // HABTM: constructJoinAttributes relies on a sourceReflection chain that
    // isn't wired for habtm reflections.  Use a direct join-record path instead,
    // matching what CollectionProxy._pushThrough does.
    if ((this.reflection as any).type === "hasAndBelongsToMany") {
      return insertHabtmRecord(this, record, validate, raise);
    }

    // Regular has_many :through — build the join record via reflection.
    // buildThroughRecord always calls proxy.build() which returns a new unsaved
    // record, so isNewRecord() is always true here.  The check mirrors Rails'
    // save_through_record which calls record.changed? (always true for new records).
    const joinRecord = buildThroughRecord(this, record);
    if (joinRecord && (joinRecord.isNewRecord() || (joinRecord as any).hasChangesToSave?.())) {
      const saved = await (joinRecord as any).save({ validate });
      if (!saved) {
        if (raise) raiseValidationError(joinRecord);
        return false;
      }
    }
    return true;
  }
}

/** @internal */
function buildThroughRecord(assoc: HasManyThroughAssociation, record: Base): Base | null {
  // Mutability is enforced inside constructJoinAttributes — keep the
  // precondition in one place (Rails' build_through_record calls
  // ensure_mutable once; our equivalent inherits it via the helper).
  const proxy = throughAssociation(assoc) as {
    build?: (attrs: Record<string, unknown>) => Base;
  } | null;
  if (!proxy) return null;
  const attrs = constructJoinAttributes(assoc, record);
  return typeof proxy.build === "function" ? proxy.build(attrs) : null;
}

/** @internal */
async function insertHabtmRecord(
  assoc: HasManyThroughAssociation,
  record: Base,
  validate: boolean,
  raise: boolean,
): Promise<boolean> {
  const ctor = assoc.owner.constructor as any;
  const assocDef = assoc.reflection as any;
  const throughName = assocDef.options?.through as string | undefined;
  if (!throughName)
    throw new Error(`HABTM association '${assocDef.name}' on ${ctor.name} has no through name`);
  const associations: AssociationDefinition[] = ctor._associations ?? [];
  const throughAssocDef = associations.find((a: any) => a.name === throughName);
  if (!throughAssocDef)
    throw new Error(
      `HABTM association '${assocDef.name}' on ${ctor.name}: through association '${throughName}' not found`,
    );
  const throughClassName =
    throughAssocDef.options.className ?? `${ctor.name}::HABTM_${camelize(assocDef.name)}`;
  const throughModel = resolveAssocClass(assoc.owner, throughName, throughClassName);
  const ownerPk = throughAssocDef.options.primaryKey ?? ctor.primaryKey ?? "id";
  const ownerFk = throughAssocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`;
  const pkValue = (assoc.owner as any)._readAttribute?.(ownerPk) ?? (assoc.owner as any)[ownerPk];
  const sourceName = assocDef.options?.source ?? singularize(assocDef.name);
  const sourceFk = `${underscore(sourceName)}_id`;
  const targetPk = (record.constructor as any).primaryKey ?? "id";
  const joinAttrs: Record<string, unknown> = {
    [ownerFk as string]: pkValue,
    [sourceFk]: (record as any)._readAttribute?.(targetPk) ?? (record as any)[targetPk],
  };
  // Rails: new(record_to_save_attributes(record)).save(validate: validate)
  const joinRecord = new (throughModel as any)(joinAttrs);
  const saved = await joinRecord.save({ validate });
  if (!saved) {
    if (raise) throw new Error(`Failed to create join record for ${assocDef.name}`);
    return false;
  }
  return true;
}

/** @internal */
function throughScope(assoc: HasManyThroughAssociation): unknown {
  // through_scope is set externally by the association's concat/insert path.
  // Return the memoized scope if it was set; otherwise null.
  return (assoc as any)._throughScope ?? null;
}

/** @internal */
function throughScopeAttributes(assoc: HasManyThroughAssociation): Record<string, unknown> {
  // Extract WHERE conditions from the through scope for the through model's table.
  const throughName = assoc.reflection.options.through as string | undefined;
  if (!throughName) return {};
  const throughAssoc = (assoc.owner as any).association?.(throughName);
  if (!throughAssoc) return {};
  const scope: any = throughAssoc.scope?.();
  if (!scope || typeof scope.whereValuesHash !== "function") return {};
  const throughTable = (throughAssoc.klass as any)?.tableName ?? "";
  const attrs = scope.whereValuesHash(throughTable) as Record<string, unknown>;
  // Exclude the FK columns and the STI inheritance column.
  const throughFk = throughAssoc.reflection?.options?.foreignKey ?? "";
  const inheritanceCol = (throughAssoc.klass as any)?.inheritanceColumn ?? "type";
  for (const key of [String(throughFk), inheritanceCol]) {
    if (key in attrs) delete attrs[key];
  }
  return attrs;
}

/** @internal */
function saveThroughRecord(assoc: HasManyThroughAssociation, record: Base): Promise<boolean> {
  // Find and save the first unsaved through record for this target.
  const records = throughRecordsFor(assoc, record);
  const first = records[0];
  if (!first || (first as any).isDestroyed?.()) return Promise.resolve(true);
  if (typeof (first as any).save === "function") {
    return (first as any).save({ validate: true });
  }
  return Promise.resolve(true);
}

/** @internal */
function removeRecords(
  assoc: HasManyThroughAssociation,
  _existingRecords: Base[],
  records: Base[],
  _method: string,
): Promise<void> {
  return (assoc as any).delete?.(...records) ?? Promise.resolve();
}

/** @internal */
function isTargetReflectionHasAssociatedRecord(assoc: HasManyThroughAssociation): boolean {
  const throughRefl = assoc.reflection.options.through;
  if (!throughRefl) return false;
  const throughAssoc = (assoc.owner as any).association?.(throughRefl);
  if (!throughAssoc) return false;
  const fk = throughAssoc.reflection?.foreignKey;
  if (!fk) return true;
  return !!(assoc.owner as any).readAttribute?.(fk as string);
}

/** @internal */
function isUpdateThroughCounter(assoc: HasManyThroughAssociation, method: string): boolean {
  return method !== "destroy" && (assoc as any)._isUpdateThroughCounter?.(method) !== false;
}

/** @internal */
function deleteOrNullifyAllRecords(
  assoc: HasManyThroughAssociation,
  method: string,
): Promise<void> {
  return (assoc as any).deleteAll?.(method) ?? Promise.resolve();
}

/** @internal */
function deleteRecords(
  assoc: HasManyThroughAssociation,
  records: Base[],
  method: string,
): Promise<void> {
  return (assoc as any).delete?.(...records) ?? Promise.resolve();
}

/** @internal */
function difference(_assoc: HasManyThroughAssociation, a: Base[], b: Base[]): Base[] {
  return a.filter((r) => !b.includes(r));
}

/** @internal */
function intersection(_assoc: HasManyThroughAssociation, a: Base[], b: Base[]): Base[] {
  return a.filter((r) => b.includes(r));
}

/** @internal */
function markOccurrence(
  _assoc: HasManyThroughAssociation,
  distribution: Map<Base, number>,
  record: Base,
): boolean {
  const count = distribution.get(record) ?? 0;
  if (count > 0) {
    distribution.set(record, count - 1);
    return true;
  }
  return false;
}

/** @internal */
function distribution(_assoc: HasManyThroughAssociation, array: Base[]): Map<Base, number> {
  const result = new Map<Base, number>();
  for (const r of array) result.set(r, (result.get(r) ?? 0) + 1);
  return result;
}

/** @internal */
function throughRecordsFor(assoc: HasManyThroughAssociation, record: Base): Base[] {
  const throughName = assoc.reflection.options.through as string | undefined;
  if (!throughName) return [];
  const throughAssoc = (assoc.owner as any).association?.(throughName);
  if (!throughAssoc) return [];

  // Use constructJoinAttributes to get the FK → PK map for this record,
  // then filter the through-association's in-memory target by those constraints.
  const joinAttrs = constructJoinAttributes(assoc, record);
  const candidates: Base[] = Array.isArray(throughAssoc.target)
    ? throughAssoc.target
    : throughAssoc.target
      ? [throughAssoc.target]
      : [];
  return candidates.filter((c) =>
    Object.entries(joinAttrs).every(([fk, val]) => {
      const actual =
        typeof (c as any).readAttribute === "function"
          ? (c as any).readAttribute(fk)
          : (c as any)[fk];
      return actual === val;
    }),
  );
}

/** @internal */
function deleteThroughRecords(assoc: HasManyThroughAssociation, records: Base[]): Promise<void> {
  // Mirrors Rails delete_through_records: remove through join-model records.
  const throughName = assoc.reflection.options.through as string | undefined;
  if (!throughName) return Promise.resolve();
  const throughAssoc = (assoc.owner as any).association?.(throughName);
  if (!throughAssoc) return Promise.resolve();
  for (const record of records) {
    const toDelete = throughRecordsFor(assoc, record);
    if (Array.isArray(throughAssoc.target)) {
      for (const r of toDelete) {
        const idx = (throughAssoc.target as Base[]).indexOf(r);
        if (idx !== -1) (throughAssoc.target as Base[]).splice(idx, 1);
      }
    } else if (toDelete.length > 0 && throughAssoc.target === toDelete[0]) {
      throughAssoc.target = null;
    }
  }
  return Promise.resolve();
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
  assoc: HasManyThroughAssociation,
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
function throughReflection(assoc: HasManyThroughAssociation): unknown {
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
 * Returns the live Association wrapper that owns the join model — i.e.,
 * `owner.association(throughReflection.name)`.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#through_association
 *
 * @internal
 */
function throughAssociation(assoc: HasManyThroughAssociation): unknown {
  const tr = throughReflection(assoc) as { name?: string } | null;
  if (!tr?.name) return null;
  return (assoc.owner as unknown as { association?: (n: string) => unknown }).association?.(
    tr.name,
  );
}

/**
 * Build the join-table attribute hash that pairs `records` with the owner
 * via the source reflection's foreign key (or the source association name
 * when the join is composite-keyed). Used when constructing through
 * records.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#construct_join_attributes
 *
 * @internal
 */
function constructJoinAttributes(
  assoc: HasManyThroughAssociation,
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
 * Throws when the source reflection is not a `belongsTo` — Rails treats
 * such through associations as read-only because mutating the source side
 * isn't well-defined.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#ensure_mutable
 *
 * @internal
 */
function ensureMutable(assoc: HasManyThroughAssociation): void {
  // HABTM associations are always mutable: the join model's right side is an
  // implicit belongsTo, but our habtm reflection doesn't expose that chain.
  // Rails reaches the same conclusion via source_reflection.belongs_to?.
  if ((assoc.reflection as any).type === "hasAndBelongsToMany") return;

  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name);
  const sourceRefl = refl?.sourceReflection as
    | { isBelongsTo?: () => boolean; macro?: string }
    | undefined;
  const isBelongs = sourceRefl?.isBelongsTo?.() ?? sourceRefl?.macro === "belongsTo";
  if (!isBelongs) {
    throw new HasManyThroughCantAssociateThroughHasOneOrManyReflection(
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
function ensureNotNested(assoc: HasManyThroughAssociation): void {
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) as {
    isNested?: () => boolean;
  } | null;
  if (refl?.isNested?.()) {
    throw new HasManyThroughNestedAssociationsAreReadonly(
      (assoc.owner.constructor as { name: string }).name,
      assoc.reflection.name,
    );
  }
}
