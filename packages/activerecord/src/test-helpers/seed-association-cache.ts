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
  // A declared association has a real holder — set its target so the genuine
  // reader / strict-loading logic runs off it. Mark `_explicitTarget` so the
  // inner-loader short-circuit treats it as an explicit set (matching the old
  // `_cachedAssociations.set` poke this replaces).
  try {
    const assoc = (
      record as unknown as {
        association(n: string): { setTarget(t: unknown): void; _explicitTarget: boolean };
      }
    ).association(name);
    assoc.setTarget(target);
    assoc._explicitTarget = true;
    return;
  } catch {
    // Undeclared name (FakeTopic/FakeReply fixtures): fall through to a minimal
    // loaded holder, the way `@association_cache` tolerates ad-hoc inverses.
  }
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
