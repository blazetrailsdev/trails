import type { Base } from "../base.js";

/**
 * Seed a loaded association target into a record's association cache
 * (`Base#_associationCache`, the trails analog of Rails'
 * `@association_cache[name]`), as an in-memory test fixture.
 *
 * Stands in for the old direct `record._cachedAssociations.set(name, target)`
 * pokes: it installs a minimal loaded association object under `name` so that
 * `record._associationCache(name)?.target` (and the production readers that
 * consult it) return `target`. Tolerates undeclared names — the seeded object
 * does not require a real reflection — matching `@association_cache`.
 */
export function seedAssociationCache(record: Base, name: string, target: unknown): void {
  try {
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
    return;
  } catch {}
  (record as unknown as { _associationInstances: Map<string, unknown> })._associationInstances.set(
    name,
    {
      target,
      _explicitTarget: true,
      isLoaded: () => true,
      setTarget(this: { target: unknown }, t: unknown) {
        this.target = t;
      },
    },
  );
}
