import type { Base } from "./base.js";
import { modelRegistry } from "./associations.js";
import { ActiveRecordError, UnknownAttributeError, RecordNotFound } from "./errors.js";
import { singularize, camelize, underscore } from "@blazetrails/activesupport";
import { Table, UpdateManager } from "@blazetrails/arel";
import { isMarkedForDestruction, markForDestruction } from "./autosave-association.js";
import { BooleanType } from "@blazetrails/activemodel";

/**
 * Raised when more nested-attribute records are provided than the
 * association's `limit` option allows.
 *
 * Mirrors: ActiveRecord::NestedAttributes::TooManyRecords
 */
export class TooManyRecords extends ActiveRecordError {
  constructor(message?: string) {
    super(message);
    this.name = "TooManyRecords";
  }
}

/**
 * Returns whether the record is marked for destruction in the context of
 * nested attributes. Mirrors Rails' NestedAttributes instance method `_destroy`,
 * which delegates to `marked_for_destruction?`.
 *
 * Mirrors: ActiveRecord::NestedAttributes#_destroy
 */
export function _destroy(this: Base): boolean {
  return isMarkedForDestruction(this);
}

interface NestedAttributeOptions {
  allowDestroy?: boolean;
  rejectIf?: (attrs: Record<string, unknown>) => boolean;
  limit?: number | ((...args: unknown[]) => number);
  updateOnly?: boolean;
}

interface NestedAttributeConfig {
  associationName: string;
  options: NestedAttributeOptions;
}

/**
 * Configure nested attributes for an association.
 *
 * Mirrors: ActiveRecord::Base.accepts_nested_attributes_for
 *
 * Usage:
 *   acceptsNestedAttributesFor(Post, 'comments', { allowDestroy: true })
 *
 * Then when saving:
 *   post.assignAttributes({ commentsAttributes: [{ body: 'hi' }, { id: 1, _destroy: true }] })
 *   await post.save()
 */
export function acceptsNestedAttributesFor(
  modelClass: typeof Base,
  associationName: string,
  options: NestedAttributeOptions = {},
): void {
  // Validate that the association exists
  const associations: any[] = (modelClass as any)._associations ?? [];
  const assocExists = associations.find((a: any) => a.name === associationName);
  if (!assocExists) {
    throw new Error(`No association found for name '${associationName}'. Has it been defined yet?`);
  }

  // Rails does NOT reject polymorphic belongs_to at declaration time — the
  // check is deferred to build time (the writer raises when it tries to build
  // a new record and finds no `build_#{association_name}` method). See
  // assign_nested_attributes_for_one_to_one_association in Rails'
  // nested_attributes.rb. We mirror that in
  // assignNestedAttributesForOneToOneAssociation.

  // Store config on the class
  if (!(modelClass as any)._nestedAttributeConfigs) {
    (modelClass as any)._nestedAttributeConfigs = [];
  }
  (modelClass as any)._nestedAttributeConfigs.push({
    associationName,
    options,
  } as NestedAttributeConfig);

  const type =
    assocExists.type === "hasMany" || assocExists.type === "hasAndBelongsToMany"
      ? "collection"
      : "one_to_one";
  generateAssociationWriter(modelClass, associationName, type);

  // Wrap save to flush pending nested attributes after the parent is persisted
  const originalSave = modelClass.prototype.save;
  if (!(modelClass as any)._nestedSaveWrapped) {
    (modelClass as any)._nestedSaveWrapped = true;

    modelClass.prototype.save = async function (this: Base): Promise<boolean> {
      const result = await originalSave.call(this);
      if (!result) return false;

      await processNestedAttributes(this);
      return true;
    };
  }
}

/**
 * Assign nested attributes for an association.
 *
 * Mirrors: ActiveRecord::Base#assign_nested_attributes_for
 */
export function assignNestedAttributes(
  record: Base,
  associationName: string,
  attributesArray: Record<string, unknown>[] | Record<string, Record<string, unknown>>,
): void {
  // Validate input type
  if (typeof attributesArray !== "object" || attributesArray === null) {
    throw new Error("Hash or Array expected for nested attributes, got: " + typeof attributesArray);
  }

  // Normalize hash-keyed format to array
  let attrs: Record<string, unknown>[];
  if (Array.isArray(attributesArray)) {
    attrs = attributesArray;
  } else {
    // Sort by keys before converting to array (Rails sorts hash keys)
    const sortedKeys = Object.keys(attributesArray).sort();
    attrs = sortedKeys.map((k) => (attributesArray as Record<string, Record<string, unknown>>)[k]);
  }

  // Rails raises TooManyRecords synchronously from
  // `assign_nested_attribute_for_collection_association` when `limit:`
  // is exceeded — mirror that here so callers see the misconfiguration
  // at assign time, not at save time.
  const ctor = record.constructor as typeof Base;
  const configs: NestedAttributeConfig[] = (ctor as any)._nestedAttributeConfigs ?? [];
  const config = configs.find((c) => c.associationName === associationName);
  const rawLimit = config?.options.limit;
  const resolvedLimit = typeof rawLimit === "function" ? rawLimit() : rawLimit;
  if (resolvedLimit !== undefined && attrs.length > resolvedLimit) {
    throw new TooManyRecords(
      `Maximum ${resolvedLimit} records are allowed. ` + `Got ${attrs.length} records instead.`,
    );
  }

  // Store on instance for later processing
  if (!(record as any)._pendingNestedAttributes) {
    (record as any)._pendingNestedAttributes = new Map();
  }
  (record as any)._pendingNestedAttributes.set(associationName, attrs);
}

