import type { Base } from "./base.js";
import { StrictLoadingViolationError, DeleteRestrictionError } from "./errors.js";
import { underscore, singularize, pluralize, camelize } from "@rails-ts/activesupport";

/**
 * Association options.
 */
export interface AssociationOptions {
  foreignKey?: string;
  className?: string;
  primaryKey?: string;
  dependent?: "destroy" | "nullify" | "delete" | "restrictWithException" | "restrictWithError";
  inverseOf?: string;
  through?: string;
  source?: string;
  polymorphic?: boolean;
  as?: string;
  counterCache?: boolean | string;
  touch?: boolean;
  autosave?: boolean;
  scope?: (rel: any) => any;
  required?: boolean;
  optional?: boolean;
  beforeAdd?: ((owner: Base, record: Base) => void) | ((owner: Base, record: Base) => void)[];
  afterAdd?: ((owner: Base, record: Base) => void) | ((owner: Base, record: Base) => void)[];
  beforeRemove?: ((owner: Base, record: Base) => void) | ((owner: Base, record: Base) => void)[];
  afterRemove?: ((owner: Base, record: Base) => void) | ((owner: Base, record: Base) => void)[];
}

export interface AssociationDefinition {
  type: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany";
  name: string;
  options: AssociationOptions & { joinTable?: string };
}

/**
 * Registry to hold model classes by name. Models must be registered
 * here so associations can resolve class references.
 */
export const modelRegistry = new Map<string, typeof Base>();

/**
 * Register a model class for association resolution.
 * Can be called as registerModel(Model) or registerModel("Name", Model).
 */
export function registerModel(nameOrModel: string | typeof Base, model?: typeof Base): void {
  if (typeof nameOrModel === "string") {
    if (!model) throw new Error("registerModel(name, model) requires a model class");
    modelRegistry.set(nameOrModel, model);
  } else {
    modelRegistry.set(nameOrModel.name, nameOrModel);
  }
}

/**
 * Resolve a model class by name.
 */
function resolveModel(name: string): typeof Base {
  const model = modelRegistry.get(name);
  if (!model) {
    throw new Error(
      `Model "${name}" not found in registry. Did you call registerModel(${name})?`
    );
  }
  return model;
}

/**
 * Associations mixin — adds belongsTo, hasOne, hasMany to a model class.
 *
 * Mirrors: ActiveRecord::Associations::ClassMethods
 */
export class Associations {
  static _associations: AssociationDefinition[] = [];

  /**
   * Define a belongs_to association.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#belongs_to
   */
  static belongsTo(name: string, options: AssociationOptions = {}): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_associations")) {
      this._associations = [...(this._associations ?? [])];
    }
    this._associations.push({ type: "belongsTo", name, options });

    // If required: true (or optional: false), add presence validation on the FK
    if (options.required || options.optional === false) {
      const foreignKey = options.foreignKey ?? `${underscore(name)}_id`;
      (this as any).validates(foreignKey, { presence: true });
    }
  }

  /**
   * Define a has_one association.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#has_one
   */
  static hasOne(name: string, options: AssociationOptions = {}): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_associations")) {
      this._associations = [...(this._associations ?? [])];
    }
    this._associations.push({ type: "hasOne", name, options });
  }

  /**
   * Define a has_many association.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#has_many
   */
  static hasMany(name: string, options: AssociationOptions = {}): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_associations")) {
      this._associations = [...(this._associations ?? [])];
    }
    this._associations.push({ type: "hasMany", name, options });
  }

  /**
   * Define a has_and_belongs_to_many association.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#has_and_belongs_to_many
   */
  static hasAndBelongsToMany(
    name: string,
    options: AssociationOptions & { joinTable?: string } = {}
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_associations")) {
      this._associations = [...(this._associations ?? [])];
    }
    this._associations.push({ type: "hasAndBelongsToMany", name, options });
  }
}

/**
 * Load a belongs_to association.
 */
