import type { Base } from "../base.js";
import { Table as ArelTable } from "@rails-ts/arel";
import { underscore, singularize, pluralize, camelize } from "@rails-ts/activesupport";
import { StrictLoadingViolationError } from "../errors.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughNestedAssociationsAreReadonly,
  HasManyThroughOrderError,
} from "./errors.js";
import { getInheritanceColumn, findStiClass } from "../sti.js";
import type { AssociationDefinition } from "../associations.js";
import {
  resolveModel,
  fireAssocCallbacks,
  buildHasManyRelation,
  loadHasMany,
} from "../associations.js";

export class CollectionProxy {
  private _record: Base;
  private _assocName: string;
  private _assocDef: AssociationDefinition;
  private _target: Base[] = [];
  private _loaded = false;

  get loaded(): boolean {
    return this._loaded;
  }

  get target(): Base[] {
    return this._target;
  }

  /** @internal Initialize from preloaded association data. */
  _hydrateFromPreload(records: Base[]): void {
    // Preserve any unsaved in-memory records (from build/push before preload ran)
    const unsaved = this._target.filter((r) => r.isNewRecord());
    this._target = unsaved.length > 0 ? [...records, ...unsaved] : records;
    this._loaded = true;
  }

  constructor(record: Base, assocName: string, assocDef: AssociationDefinition) {
    this._record = record;
    this._assocName = assocName;
    this._assocDef = assocDef;

    // Apply extend option — mix methods into this proxy instance
    const ext = assocDef.options.extend;
    if (ext) {
      const extensions = Array.isArray(ext) ? ext : [ext];
      for (const mod of extensions) {
        for (const [key, fn] of Object.entries(mod)) {
          if (typeof fn === "function") {
            (this as Record<string, unknown>)[key] = fn.bind(this);
          }
        }
      }
    }
  }

  /**
   * Load and return all associated records.
   */
  async toArray(): Promise<Base[]> {
    const results = await loadHasMany(this._record, this._assocName, this._assocDef.options);
    const unsaved = this._target.filter((r) => r.isNewRecord());
    if (unsaved.length > 0) {
      return [...results, ...unsaved];
    }
    return results;
  }

  async load(): Promise<Base[]> {
    if (this._loaded) return this._target;
    const results = await loadHasMany(this._record, this._assocName, this._assocDef.options);
    // Merge: prefer existing in-memory instances (from push/build) over fresh DB records
    const existingByPk = new Map<string, Base>();
    for (const r of this._target) {
      const id = this._identityFor(r);
      if (id != null) existingByPk.set(id, r);
    }
    const merged: Base[] = results.map((r) => {
      const id = this._identityFor(r);
      return id != null && existingByPk.has(id) ? existingByPk.get(id)! : r;
    });
    const unsaved = this._target.filter((r) => r.isNewRecord());
    this._target = unsaved.length > 0 ? [...merged, ...unsaved] : merged;
    this._loaded = true;
    return this._target;
  }

  private _identityFor(r: Base): string | null {
    const pk = (r.constructor as typeof Base).primaryKey;
    if (Array.isArray(pk)) {
      const vals = pk.map((col) => r.readAttribute(col));
      if (vals.some((v) => v == null)) return null;
      return JSON.stringify(vals);
    }
    const val = r.readAttribute(pk as string);
    return val == null ? null : String(val);
  }

  private get _isThrough(): boolean {
    return !!this._assocDef.options.through;
  }

  private _ensureThroughWritable(): void {
    if (!this._isThrough) return;
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new HasManyThroughOrderError(
        ctor.name,
        this._assocName,
        this._assocDef.options.through as string,
      );
    }

    if (throughAssoc.type === "hasOne") {
      throw new HasManyThroughCantAssociateThroughHasOneOrManyReflection(
        ctor.name,
        this._assocName,
      );
    }

