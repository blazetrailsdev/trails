/** @internal */

export let _CollectionProxyCtor: (new (...args: any[]) => any) | undefined;

/** @internal */

export function _setCollectionProxyCtor(ctor: new (...args: any[]) => any): void {
  _CollectionProxyCtor = ctor;
}
