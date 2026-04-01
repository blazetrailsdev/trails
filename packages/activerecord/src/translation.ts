import type { Base } from "./base.js";

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
export function i18nScope(_modelClass: typeof Base): string {
  return "activerecord";
}

/**
 * Return the ancestor chain for i18n lookup, stopping before the
 * ActiveRecord Base class (the first class whose parent constructor
 * does not have _attributeDefinitions).
 *
 * Mirrors: ActiveRecord::Translation#lookup_ancestors
 */
export function lookupAncestors(modelClass: typeof Base): Array<typeof Base> {
  const ancestors: Array<typeof Base> = [];
  let klass: any = modelClass;
  while (klass) {
    const parent = Object.getPrototypeOf(klass);
    if (!parent || !("_attributeDefinitions" in parent)) {
      // klass is Base (its parent is Model which doesn't have _attributeDefinitions).
      // Only include Base if it was the original modelClass.
      if (klass === modelClass) ancestors.push(klass);
      break;
    }
    ancestors.push(klass);
    klass = parent;
  }
  return ancestors;
}
