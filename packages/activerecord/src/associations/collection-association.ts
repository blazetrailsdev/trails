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
    for (const record of flattened) {
      const added = this.addToTarget(record);
      if (!added) continue;
      if (this.owner.isPersisted() && typeof (record as any).save === "function") {
        this.setOwnerAttributes(record);
        await (record as any).save();
      }
    }
    return flattened;
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
    if (this.isLoaded()) {
      return this.target.length;
    }
    if (this._associationIds) {
      return this._associationIds.length;
    }
    return this.target.length;
  }

  isEmpty(): boolean {
    if (this.isLoaded() || this._associationIds) {
      return this.size === 0;
    }
    return this.target.length === 0;
  }

  /**
   * Replace this collection with other_array. Performs a diff and
   * delete/add only records that have changed.
   */
  replace(otherArray: Base[]): void {
    const original = [...this.target];
    const desiredIds = new Set(otherArray.map((r) => this.recordIdentity(r)));
    const originalIds = new Set(original.map((r) => this.recordIdentity(r)));

    const toRemove = original.filter((r) => !desiredIds.has(this.recordIdentity(r)));
    const toAdd = otherArray.filter((r) => !originalIds.has(this.recordIdentity(r)));

    for (const record of toRemove) {
      const proceed = fireAssocCallbacks(this.options.beforeRemove, this.owner, record);
      if (proceed === false) continue;
      const idx = this.target.indexOf(record);
      if (idx !== -1) {
        this.target.splice(idx, 1);
        this.removeInverseInstance(record);
      }
      fireAssocCallbacks(this.options.afterRemove, this.owner, record);
    }

    for (const record of toAdd) {
      this.setOwnerAttributes(record);
      this.addToTarget(record);
    }

    this.loadedBang();
  }

  /**
   * Check if a record is in the collection. For new records, checks
   * the in-memory target. For persisted records, uses scope if not loaded.
   */
  async isInclude(record: Base): Promise<boolean> {
    if (record.isNewRecord()) {
      return this.target.includes(record);
    }
    if (this.isLoaded()) {
      const identity = this.recordIdentity(record);
      return this.target.some((r) => this.recordIdentity(r) === identity);
    }
    const rel = this.scope();
    if (rel && typeof rel.exists === "function") {
      const pk = this.primaryKeyValue(record);
      return await rel.exists(pk);
    }
    const identity = this.recordIdentity(record);
    return this.target.some((r) => this.recordIdentity(r) === identity);
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
    const { skipCallbacks, replace: shouldReplace } = options;

    let index = -1;
    if (shouldReplace && this._replacedOrAddedTargets.has(record)) {
      index = this.target.indexOf(record);
    }

    if (!skipCallbacks) {
      const proceed = fireAssocCallbacks(this.reflection.options.beforeAdd, this.owner, record);
      if (proceed === false) return null;
    }

    this.setInverseInstance(record);
    this._replacedOrAddedTargets.add(record);
    this._associationIds = null;

    if (index !== -1) {
      this.target[index] = record;
    } else {
      this.target.push(record);
    }

    if (!skipCallbacks) {
      fireAssocCallbacks(this.reflection.options.afterAdd, this.owner, record);
    }

    return record;
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
        typeof this.owner.readAttribute === "function"
          ? this.owner.readAttribute(key)
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

  get reader(): Base[] {
    return this.target;
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
        typeof this.owner.readAttribute === "function"
          ? this.owner.readAttribute(pkCol)
          : (this.owner as any)[pkCol];

      if (typeof (record as any).writeAttribute === "function") {
        (record as any).writeAttribute(fks[i], pkValue);
      } else {
        (record as any)[fks[i]] = pkValue;
      }
    }

    if (this.reflection.options.as) {
      const typeCol = `${underscore(this.reflection.options.as)}_type`;
      if (typeof (record as any).writeAttribute === "function") {
        (record as any).writeAttribute(typeCol, ctor.name);
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

    // Fire beforeRemove callbacks; abort if any returns false
    for (const record of records) {
      const proceed = fireAssocCallbacks(this.options.beforeRemove, this.owner, record);
      if (proceed === false) return;
    }

    const persisted = records.filter((r) => r.isPersisted());
    if (method === "destroy") {
      for (const record of persisted) {
        if (typeof (record as any).destroy === "function") {
          await (record as any).destroy();
        }
      }
    } else if (persisted.length > 0) {
      // Nullify FK columns on persisted records (Rails: delete_records)
      const fks = this.foreignKeyColumns();
      const nullAttrs: string[] = [...fks];
      if (this.reflection.options.as) {
        nullAttrs.push(`${underscore(this.reflection.options.as)}_type`);
      }
      for (const record of persisted) {
        for (const attr of nullAttrs) {
          if (typeof (record as any).writeAttribute === "function") {
            (record as any).writeAttribute(attr, null);
          } else {
            (record as any)[attr] = null;
          }
        }
        if (typeof (record as any).save === "function") {
          await (record as any).save();
        }
      }
    }

    for (const record of records) {
      const idx = this.target.indexOf(record);
      if (idx !== -1) {
        this.target.splice(idx, 1);
      }
      this.removeInverseInstance(record);
    }
    this._associationIds = null;

    for (const record of records) {
      fireAssocCallbacks(this.options.afterRemove, this.owner, record);
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
        if (typeof (record as any).writeAttribute === "function") {
          (record as any).writeAttribute(attr, val);
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
      typeof record.readAttribute === "function" ? record.readAttribute(key) : (record as any)[key],
    );
    if (values.some((v) => v == null)) return record;
    return JSON.stringify(values.length === 1 ? values[0] : values);
  }

  private primaryKeyValue(record: Base): unknown {
    const pk = (this.klass as any).primaryKey ?? "id";
    if (Array.isArray(pk)) {
      return pk.map((key: string) =>
        typeof record.readAttribute === "function"
          ? record.readAttribute(key)
          : (record as any)[key],
      );
    }
    return typeof record.readAttribute === "function"
      ? record.readAttribute(pk)
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
