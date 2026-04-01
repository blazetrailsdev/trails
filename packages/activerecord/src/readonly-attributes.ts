import type { Base } from "./base.js";

/**
 * Track and enforce readonly attributes on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes
 *
 * Usage:
 *   attrReadonly(User, 'email', 'username')
 *   readonlyAttributes(User) // => ['email', 'username']
 */

/**
 * Declare attributes as readonly. Once a record is persisted, these
 * attributes cannot be changed via update/save.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#attr_readonly
 */
export function attrReadonly(modelClass: typeof Base, ...attributes: string[]): void {
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_readonlyAttributes")) {
    (modelClass as any)._readonlyAttributes = new Set((modelClass as any)._readonlyAttributes);
  }
  for (const attr of attributes) {
    (modelClass as any)._readonlyAttributes.add(attr);
  }
}

/**
 * Return the list of readonly attribute names for a model class.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attributes
 */
export function readonlyAttributes(modelClass: typeof Base): string[] {
  return Array.from((modelClass as any)._readonlyAttributes ?? []);
}

/**
 * Check if a specific attribute is readonly.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attribute?
 */
export function readonlyAttribute(modelClass: typeof Base, attribute: string): boolean {
  return (
    ((modelClass as any)._readonlyAttributes as Set<string> | undefined)?.has(attribute) ?? false
  );
}
