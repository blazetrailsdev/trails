import type { Base } from "./base.js";
import { modelRegistry } from "./associations.js";
import { SubclassNotFound } from "./errors.js";

/**
 * Register a class as a subclass of its parent.
 * Call this in a static initializer block on subclasses to enable
 * subclasses/descendants tracking.
 *
 * Mirrors the implicit subclass registration Rails does via Ruby's
 * inherited hook.
 */
export function registerSubclass(klass: typeof Base): void {
  const parent = Object.getPrototypeOf(klass) as typeof Base;
  if (!parent || parent === Function.prototype) return;
  if (!Object.prototype.hasOwnProperty.call(parent, "_subclasses")) {
    (parent as any)._subclasses = [];
  }
  (parent as any)._subclasses.push(klass);
}

/**
 * Single Table Inheritance support.
 *
 * When a model has an inheritance column (default: "type"), subclasses
 * share the parent's table and auto-set the type column.
 *
 * Mirrors: ActiveRecord::Inheritance
 */

/**
 * Configure STI on a base model class.
 * Call this on the parent class to enable STI.
 */
export function enableSti(
  modelClass: typeof Base,
  options: { column?: string } = {}
): void {
  const column = options.column ?? "type";
  (modelClass as any)._inheritanceColumn = column;
}

/**
 * Get the inheritance column for a model, if STI is enabled.
 */
export function getInheritanceColumn(
  modelClass: typeof Base
): string | null {
  return (modelClass as any)._inheritanceColumn ?? null;
}

/**
 * Check if a model class is an STI subclass (not the base STI class).
 */
export function isStiSubclass(modelClass: typeof Base): boolean {
  // Walk up the prototype chain to find if any parent has _inheritanceColumn
  let current = Object.getPrototypeOf(modelClass);
  while (current && current !== Function.prototype) {
    if ((current as any)._inheritanceColumn) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Get the STI base class for a model.
 */
export function getStiBase(modelClass: typeof Base): typeof Base {
  let current = modelClass;
  let base = modelClass;
  while (current && current !== Function.prototype) {
    if ((current as any)._inheritanceColumn) {
      base = current;
    }
    current = Object.getPrototypeOf(current) as typeof Base;
  }
  return base;
}

/**
 * Resolve a type name to a subclass of the given base class.
 * Throws SubclassNotFound if the type is invalid or not a subclass.
 *
 * Mirrors: ActiveRecord::Inheritance.find_sti_class
 */
export function findStiClass(
  baseClass: typeof Base,
  typeName: string
): typeof Base {
  const klass = modelRegistry.get(typeName);
  if (!klass) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${typeName} is not a subclass of ${baseClass.name}`
    );
  }
  // Verify it's actually a subclass (or the base itself)
  if (klass !== baseClass && !(klass.prototype instanceof baseClass)) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${typeName} is not a subclass of ${baseClass.name}`
    );
  }
  return klass;
}

/**
 * Directly instantiate a record without STI delegation (avoids recursion).
 */
function directInstantiate(klass: typeof Base, row: Record<string, unknown>): Base {
  (klass as any)._skipEncryption = true;
  const record = new klass(row);
  (klass as any)._skipEncryption = false;
  record._newRecord = false;
  (record as any)._dirty.snapshot(record._attributes);
  record.changesApplied();
  if ((klass as any)._strictLoadingByDefault) {
    (record as any)._strictLoading = true;
  }
  (klass as any)._callbackChain?.runAfter?.("find", record);
  return record;
}

/**
 * Instantiate the correct STI subclass from a database row.
 */
export function instantiateSti(
  baseClass: typeof Base,
  row: Record<string, unknown>
): Base {
  const column = getInheritanceColumn(baseClass);
  if (!column) return directInstantiate(baseClass, row);

  const typeName = row[column] as string | null | undefined;
  if (!typeName || !typeName.trim()) return directInstantiate(baseClass, row);

  const subclass = findStiClass(baseClass, typeName);
  return directInstantiate(subclass, row);
}