export async function loadBelongsTo(
  record: Base,
  assocName: string,
  options: AssociationOptions
): Promise<Base | null> {
  // Check cached (inverse_of) first, then preloaded
  if ((record as any)._cachedAssociations?.has(assocName)) {
    return (record as any)._cachedAssociations.get(assocName) as Base | null;
  }
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base | null;
  }

  // Strict loading check: this is a lazy load
  if ((record as any)._strictLoading) {
    throw new StrictLoadingViolationError(record, assocName);
  }

  const foreignKey = options.foreignKey ?? `${underscore(assocName)}_id`;
  const primaryKey = options.primaryKey ?? "id";

  // Polymorphic: use the _type column to determine the target model
  let className: string;
  if (options.polymorphic) {
    const typeCol = `${underscore(assocName)}_type`;
    const typeName = record.readAttribute(typeCol) as string | null;
    if (!typeName) return null;
    className = typeName;
  } else {
    className = options.className ?? camelize(assocName);
  }

  const targetModel = resolveModel(className);
  const fkValue = record.readAttribute(foreignKey);
  if (fkValue === null || fkValue === undefined) return null;

  const result = await targetModel.findBy({ [primaryKey]: fkValue });

  // Set inverse_of: store reference back to the owner
  if (result && options.inverseOf) {
    (result as any)._cachedAssociations = (result as any)._cachedAssociations ?? new Map();
    (result as any)._cachedAssociations.set(options.inverseOf, record);
  }

  return result;
}

/**
 * Load a has_one association.
 */
export async function loadHasOne(
  record: Base,
  assocName: string,
  options: AssociationOptions
): Promise<Base | null> {
  // Check cached (inverse_of) first, then preloaded
  if ((record as any)._cachedAssociations?.has(assocName)) {
    return (record as any)._cachedAssociations.get(assocName) as Base | null;
  }
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base | null;
  }

  // Strict loading check
  if ((record as any)._strictLoading) {
    throw new StrictLoadingViolationError(record, assocName);
  }

  // Handle has_one :through
  if (options.through) {
    return loadHasOneThrough(record, assocName, options);
  }

  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(assocName);
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  const targetModel = resolveModel(className);
  const pkValue = record.readAttribute(primaryKey);
  if (pkValue === null || pkValue === undefined) return null;

  // Polymorphic "as" option: has_one :image, as: :imageable
  if (options.as) {
    const foreignKey = options.foreignKey ?? `${underscore(options.as)}_id`;
    const typeCol = `${underscore(options.as)}_type`;
    return targetModel.findBy({
      [foreignKey]: pkValue,
      [typeCol]: ctor.name,
    });
  }

  const foreignKey = options.foreignKey ?? `${underscore(ctor.name)}_id`;
  let result: Base | null;
  if (options.scope) {
    let rel = (targetModel as any).all().where({ [foreignKey]: pkValue });
    rel = options.scope(rel);
    result = await rel.first();
  } else {
    result = await targetModel.findBy({ [foreignKey]: pkValue });
  }

  // Set inverse_of: store reference back to the owner
  if (result && options.inverseOf) {
    (result as any)._cachedAssociations = (result as any)._cachedAssociations ?? new Map();
    (result as any)._cachedAssociations.set(options.inverseOf, record);
  }

  return result;
}

/**
 * Load a has_many association.
 */
export async function loadHasMany(
  record: Base,
  assocName: string,
  options: AssociationOptions
): Promise<Base[]> {
  // Check cached (inverse_of) first, then preloaded
  if ((record as any)._cachedAssociations?.has(assocName)) {
    return (record as any)._cachedAssociations.get(assocName) as Base[];
  }
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base[];
  }

  // Strict loading check
  if ((record as any)._strictLoading) {
    throw new StrictLoadingViolationError(record, assocName);
  }

  // Handle through associations
  if (options.through) {
    return loadHasManyThrough(record, assocName, options);
  }

  const ctor = record.constructor as typeof Base;
  const className =
    options.className ?? camelize(singularize(assocName));
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  const targetModel = resolveModel(className);
  const pkValue = record.readAttribute(primaryKey);
  if (pkValue === null || pkValue === undefined) return [];

  // Polymorphic "as" option: has_many :comments, as: :commentable
  if (options.as) {
    const foreignKey = options.foreignKey ?? `${underscore(options.as)}_id`;
    const typeCol = `${underscore(options.as)}_type`;
    const rel = (targetModel as any).all().where({
      [foreignKey]: pkValue,
      [typeCol]: ctor.name,
    });
    return rel.toArray();
  }

  const foreignKey = options.foreignKey ?? `${underscore(ctor.name)}_id`;
  let rel = (targetModel as any).all().where({ [foreignKey]: pkValue });
  // Apply association scope
  if (options.scope) {
    rel = options.scope(rel);
  }
  const results: Base[] = await rel.toArray();

  // Set inverse_of on each loaded child
  if (options.inverseOf) {
    for (const child of results) {
      (child as any)._cachedAssociations = (child as any)._cachedAssociations ?? new Map();
      (child as any)._cachedAssociations.set(options.inverseOf, record);
    }
  }

  return results;
}

