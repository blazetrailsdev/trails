/** @internal */
export let _Compatibility: { find(version: string | number): unknown } | null = null;

/** @internal */
export function _setCompatibility(value: { find(version: string | number): unknown }): void {
  _Compatibility = value;
}
