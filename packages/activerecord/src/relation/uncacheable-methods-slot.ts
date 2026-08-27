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
export const _relationFamilyState = { version: 0 };

/** @internal */
export function _registerRelationFamily(key: RelationFamilyKey, ctor: Ctor): void {
  _relationFamilySlot[key] = ctor;
  _relationFamilyState.version++;
}
