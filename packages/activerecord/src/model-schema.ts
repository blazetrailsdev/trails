import type { Base } from "./base.js";

/**
 * Schema metadata for ActiveRecord models — table name, primary key,
 * columns, content columns, etc.
 *
 * Mirrors: ActiveRecord::ModelSchema
 */

/**
 * Return column names for a model, excluding ignored columns.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#column_names
 */
export function columnNames(modelClass: typeof Base): string[] {
  const ignored = new Set(modelClass.ignoredColumns ?? []);
  return Array.from(modelClass._attributeDefinitions.keys()).filter((name) => !ignored.has(name));
}

/**
 * Check if a model class has a given attribute defined.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#has_attribute?
 */
export function hasAttributeDefinition(modelClass: typeof Base, name: string): boolean {
  return modelClass._attributeDefinitions.has(name);
}

/**
 * Return a hash of column definitions keyed by name.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#columns_hash
 */
export function columnsHash(
  modelClass: typeof Base,
): Record<string, { name: string; type: string; default: unknown }> {
  if (modelClass.abstractClass) {
    throw new Error(`Cannot call columnsHash on abstract class ${modelClass.name}`);
  }
  const result: Record<string, { name: string; type: string; default: unknown }> = {};
  for (const [name, def] of modelClass._attributeDefinitions) {
    result[name] = { name, type: def.type.name, default: def.defaultValue };
  }
  return result;
}

/**
 * Return content columns (excluding PK, FKs, and timestamps).
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#content_columns
 */
export function contentColumns(modelClass: typeof Base): string[] {
  const pk = modelClass.primaryKey;
  return columnNames(modelClass).filter((col) => {
    if (col === pk) return false;
    if (col.endsWith("_id")) return false;
    if (col === "created_at" || col === "updated_at") return false;
    return true;
  });
}