/**
 * Load a has_many :through association.
 */
export async function loadHasManyThrough(
  record: Base,
  assocName: string,
  options: AssociationOptions
): Promise<Base[]> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const throughAssoc = associations.find((a) => a.name === options.through);
  if (!throughAssoc) {
    throw new Error(`Through association "${options.through}" not found on ${ctor.name}`);
  }

  // Load through records
  let throughRecords: Base[];
  if (throughAssoc.type === "hasMany") {
    throughRecords = await loadHasMany(record, throughAssoc.name, throughAssoc.options);
  } else if (throughAssoc.type === "hasOne") {
    const one = await loadHasOne(record, throughAssoc.name, throughAssoc.options);
    throughRecords = one ? [one] : [];
  } else if (throughAssoc.type === "belongsTo") {
    const one = await loadBelongsTo(record, throughAssoc.name, throughAssoc.options);
    throughRecords = one ? [one] : [];
  } else {
    throughRecords = [];
  }

  if (throughRecords.length === 0) return [];

  // Resolve the target model
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveModel(className);

  // The source defaults to the singularized association name
  const sourceName = options.source ?? singularize(assocName);

  // Look up the source association on the through model (try singular and plural)
  const throughCtor = throughRecords[0].constructor as typeof Base;
  const throughModelAssocs: AssociationDefinition[] = (throughCtor as any)._associations ?? [];
  const sourceAssoc = throughModelAssocs.find((a) => a.name === sourceName)
    ?? throughModelAssocs.find((a) => a.name === pluralize(sourceName));
  const sourceType = sourceAssoc?.type ?? "belongsTo";

  if (sourceType === "belongsTo") {
    // Through record has FK pointing to target (e.g., tagging.tag_id -> tag.id)
    const targetFk = sourceAssoc?.options?.foreignKey ?? `${underscore(sourceName)}_id`;
    const targetIds = throughRecords
      .map((r) => r.readAttribute(targetFk))
      .filter((v) => v !== null && v !== undefined);
    if (targetIds.length === 0) return [];
    let rel = (targetModel as any).all().where({ [targetModel.primaryKey]: targetIds });
    if (options.scope) rel = options.scope(rel);
    return rel.toArray();
  } else {
    // Source is has_many/has_one: target has FK pointing back to through record
    const sourceAsName = sourceAssoc?.options?.as;
    const throughClassName = throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const sourceFk = sourceAsName
      ? (sourceAssoc?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
      : (sourceAssoc?.options?.foreignKey ?? `${underscore(throughClassName)}_id`);
    const throughIds = throughRecords
      .map((r) => r.readAttribute((r.constructor as typeof Base).primaryKey))
      .filter((v) => v !== null && v !== undefined);
    if (throughIds.length === 0) return [];
    const whereConditions: Record<string, unknown> = { [sourceFk]: throughIds };
    if (sourceAsName) whereConditions[`${underscore(sourceAsName)}_type`] = throughClassName;
    let rel2 = (targetModel as any).all().where(whereConditions);
    if (options.scope) rel2 = options.scope(rel2);
    return rel2.toArray();
  }
}

/**
 * Load a has_one :through association.
 */
