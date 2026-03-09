import type { Base } from "./base.js";
import { modelRegistry } from "./associations.js";

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
  options: NestedAttributeOptions = {}
): void {
  // Validate that the association exists
  const associations: any[] = (modelClass as any)._associations ?? [];
  const assocExists = associations.find((a: any) => a.name === associationName);
  if (!assocExists) {
    throw new Error(`No association found for name '${associationName}'. Has it been defined yet?`);
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
  attributesArray: Record<string, unknown>[] | Record<string, Record<string, unknown>>
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
  const pending: Map<string, Record<string, unknown>[]> | undefined =
    (record as any)._pendingNestedAttributes;
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
    const singularize = (w: string) => {
      if (w.endsWith("ies")) return w.slice(0, -3) + "y";
      if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
      if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
      return w;
    };
    const camelize = (n: string) =>
      n.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");

    const className = assocDef.options.className ??
      (assocDef.type === "hasMany" || assocDef.type === "hasAndBelongsToMany"
        ? camelize(singularize(assocName))
        : camelize(assocName));

    const targetModel = modelRegistry.get(className);
    if (!targetModel) continue;

    const underscore = (n: string) =>
      n.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .replace(/([a-z\d])([A-Z])/g, "$1_$2")
        .toLowerCase();

    const foreignKey = assocDef.options.foreignKey ?? `${underscore(ctor.name)}_id`;

    // Apply limit check
    if (config.options.limit && attrsList.length > config.options.limit) {
      record.errors.add(assocName, "invalid", {
        message: `exceeds the limit of ${config.options.limit}`,
      });
      continue;
    }

    const childPk = (targetModel as any).primaryKey || "id";

    for (const attrs of attrsList) {
      const { _destroy, ...restAttrs } = attrs as any;
      const pkValue = restAttrs[childPk];
      // Remove PK from child attrs so it's not set as a regular attribute during update
      const { [childPk]: _pkIgnored, ...childAttrs } = restAttrs;

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
          // Use writeAttribute + direct save to avoid re-triggering nested attributes
          record.writeAttribute(foreignKey, created.id);
          const tableName = (ctor as any).tableName;
          const pk = (ctor as any).primaryKey || "id";
          const pkVal = record.readAttribute(pk);
          await (ctor as any).adapter.executeMutation(
            `UPDATE "${tableName}" SET "${foreignKey}" = ${created.id} WHERE "${pk}" = ${pkVal}`
          );
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
