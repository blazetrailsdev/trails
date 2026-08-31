/** @internal */

export let _RequestCtor: (new (...args: any[]) => any) | undefined;

/** @internal */

export function _setRequestCtor(ctor: new (...args: any[]) => any): void {
  _RequestCtor = ctor;
}
