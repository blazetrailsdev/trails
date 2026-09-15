import type * as Reflection from "./reflection.js";

/** @internal */

export let _Reflection: typeof Reflection | undefined;

/** @internal */

export function _setReflection(reflection: typeof Reflection): void {
  _Reflection = reflection;
}