/**
 * Process all pending nested attributes after save.
 */
async function processNestedAttributes(record: Base): Promise<void> {
  const pending: Map<string, Record<string, unknown>[]> | undefined = (record as any)
    ._pendingNestedAttributes;
  if (!pending) return;

  const ctor = record.constructor as typeof Base;
  const configs: NestedAttributeConfig[] = (ctor as any)._nestedAttributeConfigs ?? [];

  for (const [assocName, attrsList] of pending) {
    const config = configs.find((c) => c.associationName === assocName);
    if (!config) continue;

    const associations: any[] = (ctor as any)._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === assocName);
    if (!assocDef) continue;

    // Resolve target model
    const className = collectionAssociationClassName(assocDef, assocName);

    const targetModel = modelRegistry.get(className);
    if (!targetModel) continue;

    const foreignKey = assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`;

    // limit-check already fired in assignNestedAttributes (Rails
    // raises synchronously at assign time).

    const childPk = (targetModel as any).primaryKey || "id";

    // Get known attribute names from the target model
    const knownAttrs = new Set<string>();
    const attrDefs: Map<string, any> | undefined = (targetModel as any)._attributeDefinitions;
    if (attrDefs) {
      for (const name of attrDefs.keys()) {
        knownAttrs.add(name);
      }
    }
    // Also allow the primary key and foreign key
    knownAttrs.add(childPk);
    knownAttrs.add(foreignKey);

    for (const attrs of attrsList) {
      const { _destroy, ...restAttrs } = attrs as any;
      const pkValue = restAttrs[childPk];
      // Remove PK from child attrs so it's not set as a regular attribute during update
      const { [childPk]: _pkIgnored, ...childAttrs } = restAttrs;

      // Validate attributes against the target model's known columns
      if (knownAttrs.size > 0) {
        for (const key of Object.keys(childAttrs)) {
          if (!knownAttrs.has(key)) {
            const dummy = new (targetModel as any)();
            throw new UnknownAttributeError(dummy, key);
          }
        }
      }

      // Check _destroy before rejectIf — destroy should work regardless of rejectIf
      if (_destroy && config.options.allowDestroy) {
        // Destroy existing record
        if (pkValue) {
          const existing = await (targetModel as any).find(pkValue);
          await existing.destroy();
        }
        continue;
      }

      // Check rejectIf only for create/update, not destroy
      if (config.options.rejectIf && config.options.rejectIf(attrs)) {
        continue;
      }

      if (pkValue) {
        // Update existing record
        const existing = await (targetModel as any).find(pkValue);
        await existing.update(childAttrs);
      } else if (assocDef.type === "belongsTo") {
        // For belongs_to, create the target and set FK on *this* record
        const created = await (targetModel as any).create(childAttrs);
        if (created && created.id != null) {
          // Use _writeAttribute + direct persistence to avoid re-triggering nested attributes
          record._writeAttribute(foreignKey, created.id);
          const arelTable = (ctor as any).arelTable as Table;
          const um = new UpdateManager()
            .table(arelTable)
            .set([[arelTable.get(foreignKey), created.id]])
            .where((ctor as any)._buildPkWhereNode(record.id));
          await (ctor as any).connection.executeMutation(um.toSql());
        }
      } else {
        // For hasMany/hasOne, set FK on the child record
        await (targetModel as any).create({
          ...childAttrs,
          [foreignKey]: record.id,
        });
      }
    }
  }

  (record as any)._pendingNestedAttributes = null;
}

const UNASSIGNABLE_KEYS = new Set(["id", "_destroy"]);

/** @internal Stateless; one instance shared across all calls. */
const _booleanType = new BooleanType();

/** @internal */
export function hasDestroyFlag(hash: Record<string, unknown>): boolean {
  return _booleanType.cast(hash["_destroy"]) === true;
}

/** @internal */
export function isAllowDestroy(record: Base, associationName: string): boolean {
  const configs: NestedAttributeConfig[] =
    (record.constructor as any)._nestedAttributeConfigs ?? [];
  return configs.find((c) => c.associationName === associationName)?.options.allowDestroy ?? false;
}

/** @internal */
export function isWillBeDestroyed(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  return isAllowDestroy(record, associationName) && hasDestroyFlag(attributes);
}

/** @internal */
export function callRejectIf(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  if (isWillBeDestroyed(record, associationName, attributes)) return false;
  const configs: NestedAttributeConfig[] =
    (record.constructor as any)._nestedAttributeConfigs ?? [];
  const rejectIf = configs.find((c) => c.associationName === associationName)?.options.rejectIf;
  return rejectIf ? rejectIf(attributes) : false;
}

/** @internal */
export function isRejectNewRecord(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  return (
    isWillBeDestroyed(record, associationName, attributes) ||
    callRejectIf(record, associationName, attributes)
  );
}

/** @internal */
export function assignToOrMarkForDestruction(
  childRecord: Base,
  attributes: Record<string, unknown>,
  allowDestroy: boolean,
): void {
  const assignable: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (!UNASSIGNABLE_KEYS.has(k)) assignable[k] = v;
  }
  childRecord.assignAttributes(assignable);
  if (hasDestroyFlag(attributes) && allowDestroy) {
    markForDestruction(childRecord);
  }
}

/** @internal */
export function findRecordById(klass: typeof Base, records: Base[], id: unknown): Base | undefined {
  if (Array.isArray((klass as any).primaryKey)) {
    const needle = (Array.isArray(id) ? id : [id]).map(String);
    return records.find((r) => {
      const rid = Array.isArray(r.id) ? r.id : [r.id];
      return rid.map(String).join(",") === needle.join(",");
    });
  }
  return records.find((r) => String(r.id) === String(id));
}

/** @internal */
export function raiseNestedAttributesRecordNotFoundBang(
  record: Base,
  associationName: string,
  recordId: unknown,
): never {
  const ctor = record.constructor as typeof Base;
  const associations: any[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  const modelName = assocDef?.options?.className ?? camelize(singularize(associationName));
  throw new RecordNotFound(
    `Couldn't find ${modelName} with ID=${recordId} for ${ctor.name} with ID=${record.id}`,
    modelName,
    "id",
    recordId,
  );
}