export async function loadHasOneThrough(
  record: Base,
  assocName: string,
  options: AssociationOptions
): Promise<Base | null> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const throughAssoc = associations.find((a) => a.name === options.through);
  if (!throughAssoc) {
    throw new Error(`Through association "${options.through}" not found on ${ctor.name}`);
  }

  // Load the through record (could be has_one or belongs_to)
  let throughRecord: Base | null;
  if (throughAssoc.type === "hasOne") {
    throughRecord = await loadHasOne(record, throughAssoc.name, throughAssoc.options);
  } else if (throughAssoc.type === "belongsTo") {
    throughRecord = await loadBelongsTo(record, throughAssoc.name, throughAssoc.options);
  } else if (throughAssoc.type === "hasMany") {
    const throughRecords = await loadHasMany(record, throughAssoc.name, throughAssoc.options);
    throughRecord = throughRecords[0] ?? null;
  } else {
    throughRecord = null;
  }

  if (!throughRecord) return null;

  // Now load the source from the through record
  const sourceName = options.source ?? assocName;
  const throughCtor = throughRecord.constructor as typeof Base;
  const throughAssociations: AssociationDefinition[] = (throughCtor as any)._associations ?? [];
  const sourceAssoc = throughAssociations.find((a) => a.name === sourceName);

  if (sourceAssoc) {
    if (sourceAssoc.type === "belongsTo") {
      return loadBelongsTo(throughRecord, sourceName, sourceAssoc.options);
    } else if (sourceAssoc.type === "hasOne") {
      return loadHasOne(throughRecord, sourceName, sourceAssoc.options);
    }
  }

  // Fallback: try as belongs_to by convention
  const className = options.className ?? camelize(sourceName);
  const targetFk = `${underscore(sourceName)}_id`;
  const fkValue = throughRecord.readAttribute(targetFk);
  if (fkValue === null || fkValue === undefined) return null;
  const targetModel = resolveModel(className);
  return targetModel.findBy({ [targetModel.primaryKey]: fkValue });
}

/**
 * Compute the default join table name for HABTM.
 * Uses the two table names in alphabetical order, joined by underscore.
 */
function defaultJoinTableName(model1: typeof Base, assocName: string): string {
  const table1 = underscore(model1.name);
  const table2 = underscore(assocName);
  // Sort alphabetically
  const sorted = [pluralize(table1), table2].sort();
  return sorted.join("_");
}

/**
 * Load a has_and_belongs_to_many association.
 */
export async function loadHabtm(
  record: Base,
  assocName: string,
  options: AssociationOptions & { joinTable?: string }
): Promise<Base[]> {
  // Check preloaded cache first
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base[];
  }

  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveModel(className);
  const joinTable = options.joinTable ?? defaultJoinTableName(ctor, assocName);
  const ownerFk = `${underscore(ctor.name)}_id`;
  const targetFk = `${underscore(singularize(assocName))}_id`;
  const pkValue = record.readAttribute(ctor.primaryKey);
  if (pkValue === null || pkValue === undefined) return [];

  // Query the join table to get target IDs
  const pkQuoted = typeof pkValue === "number" ? String(pkValue) : `'${pkValue}'`;
  const joinRows = await ctor.adapter.execute(
    `SELECT "${targetFk}" FROM "${joinTable}" WHERE "${ownerFk}" = ${pkQuoted}`
  );

  const targetIds = joinRows.map((r) => r[targetFk]).filter((v) => v != null);
  if (targetIds.length === 0) return [];

  return (targetModel as any).all().where({ [targetModel.primaryKey]: targetIds }).toArray();
}

/**
 * Process dependent associations before destroying a record.
 */
