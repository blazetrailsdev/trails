/* eslint-disable @typescript-eslint/no-explicit-any */

/** @internal */
export let _UserProvidedDefaultCtor: (new (...args: any[]) => any) | undefined;

/** @internal */
export function _setUserProvidedDefaultCtor(ctor: new (...args: any[]) => any): void {
  _UserProvidedDefaultCtor = ctor;
}