/** @internal */
export function checkRecordLimitBang(
  limit: number | ((...args: unknown[]) => number) | undefined,
  attributesCollection: unknown[],
): void {
  if (limit === undefined) return;
  const resolved = typeof limit === "function" ? limit() : limit;
  if (resolved !== undefined && attributesCollection.length > resolved) {
    throw new TooManyRecords(
      `Maximum ${resolved} records are allowed. Got ${attributesCollection.length} records instead.`,
    );
  }
}

/** @internal */
function generateAssociationWriter(
  modelClass: typeof Base,
  associationName: string,
  type: "collection" | "one_to_one",
): void {
  const attrName = `${associationName}Attributes`;
  if (type === "collection") {
    Object.defineProperty(modelClass.prototype, attrName, {
      set(this: Base, value: any) {
        assignNestedAttributesForCollectionAssociation(this, associationName, value);
      },
      configurable: true,
    });
  } else {
    Object.defineProperty(modelClass.prototype, attrName, {
      set(this: Base, value: any) {
        assignNestedAttributesForOneToOneAssociation(this, associationName, value);
      },
      configurable: true,
    });
  }
}

/** @internal */
export function isPolymorphicBelongsTo(record: Base, associationName: string): boolean {
  const associations: any[] = (record.constructor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  return assocDef?.type === "belongsTo" && Boolean(assocDef?.options?.polymorphic);
}

/** @internal */
export function assignNestedAttributesForOneToOneAssociation(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): void {
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) {
    throw new Error(
      `Hash expected for \`${associationName}\` attributes, got ${typeof attributes}`,
    );
  }
  if (!isRejectNewRecord(record, associationName, attributes)) {
    // Rails defers the polymorphic-target check to build time: when no `id` is
    // present a new record must be built, but a polymorphic belongs_to has no
    // `build_#{association_name}` method, so the writer raises. Updates (with a
    // matching `id`) are unaffected.
    const id = (attributes as any).id;
    if (
      (id === undefined || id === null || id === "") &&
      isPolymorphicBelongsTo(record, associationName)
    ) {
      throw new Error(
        `Cannot build association \`${associationName}'. ` +
          `Are you trying to build a polymorphic one-to-one association?`,
      );
    }
    if (!(record as any)._pendingNestedAttributes) {
      (record as any)._pendingNestedAttributes = new Map();
    }
    (record as any)._pendingNestedAttributes.set(associationName, [attributes]);
  }
}