export async function processDependentAssociations(record: Base): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

  for (const assoc of associations) {
    if (!assoc.options.dependent) continue;
    if (assoc.type !== "hasMany" && assoc.type !== "hasOne") continue;

    const dep = assoc.options.dependent;

    if (assoc.type === "hasMany") {
      const children = await loadHasMany(record, assoc.name, assoc.options);
      if (dep === "destroy") {
        for (const child of children) {
          await child.destroy();
        }
      } else if (dep === "delete") {
        for (const child of children) {
          await child.delete();
        }
      } else if (dep === "nullify") {
        const asName = assoc.options.as;
        const foreignKey = asName
          ? (assoc.options.foreignKey ?? `${underscore(asName)}_id`)
          : (assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`);
        const typeCol = asName ? `${underscore(asName)}_type` : null;
        for (const child of children) {
          child.writeAttribute(foreignKey, null);
          if (typeCol) child.writeAttribute(typeCol, null);
          await child.save();
        }
      } else if (dep === "restrictWithException") {
        if (children.length > 0) {
          throw new DeleteRestrictionError(record, assoc.name);
        }
      } else if (dep === "restrictWithError") {
        if (children.length > 0) {
          (record as any).errors?.add("base", "invalid", { message: `Cannot delete record because dependent ${assoc.name} exist` });
          throw new DeleteRestrictionError(record, assoc.name);
        }
      }
    } else if (assoc.type === "hasOne") {
      const child = await loadHasOne(record, assoc.name, assoc.options);
      if (!child) continue;
      if (dep === "destroy") {
        await child.destroy();
      } else if (dep === "delete") {
        await child.delete();
      } else if (dep === "nullify") {
        const hasOneAsName = assoc.options.as;
        const foreignKey = hasOneAsName
          ? (assoc.options.foreignKey ?? `${underscore(hasOneAsName)}_id`)
          : (assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`);
        child.writeAttribute(foreignKey, null);
        if (hasOneAsName) child.writeAttribute(`${underscore(hasOneAsName)}_type`, null);
        await child.save();
      } else if (dep === "restrictWithException") {
        throw new DeleteRestrictionError(record, assoc.name);
      } else if (dep === "restrictWithError") {
        (record as any).errors?.add("base", "invalid", { message: `Cannot delete record because dependent ${assoc.name} exists` });
        throw new DeleteRestrictionError(record, assoc.name);
      }
    }
  }
}

/**
 * Fire one or more association callbacks (before_add, after_add, etc.).
 */
function fireAssocCallbacks(
  cbs: ((owner: Base, record: Base) => void) | ((owner: Base, record: Base) => void)[] | undefined,
  owner: Base,
  record: Base
): void {
  if (!cbs) return;
  const arr = Array.isArray(cbs) ? cbs : [cbs];
  for (const cb of arr) cb(owner, record);
}

/**
 * CollectionProxy — wraps a has_many association with convenience methods.
 *
 * Mirrors: ActiveRecord::Associations::CollectionProxy
 */
export class CollectionProxy {
  private _record: Base;
  private _assocName: string;
  private _assocDef: AssociationDefinition;

  constructor(record: Base, assocName: string, assocDef: AssociationDefinition) {
    this._record = record;
    this._assocName = assocName;
    this._assocDef = assocDef;
  }

  /**
   * Load and return all associated records.
   */
  async toArray(): Promise<Base[]> {
    return loadHasMany(this._record, this._assocName, this._assocDef.options);
  }

