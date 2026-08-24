import type { Base } from "../base.js";

/**
 * Seed a loaded association target into a record's association cache
 * (`Base#_associationCache`, the trails analog of Rails'
 * `@association_cache[name]`), as an in-memory test fixture.
 *
 * Stands in for the old direct `record._cachedAssociations.set(name, target)`
 * pokes: it loads the record's real `Association` for `name` with `target`, so
 * that `record._associationCache(name)?.target` (and the production readers
 * that consult it) return `target`. Like Rails' `@association_cache`, the map
 * only ever holds `Association` instances built from a reflection — an
 * undeclared name has no association to seed and raises here rather than
 * caching an ad-hoc holder.
 */
export function seedAssociationCache(record: Base, name: string, target: unknown): void {
  const assoc = (
    record as unknown as {
      association(n: string): {
        _setTargetFromLoader(t: unknown): void;
        _explicitTarget: boolean;
      };
    }
  ).association(name);
  assoc._setTargetFromLoader(target);
  assoc._explicitTarget = true;
}