/** @internal */
export function assignNestedAttributesForCollectionAssociation(
  record: Base,
  associationName: string,
  attributesCollection: Record<string, unknown>[] | Record<string, Record<string, unknown>>,
): void {
  if (typeof attributesCollection !== "object" || attributesCollection === null) {
    throw new Error(
      `Hash or Array expected for \`${associationName}\` attributes, got ${typeof attributesCollection}`,
    );
  }
  const ctor = record.constructor as typeof Base;
  const configs: NestedAttributeConfig[] = (ctor as any)._nestedAttributeConfigs ?? [];
  const config = configs.find((c) => c.associationName === associationName);

  let attrs: Record<string, unknown>[];
  if (Array.isArray(attributesCollection)) {
    attrs = attributesCollection;
  } else {
    const keys = Object.keys(attributesCollection);
    if (keys.includes("id")) {
      attrs = [attributesCollection as unknown as Record<string, unknown>];
    } else {
      attrs = keys.sort().map((k) => (attributesCollection as any)[k]);
    }
  }

  checkRecordLimitBang(config?.options.limit, attrs);

  // Rails `assign_nested_attributes_for_collection_association` marks matching
  // records for destruction *in memory* at assign time, so validations run
  // against the post-destroy graph (e.g. the association-aware length validator
  // excludes records marked for destruction). The actual DELETE still flows
  // through the post-save flush in `processNestedAttributes`, which only runs
  // when `save` succeeds — so an invalidated graph leaves the rows untouched,
  // matching Rails.
  //
  // KNOWN LIMITATION vs Rails (nested_attributes.rb:510-515): Rails computes
  // `existing_records` as `association.loaded? ? target : scope.where(pk => ids)`
  // — i.e. it queries the DB when the association isn't loaded. We only mark
  // already-loaded records (the sync setter can't perform trails' async load).
  // This stays internally consistent: `readAttributeForValidation` also reads
  // only the loaded proxy, so an unloaded collection is neither validated
  // against nor marked here. The DB rows are still correctly destroyed by the
  // post-save flush; only the pre-save size-validation interaction is skipped
  // for the unloaded case (not exercised by any test).
  if (config?.options.allowDestroy) {
    const loaded = loadedCollectionTarget(record, associationName);
    if (loaded.length > 0) {
      const targetModel = resolveCollectionTargetModel(record, associationName);
      if (targetModel) {
        for (const a of attrs) {
          const id = (a as Record<string, unknown>).id;
          if (id != null && id !== "" && hasDestroyFlag(a)) {
            const existing = findRecordById(targetModel, loaded, id);
            if (existing) markForDestruction(existing);
          }
        }
      }
    }
  }

  if (!(record as any)._pendingNestedAttributes) {
    (record as any)._pendingNestedAttributes = new Map();
  }
  (record as any)._pendingNestedAttributes.set(associationName, attrs);
}

/**
 * The in-memory target of a loaded collection proxy, or `[]` when the
 * association has not been loaded. Mirrors the read path in
 * `readAttributeForValidation` so destruction marking and validation see the
 * same record instances.
 * @internal
 */
function loadedCollectionTarget(record: Base, associationName: string): Base[] {
  const proxy = (record as any)._collectionProxies?.get?.(associationName) as
    | { target?: unknown[] }
    | undefined;
  return Array.isArray(proxy?.target) ? (proxy!.target as Base[]) : [];
}

/**
 * Class name backing a collection association: explicit `className` option, else
 * the camelized singular of the association name. Single source of truth for
 * `processNestedAttributes` and `resolveCollectionTargetModel`.
 * @internal
 */
function collectionAssociationClassName(assocDef: any, associationName: string): string {
  return (
    assocDef.options.className ??
    (assocDef.type === "hasMany" || assocDef.type === "hasAndBelongsToMany"
      ? camelize(singularize(associationName))
      : camelize(associationName))
  );
}

/**
 * Resolve the model class backing a collection association via the registry,
 * mirroring the className resolution in `processNestedAttributes`.
 * @internal
 */
function resolveCollectionTargetModel(
  record: Base,
  associationName: string,
): typeof Base | undefined {
  const ctor = record.constructor as typeof Base;
  const associations: any[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === associationName);
  if (!assocDef) return undefined;
  return modelRegistry.get(collectionAssociationClassName(assocDef, associationName)) as
    | typeof Base
    | undefined;
}

export const InstanceMethods = {
  _destroy,
  hasDestroyFlag,
  isAllowDestroy,
  isWillBeDestroyed,
  callRejectIf,
  isRejectNewRecord,
  assignToOrMarkForDestruction,
  findRecordById,
  raiseNestedAttributesRecordNotFoundBang,
  checkRecordLimitBang,
  assignNestedAttributesForOneToOneAssociation,
  assignNestedAttributesForCollectionAssociation,
};