  /**
   * Build a new associated record (unsaved) with the FK set.
   */
  build(attrs: Record<string, unknown> = {}): Base {
    const ctor = this._record.constructor as typeof Base;
    const className = this._assocDef.options.className ??
      camelize(singularize(this._assocName));
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;

    // Polymorphic "as" option
    const asName = this._assocDef.options.as;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`);

    const buildAttrs: Record<string, unknown> = {
      ...attrs,
      [foreignKey]: this._record.readAttribute(primaryKey),
    };
    if (asName) {
      buildAttrs[`${underscore(asName)}_type`] = ctor.name;
    }

    const targetModel = resolveModel(className);
    return new targetModel(buildAttrs);
  }

  /**
   * Build and save a new associated record.
   */
  async create(attrs: Record<string, unknown> = {}): Promise<Base> {
    const record = this.build(attrs);
    await record.save();
    return record;
  }

  /**
   * Count associated records.
   */
  async count(): Promise<number> {
    const records = await this.toArray();
    return records.length;
  }

  /**
   * Alias for count.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#size
   */
  async size(): Promise<number> {
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
    // Through association: create join records instead of setting FK on target
    if (this._assocDef.options.through) {
      await this._pushThrough(records);
      return;
    }

    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`);
    const typeCol = asName ? `${underscore(asName)}_type` : null;
    const primaryKey = this._assocDef.options.primaryKey ?? ctor.primaryKey;
    const pkValue = this._record.readAttribute(primaryKey);
    for (const record of records) {
      fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
      record.writeAttribute(foreignKey, pkValue);
      if (typeCol) record.writeAttribute(typeCol, ctor.name);
      await record.save();
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
    }
  }

  private async _pushThrough(records: Base[]): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) {
      throw new Error(`Through association "${this._assocDef.options.through}" not found on ${ctor.name}`);
    }

    const throughClassName = throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const ownerFk = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = throughAssoc.options.primaryKey ?? ctor.primaryKey;
    const pkValue = this._record.readAttribute(primaryKey);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    for (const record of records) {
      fireAssocCallbacks(this._assocDef.options.beforeAdd, this._record, record);
      // Save the target record if it's new
      if (record.isNewRecord()) await record.save();
      // Create the join record
      const joinAttrs: Record<string, unknown> = {
        [ownerFk]: pkValue,
        [sourceFk]: record.readAttribute((record.constructor as typeof Base).primaryKey),
      };
      // Handle polymorphic through (as option on through association)
      if (throughAssoc.options.as) {
        const typeCol = `${underscore(throughAssoc.options.as)}_type`;
        joinAttrs[`${underscore(throughAssoc.options.as)}_id`] = pkValue;
        joinAttrs[typeCol] = ctor.name;
        delete joinAttrs[ownerFk];
      }
      await throughModel.create(joinAttrs);
      fireAssocCallbacks(this._assocDef.options.afterAdd, this._record, record);
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
    // Through association: delete the join records
    if (this._assocDef.options.through) {
      await this._deleteThrough(records);
      return;
    }

    const ctor = this._record.constructor as typeof Base;
    const asName = this._assocDef.options.as;
    const foreignKey = asName
      ? (this._assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
      : (this._assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`);
    const typeCol = asName ? `${underscore(asName)}_type` : null;
    for (const record of records) {
      fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record);
      record.writeAttribute(foreignKey, null);
      if (typeCol) record.writeAttribute(typeCol, null);
      await record.save();
      fireAssocCallbacks(this._assocDef.options.afterRemove, this._record, record);
    }
  }

  private async _deleteThrough(records: Base[]): Promise<void> {
    const ctor = this._record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
    const throughAssoc = associations.find((a: any) => a.name === this._assocDef.options.through);
    if (!throughAssoc) return;

    const throughClassName = throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const throughModel = resolveModel(throughClassName);
    const ownerFk = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = throughAssoc.options.primaryKey ?? ctor.primaryKey;
    const pkValue = this._record.readAttribute(primaryKey);
    const sourceName = this._assocDef.options.source ?? singularize(this._assocName);
    const sourceFk = `${underscore(sourceName)}_id`;

    for (const record of records) {
      fireAssocCallbacks(this._assocDef.options.beforeRemove, this._record, record);
      const targetPk = record.readAttribute((record.constructor as typeof Base).primaryKey);
      // Find and destroy the join record
      const joinRecord = await throughModel.findBy({
        [ownerFk]: pkValue,
        [sourceFk]: targetPk,
      });
      if (joinRecord) await joinRecord.destroy();
      fireAssocCallbacks(this._assocDef.options.afterRemove, this._record, record);
    }
  }

  /**
   * Destroy associated records (runs callbacks and deletes from DB).
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#destroy
   */
  async destroy(...records: Base[]): Promise<void> {
    for (const record of records) {
      await record.destroy();
    }
  }

  /**
   * Remove all records from the collection by nullifying FKs.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#clear
   */
  async clear(): Promise<void> {
    const records = await this.toArray();
    await this.delete(...records);
  }

  /**
   * Check if a record is in the collection.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#include?
   */
  async includes(record: Base): Promise<boolean> {
    const records = await this.toArray();
    const pk = (record.constructor as typeof Base).primaryKey;
    const targetId = record.readAttribute(pk);
    return records.some(r => r.readAttribute(pk) === targetId);
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
    return records.some(r =>
      Object.entries(conditions).every(([k, v]) => r.readAttribute(k) === v)
    );
  }

  /**
   * Filter the collection by conditions. Returns matching records.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#where
   */
  async where(conditions: Record<string, unknown>): Promise<Base[]> {
    const records = await this.toArray();
    return records.filter(r =>
      Object.entries(conditions).every(([k, v]) => r.readAttribute(k) === v)
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
    for (const record of records) {
      await record.destroy();
    }
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
      const found = records.filter(r => id.includes(r.readAttribute(pk) as number));
      if (found.length !== id.length) throw new Error(`Couldn't find all records with ids: ${id}`);
      return found;
    }
    const found = records.find(r => r.readAttribute(pk) === id);
    if (!found) throw new Error(`Couldn't find record with id=${id}`);
    return found;
  }

  /**
   * Set the collection to exactly the records identified by ids.
   *
   * Mirrors: ActiveRecord::Associations::CollectionProxy#ids=
   */
  async setIds(ids: (number | string)[]): Promise<void> {
    const className = this._assocDef.options.className ??
      camelize(singularize(this._assocName));
    const targetModel = resolveModel(className);
    const cleanIds = ids.filter(id => id !== null && id !== undefined && id !== "");
    const records = await Promise.all(cleanIds.map(id => targetModel.find(Number(id))));
    await this.replace(records);
  }
}

