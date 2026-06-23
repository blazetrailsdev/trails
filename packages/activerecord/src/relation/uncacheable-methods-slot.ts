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

/** @internal */
export function _registerRelationFamily(key: RelationFamilyKey, ctor: Ctor): void {
  _relationFamilySlot[key] = ctor;
}