    // Nested through: the through association is itself a through association
    const isNestedThrough =
      throughAssoc.options.through ||
      (throughAssoc.type as string) === "hasManyThrough" ||
      (throughAssoc.type as string) === "hasOneThrough";
    if (isNestedThrough) {
      if (this._assocDef.type === "hasOne" || (this._assocDef.type as string) === "hasOneThrough") {
        throw new HasOneThroughNestedAssociationsAreReadonly(ctor.name, this._assocName);
      }
      throw new HasManyThroughNestedAssociationsAreReadonly(ctor.name, this._assocName);
    }
  }

  private async _withoutStrictLoading<T>(fn: () => Promise<T>): Promise<T> {
    this._record._strictLoadingBypassCount++;
    try {
      return await fn();
    } finally {
      this._record._strictLoadingBypassCount--;
    }
  }

  /**
   * Build a new associated record (unsaved).
   * For direct has_many, sets the FK on the target.
   * For through associations, builds the target without FK — the join
   * record is created later via create() or push().
   */
  build(attrs: Record<string, unknown> = {}): Base {
    // Through association: build the target record (no FK on target)
    if (this._isThrough) {
      const record = this._buildThrough(attrs);
      const allowed = fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
      if (allowed) {
        this._target.push(record);
        fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
      }
      return record;
    }

    const record = this._buildRaw(attrs);
    const allowed = fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
    if (allowed) {
      this._target.push(record);
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    }
    return record;
  }

  private _buildRaw(attrs: Record<string, unknown> = {}): Base {
    const ctor = this._record.constructor as typeof Base;
    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;

    // Polymorphic "as" option
    const asName = this._assocDef.options.as;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`);

    const buildAttrs: Record<string, unknown> = {
      ...attrs,
      [foreignKey as string]: this._record.readAttribute(primaryKey as string),
    };
    if (asName) {
      buildAttrs[`${underscore(asName)}_type`] = ctor.name;
    }

    let targetModel = resolveModel(className);

    // STI: if a type attribute is provided, resolve to the correct subclass
    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol && buildAttrs[inheritanceCol]) {
      const typeName = buildAttrs[inheritanceCol] as string;
      targetModel = findStiClass(targetModel, typeName);
    }

    return new targetModel(buildAttrs);
  }

  private _buildThrough(attrs: Record<string, unknown> = {}): Base {
    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    let targetModel = resolveModel(className);

    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol && attrs[inheritanceCol]) {
      const typeName = attrs[inheritanceCol] as string;
      targetModel = findStiClass(targetModel, typeName);
    }

    return new targetModel(attrs);
  }

  /**
   * Build and save a new associated record.
   */
  async create(attrs: Record<string, unknown> = {}): Promise<Base> {
    this._ensureThroughWritable();
    if (this._isThrough) {
      return this._createThrough(attrs);
    }
    const record = this._buildRaw(attrs);
    if (!fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)) {
      return record;
    }
    const saved = await record.save();
    if (saved) {
      this._target.push(record);
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    }
    return record;
  }

  // NOTE: If _pushThrough fails after the target is saved, the target record
  // will be orphaned (no join row). Rails wraps this in a transaction. We don't
  // have transaction support yet — tracked in the roadmap under "Transactions".
  private async _createThrough(attrs: Record<string, unknown> = {}): Promise<Base> {
    const ctor = this._record.constructor as typeof Base;
    if (this._record.isNewRecord()) {
      throw new Error(`Cannot create through association on an unpersisted ${ctor.name}`);
    }
    const record = this._buildThrough(attrs);
    const saved = await record.save();
    if (!saved) return record;
    await this._pushThrough([record]);
    return record;
  }

  /**
   * Count associated records.
   */
  async count(): Promise<number> {
    const results = await loadHasMany(this._record, this._assocName, this._assocDef.options);
    return results.length;
  }

  /**
   * Alias for count.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#size
   */
  async size(): Promise<number> {
    if (this._loaded) return this._target.length;
    return this.count();
  }

  /**
   * Check if the collection is empty.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#empty?
   */
  async isEmpty(): Promise<boolean> {
    return (await this.count()) === 0;
  }

  /**
   * Add one or more records to the collection by setting the FK and saving.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#push / #<<
   */
  async push(...records: Base[]): Promise<void> {
    this._ensureThroughWritable();
    // Through association (including HABTM): create join records
    if (this._assocDef.options.through) {
      await this._pushThrough(records);
      return;
    }

    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ??
        this._assocDef.options.queryConstraints ??
        (Array.isArray(primaryKey)
          ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));
    const typeCol = asName ? `${underscore(asName)}_type` : null;
    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)) continue;
      if (Array.isArray(foreignKey)) {
        if (!Array.isArray(primaryKey) || primaryKey.length !== foreignKey.length) {
          throw new Error(
            `Composite foreignKey on "${this._assocName}" requires primaryKey to be an array of the same length`,
          );
        }
        for (let i = 0; i < foreignKey.length; i++) {
          record.writeAttribute(foreignKey[i], this._record.readAttribute(primaryKey[i] as string));
        }
      } else {
        if (Array.isArray(primaryKey)) {
          throw new Error(
            `Association "${this._assocName}" with composite primaryKey requires a composite foreignKey array`,
          );
        }
        const pkValue = this._record.readAttribute(primaryKey as string);
        record.writeAttribute(foreignKey as string, pkValue);
      }
      if (typeCol) record.writeAttribute(typeCol, ctor.name);
      const saved = await record.save();
      if (saved) {
        this._target.push(record);
        fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
      }
    }
  }

  private async _pushThrough(records: Base[]): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new Error(
        `Through association "${this._assocDef.options.through}" not found on ${ctor.name}`,
      );
    }

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const ownerFk = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = throughAssoc.options.primaryKey ?? ctor.primaryKey;
    const pkValue = this._record.readAttribute(primaryKey as string);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record)) continue;
      // Save the target record if it's new
      if (record.isNewRecord()) {
        const saved = await record.save();
        if (!saved) continue;
      }
      // Create the join record
      const joinAttrs: Record<string, unknown> = {
        [ownerFk as string]: pkValue,
        [sourceFk]: record.readAttribute((record.constructor as typeof Base).primaryKey as string),
      };
      // Handle polymorphic through (as option on through association)
      if (throughAssoc.options.as) {
        const typeCol = `${underscore(throughAssoc.options.as)}_type`;
        joinAttrs[`${underscore(throughAssoc.options.as)}_id`] = pkValue;
        joinAttrs[typeCol] = ctor.name;
        delete joinAttrs[ownerFk as string];
      }
      const joinRecord = await throughModel.create(joinAttrs);
      if (joinRecord.isPersisted()) {
        this._target.push(record);
        fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
      }
    }
  }

  /**
   * Alias for push.
   */
  async concat(...records: Base[]): Promise<void> {
    return this.push(...records);
  }

  /**
   * Delete associated records by nullifying the FK (or removing join record for through).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#delete
   */
  async delete(...records: Base[]): Promise<void> {
    this._ensureThroughWritable();
    // Through association (including HABTM): delete the join records
    if (this._assocDef.options.through) {
      await this._deleteThrough(records);
      return;
    }

    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const ownerPk = this._assocDef.options.primaryKey ?? ctor.primaryKey;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ??
        this._assocDef.options.queryConstraints ??
        (Array.isArray(ownerPk)
          ? ownerPk.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));
    const typeCol = asName ? `${underscore(asName)}_type` : null;
    const removed: Base[] = [];
    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record)) continue;
      if (Array.isArray(foreignKey)) {
        for (const fk of foreignKey) {
          record.writeAttribute(fk, null);
        }
      } else {
        record.writeAttribute(foreignKey as string, null);
      }
      if (typeCol) record.writeAttribute(typeCol, null);
      const saved = await record.save();
      if (saved) {
        removed.push(record);
        fireAssocCallbacks(this._assocDef.options.afterRemove, this._record, record);
      }
    }
    this._removeFromTarget(removed);
  }

  private _removeFromTarget(records: Base[]): void {
    const pkIdentities = new Set<string>();
    const nullPkRecords = new Set<Base>();
    for (const r of records) {
      const id = this._identityFor(r);
      if (id == null) {
        nullPkRecords.add(r);
      } else {
        pkIdentities.add(id);
      }
    }

    this._target = this._target.filter((r) => {
      const id = this._identityFor(r);
      if (id != null) return !pkIdentities.has(id);
      return !nullPkRecords.has(r);
    });
  }

  private async _deleteThrough(records: Base[]): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) return;

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const ownerFk = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = throughAssoc.options.primaryKey ?? ctor.primaryKey;
    const pkValue = this._record.readAttribute(primaryKey as string);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    const removed: Base[] = [];
    for (const record of records) {
      if (!fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record)) continue;
      const targetPk = record.readAttribute(
        (record.constructor as typeof Base).primaryKey as string,
      );
      const joinRecord = await throughModel.findBy({
        [ownerFk as string]: pkValue,
        [sourceFk]: targetPk,
      });
      if (joinRecord) {
        await joinRecord.destroy();
        if (joinRecord.isDestroyed()) {
          removed.push(record);
          fireAssocCallbacks(this._assocDef.options.afterRemove, this._record, record);
        }
      }
    }
    this._removeFromTarget(removed);
  }

  /**
   * Destroy associated records (runs callbacks and deletes from DB).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#destroy
   */
  async destroy(...records: Base[]): Promise<void> {
    const destroyed: Base[] = [];
    for (const record of records) {
      await record.destroy();
      if (record.isDestroyed()) destroyed.push(record);
    }
    // Remove join/through rows only for successfully destroyed records
    if (destroyed.length > 0) {
      if (this._isThrough) {
        await this._deleteThrough(destroyed);
      } else {
        this._removeFromTarget(destroyed);
      }
    }
  }

  /**
   * Remove all records from the collection by nullifying FKs.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#clear
   */
  async clear(): Promise<void> {
    return this._withoutStrictLoading(async () => {
      const records = await this.toArray();
      const persisted = records.filter((r) => !r.isNewRecord());
      if (persisted.length > 0) {
        await this.delete(...persisted);
      }
      const unsaved = this._target.filter((r) => r.isNewRecord());
      if (unsaved.length > 0) {
        this._removeFromTarget(unsaved);
      }
    });
  }

  /**
   * Check if a record is in the collection.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#include?
   */
  async includes(record: Base): Promise<boolean> {
    const records = await this.toArray();
    const pk = (record.constructor as typeof Base).primaryKey;
    const targetId = record.readAttribute(pk as string);
    return records.some((r) => r.readAttribute(pk as string) === targetId);
  }

  /**
   * Return the first associated record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first
   */
  async first(): Promise<Base | null> {
    const records = await this.toArray();
    return records[0] ?? null;
  }

  /**
   * Return the last associated record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#last
   */
  async last(): Promise<Base | null> {
    const records = await this.toArray();
    return records[records.length - 1] ?? null;
  }

  /**
   * Return the first n records (or first record if n omitted).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#take
   */
  async take(n?: number): Promise<Base | Base[] | null> {
    const records = await this.toArray();
    if (n === undefined) return records[0] ?? null;
    return records.slice(0, n);
  }

  /**
   * True if the collection has more than one record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#many?
   */
  async many(): Promise<boolean> {
    return (await this.count()) > 1;
  }

  /**
   * True if the collection has no records.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#none?
   */
  async none(): Promise<boolean> {
    return (await this.count()) === 0;
  }

  /**
   * True if the collection has exactly one record.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#one?
   */
  async one(): Promise<boolean> {
    return (await this.count()) === 1;
  }

  /**
   * True if any records exist in the collection (optionally matching conditions).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#exists?
   */
  async exists(conditions: Record<string, unknown> = {}): Promise<boolean> {
    const records = await this.toArray();
    if (Object.keys(conditions).length === 0) return records.length > 0;
    return records.some((r) =>
      Object.entries(conditions).every(([k, v]) => r.readAttribute(k) === v),
    );
  }

  /**
   * Filter the collection by conditions. Returns matching records.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#where
   */
  async where(conditions: Record<string, unknown>): Promise<Base[]> {
    const records = await this.toArray();
    return records.filter((r) =>
      Object.entries(conditions).every(([k, v]) => r.readAttribute(k) === v),
    );
  }

  /**
   * Find first record matching conditions, or build (but don't save) a new one.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first_or_initialize
   */
  async firstOrInitialize(conditions: Record<string, unknown> = {}): Promise<Base> {
    const matches = await this.where(conditions);
    if (matches.length > 0) return matches[0];
    return this.build(conditions);
  }

  /**
   * Find first record matching conditions, or create one.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first_or_create
   */
  async firstOrCreate(conditions: Record<string, unknown> = {}): Promise<Base> {
    const matches = await this.where(conditions);
    if (matches.length > 0) return matches[0];
    return this.create(conditions);
  }

  /**
   * Find first record matching conditions, or create one (raises on failure).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#first_or_create!
   */
  async firstOrCreate_(conditions: Record<string, unknown> = {}): Promise<Base> {
    const matches = await this.where(conditions);
    if (matches.length > 0) return matches[0];
    const record = this.build(conditions);
    await record.save();
    if (record.isNewRecord()) throw new Error("Failed to create record");
    return record;
  }

  /**
   * Replace the collection with a new set of records.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#replace
   */
  async replace(records: Base[]): Promise<void> {
    this._ensureThroughWritable();
    await this.clear();
    await this.push(...records);
  }

  /**
   * Destroy all records in the collection (runs callbacks, deletes from DB).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#destroy_all
   */
  async destroyAll(): Promise<void> {
    const records = await this.toArray();
    await this.destroy(...records);
  }

  /**
   * Find records within the association by id or array of ids.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#find
   */
  async find(id: number | number[]): Promise<Base | Base[]> {
    const records = await this.toArray();
    const targetModel = (records[0]?.constructor ?? Object) as typeof Base;
    const pk = targetModel.primaryKey ?? "id";
    if (Array.isArray(id)) {
      const found = records.filter((r) => id.includes(r.readAttribute(pk as string) as number));
      if (found.length !== id.length) throw new Error(`Couldn't find all records with ids: ${id}`);
      return found;
    }
    const found = records.find((r) => r.readAttribute(pk as string) === id);
    if (!found) throw new Error(`Couldn't find record with id=${id}`);
    return found;
  }

  /**
   * Set the collection to exactly the records identified by ids.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#ids=
   */
  async setIds(ids: (number | string)[]): Promise<void> {
    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    const targetModel = resolveModel(className);
    const cleanIds = ids.filter((id) => id !== null && id !== undefined && id !== "");
    const records = await Promise.all(cleanIds.map((id) => targetModel.find(Number(id))));
    await this.replace(records);
  }

  private async _resolveRecords(): Promise<Base[]> {
    if (this._loaded) return this._target;
    if (this._record._strictLoading && !this._record._strictLoadingBypassCount) {
      throw new StrictLoadingViolationError(this._record, this._assocName);
    }
    // For through associations, scope() may not handle all cases (nested through).
    // Fall back to loading via the loader, filtering to persisted records only
    // so pluck/pick don't include unsaved in-memory records.
    if (this._isThrough) {
      const all = await this.toArray();
      return all.filter((r) => !r.isNewRecord());
    }
    return this.scope().toArray();
  }

  async pluck(...columns: string[]): Promise<unknown[]> {
    const records = this._loaded ? this._target : await this._resolveRecords();
    if (columns.length === 1) {
      return records.map((r) => r.readAttribute(columns[0]));
    }
    return records.map((r) => columns.map((c) => r.readAttribute(c)));
  }

  async pick(...columns: string[]): Promise<unknown> {
    const records = this._loaded ? this._target : await this._resolveRecords();
    if (records.length === 0) return null;
    if (columns.length === 1) return records[0].readAttribute(columns[0]);
    return columns.map((c) => records[0].readAttribute(c));
  }

  async reload(): Promise<this> {
    this._loaded = false;
    this._target = [];
    await this.load();
    return this;
  }

  reset(): void {
    this._loaded = false;
    this._target = [];
  }

  scope(): any {
    if (this._isThrough) {
      return this._buildThroughScope();
    }

    const rel = buildHasManyRelation(this._record, this._assocName, this._assocDef.options);
    if (rel === null) {
      const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
      const targetModel = resolveModel(className);
      let emptyRel = (targetModel as any).all();
      if (this._assocDef.options.scope) {
        emptyRel = this._assocDef.options.scope(emptyRel);
      }
      return emptyRel.none();
    }
    return rel;
  }

  private _buildThroughScope(): any {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new Error(
        `Through association "${this._assocDef.options.through}" not found on ${ctor.name}`,
      );
    }

    const className = this._assocDef.options.className ?? camelize(singularize(this._assocName));
    const targetModel = resolveModel(className);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);

    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const throughModelAssocs: AssociationDefinition[] = (throughModel as any)._associations ?? [];
    const sourceAssoc =
      throughModelAssocs.find((a) => a.name === sourceName) ??
      throughModelAssocs.find((a) => a.name === pluralize(sourceName));

    const throughAs = throughAssoc.options.as;
    const ownerFk = throughAs
      ? (throughAssoc.options.foreignKey ?? `${underscore(throughAs)}_id`)
      : (throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`);
    const ownerPk = throughAssoc.options.primaryKey ?? ctor.primaryKey;

    if (Array.isArray(ownerPk)) {
      throw new Error(
        `CollectionProxy#scope does not support composite primary keys for through associations on "${this._assocName}".`,
      );
    }

    const pkValue = this._record.readAttribute(ownerPk as string);
    if (pkValue == null) return (targetModel as any).all().none();

    const throughTable = new ArelTable(throughModel.tableName);
    const targetArelTable = new ArelTable(targetModel.tableName);
    const sourceAssocKind = sourceAssoc?.type ?? "belongsTo";

    // Build the through table subquery
    if (Array.isArray(ownerFk)) {
      throw new Error(
        `CollectionProxy#scope does not support composite foreign keys for through associations on "${this._assocName}".`,
      );
    }
    let throughSubquery = throughTable.from().where(throughTable.get(ownerFk).eq(pkValue));
    if (throughAs) {
      throughSubquery = throughSubquery.where(
        throughTable.get(`${underscore(throughAs)}_type`).eq(ctor.name),
      );
    }

    if (sourceAssocKind === "belongsTo") {
      const targetFk = sourceAssoc?.options?.foreignKey ?? `${underscore(sourceName)}_id`;
      if (Array.isArray(targetFk)) {
        throw new Error(
          `CollectionProxy#scope does not support composite foreign keys for through associations on "${this._assocName}".`,
        );
      }
      if (Array.isArray(targetModel.primaryKey)) {
        throw new Error(
          `CollectionProxy#scope does not support composite primary keys on target model for through associations on "${this._assocName}".`,
        );
      }
      const targetFkStr = targetFk;
      const targetPkCol = targetModel.primaryKey;

      // Handle sourceType for polymorphic belongsTo sources
      if (sourceAssoc?.options?.polymorphic && this._assocDef.options.sourceType) {
        const sourceTypeCol = `${underscore(sourceAssoc.name ?? sourceName)}_type`;
        throughSubquery = throughSubquery.where(
          throughTable.get(sourceTypeCol).eq(this._assocDef.options.sourceType),
        );
      }

      throughSubquery.project(throughTable.get(targetFkStr));
      const inNode = targetArelTable.get(targetPkCol).in(throughSubquery);

      let rel = (targetModel as any).all().where(inNode);
      if (this._assocDef.options.scope) rel = this._assocDef.options.scope(rel);
      return rel;
    } else {
      const sourceAsName = sourceAssoc?.options?.as;
      const sourceFk = sourceAsName
        ? (sourceAssoc?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
        : (sourceAssoc?.options?.foreignKey ?? `${underscore(throughClassName)}_id`);
      if (Array.isArray(sourceFk)) {
        throw new Error(
          `CollectionProxy#scope does not support composite foreign keys for through associations on "${this._assocName}".`,
        );
      }
      if (Array.isArray(throughModel.primaryKey)) {
        throw new Error(
          `CollectionProxy#scope does not support composite primary keys on through model for "${this._assocName}".`,
        );
      }
      const sourceFkStr = sourceFk;
      const throughPkCol = throughModel.primaryKey;

      throughSubquery.project(throughTable.get(throughPkCol));
      const inNode = targetArelTable.get(sourceFkStr).in(throughSubquery);

      let rel = (targetModel as any).all().where(inNode);
      if (sourceAsName) {
        rel = rel.where({ [`${underscore(sourceAsName)}_type`]: throughClassName });
      }
      if (this._assocDef.options.scope) rel = this._assocDef.options.scope(rel);
      return rel;
    }
  }
}
