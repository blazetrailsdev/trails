/**
 * Late-binding registries for two TDZ-constrained dependencies of `association.ts`.
 *
 * Both `DisableJoinsAssociationScope` and `AssociationRelation` live in modules
 * that form cycles back to `association.ts` through the static import graph
 * (`DJAS → DJAR → relation.ts → associations.ts → association.ts` and
 * `AssociationRelation → relation.ts → associations.ts → association.ts`).
 * A direct static `import` from `association.ts` shifts initialization order
 * so that builder subclasses extend an undefined superclass.
 *
 * Each owning module imports its setter here and calls it at module end, after
 * its own class is defined. `association.ts` imports the getters and reads them
 * inside methods — by which point all static imports have resolved and both
 * slots are populated. This file has no imports from the association module
 * graph so it is safe to import from either side.
 */

type DjasScopeFn = (assoc: { owner: unknown; reflection: unknown; klass: unknown }) => unknown;

let _djas: DjasScopeFn | undefined;
export function setDjasScopeBuilder(fn: DjasScopeFn): void {
  _djas = fn;
}
export function getDjasScopeBuilder(): DjasScopeFn | undefined {
  return _djas;
}

type ArFactoryFn = (klass: unknown, assoc: unknown) => unknown;

let _arFactory: ArFactoryFn | undefined;
export function setAssociationRelationFactory(fn: ArFactoryFn): void {
  _arFactory = fn;
}
export function getAssociationRelationFactory(): ArFactoryFn | undefined {
  return _arFactory;
}
