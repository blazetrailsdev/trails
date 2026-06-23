// Zero-import slot so the relation-family classes can self-register their
// constructors for `Delegation.uncacheableMethods` (delegation.rb:17-21)
// without import cycles. CollectionProxy/AssociationRelation transitively drag
// in `associations.ts`, so a direct value-import from `delegation.ts` would
// observe a partial module during the cycle. Same rationale as
// `associations/collection-proxy-slot.ts`.

type Ctor = new (...args: never[]) => unknown;

/** @internal */
export type RelationFamilyKey =
  | "relation"
  | "collectionProxy"
  | "associationRelation"
  | "disableJoinsAssociationRelation";

/** @internal */
export const _relationFamilySlot: Partial<Record<RelationFamilyKey, Ctor>> = {};

/**
 * Bumped on every registration so `uncacheableMethods()` can memoize against a
 * version stamp rather than gate on "all four registered" — registrations only
 * happen at module-init time, so the version stabilizes before any delegation
 * runs and the computed set is cached permanently regardless of which family
 * classes are loaded.
 *
 * @internal
 */
export const _relationFamilyState = { version: 0 };

/** @internal */
export function _registerRelationFamily(key: RelationFamilyKey, ctor: Ctor): void {
  _relationFamilySlot[key] = ctor;
  _relationFamilyState.version++;
}
