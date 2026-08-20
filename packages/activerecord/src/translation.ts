import type { Base } from "./base.js";
import { isBaseClass } from "./inheritance.js";

/**
 * Translation and i18n support for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Translation
 */

/**
 * Return the i18n scope for this model class.
 *
 * Mirrors: ActiveRecord::Translation#i18n_scope
 */
export function i18nScope(this: typeof Base): string {
  return "activerecord";
}

/**
 * Set the lookup ancestors for ActiveModel.
 *
 * Mirrors: ActiveRecord::Translation#lookup_ancestors (translation.rb:6-15)
 */
export function lookupAncestors(this: typeof Base): Array<typeof Base> {
  let klass: typeof Base = this;
  const classes: Array<typeof Base> = [klass];
  // Rails compares against the `ActiveRecord::Base` constant; trails detects it
  // through the `_isActiveRecordBase` own-property sentinel `setBaseClass` uses.
  if (Object.prototype.hasOwnProperty.call(klass, "_isActiveRecordBase")) return classes;

  while (!isBaseClass(klass)) {
    klass = Object.getPrototypeOf(klass) as typeof Base;
    classes.push(klass);
  }
  return classes;
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 */
export const ClassMethods = {
  lookupAncestors,
};
