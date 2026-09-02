import type { Base } from "./base.js";

/** @internal */

export let _Base: typeof Base | undefined;

/** @internal */

export function _setBase(base: typeof Base): void {
  _Base = base;
}
