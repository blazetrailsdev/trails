/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export let trails: { env: { "development?"(): boolean } } | null = null;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function _setTrails(value: { env: { "development?"(): boolean } } | null): void {
  trails = value;
}
