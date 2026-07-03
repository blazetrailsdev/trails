import { Merger } from "../relation/merger.js";

/**
 * Rebase a relation whose base is the stale new-owner `1=0` NullRelation seed
 * onto a freshly resolved association scope.
 *
 * A `CollectionProxy`'s clauses are seeded ONCE at construction. When the owner
 * is a NEW record then, its foreign key is unresolvable and the seed collapses
 * to a `1=0` NullRelation (no FK predicate, and — for HABTM/through — no join).
 * Any relation carrying that seed — the proxy itself once a bang has diverged
 * it, or a relation SPAWNED off it (`owner.things.where(...)`) — keeps the dead
 * seed even after the owner is saved and its FK becomes resolvable. Rails'
 * `CollectionProxy` sidesteps this by delegating every query to the live
 * `association.scope`; we mirror that by re-merging the relation's accumulated
 * mutations onto the freshly rebuilt scope.
 *
 * `target` is mutated in place: its seed WHERE predicates are dropped, then the
 * remaining mutation clauses are merged onto `freshScope` (which carries the
 * resolved FK plus any HABTM/through join) and the result is copied back.
 */
interface Rebaseable {
  _whereClause: { predicates: unknown[] };
  _isNone: boolean;
  _copyStateFrom(source: unknown): void;
}

export function rebaseNewOwnerSeed(
  target: Rebaseable,
  freshScope: unknown,
  seedPredicates: readonly unknown[],
): void {
  // Drop the stale seed predicates (the `1=0`), keeping only the mutations
  // layered on top, and clear the NullRelation flag so the merge is live.
  target._whereClause.predicates = target._whereClause.predicates.filter(
    (p) => !seedPredicates.includes(p),
  );
  target._isNone = false;
  // Merge the surviving mutations onto the freshly resolved scope, then adopt
  // the merged state — the scope contributes the resolved FK + join, the
  // mutations contribute the accumulated where/order/limit/etc.
  const merged = new Merger(freshScope, target).merge();
  target._copyStateFrom(merged);
}
