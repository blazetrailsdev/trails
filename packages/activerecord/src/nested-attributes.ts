import type { Base } from "./base.js";
import { modelRegistry } from "./associations.js";
import { ActiveRecordError, UnknownAttributeError } from "./errors.js";
import { singularize, camelize, underscore } from "@blazetrails/activesupport";
import { Table, UpdateManager } from "@blazetrails/arel";
import { isMarkedForDestruction } from "./autosave-association.js";

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
  limit?: number;
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

  // Rails raises ArgumentError for polymorphic belongs_to
  if (assocExists.type === "belongsTo" && assocExists.options?.polymorphic) {
    throw new Error(
      `Cannot build a polymorphic belongs_to association '${associationName}' with nested attributes. ` +
        `You need to define which model to use for the polymorphic association.`,
    );
  }

  // Store config on the class
  if (!(modelClass as any)._nestedAttributeConfigs) {
    (modelClass as any)._nestedAttributeConfigs = [];
  }
  (modelClass as any)._nestedAttributeConfigs.push({
    associationName,
    options,
  } as NestedAttributeConfig);

  // Define the setter for `{associationName}Attributes`
  const attrName = `${associationName}Attributes`;

  // Store pending nested attrs on instance for processing during save
  const originalSave = modelClass.prototype.save;
  if (!(modelClass as any)._nestedSaveWrapped) {
    (modelClass as any)._nestedSaveWrapped = true;

    modelClass.prototype.save = async function (this: Base): Promise<boolean> {
      const result = await originalSave.call(this);
      if (!result) return false;

      // Process pending nested attributes
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
  if (config?.options.limit !== undefined && attrs.length > config.options.limit) {
    throw new TooManyRecords(
      `Maximum ${config.options.limit} records are allowed. ` +
        `Got ${attrs.length} records instead.`,
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
    const className =
      assocDef.options.className ??
      (assocDef.type === "hasMany" || assocDef.type === "hasAndBelongsToMany"
        ? camelize(singularize(assocName))
        : camelize(assocName));

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
          await (ctor as any).adapter.executeMutation(um.toSql());
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
