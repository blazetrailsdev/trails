import type { Base } from "./base.js";

/**
 * Track and enforce readonly attributes on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes
 *
 * Usage:
 *   User.attrReadonly('email', 'username')
 *   User.readonlyAttributes // => ['email', 'username']
 */

/**
 * Declare attributes as readonly. Once a record is persisted, these
 * attributes cannot be changed via update/save.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#attr_readonly
 */
export function attrReadonly(this: typeof Base, ...attributes: string[]): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_readonlyAttributes")) {
    (this as any)._readonlyAttributes = new Set((this as any)._readonlyAttributes);
  }
  for (const attr of attributes) {
    (this as any)._readonlyAttributes.add(attr);
  }
}

/**
 * Return the list of readonly attribute names for a model class.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attributes
 */
export function readonlyAttributes(this: typeof Base): string[] {
  return Array.from((this as any)._readonlyAttributes ?? []);
}

/**
 * Check if a specific attribute is readonly.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attribute?
 * (The `Q` suffix mirrors Ruby's `?` predicate convention.)
 */
export function readonlyAttributeQ(this: typeof Base, attribute: string): boolean {
  return ((this as any)._readonlyAttributes as Set<string> | undefined)?.has(attribute) ?? false;
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 *
 * Note: `readonlyAttributes` is exposed on Base as a getter for ergonomic
 * property access (TS idiom for what Rails exposes as a bare method call),
 * so it stays as a hand-rolled delegate in base.ts rather than being mixed
 * in here.
 */
export const ClassMethods = {
  attrReadonly,
  readonlyAttributeQ,
};