/**
 * Factory to get a CollectionProxy for a has_many association.
 */
export function association(record: Base, assocName: string): CollectionProxy {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a) => a.name === assocName);
  if (!assocDef) {
    throw new Error(`Association "${assocName}" not found on ${ctor.name}`);
  }
  return new CollectionProxy(record, assocName, assocDef);
}

/**
 * Update counter caches after a record is created or destroyed.
 *
 * Mirrors: ActiveRecord::CounterCache
 */
export async function updateCounterCaches(
  record: Base,
  direction: "increment" | "decrement"
): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

  for (const assoc of associations) {
    if (assoc.type !== "belongsTo" || !assoc.options.counterCache) continue;

    const foreignKey = assoc.options.foreignKey ?? `${underscore(assoc.name)}_id`;
    const fkValue = record.readAttribute(foreignKey);
    if (fkValue === null || fkValue === undefined) continue;

    // For polymorphic, resolve model from _type column
    let className: string;
    if (assoc.options.polymorphic) {
      const typeCol = `${underscore(assoc.name)}_type`;
      const typeName = record.readAttribute(typeCol) as string | null;
      if (!typeName) continue;
      className = typeName;
    } else {
      className = assoc.options.className ?? camelize(assoc.name);
    }
    const targetModel = resolveModel(className);

    // Counter column name
    const counterCol =
      typeof assoc.options.counterCache === "string"
        ? assoc.options.counterCache
        : `${pluralize(underscore(ctor.name))}_count`;

    const parent = await targetModel.findBy({ [targetModel.primaryKey]: fkValue });
    if (!parent) continue;

    if (direction === "increment") {
      await parent.incrementBang(counterCol);
    } else {
      await parent.decrementBang(counterCol);
    }
  }
}

/**
 * Touch parent associations after a record is saved or destroyed.
 *
 * Mirrors: ActiveRecord::Associations::Builder::BelongsTo touch option
 */
/**
 * Set a belongs_to association on a record.
 * Sets the foreign key and caches the associated record.
 * Also sets inverse_of on the target if configured.
 *
 * Mirrors: ActiveRecord::Associations::BelongsToAssociation#writer
 */
export function setBelongsTo(
  record: Base,
  assocName: string,
  target: Base | null,
  options: AssociationOptions = {}
): void {
  const foreignKey = options.foreignKey ?? `${underscore(assocName)}_id`;
  const primaryKey = options.primaryKey ?? "id";

  if (target) {
    record.writeAttribute(foreignKey, target.readAttribute(primaryKey));
    // Polymorphic: set the _type column
    if (options.polymorphic) {
      const typeCol = `${underscore(assocName)}_type`;
      record.writeAttribute(typeCol, (target.constructor as typeof Base).name);
    }
  } else {
    record.writeAttribute(foreignKey, null);
    if (options.polymorphic) {
      const typeCol = `${underscore(assocName)}_type`;
      record.writeAttribute(typeCol, null);
    }
  }

  // Cache the association
  if (!(record as any)._cachedAssociations) (record as any)._cachedAssociations = new Map();
  (record as any)._cachedAssociations.set(assocName, target);

  // Set inverse on target
  if (target && options.inverseOf) {
    if (!(target as any)._cachedAssociations) (target as any)._cachedAssociations = new Map();
    (target as any)._cachedAssociations.set(options.inverseOf, record);
  }
}

/**
 * Set a has_one association on a record.
 * Sets the foreign key on the target and caches.
 *
 * Mirrors: ActiveRecord::Associations::HasOneAssociation#writer
 */
