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
