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
import { throughTargetScope } from "./through-association.js";

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

  /**
   * Mirrors Rails' `HasManyThroughAssociation#concat_records`
   * (has_many_through_association.rb:37-49):
   *
   *   ensure_not_nested
   *   records = super(records, true)
   *   if owner.new_record? && records
   *     records.flatten.each { |record| build_through_record(record) }
   *   end
   *   records
   *
   * When the owner is unsaved, `super` only adds the targets to the in-memory
   * collection (no INSERT). Pre-building the through rows here primes the
   * `@through_records` cache so the owner's `after_create` autosave creates
   * the join rows alongside the owner.
   * @internal
   */
  protected override async concatRecords(records: Base[], _shouldRaise = false): Promise<Base[]> {
    ensureNotNested(this);
    const added = await super.concatRecords(records, true);
    if (this.owner.isNewRecord() && added) {
      for (const record of added.flat() as Base[]) {
        buildThroughRecord(this, record);
      }
    }
    return added;
  }

  /**
   * Mirrors the `build_through_record` loop that
   * `HasManyThroughAssociation#concat_records` runs for a new owner. Reached
   * from `CollectionAssociation#replace` so array-assignment forms
   * (`category.authors = [author]`, `Category.new(authors: [...])`) build the
   * through join rows in memory before the owner is saved.
   * @internal
   */
  protected override buildThroughRecordsInMemory(records: Base[]): void {
    for (const record of records) {
      buildThroughRecord(this, record);
    }
  }

  /**
   * Mirrors Rails' `ThroughAssociation#target_scope` override.
   * @internal
   */
  protected override targetScope(): unknown {
    return throughTargetScope(this, super["targetScope"]());
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
    // Rails' two-step: super.insert_record (above) saves the target; then
    // save_through_record builds + saves the join row via the through proxy.
    return saveThroughRecord(this, record, validate, raise);
  }

  /**
   * Mirrors Rails' HasManyThroughAssociation#build_record
   * (has_many_through_association.rb:90-114):
   *
   *   ensure_not_nested
   *   @through_scope = scope
   *   record = super
   *   inverse = source_reflection.polymorphic? ?
   *     source_reflection.polymorphic_inverse_of(record.class) :
   *     source_reflection.inverse_of
   *   if inverse
   *     if inverse.collection?
   *       record.send(inverse.name) << build_through_record(record)
   *     elsif inverse.has_one?
   *       record.send("#{inverse.name}=", build_through_record(record))
   *     end
   *   end
   *   record
   * ensure
   *   @through_scope = nil
   *
   * Builds the target via `super`, then — when the source reflection has an
   * inverse on the built record's class — pre-builds the through join row and
   * wires it onto that inverse so the join is created alongside the target.
   */
  protected override buildRecord(attributes?: Record<string, unknown>): Base | null {
    ensureNotNested(this);
    (this as HasManyThroughAssociation & { _throughScope?: unknown })._throughScope = (
      this as unknown as { scope?: () => unknown }
    ).scope?.();
    try {
      const record = super.buildRecord(attributes);
      if (!record) return record;
      const built = buildThroughInverseFor(this.owner, this.reflection, record);
      if (built) {
        const inverseAssoc = (
          record as unknown as { association?: (n: string) => any }
        ).association?.(built.inverseName);
        if (inverseAssoc) {
          if (built.isCollection) {
            inverseAssoc.addToTarget?.(built.throughRecord);
          } else if (built.isHasOne) {
            inverseAssoc.target = built.throughRecord;
            inverseAssoc.setInverseInstance?.(built.throughRecord);
          }
        }
      }
      return record;
    } finally {
      (this as HasManyThroughAssociation & { _throughScope?: unknown })._throughScope = null;
    }
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#invertible_for?`
   * (has_many_through_association.rb:232-234): through associations never wire
   * an inverse via `inverse_association_for` ("NOTE - not sure that we can
   * actually cope with inverses here"). The join-row inverse wiring HMT does
   * need happens in `buildRecord` via `buildThroughInverseFor`, not here.
   * @internal
   */
  protected override isInvertibleFor(_record: Base): boolean {
    return false;
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#remove_records`
   * (has_many_through_association.rb:116-119): generic removal via `super`,
   * then drop the matching join rows from the through target.
   * @internal
   */
  protected override async removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> {
    const removed = await super.removeRecords(existingRecords, records, method);
    await deleteThroughRecords(this, records);
    return removed;
  }

  /**
   * Mirrors Rails' `HasManyThroughAssociation#delete_records`
   * (has_many_through_association.rb:140-175): scope the through association to
   * the join rows pairing `owner` with `records`, then destroy/nullify/delete
   * per `method`, and prune the in-memory through target.
   * @internal
   */
  protected override async deleteRecords(records: Base[], method: string): Promise<number> {
    ensureNotNested(this);
    const throughName = this.reflection.options.through as string | undefined;
    const owner = this.owner as unknown as { association?: (n: string) => any };
    const throughAssoc = throughName ? (owner.association?.(throughName) ?? null) : null;
    if (!throughAssoc) return 0;

    let scope: any = throughAssoc.scope();
    scope = scope.where(constructJoinAttributes(this, ...records));
    const extra = throughScopeAttributes(this);
    if (Object.keys(extra).length > 0) scope = scope.where(extra);

    let count = 0;
    if (method === "nullify") {
      count = await scope.updateAll({ [sourceForeignKey(this)]: null });
    } else if ((scope.model as typeof Base | undefined)?.primaryKey) {
      // Destroy (not Rails' bulk delete_all) so the join model's belongs_to
      // counter caches and before_destroy guards fire — trails keys through
      // counter caches off that callback. See PR notes.
      const destroyed = (await scope.destroyAll()) as Base[];
      count = destroyed.filter((r) => (r as any).isDestroyed?.()).length;
    } else {
      const recs = (await scope.toArray()) as Base[];
      for (const r of recs) await (r as any)._runDestroyCallbacks?.();
      count = await scope.deleteAll();
    }

    await deleteThroughRecords(this, records);
    return count;
  }
}

/**
 * Mirrors Rails' `HasManyThroughAssociation#delete_or_nullify_all_records`
 * (has_many_through_association.rb:136-138): `delete_records(load_target, method)`.
 * @internal
 */
async function deleteOrNullifyAllRecords(
  assoc: HasManyThroughAssociation,
  method: string,
): Promise<number> {
  const a = assoc as unknown as {
    loadTarget(): Promise<Base[]>;
    deleteRecords(r: Base[], m: string): Promise<number>;
  };
  return a.deleteRecords(await a.loadTarget(), method);
}

/**
 * Resolve the source reflection's foreign key — the join-table column that
 * points at the target — for `nullify` updates.
 *
 * @internal
 */
function sourceForeignKey(assoc: HasManyThroughAssociation): string {
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  return sourceRefl?.foreignKey ?? `${underscore(singularize(assoc.reflection.name))}_id`;
}

/** The pre-built join row and the source reflection's inverse it wires to. */
export interface BuiltThroughInverse {
  inverseName: string;
  isCollection: boolean;
  isHasOne: boolean;
  throughRecord: Base;
}

/**
 * Mirrors the inverse half of Rails'
 * `HasManyThroughAssociation#build_record` (has_many_through_association.rb:96-109):
 * resolve the source reflection's inverse and pre-build the through join row
 * that pairs `record` with `owner`. Returns null when there's no inverse to
 * wire (matching Rails, which only touches the join when `inverse` is set).
 *
 * Lives here (not in collection-proxy) so the join-building logic stays in the
 * Rails-mirroring file; the proxy's `build` path calls in via this helper.
 *
 * @internal
 */
export function buildThroughInverseFor(
  owner: Base,
  reflection: AssociationDefinition,
  record: Base,
): BuiltThroughInverse | null {
  const assoc = { owner, reflection } as unknown as HasManyThroughAssociation;
  const ctor = owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(reflection.name);
  const sourceRefl = refl?.sourceReflection;
  if (!sourceRefl) return null;

  const inverse = sourceRefl.isPolymorphic?.()
    ? sourceRefl.polymorphicInverseOf?.(record.constructor as any)
    : sourceRefl.inverseOf?.();
  if (!inverse?.name) return null;

  const throughRecord = buildThroughRecord(assoc, record);
  if (!throughRecord) return null;

  return {
    inverseName: inverse.name,
    isCollection: !!inverse.isCollection?.(),
    isHasOne: !!inverse.isHasOne?.(),
    throughRecord,
  };
}

/**
 * Mirrors Rails' `HasManyThroughAssociation#build_through_record`
 * (has_many_through_association.rb:51-66):
 *
 *   @through_records[record] ||= begin
 *     ensure_mutable
 *     attributes = through_scope_attributes
 *     attributes[source_reflection.name] = record
 *     through_association.build(attributes).tap { ... source_type ... }
 *   end
 *
 * The join row is cached by target-record identity so the same instance is
 * reused across build → concat → insert. Crucially it sets the source
 * reflection's *association* (`source_reflection.name`) to `record` rather
 * than freezing the FK value, so the join's `belongsTo` autosave follows the
 * target's primary key when both are saved together.
 * @internal
 */
function buildThroughRecord(assoc: HasManyThroughAssociation, record: Base): Base | null {
  // HABTM associations don't expose a sourceReflection chain, so
  // constructJoinAttributes (which keys off source_reflection) can't run.
  // Build the join row from the habtm options instead — matches Rails'
  // build_through_record path for habtm under the hood.
  if ((assoc.reflection as any).type === "hasAndBelongsToMany") {
    return buildHabtmThroughRecord(assoc, record);
  }
  const cache = throughRecordsCache(assoc);
  const cached = cache.get(record);
  if (cached) return cached;

  ensureMutable(assoc);
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  const proxy = throughAssociation(assoc) as {
    build?: (attrs: Record<string, unknown>) => Base;
  } | null;
  if (!proxy || typeof proxy.build !== "function" || !sourceRefl?.name) return null;

  const attributes = throughScopeAttributes(assoc);
  attributes[sourceRefl.name] = record;
  const newRecord = proxy.build(attributes);
  if (assoc.reflection.options.sourceType && sourceRefl.foreignType) {
    (newRecord as any).writeAttribute?.(
      sourceRefl.foreignType,
      assoc.reflection.options.sourceType,
    );
  }
  cache.set(record, newRecord);
  return newRecord;
}

/** @internal */
function buildHabtmThroughRecord(assoc: HasManyThroughAssociation, record: Base): Base {
  const ctor = assoc.owner.constructor as any;
  const assocDef = assoc.reflection as any;
  const throughName = assocDef.options?.through as string | undefined;
  // The HABTM builder (associations/builder/has-and-belongs-to-many.ts) always
  // sets options.through to the generated middle reflection, so a missing
  // through-name or missing through definition signals genuine misconfiguration —
  // surface it loudly rather than silently dropping the join write.
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
  // The HABTM JoinModel (createHabtmJoinModel in associations.ts) declares
  // two belongsTo entries on `_associations`: "leftSide" (owner-side) and a
  // right-side entry whose `foreignKey` is the builder-computed targetFk
  // (className-derived, honoring `associationForeignKey`). Read it from
  // there so we write to the column the JoinModel actually declared, rather
  // than re-deriving via `singularize(assocName)` and silently dropping the
  // value when the conventions diverge.
  const joinAssocs = (throughModel as { _associations?: AssociationDefinition[] })._associations;
  const rightSide = joinAssocs?.find(
    (a) => a.type === "belongsTo" && a.name !== "leftSide" && a.options?.foreignKey,
  );
  const sourceFk =
    (rightSide?.options?.foreignKey as string | undefined) ??
    `${underscore(assocDef.options?.source ?? singularize(assocDef.name))}_id`;
  const targetPk = (record.constructor as any).primaryKey ?? "id";
  const joinAttrs: Record<string, unknown> = {
    [ownerFk as string]: pkValue,
    [sourceFk]: (record as any)._readAttribute?.(targetPk) ?? (record as any)[targetPk],
  };
  const throughProxy = (assoc.owner as any).association?.(throughName) as {
    build?: (a: Record<string, unknown>) => Base;
  } | null;
  if (throughProxy && typeof throughProxy.build === "function") {
    return throughProxy.build(joinAttrs);
  }
  return new (throughModel as any)(joinAttrs);
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
  // Rails: `scope = through_scope || self.scope` (hmt:72). The `_throughScope`
  // ivar is set during `buildRecord` (hmt:93) and cleared after; consult it
  // first so a record built within that window picks up the scope captured at
  // build time, then fall back to `self.scope` (the HMT relation). The last
  // fallback to the through association's own scope covers the lightweight
  // `{ owner, reflection }` stand-in used by `buildThroughInverseFor` (called
  // from `buildRecord` and `CollectionProxy._buildThrough`), which has no
  // `scope()` of its own. `whereValuesHash(throughTable)` below filters the
  // equality predicates to the through model's table, so target-table
  // predicates carried by any of these relations are dropped rather than
  // leaking into the join row / delete query.
  const scope: any = throughScope(assoc) ?? (assoc as any).scope?.() ?? throughAssoc.scope?.();
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
async function saveThroughRecord(
  assoc: HasManyThroughAssociation,
  record: Base,
  validate = true,
  raise = false,
): Promise<boolean> {
  // Mirrors Rails' has_many_through_association#save_through_record: build
  // the join row (via the through proxy for HMT, or via habtm options for
  // HABTM) and save it when it has pending changes. The `ensure`-clear evicts
  // the per-record cache so the same target can be associated again later.
  try {
    const joinRecord = buildThroughRecord(assoc, record);
    if (!joinRecord) return true;
    const isUnsaved =
      joinRecord.isNewRecord() ||
      (typeof (joinRecord as any).hasChangesToSave === "function"
        ? (joinRecord as any).hasChangesToSave()
        : true);
    if (!isUnsaved) return true;
    const saved = await (joinRecord as any).save({ validate });
    if (!saved) {
      if (raise) raiseValidationError(joinRecord);
      return false;
    }
    return true;
  } finally {
    throughRecordsCache(assoc).delete(record);
  }
}

/**
 * The per-record cache of pre-built through join rows, keyed by target-record
 * identity. Mirrors Rails' `@through_records = {}.compare_by_identity`: a row
 * built during `build_record`/`concat_records` is reused by the subsequent
 * `insert_record`, then evicted once saved.
 *
 * Stored on the owner (keyed by reflection name) rather than the association
 * instance because the build path threads a synthetic `{ owner, reflection }`
 * stand-in through `buildThroughInverseFor`, while save/insert run on the live
 * instance — both must observe the same map.
 *
 * @internal
 */
function throughRecordsCache(assoc: HasManyThroughAssociation): Map<Base, Base> {
  const owner = assoc.owner as unknown as {
    _throughRecordsCaches?: Map<string, Map<Base, Base>>;
  };
  const store = (owner._throughRecordsCaches ??= new Map<string, Map<Base, Base>>());
  let cache = store.get(assoc.reflection.name);
  if (!cache) {
    cache = new Map<Base, Base>();
    store.set(assoc.reflection.name, cache);
  }
  return cache;
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
