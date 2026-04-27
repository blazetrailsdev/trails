import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { fireAssocCallbacks } from "../associations.js";
import { underscore } from "@blazetrails/activesupport";
import { Association } from "./association.js";

/**
 * Base class for has_many and has_and_belongs_to_many associations.
 *
 * CollectionAssociation provides common CRUD methods for collections.
 * The actual database interaction is delegated to load functions in
 * associations.ts and the CollectionProxy class.
 *
 * Mirrors: ActiveRecord::Associations::CollectionAssociation
 */
export class CollectionAssociation extends Association {
  declare target: Base[];
  nestedAttributesTarget: Base[] | null = null;
  private _replacedOrAddedTargets: Set<Base> = new Set();
  private _associationIds: unknown[] | null = null;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
    this.target = [];
  }

  /**
   * Implements the writer method, e.g. foo.items= for Foo.has_many :items.
   * Replaces the entire collection.
   */
  writer(records: Base[]): void {
    this.replace(records);
  }

  /**
   * Implements the ids reader, e.g. foo.item_ids.
   * Returns an array of primary key values from the target.
   */
  async idsReader(): Promise<unknown[]> {
    if (this.isLoaded()) {
      return this.target.map((r) => this.primaryKeyValue(r));
    }
    if (this.target.length > 0) {
      await this.loadTarget();
      return this.target.map((r) => this.primaryKeyValue(r));
    }
    if (this._associationIds) return this._associationIds;
    const pk = (this.klass as any).primaryKey ?? "id";
    const rel = this.scope();
    if (rel && typeof rel.pluck === "function") {
      this._associationIds = await rel.pluck(...(Array.isArray(pk) ? pk : [pk]));
      return this._associationIds!;
    }
    return [];
  }

  /**
   * Implements the ids writer, e.g. foo.item_ids=.
   * Loads records by the given IDs and replaces the collection.
   */
  async idsWriter(ids: unknown[]): Promise<void> {
    const filteredIds = (ids ?? []).filter((id) => id != null && id !== "");
    if (filteredIds.length === 0) {
      this.replace([]);
      return;
    }
    const Klass = this.klass as any;
    const pk = Klass.primaryKey ?? "id";

    if (Array.isArray(pk)) {
      const found = await Promise.all(
        filteredIds.map(async (id) => {
          const conditions: Record<string, unknown> = {};
          const idParts = Array.isArray(id) ? id : [id];
          pk.forEach((col: string, i: number) => {
            conditions[col] = idParts[i];
          });
          return Klass.findBy(conditions);
        }),
      );
      this.replace(found.filter((r): r is Base => r != null));
    } else if (typeof Klass.where === "function") {
      const records: Base[] = await Klass.where({ [pk]: filteredIds }).toArray();
      this.replace(records);
    }
  }

  override reset(): void {
    super.reset();
    this.target = [];
    this._replacedOrAddedTargets = new Set();
    this._associationIds = null;
  }

  /**
   * Find records within the association. If inverse_of is set and the
   * collection is loaded, scans the in-memory target. Otherwise
   * delegates to the association scope.
   */
  async find(...args: unknown[]): Promise<Base | Base[] | null> {
    const ids = (args as any[]).flat().filter((id) => id != null);

    if (this.reflection.options.inverseOf && this.isLoaded()) {
      if (ids.length === 0) {
        throw new Error(`Couldn't find ${this.klass.name} without an ID`);
      }
      return this.findByScan(ids);
    }

    const rel = this.scope();
    if (rel && typeof rel.find === "function") {
      return await rel.find(...ids);
    }
    return null;
  }

  build(attributes?: Record<string, unknown>): Base {
    const record = this.buildRecord(attributes);
    if (record) {
      this.setOwnerAttributes(record);
      this.addToTarget(record, { replace: true });
    }
    return record!;
  }

  /**
   * Add records to this association. Flattens arguments and inserts
   * each record, persisting if the owner is persisted.
   */
  async concat(...records: Base[]): Promise<Base[]> {
    const flattened = records.flat() as Base[];
    if (this.owner.isNewRecord()) {
      await this.loadTarget();
      await this.concatRecords(flattened);
    } else {
      await this.concatRecords(flattened);
    }
    return flattened;
  }

  private async concatRecords(records: Base[]): Promise<void> {
    let result = true;
    for (const record of records) {
      (this as any).raiseOnTypeMismatchBang(record);
      const added = this.addToTarget(record);
      if (!added) continue;
      if (!this.owner.isNewRecord()) {
        const saved = await insertRecord(this, record, true, false);
        if (!saved) result = false;
      }
    }
    if (!result) throw new Error("ActiveRecord::Rollback");
  }

  /**
   * Removes all records from the association. Honors the :dependent
   * option. If :dependent is :destroy, uses :delete_all strategy instead.
   */
  async deleteAll(dependent?: string): Promise<void> {
    if (
      dependent &&
      dependent !== "nullify" &&
      dependent !== "deleteAll" &&
      dependent !== "delete"
    ) {
      throw new Error("Valid values are 'nullify', 'delete', or 'deleteAll'");
    }

    const normalized = dependent === "delete" ? "deleteAll" : dependent;
    const optionDep = this.options.dependent;
    const effectiveDependent =
      normalized ?? (optionDep === "destroy" || optionDep === "delete" ? "deleteAll" : optionDep);

    if (effectiveDependent === "nullify") {
      await this.nullifyAllRecords();
    } else {
      await this.deleteAllRecords();
    }

    this.reset();
    this.loadedBang();
  }

  /**
   * Destroy all records from this association, calling destroy callbacks.
   */
  async destroyAll(): Promise<void> {
    const records = await this.loadTarget();
    for (const record of records) {
      if (typeof (record as any).destroy === "function") {
        await (record as any).destroy();
      }
    }
    this.reset();
    this.loadedBang();
  }

  /**
   * Remove specific records from the association using the :dependent
   * strategy. Calls before_remove/after_remove callbacks.
   */
  async delete(...records: Base[]): Promise<void> {
    await this.deleteOrDestroy(records.flat(), this.reflection.options.dependent);
  }

  /**
   * Destroy specific records, ignoring the :dependent option.
   * Calls before_remove/after_remove + before_destroy/after_destroy callbacks.
   */
  async destroy(...records: Base[]): Promise<void> {
    await this.deleteOrDestroy(records.flat(), "destroy");
  }

  get size(): number {
    if (!this.findTargetNeeded() || this.isLoaded()) {
      return this.target.length;
    }
    if (this._associationIds) {
      return this._associationIds.length;
    }
    return this.target.length;
  }

  async countRecords(): Promise<number> {
    const rel = this.scope();
    if (rel && typeof rel.count === "function") {
      return await rel.count();
    }
    return this.target.length;
  }

  isEmpty(): boolean {
    if (this.isLoaded() || this._associationIds) {
      return this.size === 0;
    }
    return this.target.length === 0;
  }

  async isEmptyAsync(): Promise<boolean> {
    if (this.isLoaded() || this._associationIds) {
      return this.size === 0;
    }
    if (this.target.length > 0) return false;
    const rel = this.scope();
    if (rel && typeof rel.exists === "function") {
      return !(await rel.exists());
    }
    return true;
  }

  /**
   * Replace this collection with other_array. Performs a diff and
   * delete/add only records that have changed.
   */
  replace(otherArray: Base[]): void {
    for (const val of otherArray) (this as any).raiseOnTypeMismatchBang(val);
    const originalTarget = [...this.target];
    // Update in-memory target immediately (synchronous) then persist async.
    // Rails does the same: replace_common_records_in_memory runs first,
    // then transaction { replace_records } (async) handles DB.
    replaceCommonRecordsInMemory(this, otherArray, originalTarget);
    if (this.owner.isNewRecord()) {
      // For new owners: just set the in-memory target directly
      this.target = [...otherArray];
      this.loadedBang();
    } else if (!arraysEqual(otherArray, originalTarget)) {
      // Sync in-memory: remove records not in new target, add new ones
      for (const r of originalTarget) {
        if (!otherArray.includes(r)) {
          const idx = this.target.indexOf(r);
          if (idx !== -1) this.target.splice(idx, 1);
        }
      }
      for (const r of otherArray) {
        if (!this.target.includes(r)) {
          this.setOwnerAttributes(r);
          this.addToTarget(r);
        }
      }
      this.loadedBang();
      // Persist changes async (matches Rails: transaction { replace_records })
      void transaction(this, async () => {
        await replaceRecords(this, otherArray, originalTarget);
      });
    }
  }

  /**
   * Check if a record is in the collection. For new records, checks
   * the in-memory target. For persisted records, uses scope if not loaded.
   */
  async isInclude(record: Base): Promise<boolean> {
    if (record.isNewRecord() || this.isLoaded()) {
      return isIncludeInMemory(this, record);
    }
    const rel = this.scope();
    if (rel && typeof rel.exists === "function") {
      const pk = this.primaryKeyValue(record);
      return await rel.exists(pk);
    }
    return isIncludeInMemory(this, record);
  }

  /**
   * Load target from database and merge with in-memory records.
   */
  override async loadTarget(): Promise<Base[]> {
    if (this.findTargetNeeded()) {
      const cached = this.doFindTarget();
      if (cached !== undefined && Array.isArray(cached)) {
        this.target = this.mergeTargetLists(cached, this.target);
      } else {
        const found = await this.doAsyncFindTarget();
        if (found !== undefined && found !== null && Array.isArray(found)) {
          this.target = this.mergeTargetLists(found, this.target);
        }
      }
    }

    this.loadedBang();
    return this.target;
  }

  /**
   * Add a record to the in-memory target array, firing callbacks
   * and setting inverse associations.
   */
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean } = {},
  ): Base | null {
    const { skipCallbacks = false, replace: shouldReplace = false } = options;
    return replaceOnTarget(this, record, skipCallbacks, shouldReplace);
  }

  /**
   * Returns the scope (Relation) for this association, applying
   * none! if the scope is null (owner is new and has no FK).
   */
  override scope(): any {
    const s = super.scope();
    if (this.isNullScope() && s && typeof s.none === "function") {
      return s.none();
    }
    return s;
  }

  /**
   * For collection associations, the "foreign key" that matters is the
   * owner's primary key (since children reference it via their FK).
   * A new record that already has a PK assigned can still load children.
   */
  protected override foreignKeyPresent(): boolean {
    const ctor = this.owner.constructor as any;
    const pk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    const keys = Array.isArray(pk) ? pk : [pk];
    return keys.every((key: string) => {
      const val =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(key)
          : (this.owner as any)[key];
      return val != null;
    });
  }

  /**
   * Returns true if the scope should be null — owner is a new
   * record and has no foreign key present.
   */
  isNullScope(): boolean {
    return this.owner.isNewRecord() && !this.foreignKeyPresent();
  }

  /**
   * Returns true if find should search the loaded target rather than
   * going to the database. True when loaded, strict loading, new record,
   * or any target record is new/changed.
   */
  isFindFromTarget(): boolean {
    return (
      this.isLoaded() ||
      (this.owner as any)._strictLoading ||
      this.owner.isNewRecord() ||
      this.target.some(
        (r) =>
          r.isNewRecord() ||
          (typeof (r as any).hasChangesToSave === "function" && (r as any).hasChangesToSave()),
      )
    );
  }

  override isCollection(): boolean {
    return true;
  }

  override get reader(): Base[] {
    this.ensureKlassExists();
    return this.target;
  }

  async asyncReader(): Promise<Base[]> {
    this.ensureKlassExists();

    if (this.isStaleTarget()) {
      await this.reload();
    }

    return this.target;
  }

  private ensureKlassExists(): void {
    try {
      void this.klass;
    } catch (error) {
      throw new Error(`Association ${this.reflection.name}: target class does not exist`, {
        cause: error,
      });
    }
  }

  // --- Protected helpers ---

  protected setOwnerAttributes(record: Base): void {
    if (this.reflection.options.through) return;

    const ctor = this.owner.constructor as any;
    const configuredPk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    const pks = Array.isArray(configuredPk) ? configuredPk : [configuredPk];
    const fks = this.foreignKeyColumns();

    for (let i = 0; i < fks.length; i++) {
      const pkCol = pks[i] ?? pks[0];
      const pkValue =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(pkCol)
          : (this.owner as any)[pkCol];

      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(fks[i], pkValue);
      } else {
        (record as any)[fks[i]] = pkValue;
      }
    }

    if (this.reflection.options.as) {
      const typeCol = `${underscore(this.reflection.options.as)}_type`;
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, ctor.name);
      } else {
        (record as any)[typeCol] = ctor.name;
      }
    }
  }

  // --- Private helpers ---

  private foreignKeyColumns(): string[] {
    const fk = this.reflection.options.foreignKey;
    if (typeof fk === "string") return [fk];
    if (Array.isArray(fk)) return fk;
    const ctor = this.owner.constructor as any;
    if (this.reflection.options.as) {
      return [`${underscore(this.reflection.options.as)}_id`];
    }
    // Derive composite FKs for CPK owners (mirrors loadHasMany)
    const pk = this.reflection.options.primaryKey ?? ctor.primaryKey ?? "id";
    if (Array.isArray(pk)) {
      return pk.map((col: string) => `${underscore(ctor.name)}_${col}`);
    }
    return [`${underscore(ctor.name)}_id`];
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  private async deleteOrDestroy(records: Base[], method?: string): Promise<void> {
    if (records.length === 0) return;
    for (const record of records) (this as any).raiseOnTypeMismatchBang(record);
    const existingRecords = records.filter((r) => !r.isNewRecord());
    if (existingRecords.length === 0) {
      await removeRecords(this, existingRecords, records, method ?? "");
    } else {
      await transaction(this, () => removeRecords(this, existingRecords, records, method ?? ""));
    }
  }

  private async nullifyAllRecords(): Promise<void> {
    const nullAttrs: Record<string, null> = {};
    for (const fk of this.foreignKeyColumns()) {
      nullAttrs[fk] = null;
    }
    if (this.reflection.options.as) {
      nullAttrs[`${underscore(this.reflection.options.as)}_type`] = null;
    }

    // Prefer scope-based bulk update (hits DB even if target isn't loaded)
    const rel = this.scope();
    if (rel && typeof rel.updateAll === "function") {
      await rel.updateAll(nullAttrs);
      return;
    }

    // Fallback: load and update individually
    await this.loadTarget();
    for (const record of this.target) {
      for (const [attr, val] of Object.entries(nullAttrs)) {
        if (typeof (record as any)._writeAttribute === "function") {
          (record as any)._writeAttribute(attr, val);
        } else {
          (record as any)[attr] = val;
        }
      }
      if (typeof (record as any).save === "function") {
        await (record as any).save();
      }
    }
  }

  /**
   * Stable identity for a record using the target model's configured PK.
   * Returns the record object itself for new records with null PK
   * (reference identity), or a JSON-serialized PK for persisted records.
   */
  private recordIdentity(record: Base): string | Base {
    const pk = (this.klass as any).primaryKey ?? "id";
    const keys = Array.isArray(pk) ? pk : [pk];
    const values = keys.map((key: string) =>
      typeof (record as any)._readAttribute === "function"
        ? (record as any)._readAttribute(key)
        : (record as any)[key],
    );
    if (values.some((v) => v == null)) return record;
    return JSON.stringify(values.length === 1 ? values[0] : values);
  }

  private primaryKeyValue(record: Base): unknown {
    const pk = (this.klass as any).primaryKey ?? "id";
    if (Array.isArray(pk)) {
      return pk.map((key: string) =>
        typeof (record as any)._readAttribute === "function"
          ? (record as any)._readAttribute(key)
          : (record as any)[key],
      );
    }
    return typeof (record as any)._readAttribute === "function"
      ? (record as any)._readAttribute(pk)
      : (record as any)[pk];
  }

  private async deleteAllRecords(): Promise<void> {
    const rel = this.scope();
    if (rel && typeof rel.deleteAll === "function") {
      await rel.deleteAll();
    }
  }

  /**
   * Merge persisted records from DB with in-memory target records.
   * Preserves order of persisted, deduplicates, and keeps
   * attribute changes from in-memory versions.
   */
  private mergeTargetLists(persisted: Base[], memory: Base[]): Base[] {
    if (memory.length === 0) return persisted;

    const newRecords: Base[] = [];
    const memoryByIdentity = new Map<string | Base, Base>();
    for (const record of memory) {
      const identity = this.recordIdentity(record);
      if (typeof identity !== "string") {
        newRecords.push(record);
      } else {
        memoryByIdentity.set(identity, record);
      }
    }

    const merged = persisted.map((record) => {
      const identity = this.recordIdentity(record);
      if (typeof identity !== "string") return record;
      const memRecord = memoryByIdentity.get(identity);
      if (memRecord) {
        memoryByIdentity.delete(identity);
        return memRecord;
      }
      return record;
    });

    merged.push(...newRecords);
    return merged;
  }

  private findByScan(ids: unknown[]): Base | Base[] {
    const normalize = (v: unknown) => JSON.stringify(v);
    const normalizedIds = ids.map(normalize);

    if (ids.length === 1) {
      const found = this.target.find(
        (r) => normalize(this.primaryKeyValue(r)) === normalizedIds[0],
      );
      if (!found) {
        throw new Error(`Couldn't find ${this.klass.name} with ID ${normalizedIds[0]}`);
      }
      return found;
    }

    const idSet = new Set(normalizedIds);
    const found = this.target.filter((r) => idSet.has(normalize(this.primaryKeyValue(r))));
    if (found.length !== ids.length) {
      const foundSet = new Set(found.map((r) => normalize(this.primaryKeyValue(r))));
      const missing = ids.filter((id) => !foundSet.has(normalize(id)));
      throw new Error(
        `Couldn't find all ${this.klass.name} with IDs (${missing.map(normalize).join(", ")})`,
      );
    }
    return found;
  }
}

