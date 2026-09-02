/** @internal */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let _UserProvidedDefaultCtor: (new (...args: any[]) => any) | undefined;

/** @internal */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function _setUserProvidedDefaultCtor(ctor: new (...args: any[]) => any): void {
  _UserProvidedDefaultCtor = ctor;
}
