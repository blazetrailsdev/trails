import type { Trails as TrailsClass } from "./rails.js";

export let _Trails: typeof TrailsClass | undefined;

/** @internal */
export function _setTrails(value: typeof TrailsClass): void {
  _Trails = value;
}