function transaction(assoc: CollectionAssociation, block: () => Promise<void>): Promise<void> {
  // Rails: reflection.klass.transaction(&block) — uses the reflection's klass, not assoc.klass
  const klass = (assoc.reflection as any).klass ?? assoc.klass;
  if (klass && typeof (klass as any).transaction === "function") {
    return (klass as any).transaction(block);
  }
  return block();
}

async function insertRecord(
  assoc: CollectionAssociation,
  record: Base,
  validate = true,
  raise = false,
): Promise<Base | null> {
  // Mirrors Rails insert_record: set owner FK attributes on the record, then save it.
  if (typeof (assoc as any).setOwnerAttributes === "function") {
    (assoc as any).setOwnerAttributes(record);
  }
  const saveMethod = raise ? "saveBang" : "save";
  if (typeof (record as any)[saveMethod] === "function") {
    const saved = await (record as any)[saveMethod]({ validate });
    return saved ? record : null;
  }
  if (typeof (record as any).save === "function") {
    const saved = await (record as any).save();
    if (!saved && raise) throw new Error(`Failed to insert ${record.constructor.name}`);
    return saved ? record : null;
  }
  return record;
}

async function removeRecords(
  assoc: CollectionAssociation,
  existingRecords: Base[],
  records: Base[],
  method: string,
): Promise<void> {
  // Rails remove_records: fire before callbacks, delete persisted, remove from target, fire after
  for (const record of records) callback(assoc, "beforeRemove", record);
  if (existingRecords.length > 0) {
    await Promise.resolve(deleteRecords(assoc, existingRecords, method));
  }
  for (const record of records) {
    const idx = (assoc.target as Base[]).indexOf(record);
    if (idx !== -1) (assoc.target as Base[]).splice(idx, 1);
    assoc.removeInverseInstance(record);
  }
  (assoc as any)._associationIds = null;
  for (const record of records) callback(assoc, "afterRemove", record);
}

