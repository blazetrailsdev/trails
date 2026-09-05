type DjasScopeFn = (assoc: { owner: unknown; reflection: unknown; klass: unknown }) => unknown;

let _djas: DjasScopeFn | undefined;
/** @noRailsEquivalent PERMANENT */
export function setDjasScopeBuilder(fn: DjasScopeFn): void {
  _djas = fn;
}
/** @noRailsEquivalent PERMANENT */
export function getDjasScopeBuilder(): DjasScopeFn | undefined {
  return _djas;
}

type ArFactoryFn = (klass: unknown, assoc: unknown) => unknown;

let _arFactory: ArFactoryFn | undefined;
/** @noRailsEquivalent PERMANENT */
export function setAssociationRelationFactory(fn: ArFactoryFn): void {
  _arFactory = fn;
}
/** @noRailsEquivalent PERMANENT */
export function getAssociationRelationFactory(): ArFactoryFn | undefined {
  return _arFactory;
}