export async function setHasOne(
  record: Base,
  assocName: string,
  target: Base | null,
  options: AssociationOptions = {}
): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const primaryKey = options.primaryKey ?? ctor.primaryKey;
  const pkValue = record.readAttribute(primaryKey);

  // Polymorphic "as" option
  const asName = options.as;
  const foreignKey = asName
    ? (options.foreignKey ?? `${underscore(asName)}_id`)
    : (options.foreignKey ?? `${underscore(ctor.name)}_id`);
  const typeCol = asName ? `${underscore(asName)}_type` : null;

  // Nullify old target
  const className = options.className ?? camelize(assocName);
  const targetModel = resolveModel(className);
  const findConditions: Record<string, unknown> = { [foreignKey]: pkValue };
  if (typeCol) findConditions[typeCol] = ctor.name;
  const existing = await targetModel.findBy(findConditions);
  if (existing && existing !== target) {
    existing.writeAttribute(foreignKey, null);
    if (typeCol) existing.writeAttribute(typeCol, null);
    await existing.save();
  }

  if (target) {
    target.writeAttribute(foreignKey, pkValue);
    if (typeCol) target.writeAttribute(typeCol, ctor.name);
    if (target.isPersisted()) await target.save();
  }

  // Cache
  if (!(record as any)._cachedAssociations) (record as any)._cachedAssociations = new Map();
  (record as any)._cachedAssociations.set(assocName, target);

  // Set inverse
  if (target && options.inverseOf) {
    if (!(target as any)._cachedAssociations) (target as any)._cachedAssociations = new Map();
    (target as any)._cachedAssociations.set(options.inverseOf, record);
  }
}

/**
 * Set a has_many association (replace entire collection).
 * Nullifies old targets' FKs, sets new ones.
 *
 * Mirrors: ActiveRecord::Associations::HasManyAssociation#writer
 */
export async function setHasMany(
  record: Base,
  assocName: string,
  targets: Base[],
  options: AssociationOptions = {}
): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const primaryKey = options.primaryKey ?? ctor.primaryKey;
  const pkValue = record.readAttribute(primaryKey);

  // Polymorphic "as" option
  const asName = options.as;
  const foreignKey = asName
    ? (options.foreignKey ?? `${underscore(asName)}_id`)
    : (options.foreignKey ?? `${underscore(ctor.name)}_id`);
  const typeCol = asName ? `${underscore(asName)}_type` : null;

  // Nullify old targets
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveModel(className);
  const findConditions: Record<string, unknown> = { [foreignKey]: pkValue };
  if (typeCol) findConditions[typeCol] = ctor.name;
  const existing = await (targetModel as any).where(findConditions).toArray();
  for (const old of existing) {
    if (!targets.includes(old)) {
      old.writeAttribute(foreignKey, null);
      if (typeCol) old.writeAttribute(typeCol, null);
      await old.save();
    }
  }

  // Set FK on new targets
  for (const t of targets) {
    t.writeAttribute(foreignKey, pkValue);
    if (typeCol) t.writeAttribute(typeCol, ctor.name);
    if (t.isPersisted()) await t.save();

    // Set inverse
    if (options.inverseOf) {
      if (!(t as any)._cachedAssociations) (t as any)._cachedAssociations = new Map();
      (t as any)._cachedAssociations.set(options.inverseOf, record);
    }
  }

  // Cache the collection
  if (!(record as any)._cachedAssociations) (record as any)._cachedAssociations = new Map();
  (record as any)._cachedAssociations.set(assocName, targets);
}

export async function touchBelongsToParents(record: Base): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

  for (const assoc of associations) {
    if (assoc.type !== "belongsTo" || !assoc.options.touch) continue;

    const foreignKey = assoc.options.foreignKey ?? `${underscore(assoc.name)}_id`;
    const fkValue = record.readAttribute(foreignKey);
    if (fkValue === null || fkValue === undefined) continue;

    const className = assoc.options.className ?? camelize(assoc.name);
    const targetModel = resolveModel(className);

    const parent = await targetModel.findBy({ [targetModel.primaryKey]: fkValue });
    if (!parent) continue;

    await parent.touch();
  }
}