function deleteRecords(assoc: CollectionAssociation, records: Base[], method: string): void {
  throw new Error(`deleteRecords must be implemented by ${assoc.constructor.name}`);
}

async function replaceRecords(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): Promise<Base[]> {
  // Rails: delete(difference(target, new_target)); concat(difference(new_target, target))
  const toDelete = (assoc.target as Base[]).filter((r) => !newTarget.includes(r));
  if (toDelete.length > 0) await assoc.delete(...toDelete);
  const toAdd = newTarget.filter((r) => !(assoc.target as Base[]).includes(r));
  if (toAdd.length > 0) {
    const result = await assoc.concat(...toAdd);
    if (!result) {
      (assoc as any).target = originalTarget;
      throw new Error(
        `Failed to replace ${assoc.reflection.name} because one or more records could not be saved.`,
      );
    }
  }
  return assoc.target as Base[];
}

function replaceCommonRecordsInMemory(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): void {
  const common = newTarget.filter((r) => originalTarget.includes(r));
  for (const record of common) {
    replaceOnTarget(assoc, record, true, true);
  }
}

function replaceOnTarget(
  assoc: CollectionAssociation,
  record: Base,
  skipCallbacks: boolean,
  replace: boolean,
): Base | null {
  const replaced = assoc as any;
  let index = -1;
  if (replace && replaced._replacedOrAddedTargets?.has(record)) {
    index = (assoc.target as Base[]).indexOf(record);
  }

  if (!skipCallbacks) {
    const proceed = fireAssocCallbacks(assoc.reflection.options.beforeAdd, assoc.owner, record);
    if (proceed === false) return null;
  }

  assoc.setInverseInstance(record);
  replaced._replacedOrAddedTargets?.add(record);
  replaced._associationIds = null;

  const target = assoc.target as Base[];
  if (index !== -1) {
    target[index] = record;
  } else {
    target.push(record);
  }

  if (!skipCallbacks) {
    fireAssocCallbacks(assoc.reflection.options.afterAdd, assoc.owner, record);
  }

  return record;
}

function callback(assoc: CollectionAssociation, method: string, record: Base): void {
  for (const cb of callbacksFor(assoc, method)) {
    if (typeof cb === "function") cb(method, assoc.owner, record);
  }
}

function callbacksFor(assoc: CollectionAssociation, callbackName: string): unknown[] {
  const fullName = `${callbackName}For${assoc.reflection.name.charAt(0).toUpperCase()}${assoc.reflection.name.slice(1)}`;
  const owner = assoc.owner.constructor as any;
  if (typeof owner[fullName] === "function") return owner[fullName]();
  return [];
}

function isIncludeInMemory(assoc: CollectionAssociation, record: Base): boolean {
  // For through reflections, also check through the source chain.
  const refl = assoc.reflection as any;
  if (refl.isThroughReflection?.()) {
    const throughName = refl.options?.through;
    if (throughName) {
      const throughAssoc = (assoc.owner as any).association?.(throughName);
      const sourceRefl = refl.sourceReflection?.();
      if (throughAssoc && sourceRefl) {
        const sourceName = sourceRefl.name;
        const reader = throughAssoc.target as Base[];
        if (Array.isArray(reader)) {
          const found = reader.some((source: any) => {
            const targetRefl = source[sourceName];
            if (Array.isArray(targetRefl)) return targetRefl.includes(record);
            return targetRefl === record;
          });
          if (found) return true;
        }
      }
    }
  }
  return (assoc.target as Base[]).includes(record);
}

function arraysEqual(a: Base[], b: Base[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r === b[i]);
}
